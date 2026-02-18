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
  getBookingDurationMinutes,
  getBookingStartDate,
} from "@/lib/booking-calculations";
import { hasMinuteIntervalOverlap } from "@/lib/booking-interval";
import { ACTIVE_BOOKING_PAYMENT_WHERE } from "@/lib/booking-payment";
import { prisma } from "@/lib/prisma";
import { returnValidationErrors } from "next-safe-action";
import { z } from "zod";

const inputSchema = z.object({
  barbershopId: z.uuid(),
  serviceId: z.uuid(),
  barberId: z.uuid(),
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

export const createBooking = criticalActionClient
  .inputSchema(inputSchema)
  .action(async ({ parsedInput: { barbershopId, serviceId, barberId, date }, ctx: { user } }) => {
    if (isBookingDateTimeAtOrBeforeNowWithBuffer(date, BOOKING_SLOT_BUFFER_MINUTES)) {
      returnValidationErrors(inputSchema, {
        _errors: [
          "Data e horario selecionados ja passaram ou estao muito proximos do horario atual.",
        ],
      });
    }

    const {
      start: selectedDateStart,
      endExclusive: selectedDateEndExclusive,
    } = getBookingDayBounds(date);

    const service = await prisma.barbershopService.findFirst({
      where: {
        id: serviceId,
        barbershopId,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        priceInCents: true,
        barbershopId: true,
        durationInMinutes: true,
        barbershop: {
          select: {
            isActive: true,
          },
        },
      },
    });

    if (!service) {
      returnValidationErrors(inputSchema, {
        _errors: ["Serviço não encontrado. Por favor, selecione outro serviço."],
      });
    }

    if (hasInvalidServiceData(service)) {
      console.error("[createBooking] Invalid service data.", {
        serviceId,
        service,
      });
      returnValidationErrors(inputSchema, {
        _errors: [
          "Este serviço está temporariamente indisponível para reserva. Tente novamente mais tarde.",
        ],
      });
    }

    if (!service.barbershop.isActive) {
      returnValidationErrors(inputSchema, {
        _errors: ["Barbearia indisponivel para reservas."],
      });
    }

    const barber = await prisma.barber.findFirst({
      where: {
        id: barberId,
        barbershopId,
      },
      select: {
        id: true,
      },
    });

    if (!barber) {
      returnValidationErrors(inputSchema, {
        _errors: ["Barbeiro nao encontrado para esta barbearia."],
      });
    }

    const bookings = await prisma.booking.findMany({
      where: {
        barbershopId,
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
      service.durationInMinutes,
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
        _errors: ["Data e hora selecionadas já estão agendadas."],
      });
    }

    const booking = await prisma.booking.create({
      data: {
        serviceId,
        date: date.toISOString(),
        startAt: date.toISOString(),
        endAt: new Date(
          date.getTime() + service.durationInMinutes * 60_000,
        ).toISOString(),
        totalDurationMinutes: service.durationInMinutes,
        totalPriceInCents: service.priceInCents,
        userId: user.id,
        barberId: barber.id,
        barbershopId,
        paymentMethod: "IN_PERSON",
        paymentStatus: "PAID",
        services: {
          create: {
            serviceId,
          },
        },
      },
    });

    await scheduleBookingNotificationJobs(booking.id);
    revalidateBookingSurfaces();

    return booking;
  });
