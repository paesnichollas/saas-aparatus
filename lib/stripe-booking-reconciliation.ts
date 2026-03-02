import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  cancelPendingBookingNotificationJobs,
  scheduleBookingNotificationJobs,
} from "@/lib/notifications/notification-jobs";
import { tryFulfillWaitlistForReleasedSlot } from "@/lib/waitlist-fulfillment";
import Stripe from "stripe";

const STRIPE_API_VERSION: Stripe.LatestApiVersion = "2026-01-28.clover";
const DEFAULT_LOOKBACK_HOURS = 24;
const DEFAULT_USER_RECONCILIATION_LIMIT = 20;
const DEFAULT_BARBERSHOP_RECONCILIATION_LIMIT = 30;

type BookingReconciliationRecord = Prisma.BookingGetPayload<{
  select: {
    id: true;
    stripeSessionId: true;
    stripeChargeId: true;
    paymentMethod: true;
    paymentStatus: true;
    barbershopId: true;
    barberId: true;
    serviceId: true;
    date: true;
    startAt: true;
    endAt: true;
    totalDurationMinutes: true;
  };
}>;

const resolveChargeId = (
  paymentIntent: Stripe.PaymentIntent | string | null,
) => {
  if (!paymentIntent || typeof paymentIntent === "string") {
    return null;
  }

  if (typeof paymentIntent.latest_charge === "string") {
    return paymentIntent.latest_charge;
  }

  return paymentIntent.latest_charge?.id ?? null;
};

const shouldMarkSessionAsFailed = (session: Stripe.Checkout.Session) => {
  if (session.status === "expired") {
    return true;
  }

  return session.status === "complete" && session.payment_status !== "paid";
};

const createStripeClient = () => {
  if (!process.env.STRIPE_SECRET_KEY) {
    return null;
  }

  return new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: STRIPE_API_VERSION,
  });
};

const logReconciliation = (
  action: "updated-paid" | "updated-failed" | "kept-pending" | "skipped",
  details: Record<string, unknown>,
) => {
  console.info("[stripeBookingReconciliation] Result.", {
    action,
    ...details,
  });
};

const reconcilePendingBooking = async ({
  booking,
  stripe,
  source,
}: {
  booking: BookingReconciliationRecord;
  stripe: Stripe;
  source: "session-id" | "user-list" | "barbershop-list";
}) => {
  if (!booking.stripeSessionId) {
    logReconciliation("skipped", {
      source,
      bookingId: booking.id,
      reason: "missing-session-id",
    });
    return;
  }

  if (booking.paymentStatus !== "PENDING") {
    logReconciliation("skipped", {
      source,
      bookingId: booking.id,
      stripeSessionId: booking.stripeSessionId,
      reason: `already-${booking.paymentStatus.toLowerCase()}`,
    });
    return;
  }

  if (booking.paymentMethod !== "STRIPE") {
    logReconciliation("skipped", {
      source,
      bookingId: booking.id,
      stripeSessionId: booking.stripeSessionId,
      reason: "invalid-payment-method",
    });
    return;
  }

  const session = await stripe.checkout.sessions.retrieve(booking.stripeSessionId, {
    expand: ["payment_intent"],
  });

  if (session.payment_status === "paid") {
    const chargeId = resolveChargeId(
      session.payment_intent as Stripe.PaymentIntent | string | null,
    );

    await prisma.booking.update({
      where: {
        id: booking.id,
      },
      data: {
        paymentStatus: "PAID",
        paymentConfirmedAt: new Date(),
        cancelledAt: null,
        stripeChargeId: chargeId ?? booking.stripeChargeId ?? null,
      },
    });

    await scheduleBookingNotificationJobs(booking.id);

    logReconciliation("updated-paid", {
      source,
      bookingId: booking.id,
      stripeSessionId: booking.stripeSessionId,
      stripeChargeId: chargeId,
    });
    return;
  }

  if (shouldMarkSessionAsFailed(session)) {
    await prisma.booking.update({
      where: {
        id: booking.id,
      },
      data: {
        paymentStatus: "FAILED",
        paymentConfirmedAt: null,
        cancelledAt: new Date(),
      },
    });

    await cancelPendingBookingNotificationJobs(booking.id, "payment_failed");

    try {
      await tryFulfillWaitlistForReleasedSlot({
        sourceBookingId: booking.id,
        barbershopId: booking.barbershopId,
        barberId: booking.barberId,
        serviceId: booking.serviceId,
        releasedStartAt: booking.startAt ?? booking.date,
        releasedEndAt: booking.endAt,
        releasedDurationMinutes: booking.totalDurationMinutes,
      });
    } catch (error) {
      console.error(
        "[stripeBookingReconciliation] Failed to fulfill waitlist after failed booking.",
        {
          error,
          bookingId: booking.id,
          stripeSessionId: booking.stripeSessionId,
          source,
        },
      );
    }

    logReconciliation("updated-failed", {
      source,
      bookingId: booking.id,
      stripeSessionId: booking.stripeSessionId,
      stripeSessionStatus: session.status,
      stripePaymentStatus: session.payment_status,
    });
    return;
  }

  logReconciliation("kept-pending", {
    source,
    bookingId: booking.id,
    stripeSessionId: booking.stripeSessionId,
    stripeSessionStatus: session.status,
    stripePaymentStatus: session.payment_status,
  });
};

