"use server";

import { actionClient } from "@/lib/action-client";
import {
  hasMinuteIntervalOverlap,
  toMinuteOfDay,
  toTimeSlotLabel,
} from "@/lib/booking-interval";
import { prisma } from "@/lib/prisma";
import { endOfDay, isSameDay, startOfDay } from "date-fns";
import { z } from "zod";

const DEFAULT_OPEN_MINUTE = 9 * 60;
const DEFAULT_CLOSE_MINUTE = 18 * 60;

const inputSchema = z.object({
  barbershopId: z.uuid(),
  serviceId: z.uuid(),
  date: z.date(),
});

export const getDateAvailableTimeSlots = actionClient
  .inputSchema(inputSchema)
  .action(async ({ parsedInput: { barbershopId, serviceId, date } }) => {
    const [barbershop, service, bookings] = await Promise.all([
      prisma.barbershop.findUnique({
        where: {
          id: barbershopId,
        },
        select: {
          bookingIntervalMinutes: true,
          openingHours: {
            where: {
              dayOfWeek: date.getDay(),
            },
            take: 1,
          },
        },
      }),
      prisma.barbershopService.findFirst({
        where: {
          id: serviceId,
          barbershopId,
          deletedAt: null,
        },
        select: {
          durationInMinutes: true,
        },
      }),
      prisma.booking.findMany({
        where: {
          barbershopId,
          date: {
            gte: startOfDay(date),
            lte: endOfDay(date),
          },
          cancelledAt: null,
        },
        select: {
          date: true,
          service: {
            select: {
              durationInMinutes: true,
            },
          },
        },
      }),
    ]);

    if (!barbershop || !service) {
      return [];
    }

    const openingHour = barbershop.openingHours[0];
    const closed = openingHour?.closed ?? false;
    const openMinute = openingHour?.openMinute ?? DEFAULT_OPEN_MINUTE;
    const closeMinute = openingHour?.closeMinute ?? DEFAULT_CLOSE_MINUTE;

    if (closed || closeMinute <= openMinute) {
      return [];
    }

    const bookingIntervalMinutes = barbershop.bookingIntervalMinutes;
    const serviceDurationInMinutes = service.durationInMinutes;

    if (bookingIntervalMinutes <= 0 || serviceDurationInMinutes <= 0) {
      return [];
    }

    const occupiedIntervals = bookings.map((booking) => {
      const startMinute = toMinuteOfDay(booking.date);
      return {
        startMinute,
        endMinute: startMinute + booking.service.durationInMinutes,
      };
    });

    const now = new Date();
    const isToday = isSameDay(date, now);
    const availableTimeSlots: string[] = [];
    const lastAvailableStartMinute = closeMinute - serviceDurationInMinutes;

    if (lastAvailableStartMinute < openMinute) {
      return [];
    }

    for (
      let slotStartMinute = openMinute;
      slotStartMinute <= lastAvailableStartMinute;
      slotStartMinute += bookingIntervalMinutes
    ) {
      if (isToday) {
        const slotDate = new Date(date);
        slotDate.setHours(
          Math.floor(slotStartMinute / 60),
          slotStartMinute % 60,
          0,
          0,
        );
        if (slotDate <= now) {
          continue;
        }
      }

      const hasCollision = hasMinuteIntervalOverlap(
        slotStartMinute,
        serviceDurationInMinutes,
        occupiedIntervals,
      );

      if (!hasCollision) {
        availableTimeSlots.push(toTimeSlotLabel(slotStartMinute));
      }
    }

    return availableTimeSlots;
  });
