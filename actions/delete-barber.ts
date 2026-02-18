"use server";

import { protectedActionClient } from "@/lib/action-client";
import { ACTIVE_BOOKING_PAYMENT_WHERE } from "@/lib/booking-payment";
import { revalidatePublicBarbershopCache } from "@/lib/cache-invalidation";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { returnValidationErrors } from "next-safe-action";
import { z } from "zod";

const inputSchema = z.object({
  barberId: z.uuid(),
});

export const deleteBarber = protectedActionClient
  .inputSchema(inputSchema)
  .action(async ({ parsedInput: { barberId }, ctx: { user } }) => {
    const barber = await prisma.barber.findFirst({
      where: {
        id: barberId,
        barbershop: {
          ownerId: user.id,
        },
      },
      select: {
        id: true,
        barbershop: {
          select: {
            id: true,
            slug: true,
            publicSlug: true,
          },
        },
      },
    });

    if (!barber) {
      returnValidationErrors(inputSchema, {
        _errors: ["Barbeiro nao encontrado ou sem permissao de remocao."],
      });
    }

    const now = new Date();
    const futureBookingsCount = await prisma.booking.count({
      where: {
        barberId: barber.id,
        cancelledAt: null,
        AND: [ACTIVE_BOOKING_PAYMENT_WHERE],
        OR: [
          {
            startAt: {
              gte: now,
            },
          },
          {
            startAt: null,
            date: {
              gte: now,
            },
          },
        ],
      },
    });

    if (futureBookingsCount > 0) {
      returnValidationErrors(inputSchema, {
        _errors: [
          "Nao e possivel remover um barbeiro com agendamentos futuros ativos.",
        ],
      });
    }

    await prisma.barber.delete({
      where: {
        id: barber.id,
      },
    });

    revalidatePath("/owner");
    revalidatePublicBarbershopCache({
      barbershopId: barber.barbershop.id,
      slug: barber.barbershop.slug,
      publicSlug: barber.barbershop.publicSlug,
    });

    return {
      success: true,
      barberId: barber.id,
    };
  });

