import {
  type NotificationJobType,
  NotificationJobStatus,
  PaymentStatus,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

const NOTIFICATION_OFFSETS_IN_MINUTES: ReadonlyArray<{
  type: NotificationJobType;
  offsetInMinutes: number;
}> = [
  { type: "BOOKING_CONFIRM", offsetInMinutes: 0 },
  { type: "REMINDER_24H", offsetInMinutes: -24 * 60 },
  { type: "REMINDER_1H", offsetInMinutes: -60 },
];

const scheduleAt = (bookingDate: Date, offsetInMinutes: number) => {
  const scheduledAt = new Date(bookingDate.getTime() + offsetInMinutes * 60_000);

  if (offsetInMinutes === 0) {
    return scheduledAt;
  }

  return scheduledAt > new Date() ? scheduledAt : new Date();
};

export const scheduleBookingNotificationJobs = async (bookingId: string) => {
  try {
    const booking = await prisma.booking.findUnique({
      where: {
        id: bookingId,
      },
      select: {
        id: true,
        date: true,
        barbershopId: true,
        cancelledAt: true,
        paymentStatus: true,
      },
    });

    if (!booking || booking.cancelledAt) {
      return;
    }

    if (booking.paymentStatus !== PaymentStatus.PAID) {
      return;
    }

    await Promise.all(
      NOTIFICATION_OFFSETS_IN_MINUTES.map(({ type, offsetInMinutes }) => {
        return prisma.notificationJob.upsert({
          where: {
            bookingId_type: {
              bookingId: booking.id,
              type,
            },
          },
          create: {
            bookingId: booking.id,
            barbershopId: booking.barbershopId,
            type,
            scheduledAt: scheduleAt(booking.date, offsetInMinutes),
            status: NotificationJobStatus.PENDING,
          },
          update: {
            scheduledAt: scheduleAt(booking.date, offsetInMinutes),
            status: NotificationJobStatus.PENDING,
            attempts: 0,
            lastError: null,
            sentAt: null,
            canceledAt: null,
            cancelReason: null,
          },
        });
      }),
    );
  } catch (error) {
    console.warn("[notification-jobs] Failed to schedule jobs.", {
      error,
      bookingId,
    });
  }
};

export const cancelPendingBookingNotificationJobs = async (
  bookingId: string,
  cancelReason: string,
) => {
  try {
    await prisma.notificationJob.updateMany({
      where: {
        bookingId,
        canceledAt: null,
        status: {
          in: [NotificationJobStatus.PENDING, NotificationJobStatus.SENDING],
        },
      },
      data: {
        status: NotificationJobStatus.CANCELED,
        canceledAt: new Date(),
        cancelReason: cancelReason.trim(),
      },
    });
  } catch (error) {
    console.warn("[notification-jobs] Failed to cancel pending jobs.", {
      error,
      bookingId,
      cancelReason,
    });
  }
};
