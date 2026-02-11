"use server";

import { actionClient } from "@/lib/action-client";
import {
  BOOKING_SLOT_BUFFER_MINUTES,
  getBookingDayBounds,
  getBookingMinuteOfDay,
  isSameBookingDay,
} from "@/lib/booking-time";
import {
  getBookingDurationMinutes,
  getBookingStartDate,
} from "@/lib/booking-calculations";
import { toTimeSlotLabel } from "@/lib/booking-interval";
import { ACTIVE_BOOKING_PAYMENT_WHERE } from "@/lib/booking-payment";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const DEFAULT_OPEN_MINUTE = 9 * 60;
const DEFAULT_CLOSE_MINUTE = 17 * 60;

const inputSchema = z.object({
  barbershopId: z.uuid(),
  barberId: z.uuid().optional(),
  serviceId: z.uuid().optional(),
  serviceIds: z.array(z.uuid()).min(1).optional(),
  date: z.date(),
});

export const getDateAvailableTimeSlots = actionClient
  .inputSchema(inputSchema)
  .action(async ({ parsedInput: { barbershopId, barberId, serviceId, serviceIds, date } }) => {
    const {
      dayOfWeek: selectedDateDayOfWeek,
      start: selectedDateStart,
      endExclusive: selectedDateEndExclusive,
    } = getBookingDayBounds(date);

    const uniqueServiceIds = Array.from(
      new Set(serviceIds ?? (serviceId ? [serviceId] : [])),
    );

    if (uniqueServiceIds.length === 0) {
      return [];
    }

    const [barbershop, barber, services] = await Promise.all([
      prisma.barbershop.findUnique({
        where: {
          id: barbershopId,
        },
        select: {
          isActive: true,
          openingHours: {
            where: {
              dayOfWeek: selectedDateDayOfWeek,
            },
            take: 1,
          },
        },
      }),
      barberId
        ? prisma.barber.findFirst({
            where: {
              barbershopId,
              id: barberId,
            },
          })
        : prisma.barber.findFirst({
            where: {
              barbershopId,
            },
            orderBy: {
              name: "asc",
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
          durationInMinutes: true,
        },
      }),
    ]);

    if (
      !barbershop ||
      !barbershop.isActive ||
      !barber ||
      services.length !== uniqueServiceIds.length
    ) {
      return [];
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
      orderBy: {
        date: "asc",
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

    const openingHour = barbershop.openingHours[0];
    const closed = openingHour?.closed ?? false;
    const openMinute = openingHour?.openMinute ?? DEFAULT_OPEN_MINUTE;
    const closeMinute = openingHour?.closeMinute ?? DEFAULT_CLOSE_MINUTE;

    if (closed || closeMinute <= openMinute) {
      return [];
    }

    const totalDurationInMinutes = services.reduce((accumulator, service) => {
      return accumulator + service.durationInMinutes;
    }, 0);

    if (totalDurationInMinutes <= 0) {
      return [];
    }

    const occupiedIntervals = bookings.map((booking) => {
      const startMinute = getBookingMinuteOfDay(getBookingStartDate(booking));
      const durationInMinutes = getBookingDurationMinutes(booking);
      return {
        startMinute,
        endMinute: startMinute + durationInMinutes,
      };
    });

    const now = new Date();
    const isToday = isSameBookingDay(date, now);
    const minimumAllowedStartMinute = isToday
      ? getBookingMinuteOfDay(now) + BOOKING_SLOT_BUFFER_MINUTES
      : null;
    const availableTimeSlots: string[] = [];
    const lastAvailableStartMinute = closeMinute - totalDurationInMinutes;

    if (lastAvailableStartMinute < openMinute) {
      return [];
    }

    let slotStartMinute = openMinute;

    while (slotStartMinute <= lastAvailableStartMinute) {
      if (
        minimumAllowedStartMinute !== null &&
        slotStartMinute <= minimumAllowedStartMinute
      ) {
        slotStartMinute += totalDurationInMinutes;
        continue;
      }

      const slotEndMinute = slotStartMinute + totalDurationInMinutes;
      const conflictInterval = occupiedIntervals.find((interval) => {
        return (
          slotStartMinute < interval.endMinute &&
          slotEndMinute > interval.startMinute
        );
      });

      if (conflictInterval) {
        slotStartMinute = Math.max(slotStartMinute + 1, conflictInterval.endMinute);
        continue;
      }

      availableTimeSlots.push(toTimeSlotLabel(slotStartMinute));
      slotStartMinute += totalDurationInMinutes;
    }

    return Array.from(new Set(availableTimeSlots));
  });
