"use server";

import { criticalActionClient } from "@/lib/action-client";
import { revalidateBookingSurfaces } from "@/lib/cache-invalidation";
import { scheduleBookingNotificationJobs } from "@/lib/notifications/notification-jobs";
import {
  BOOKING_SLOT_BUFFER_MINUTES,
  getBookingDayBounds,
  getBookingMinuteOfDay,
  isBookingDateTimeAtOrBeforeNowWithBuffer,
} from "@/lib/booking-time";
import {
  calculateBookingTotals,
  getBookingDurationMinutes,
  getBookingStartDate,
} from "@/lib/booking-calculations";
import { hasMinuteIntervalOverlap } from "@/lib/booking-interval";
import { ACTIVE_BOOKING_PAYMENT_WHERE } from "@/lib/booking-payment";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";
import { returnValidationErrors } from "next-safe-action";
import Stripe from "stripe";
import { z } from "zod";

const inputSchema = z.object({
  barbershopId: z.uuid(),
  barberId: z.uuid(),
  serviceIds: z.array(z.uuid()).min(1),
  startAt: z.date(),
});

const hasInvalidServiceData = (service: {
  name: string;
  priceInCents: number;
  durationInMinutes: number;
}) => {
  if (service.name.trim().length === 0) {
    return true;
  }

  if (!Number.isInteger(service.priceInCents) || service.priceInCents < 0) {
    return true;
  }

  if (
    !Number.isInteger(service.durationInMinutes) ||
    service.durationInMinutes < 5
  ) {
    return true;
  }

  return false;
};

const parseAbsoluteHttpUrl = (value: string | null | undefined) => {
  const normalizedValue = value?.trim();

  if (!normalizedValue) {
    return null;
  }

  try {
    const parsedUrl = new URL(normalizedValue);

    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return null;
    }

    return parsedUrl;
  } catch {
    return null;
  }
};

const getAppBaseUrl = async () => {
  const envAppUrl = parseAbsoluteHttpUrl(process.env.NEXT_PUBLIC_APP_URL);

  if (envAppUrl) {
    return envAppUrl;
  }

  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");

  if (!host) {
    return null;
  }

  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";

  return parseAbsoluteHttpUrl(`${protocol}://${host}`);
};

