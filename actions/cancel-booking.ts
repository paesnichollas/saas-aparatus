"use server";

import { z } from "zod";
import { protectedActionClient } from "@/lib/action-client";
import { returnValidationErrors } from "next-safe-action";
import { prisma } from "@/lib/prisma";
import { cancelPendingBookingNotificationJobs } from "@/lib/notifications/notification-jobs";
import { isFuture } from "date-fns";
import { revalidateBookingSurfaces } from "@/lib/cache-invalidation";
import Stripe from "stripe";

const inputSchema = z.object({
  bookingId: z.uuid(),
});

export const cancelBooking = protectedActionClient
  .inputSchema(inputSchema)
  .action(async ({ parsedInput: { bookingId }, ctx: { user } }) => {
    const booking = await prisma.booking.findUnique({
      where: {
        id: bookingId,
      },
    });
    if (!booking) {
      returnValidationErrors(inputSchema, {
        _errors: ["Agendamento não encontrado."],
      });
    }
    if (booking.userId !== user.id) {
      returnValidationErrors(inputSchema, {
        _errors: ["Você não tem permissão para cancelar este agendamento."],
      });
    }
    if (booking.cancelledAt) {
      returnValidationErrors(inputSchema, {
        _errors: ["Este agendamento já foi cancelado."],
      });
    }
    if (!isFuture(booking.date)) {
      returnValidationErrors(inputSchema, {
        _errors: ["Não é possível cancelar um agendamento passado."],
      });
    }
    if (booking.stripeChargeId) {
      if (!process.env.STRIPE_SECRET_KEY) {
        returnValidationErrors(inputSchema, {
          _errors: ["Chave de API do Stripe não encontrada."],
        });
      }
      try {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
          apiVersion: "2026-01-28.clover",
        });
        await stripe.refunds.create({
          charge: booking.stripeChargeId,
          reason: "requested_by_customer",
        });
      } catch (error) {
        console.error("Erro ao processar o reembolso do agendamento", error);
        returnValidationErrors(inputSchema, {
          _errors: [
            "Erro ao processar o reembolso do agendamento. Por favor, tente novamente.",
          ],
        });
      }
    }
    const cancelledBooking = await prisma.booking.update({
      where: {
        id: bookingId,
      },
      data: {
        cancelledAt: new Date(),
      },
    });
    await cancelPendingBookingNotificationJobs(bookingId, "booking_canceled");
    revalidateBookingSurfaces();

    return cancelledBooking;

  });
