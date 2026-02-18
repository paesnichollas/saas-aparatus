import { prisma } from "@/lib/prisma";
import { revalidateBookingSurfaces } from "@/lib/cache-invalidation";
import {
  cancelPendingBookingNotificationJobs,
  scheduleBookingNotificationJobs,
} from "@/lib/notifications/notification-jobs";
import { NextResponse } from "next/server";
import Stripe from "stripe";


const STRIPE_API_VERSION: Stripe.LatestApiVersion = "2026-01-28.clover";

export const runtime = "nodejs";

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

const buildErrorResponse = (
  status: number,
  message: string,
  details?: Record<string, unknown>,
) => {
  console.error("[stripeWebhook] Request failed.", {
    status,
    message,
    ...details,
  });
  return NextResponse.json({ received: false, message }, { status });
};

const confirmCompletedCheckoutSession = async (
  stripe: Stripe,
  session: Stripe.Checkout.Session,
  eventId: string,
) => {
  if (!session.id) {
    return buildErrorResponse(400, "Stripe checkout session sem identificador.");
  }

  const expandedSession = await stripe.checkout.sessions.retrieve(session.id, {
    expand: ["payment_intent"],
  });

  if (expandedSession.payment_status !== "paid") {
    return buildErrorResponse(409, "Checkout session ainda nao foi pago.", {
      sessionId: session.id,
      paymentStatus: expandedSession.payment_status,
    });
  }

  const chargeId = resolveChargeId(
    expandedSession.payment_intent as Stripe.PaymentIntent | string | null,
  );

  const existingBooking = await prisma.booking.findUnique({
    where: {
      stripeSessionId: session.id,
    },
    select: {
      id: true,
      paymentStatus: true,
      stripeChargeId: true,
    },
  });

  if (!existingBooking) {
    return buildErrorResponse(409, "Reserva pendente nao encontrada para sessao Stripe.", {
      sessionId: session.id,
    });
  }

  if (existingBooking.paymentStatus === "PAID") {
    if (
      chargeId &&
      existingBooking.stripeChargeId &&
      existingBooking.stripeChargeId !== chargeId
    ) {
      return buildErrorResponse(409, "Reserva ja confirmada com charge diferente.", {
        sessionId: session.id,
        existingChargeId: existingBooking.stripeChargeId,
        receivedChargeId: chargeId,
      });
    }

    console.info("[stripeWebhook] Checkout session already reconciled.", {
      eventId,
      sessionId: session.id,
      bookingId: existingBooking.id,
      paymentStatus: existingBooking.paymentStatus,
    });
    return NextResponse.json({ received: true });
  }

  await prisma.booking.update({
    where: {
      id: existingBooking.id,
    },
    data: {
      paymentStatus: "PAID",
      paymentConfirmedAt: new Date(),
      cancelledAt: null,
      stripeChargeId: chargeId ?? existingBooking.stripeChargeId ?? null,
    },
  });

  await scheduleBookingNotificationJobs(existingBooking.id);
  revalidateBookingSurfaces();

  console.info("[stripeWebhook] Checkout session reconciled as paid.", {
    eventId,
    sessionId: session.id,
    bookingId: existingBooking.id,
    chargeId,
  });

  return NextResponse.json({ received: true });
};

const failCheckoutSessionBooking = async (
  session: Stripe.Checkout.Session,
  eventId: string,
) => {
  if (!session.id) {
    return buildErrorResponse(400, "Stripe checkout session sem identificador.");
  }

  const existingBooking = await prisma.booking.findUnique({
    where: {
      stripeSessionId: session.id,
    },
    select: {
      id: true,
      paymentStatus: true,
    },
  });

  if (!existingBooking) {
    return buildErrorResponse(409, "Reserva pendente nao encontrada para sessao Stripe.", {
      sessionId: session.id,
    });
  }

  if (existingBooking.paymentStatus === "PAID") {
    console.info("[stripeWebhook] Ignoring failed event for already paid booking.", {
      eventId,
      sessionId: session.id,
      bookingId: existingBooking.id,
    });
    return NextResponse.json({ received: true });
  }

  await prisma.booking.update({
    where: {
      id: existingBooking.id,
    },
    data: {
      paymentStatus: "FAILED",
      cancelledAt: new Date(),
      paymentConfirmedAt: null,
    },
  });

  await cancelPendingBookingNotificationJobs(existingBooking.id, "payment_failed");
  revalidateBookingSurfaces();

  console.info("[stripeWebhook] Checkout session marked as failed.", {
    eventId,
    sessionId: session.id,
    bookingId: existingBooking.id,
    eventType: "checkout.session.expired|checkout.session.async_payment_failed",
  });

  return NextResponse.json({ received: true });
};

export const POST = async (request: Request) => {
  if (
    !process.env.STRIPE_SECRET_KEY ||
    !process.env.STRIPE_WEBHOOK_SECRET_KEY
  ) {
    return buildErrorResponse(
      500,
      "STRIPE_SECRET_KEY ou STRIPE_WEBHOOK_SECRET_KEY nao configurados.",
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return buildErrorResponse(400, "Cabecalho stripe-signature ausente.");
  }

  const body = await request.text();
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: STRIPE_API_VERSION,
  });

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET_KEY,
    );
  } catch (error) {
    return buildErrorResponse(400, "Falha ao validar assinatura do webhook Stripe.", {
      error,
    });
  }

  console.info("[stripeWebhook] Event received.", {
    eventId: event.id,
    eventType: event.type,
  });

  try {
    if (event.type === "checkout.session.completed") {
      return await confirmCompletedCheckoutSession(
        stripe,
        event.data.object as Stripe.Checkout.Session,
        event.id,
      );
    }

    if (
      event.type === "checkout.session.expired" ||
      event.type === "checkout.session.async_payment_failed"
    ) {
      return await failCheckoutSessionBooking(
        event.data.object as Stripe.Checkout.Session,
        event.id,
      );
    }
  } catch (error) {
    return buildErrorResponse(500, "Erro interno ao processar evento Stripe.", {
      eventId: event.id,
      eventType: event.type,
      error,
    });
  }

  console.info("[stripeWebhook] Event ignored.", {
    eventId: event.id,
    eventType: event.type,
  });

  return NextResponse.json({ received: true });
};