export const createBookingCheckoutSession = criticalActionClient
  .inputSchema(inputSchema)
  .action(
    async ({
      parsedInput: { barbershopId, barberId, serviceIds, startAt },
      ctx: { user },
    }) => {
      if (
        isBookingDateTimeAtOrBeforeNowWithBuffer(
          startAt,
          BOOKING_SLOT_BUFFER_MINUTES,
        )
      ) {
        returnValidationErrors(inputSchema, {
          _errors: [
            "Data e horario selecionados ja passaram ou estao muito proximos do horario atual.",
          ],
        });
      }

      const {
        start: selectedDateStart,
        endExclusive: selectedDateEndExclusive,
      } = getBookingDayBounds(startAt);

      const uniqueServiceIds = Array.from(new Set(serviceIds));
      if (uniqueServiceIds.length === 0) {
        returnValidationErrors(inputSchema, {
          _errors: ["Selecione pelo menos um servico."],
        });
      }

      const [barbershop, barber, services] = await Promise.all([
        prisma.barbershop.findUnique({
          where: {
            id: barbershopId,
          },
          select: {
            id: true,
            name: true,
            stripeEnabled: true,
            isActive: true,
          },
        }),
        prisma.barber.findFirst({
          where: {
            id: barberId,
            barbershopId,
          },
          select: {
            id: true,
            name: true,
          },
        }),
        prisma.barbershopService.findMany({
          where: {
            id: {
              in: uniqueServiceIds,
            },
            barbershopId,
            deletedAt: null,
          },
          select: {
            id: true,
            name: true,
            description: true,
            imageUrl: true,
            priceInCents: true,
            durationInMinutes: true,
          },
          orderBy: {
            name: "asc",
          },
        }),
      ]);

      if (!barbershop || !barber) {
        returnValidationErrors(inputSchema, {
          _errors: ["Barbearia ou barbeiro nao encontrado."],
        });
      }

      if (!barbershop.isActive) {
        returnValidationErrors(inputSchema, {
          _errors: ["Barbearia indisponivel para reservas."],
        });
      }

      if (services.length !== uniqueServiceIds.length) {
        returnValidationErrors(inputSchema, {
          _errors: ["Um ou mais servicos selecionados nao estao disponiveis."],
        });
      }

      const hasInvalidService = services.some((service) =>
        hasInvalidServiceData(service),
      );
      if (hasInvalidService) {
        returnValidationErrors(inputSchema, {
          _errors: [
            "Um ou mais servicos estao temporariamente indisponiveis para reserva.",
          ],
        });
      }

      const { totalDurationMinutes, totalPriceInCents } =
        calculateBookingTotals(services);
      if (totalDurationMinutes <= 0) {
        returnValidationErrors(inputSchema, {
          _errors: ["Nao foi possivel calcular a duracao total da reserva."],
        });
      }

      const endAt = new Date(startAt.getTime() + totalDurationMinutes * 60_000);

      const bookings = await prisma.booking.findMany({
        where: {
          barbershopId,
          AND: [
            {
              OR: [{ barberId }, { barberId: null }],
            },
            ACTIVE_BOOKING_PAYMENT_WHERE,
          ],
          date: {
            gte: selectedDateStart,
            lt: selectedDateEndExclusive,
          },
          cancelledAt: null,
        },
        select: {
          startAt: true,
          totalDurationMinutes: true,
          date: true,
          service: {
            select: {
              durationInMinutes: true,
            },
          },
        },
      });

      const hasCollision = hasMinuteIntervalOverlap(
        getBookingMinuteOfDay(startAt),
        totalDurationMinutes,
        bookings.map((booking) => {
          const startMinute = getBookingMinuteOfDay(getBookingStartDate(booking));
          const durationInMinutes = getBookingDurationMinutes(booking);
          return {
            startMinute,
            endMinute: startMinute + durationInMinutes,
          };
        }),
      );

      if (hasCollision) {
        returnValidationErrors(inputSchema, {
          _errors: ["Data e horario selecionados ja estao agendados."],
        });
      }

      const primaryServiceId = uniqueServiceIds[0];

      if (!barbershop.stripeEnabled) {
        const booking = await prisma.booking.create({
          data: {
            serviceId: primaryServiceId,
            date: startAt.toISOString(),
            startAt: startAt.toISOString(),
            endAt: endAt.toISOString(),
            totalDurationMinutes,
            totalPriceInCents,
            userId: user.id,
            barberId: barber.id,
            barbershopId: barbershop.id,
            paymentMethod: "IN_PERSON",
            paymentStatus: "PAID",
            services: {
              createMany: {
                data: uniqueServiceIds.map((serviceId) => ({
                  serviceId,
                })),
              },
            },
          },
          select: {
            id: true,
          },
        });

        await scheduleBookingNotificationJobs(booking.id);
        revalidateBookingSurfaces();

        return {
          kind: "created" as const,
          bookingId: booking.id,
        };
      }

      if (totalPriceInCents < 1) {
        returnValidationErrors(inputSchema, {
          _errors: ["O valor total desta reserva e invalido para pagamento online."],
        });
      }

      if (!process.env.STRIPE_SECRET_KEY) {
        returnValidationErrors(inputSchema, {
          _errors: ["Chave de API do Stripe nao encontrada."],
        });
      }

      const appBaseUrl = await getAppBaseUrl();

      if (!appBaseUrl) {
        console.error(
          "[createBookingCheckoutSession] Invalid NEXT_PUBLIC_APP_URL and request origin.",
        );
        returnValidationErrors(inputSchema, {
          _errors: [
            "Configuracao de URL da aplicacao invalida. Tente novamente em alguns instantes.",
          ],
        });
      }

      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
        apiVersion: "2026-01-28.clover",
      });

      const serviceDescription = services
        .map((service) => service.name)
        .join(", ")
        .slice(0, 300);
      const successUrl = new URL("/bookings", appBaseUrl);
      successUrl.searchParams.set("session_id", "{CHECKOUT_SESSION_ID}");
      const cancelUrl = new URL("/bookings", appBaseUrl);

      let checkoutSession: Stripe.Checkout.Session;

      try {
        checkoutSession = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          mode: "payment",
          success_url: successUrl.toString(),
          cancel_url: cancelUrl.toString(),
          metadata: {
            barbershopId: barbershop.id,
            barberId: barber.id,
            userId: user.id,
            serviceIdsJson: JSON.stringify(uniqueServiceIds),
            primaryServiceId,
            startAt: startAt.toISOString(),
            endAt: endAt.toISOString(),
            date: startAt.toISOString(),
            totalDurationMinutes: String(totalDurationMinutes),
            totalPriceInCents: String(totalPriceInCents),
          },
          line_items: [
            {
              price_data: {
                currency: "brl",
                unit_amount: totalPriceInCents,
                product_data: {
                  name: `${barbershop.name} - Reserva com ${services.length} servicos`,
                  description: `Barbeiro: ${barber.name}. Servicos: ${serviceDescription}`,
                },
              },
              quantity: 1,
            },
          ],
        });
      } catch (error) {
        console.error("[createBookingCheckoutSession] Stripe checkout error.", {
          error,
          barbershopId: barbershop.id,
          barberId: barber.id,
        });
        returnValidationErrors(inputSchema, {
          _errors: [
            "Nao foi possivel iniciar o pagamento agora. Verifique os dados da reserva e tente novamente.",
          ],
        });
      }

      try {
        await prisma.booking.create({
          data: {
            stripeSessionId: checkoutSession.id,
            serviceId: primaryServiceId,
            date: startAt.toISOString(),
            startAt: startAt.toISOString(),
            endAt: endAt.toISOString(),
            totalDurationMinutes,
            totalPriceInCents,
            userId: user.id,
            barberId: barber.id,
            barbershopId: barbershop.id,
            paymentMethod: "STRIPE",
            paymentStatus: "PENDING",
            services: {
              createMany: {
                data: uniqueServiceIds.map((serviceId) => ({
                  serviceId,
                })),
              },
            },
          },
          select: {
            id: true,
          },
        });
      } catch (error) {
        console.error(
          "[createBookingCheckoutSession] Failed to create pending booking.",
          {
            error,
            checkoutSessionId: checkoutSession.id,
            barbershopId: barbershop.id,
            barberId: barber.id,
            userId: user.id,
          },
        );

        try {
          await stripe.checkout.sessions.expire(checkoutSession.id);
        } catch (expireError) {
          console.error(
            "[createBookingCheckoutSession] Failed to expire Stripe session after pending booking error.",
            {
              expireError,
              checkoutSessionId: checkoutSession.id,
            },
          );
        }

        returnValidationErrors(inputSchema, {
          _errors: [
            "Nao foi possivel reservar este horario agora. Tente novamente em alguns instantes.",
          ],
        });
      }

      return {
        kind: "stripe" as const,
        sessionId: checkoutSession.id,
      };
    },
  );
