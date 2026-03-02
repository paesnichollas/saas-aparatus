"use server";

import { protectedActionClient } from "@/lib/action-client";
import { revalidateBookingSurfaces } from "@/lib/cache-invalidation";
import { canOwnerMarkBookingAsPaid } from "@/lib/booking-payment";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { returnValidationErrors } from "next-safe-action";
import { z } from "zod";

const inputSchema = z.object({
  bookingId: z.uuid(),
});

export const ownerMarkBookingAsPaid = protectedActionClient
  .inputSchema(inputSchema)
  .action(async ({ parsedInput: { bookingId }, ctx: { user } }) => {
    const booking = await prisma.booking.findUnique({
      where: {
        id: bookingId,
      },
      select: {
        id: true,
        paymentMethod: true,
        paymentStatus: true,
        cancelledAt: true,
        startAt: true,
        date: true,
        barbershop: {
          select: {
            ownerId: true,
            users: {
              where: {
                id: user.id,
              },
              select: {
                id: true,
              },
              take: 1,
            },
          },
        },
      },
    });

    if (!booking) {
      returnValidationErrors(inputSchema, {
        _errors: ["Agendamento não encontrado."],
      });
    }

    const hasAccess =
      user.role === "ADMIN" ||
      booking.barbershop.ownerId === user.id ||
      booking.barbershop.users.length > 0;

    if (!hasAccess) {
      returnValidationErrors(inputSchema, {
        _errors: ["Sem permissão para atualizar este agendamento."],
      });
    }

    if (!canOwnerMarkBookingAsPaid(booking)) {
      returnValidationErrors(inputSchema, {
        _errors: ["Este agendamento não pode ser marcado como pago agora."],
      });
    }

    const updatedBooking = await prisma.booking.update({
      where: {
        id: booking.id,
      },
      data: {
        paymentStatus: "PAID",
        paymentConfirmedAt: new Date(),
      },
      select: {
        id: true,
        paymentStatus: true,
      },
    });

    revalidateBookingSurfaces();
    revalidatePath("/owner/reports");

    return {
      success: true,
      bookingId: updatedBooking.id,
      paymentStatus: updatedBooking.paymentStatus,
    };
  });
