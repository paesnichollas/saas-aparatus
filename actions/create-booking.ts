"use server";

import { protectedActionClient } from "@/lib/action-client";
import {
  getBookingDurationMinutes,
  getBookingStartDate,
} from "@/lib/booking-calculations";
import { hasMinuteIntervalOverlap, toMinuteOfDay } from "@/lib/booking-interval";
import { ACTIVE_BOOKING_PAYMENT_WHERE } from "@/lib/booking-payment";
import { prisma } from "@/lib/prisma";
import { endOfDay, isPast, startOfDay } from "date-fns";
import { returnValidationErrors } from "next-safe-action";
import { z } from "zod";

const inputSchema = z.object({
  serviceId: z.uuid(),
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

export const createBooking = protectedActionClient
  .inputSchema(inputSchema)
  .action(async ({ parsedInput: { serviceId, date }, ctx: { user } }) => {
    if (isPast(date)) {
      returnValidationErrors(inputSchema, {
        _errors: ["Data e hora selecionadas já passaram."],
      });
    }

    const service = await prisma.barbershopService.findFirst({
      where: {
        id: serviceId,
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

    const defaultBarber = await prisma.barber.findFirst({
      where: {
        barbershopId: service.barbershopId,
      },
      orderBy: {
        name: "asc",
      },
      select: {
        id: true,
      },
    });

    const bookings = await prisma.booking.findMany({
      where: {
        barbershopId: service.barbershopId,
        AND: [
          {
            OR: [{ barberId: defaultBarber?.id ?? null }, { barberId: null }],
          },
          ACTIVE_BOOKING_PAYMENT_WHERE,
        ],
        date: {
          gte: startOfDay(date),
          lte: endOfDay(date),
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
      toMinuteOfDay(date),
      service.durationInMinutes,
      bookings.map((booking) => {
        const startMinute = toMinuteOfDay(getBookingStartDate(booking));
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
        barberId: defaultBarber?.id ?? null,
        barbershopId: service.barbershopId,
        paymentMethod: "IN_PERSON",
        paymentStatus: "PAID",
        services: {
          create: {
            serviceId,
          },
        },
      },
    });

    return booking;
  });
