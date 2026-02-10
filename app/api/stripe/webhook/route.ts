import { hasMinuteIntervalOverlap, toMinuteOfDay } from "@/lib/booking-interval";
import { prisma } from "@/lib/prisma";
import { endOfDay, startOfDay } from "date-fns";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import z from "zod";

const metadataSchema = z.object({
  serviceId: z.uuid(),
  barbershopId: z.uuid(),
  userId: z.string(),
  date: z.iso.datetime(),
});

export const POST = async (request: Request) => {
  if (
    !process.env.STRIPE_SECRET_KEY ||
    !process.env.STRIPE_WEBHOOK_SECRET_KEY
  ) {
    console.error("STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET is not set");
    return NextResponse.error();
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.error();
  }

  const body = await request.text();
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2026-01-28.clover",
  });

  const event = stripe.webhooks.constructEvent(
    body,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET_KEY,
  );

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const metadata = metadataSchema.parse(session.metadata);
    const bookingDate = new Date(metadata.date);
    const expandedSession = await stripe.checkout.sessions.retrieve(session.id, {
      expand: ["payment_intent"],
    });
    const paymentIntent = expandedSession.payment_intent as Stripe.PaymentIntent;
    const chargeId =
      typeof paymentIntent.latest_charge === "string"
        ? paymentIntent.latest_charge
        : paymentIntent.latest_charge?.id;

    if (chargeId) {
      const existingBookingByCharge = await prisma.booking.findFirst({
        where: {
          stripeChargeId: chargeId,
        },
        select: {
          id: true,
        },
      });

      if (existingBookingByCharge) {
        return NextResponse.json({ received: true });
      }
    }

    const service = await prisma.barbershopService.findUnique({
      where: {
        id: metadata.serviceId,
      },
      select: {
        id: true,
        barbershopId: true,
        durationInMinutes: true,
      },
    });

    if (!service || service.barbershopId !== metadata.barbershopId) {
      return NextResponse.json({ received: true });
    }

    const bookings = await prisma.booking.findMany({
      where: {
        barbershopId: metadata.barbershopId,
        date: {
          gte: startOfDay(bookingDate),
          lte: endOfDay(bookingDate),
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
    });

    const hasCollision = hasMinuteIntervalOverlap(
      toMinuteOfDay(bookingDate),
      service.durationInMinutes,
      bookings.map((booking) => {
        const startMinute = toMinuteOfDay(booking.date);
        return {
          startMinute,
          endMinute: startMinute + booking.service.durationInMinutes,
        };
      }),
    );

    if (!hasCollision) {
      await prisma.booking.create({
        data: {
          serviceId: metadata.serviceId,
          barbershopId: metadata.barbershopId,
          userId: metadata.userId,
          date: metadata.date,
          stripeChargeId: chargeId,
        },
      });
    }
  }

  return NextResponse.json({ received: true });
};
