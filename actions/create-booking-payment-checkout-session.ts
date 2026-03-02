"use server";

import { protectedActionClient } from "@/lib/action-client";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";
import { returnValidationErrors } from "next-safe-action";
import Stripe from "stripe";
import { z } from "zod";

const inputSchema = z.object({
  bookingId: z.uuid(),
});

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
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");

  if (!host) {
    return null;
  }

  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";

  return parseAbsoluteHttpUrl(`${protocol}://${host}`);
};

const resolveBookingTotalPriceInCents = (booking: {
  totalPriceInCents: number | null;
  services: Array<{ service: { priceInCents: number } }>;
  service: { priceInCents: number };
}) => {
  if (typeof booking.totalPriceInCents === "number") {
    return booking.totalPriceInCents;
  }

  if (booking.services.length > 0) {
    return booking.services.reduce((sum, bookingService) => {
      return sum + bookingService.service.priceInCents;
    }, 0);
  }

  return booking.service.priceInCents;
};

const resolveServiceNamesLabel = (booking: {
  services: Array<{ service: { name: string } }>;
  service: { name: string };
}) => {
  if (booking.services.length > 0) {
    return booking.services
      .map((bookingService) => bookingService.service.name)
      .join(", ")
      .slice(0, 300);
  }

  return booking.service.name.slice(0, 300);
};

const shouldReuseOpenSession = (session: Stripe.Checkout.Session) => {
  if (session.payment_status === "paid") {
    return false;
  }

  return session.status !== "expired" && typeof session.url === "string";
};