export const reconcilePendingBookingBySessionId = async ({
  stripeSessionId,
  userId,
  barbershopId,
}: {
  stripeSessionId: string;
  userId?: string;
  barbershopId?: string;
}) => {
  const normalizedSessionId = stripeSessionId.trim();
  if (!normalizedSessionId) {
    return;
  }

  const stripe = createStripeClient();
  if (!stripe) {
    console.warn(
      "[stripeBookingReconciliation] STRIPE_SECRET_KEY ausente. Reconciliacao ignorada.",
      {
        source: "session-id",
        stripeSessionId: normalizedSessionId,
      },
    );
    return;
  }

  const booking = await prisma.booking.findFirst({
    where: {
      stripeSessionId: normalizedSessionId,
      paymentMethod: "STRIPE",
      ...(userId ? { userId } : {}),
      ...(barbershopId ? { barbershopId } : {}),
    },
    select: {
      id: true,
      stripeSessionId: true,
      stripeChargeId: true,
      paymentMethod: true,
      paymentStatus: true,
      barbershopId: true,
      barberId: true,
      serviceId: true,
      date: true,
      startAt: true,
      endAt: true,
      totalDurationMinutes: true,
    },
  });

  if (!booking) {
    logReconciliation("skipped", {
      source: "session-id",
      stripeSessionId: normalizedSessionId,
      reason: "booking-not-found",
    });
    return;
  }

  await reconcilePendingBooking({
    booking,
    stripe,
    source: "session-id",
  });
};

export const reconcilePendingBookingsForUser = async (
  userId: string,
  lookbackHours = DEFAULT_LOOKBACK_HOURS,
  limit = DEFAULT_USER_RECONCILIATION_LIMIT,
) => {
  if (!userId) {
    return;
  }

  const stripe = createStripeClient();
  if (!stripe) {
    console.warn(
      "[stripeBookingReconciliation] STRIPE_SECRET_KEY ausente. Reconciliacao ignorada.",
      {
        source: "user-list",
        userId,
      },
    );
    return;
  }

  const lookbackDate = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);
  const pendingBookings = await prisma.booking.findMany({
    where: {
      userId,
      paymentMethod: "STRIPE",
      paymentStatus: "PENDING",
      cancelledAt: null,
      stripeSessionId: {
        not: null,
      },
      createdAt: {
        gte: lookbackDate,
      },
    },
    select: {
      id: true,
      stripeSessionId: true,
      stripeChargeId: true,
      paymentMethod: true,
      paymentStatus: true,
      barbershopId: true,
      barberId: true,
      serviceId: true,
      date: true,
      startAt: true,
      endAt: true,
      totalDurationMinutes: true,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: limit,
  });

  for (const booking of pendingBookings) {
    try {
      await reconcilePendingBooking({
        booking,
        stripe,
        source: "user-list",
      });
    } catch (error) {
      console.error(
        "[stripeBookingReconciliation] Failed to reconcile pending booking for user.",
        {
          error,
          bookingId: booking.id,
          stripeSessionId: booking.stripeSessionId,
          userId,
        },
      );
    }
  }
};

export const reconcilePendingBookingsForBarbershop = async (
  barbershopId: string,
  lookbackHours = DEFAULT_LOOKBACK_HOURS,
  limit = DEFAULT_BARBERSHOP_RECONCILIATION_LIMIT,
) => {
  if (!barbershopId) {
    return;
  }

  const stripe = createStripeClient();
  if (!stripe) {
    console.warn(
      "[stripeBookingReconciliation] STRIPE_SECRET_KEY ausente. Reconciliacao ignorada.",
      {
        source: "barbershop-list",
        barbershopId,
      },
    );
    return;
  }

  const lookbackDate = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);
  const pendingBookings = await prisma.booking.findMany({
    where: {
      barbershopId,
      paymentMethod: "STRIPE",
      paymentStatus: "PENDING",
      cancelledAt: null,
      stripeSessionId: {
        not: null,
      },
      createdAt: {
        gte: lookbackDate,
      },
    },
    select: {
      id: true,
      stripeSessionId: true,
      stripeChargeId: true,
      paymentMethod: true,
      paymentStatus: true,
      barbershopId: true,
      barberId: true,
      serviceId: true,
      date: true,
      startAt: true,
      endAt: true,
      totalDurationMinutes: true,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: limit,
  });

  for (const booking of pendingBookings) {
    try {
      await reconcilePendingBooking({
        booking,
        stripe,
        source: "barbershop-list",
      });
    } catch (error) {
      console.error(
        "[stripeBookingReconciliation] Failed to reconcile pending booking for barbershop.",
        {
          error,
          bookingId: booking.id,
          stripeSessionId: booking.stripeSessionId,
          barbershopId,
        },
      );
    }
  }
};
