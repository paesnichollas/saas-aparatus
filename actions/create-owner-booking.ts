"use server";

import { getOwnerBarbershopIdByUserId } from "@/data/barbershops";
import { protectedActionClient } from "@/lib/action-client";
import {
  calculateBookingTotals,
  getBookingDurationMinutes,
  getBookingStartDate,
} from "@/lib/booking-calculations";
import { hasMinuteIntervalOverlap } from "@/lib/booking-interval";
import {
  ACTIVE_BOOKING_PAYMENT_WHERE,
  UNPAID_PAYMENT_STATUS,
} from "@/lib/booking-payment";
import {
  BOOKING_SLOT_BUFFER_MINUTES,
  getBookingDayBounds,
  getBookingMinuteOfDay,
  isBookingDateTimeAtOrBeforeNowWithBuffer,
} from "@/lib/booking-time";
import { revalidateBookingSurfaces } from "@/lib/cache-invalidation";
import { scheduleBookingNotificationJobs } from "@/lib/notifications/notification-jobs";
import { prisma } from "@/lib/prisma";
import { returnValidationErrors } from "next-safe-action";
import { z } from "zod";

const inputSchema = z.object({
  clientUserId: z.string().trim().min(1, "Cliente inválido."),
  barberId: z.uuid(),
  serviceIds: z.array(z.uuid()).min(1, "Selecione ao menos um serviço."),
  date: z.date(),
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

export const createOwnerBooking = protectedActionClient
  .inputSchema(inputSchema)
  .action(
    async ({
      parsedInput: { clientUserId, barberId, serviceIds, date },
      ctx: { user },
    }) => {
      if (user.role !== "OWNER") {
        returnValidationErrors(inputSchema, {
          _errors: ["Apenas owners podem criar agendamentos manuais."],
        });
      }

      const ownerBarbershop = await getOwnerBarbershopIdByUserId(user.id);

      if (!ownerBarbershop) {
        returnValidationErrors(inputSchema, {
          _errors: ["Barbearia do owner não encontrada."],
        });
      }

      if (
        isBookingDateTimeAtOrBeforeNowWithBuffer(
          date,
          BOOKING_SLOT_BUFFER_MINUTES,
        )
      ) {
        returnValidationErrors(inputSchema, {
          _errors: [
            "Data e horário selecionados já passaram ou estão muito próximos do horário atual.",
          ],
        });
      }

      const uniqueServiceIds = Array.from(new Set(serviceIds));

      if (uniqueServiceIds.length === 0) {
        returnValidationErrors(inputSchema, {
          _errors: ["Selecione ao menos um serviço."],
        });
      }

      const {
        start: selectedDateStart,
        endExclusive: selectedDateEndExclusive,
      } = getBookingDayBounds(date);

      const [clientUser, clientHistoryBooking, barber, services, barbershop] =
        await Promise.all([
          prisma.user.findUnique({
            where: {
              id: clientUserId,
            },
            select: {
              id: true,
            },
          }),
          prisma.booking.findFirst({
            where: {
              barbershopId: ownerBarbershop.id,
              userId: clientUserId,
            },
            select: {
              id: true,
            },
          }),
          prisma.barber.findFirst({
            where: {
              id: barberId,
              barbershopId: ownerBarbershop.id,
            },
            select: {
              id: true,
            },
          }),
          prisma.barbershopService.findMany({
            where: {
              id: {
                in: uniqueServiceIds,
              },
              barbershopId: ownerBarbershop.id,
              deletedAt: null,
            },
            select: {
              id: true,
              name: true,
              priceInCents: true,
              durationInMinutes: true,
            },
          }),
          prisma.barbershop.findUnique({
            where: {
              id: ownerBarbershop.id,
            },
            select: {
              id: true,
            },
          }),
        ]);

      if (!barbershop) {
        returnValidationErrors(inputSchema, {
          _errors: ["Barbearia não encontrada."],
        });
      }

      if (!clientUser) {
        returnValidationErrors(inputSchema, {
          _errors: ["Cliente não encontrado."],
        });
      }

      if (!clientHistoryBooking) {
        returnValidationErrors(inputSchema, {
          _errors: ["Selecione um cliente que já tenha atendido nesta barbearia."],
        });
      }

      if (!barber) {
        returnValidationErrors(inputSchema, {
          _errors: ["Barbeiro não encontrado para esta barbearia."],
        });
      }

      if (services.length !== uniqueServiceIds.length) {
        returnValidationErrors(inputSchema, {
          _errors: ["Um ou mais serviços selecionados não estão disponíveis."],
        });
      }

      const hasInvalidService = services.some((service) =>
        hasInvalidServiceData(service),
      );

      if (hasInvalidService) {
        returnValidationErrors(inputSchema, {
          _errors: [
            "Um ou mais serviços estão temporariamente indisponíveis para agendamento.",
          ],
        });
      }

      const { totalDurationMinutes, totalPriceInCents } =
        calculateBookingTotals(services);

      if (totalDurationMinutes <= 0) {
        returnValidationErrors(inputSchema, {
          _errors: ["Não foi possível calcular a duração total do agendamento."],
        });
      }

      const bookings = await prisma.booking.findMany({
        where: {
          barbershopId: ownerBarbershop.id,
          AND: [
            {
              OR: [{ barberId: barber.id }, { barberId: null }],
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
        getBookingMinuteOfDay(date),
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
          _errors: ["Horário indisponível para este barbeiro."],
        });
      }

      const endAt = new Date(date.getTime() + totalDurationMinutes * 60_000);

      const createdBooking = await prisma.booking.create({
        data: {
          serviceId: uniqueServiceIds[0]!,
          date: date.toISOString(),
          startAt: date.toISOString(),
          endAt: endAt.toISOString(),
          totalDurationMinutes,
          totalPriceInCents,
          userId: clientUser.id,
          barberId: barber.id,
          barbershopId: ownerBarbershop.id,
          paymentMethod: "IN_PERSON",
          paymentStatus: UNPAID_PAYMENT_STATUS,
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
          date: true,
          totalPriceInCents: true,
          paymentStatus: true,
          barber: {
            select: {
              name: true,
            },
          },
          services: {
            select: {
              service: {
                select: {
                  name: true,
                  priceInCents: true,
                  durationInMinutes: true,
                },
              },
            },
          },
          barbershop: {
            select: {
              name: true,
              phones: true,
            },
          },
          user: {
            select: {
              name: true,
              phone: true,
            },
          },
        },
      });

      try {
        await scheduleBookingNotificationJobs(createdBooking.id);
      } catch (error) {
        console.error(
          "[createOwnerBooking] Falha ao agendar notificações para o booking criado.",
          {
            error,
            bookingId: createdBooking.id,
            ownerUserId: user.id,
          },
        );
      }

      try {
        revalidateBookingSurfaces();
      } catch (error) {
        console.error("[createOwnerBooking] Falha ao revalidar superfícies.", {
          error,
          bookingId: createdBooking.id,
          ownerUserId: user.id,
        });
      }

      return {
        ...createdBooking,
        status: "confirmed" as const,
      };
    },
  );