export const createBookingPaymentCheckoutSession = protectedActionClient
  .inputSchema(inputSchema)
  .action(async ({ parsedInput: { bookingId }, ctx: { user } }) => {
    const booking = await prisma.booking.findUnique({
      where: {
        id: bookingId,
      },
      select: {
        id: true,
        userId: true,
        barbershopId: true,
        paymentMethod: true,
        paymentStatus: true,
        stripeSessionId: true,
        cancelledAt: true,
        startAt: true,
        endAt: true,
        date: true,
        totalDurationMinutes: true,
        totalPriceInCents: true,
        barbershop: {
          select: {
            id: true,
            name: true,
          },
        },
        barber: {
          select: {
            id: true,
            name: true,
          },
        },
        service: {
          select: {
            id: true,
            name: true,
            priceInCents: true,
          },
        },
        services: {
          select: {
            service: {
              select: {
                id: true,
                name: true,
                priceInCents: true,
              },
            },
          },
        },
      },
    });

    if (!booking) {
      returnValidationErrors(inputSchema, {
        _errors: ["Agendamento não encontrado."],
      });
    }

    if (booking.userId !== user.id) {
      returnValidationErrors(inputSchema, {
        _errors: ["Sem permissão para continuar este pagamento."],
      });
    }

    if (booking.cancelledAt) {
      returnValidationErrors(inputSchema, {
        _errors: ["Este agendamento foi cancelado e não pode ser pago."],
      });
    }

    if (booking.paymentMethod !== "STRIPE") {
      returnValidationErrors(inputSchema, {
        _errors: ["Este agendamento não utiliza pagamento online."],
      });
    }

    if (booking.paymentStatus !== "PENDING") {
      returnValidationErrors(inputSchema, {
        _errors: ["Este agendamento já foi processado e não pode abrir checkout."],
      });
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      returnValidationErrors(inputSchema, {
        _errors: ["Chave de API do Stripe não encontrada."],
      });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2026-01-28.clover",
    });

    if (booking.stripeSessionId) {
      try {
        const existingSession = await stripe.checkout.sessions.retrieve(
          booking.stripeSessionId,
          {
            expand: ["payment_intent"],
          },
        );

        if (existingSession.payment_status === "paid") {
          returnValidationErrors(inputSchema, {
            _errors: ["Este pagamento já foi confirmado. Atualize seus agendamentos."],
          });
        }

        if (shouldReuseOpenSession(existingSession) && existingSession.url) {
          return {
            bookingId: booking.id,
            sessionId: existingSession.id,
            checkoutUrl: existingSession.url,
          };
        }
      } catch (error) {
        console.error(
          "[createBookingPaymentCheckoutSession] Failed to retrieve existing Stripe session.",
          {
            error,
            bookingId: booking.id,
            stripeSessionId: booking.stripeSessionId,
          },
        );
      }
    }

    const totalPriceInCents = resolveBookingTotalPriceInCents(booking);
    if (totalPriceInCents < 1) {
      returnValidationErrors(inputSchema, {
        _errors: ["O valor deste agendamento é inválido para pagamento online."],
      });
    }

    const appBaseUrl = await getAppBaseUrl();
    if (!appBaseUrl) {
      returnValidationErrors(inputSchema, {
        _errors: ["Configuração de URL da aplicação inválida. Tente novamente."],
      });
    }

    const bookingStartAt = booking.startAt ?? booking.date;
    const bookingEndAt =
      booking.endAt ??
      new Date(
        bookingStartAt.getTime() +
          (booking.totalDurationMinutes ?? 30) *
            60_000,
      );
    const serviceDescription = resolveServiceNamesLabel(booking);
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
          bookingId: booking.id,
          userId: booking.userId,
          barbershopId: booking.barbershop.id,
          barberId: booking.barber?.id ?? "",
          serviceId: booking.service.id,
          startAt: bookingStartAt.toISOString(),
          endAt: bookingEndAt.toISOString(),
          date: bookingStartAt.toISOString(),
          totalDurationMinutes: String(booking.totalDurationMinutes ?? 30),
          totalPriceInCents: String(totalPriceInCents),
        },
        line_items: [
          {
            price_data: {
              currency: "brl",
              unit_amount: totalPriceInCents,
              product_data: {
                name: `${booking.barbershop.name} - Pagamento de agendamento`,
                description: `Barbeiro: ${booking.barber?.name ?? "Não informado"}. Serviços: ${serviceDescription}`,
              },
            },
            quantity: 1,
          },
        ],
      });
    } catch (error) {
      console.error("[createBookingPaymentCheckoutSession] Stripe checkout error.", {
        error,
        bookingId: booking.id,
      });
      returnValidationErrors(inputSchema, {
        _errors: ["Não foi possível iniciar o pagamento agora. Tente novamente."],
      });
    }

    if (!checkoutSession.url) {
      try {
        await stripe.checkout.sessions.expire(checkoutSession.id);
      } catch (expireError) {
        console.error(
          "[createBookingPaymentCheckoutSession] Failed to expire session without checkout url.",
          {
            expireError,
            bookingId: booking.id,
            checkoutSessionId: checkoutSession.id,
          },
        );
      }

      returnValidationErrors(inputSchema, {
        _errors: ["Não foi possível iniciar o pagamento agora. Tente novamente."],
      });
    }

    try {
      await prisma.booking.update({
        where: {
          id: booking.id,
        },
        data: {
          stripeSessionId: checkoutSession.id,
        },
        select: {
          id: true,
        },
      });
    } catch (error) {
      console.error(
        "[createBookingPaymentCheckoutSession] Failed to attach checkout session to booking.",
        {
          error,
          bookingId: booking.id,
          checkoutSessionId: checkoutSession.id,
        },
      );

      try {
        await stripe.checkout.sessions.expire(checkoutSession.id);
      } catch (expireError) {
        console.error(
          "[createBookingPaymentCheckoutSession] Failed to expire Stripe session after booking update error.",
          {
            expireError,
            bookingId: booking.id,
            checkoutSessionId: checkoutSession.id,
          },
        );
      }

      returnValidationErrors(inputSchema, {
        _errors: [
          "Não foi possível preparar este pagamento agora. Tente novamente em alguns instantes.",
        ],
      });
    }

    return {
      bookingId: booking.id,
      sessionId: checkoutSession.id,
      checkoutUrl: checkoutSession.url,
    };
  });
