import {
  type PaymentMethod,
  type PaymentStatus,
  Prisma,
} from "@/generated/prisma/client";

export const UNPAID_PAYMENT_STATUS: PaymentStatus = "PENDING";

export const PAID_BOOKING_PAYMENT_WHERE: Prisma.BookingWhereInput = {
  paymentStatus: "PAID",
};

interface ResolveInitialPaymentStateInput {
  stripeEnabled: boolean;
  requestedPaymentMethod: PaymentMethod;
  allowStripeCheckout: boolean;
}

interface ResolveInitialPaymentStateOutput {
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  requiresStripeCheckout: boolean;
}

interface OwnerMarkBookingAsPaidEligibilityInput {
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  cancelledAt: Date | null;
  startAt: Date | null;
  date: Date;
}

export const resolveInitialPaymentState = ({
  stripeEnabled,
  requestedPaymentMethod,
  allowStripeCheckout,
}: ResolveInitialPaymentStateInput): ResolveInitialPaymentStateOutput => {
  if (!stripeEnabled) {
    return {
      paymentMethod: "IN_PERSON",
      paymentStatus: UNPAID_PAYMENT_STATUS,
      requiresStripeCheckout: false,
    };
  }

  if (requestedPaymentMethod === "STRIPE" && allowStripeCheckout) {
    return {
      paymentMethod: "STRIPE",
      paymentStatus: UNPAID_PAYMENT_STATUS,
      requiresStripeCheckout: true,
    };
  }

  return {
    paymentMethod: "IN_PERSON",
    paymentStatus: UNPAID_PAYMENT_STATUS,
    requiresStripeCheckout: false,
  };
};

export const canOwnerMarkBookingAsPaid = (
  booking: OwnerMarkBookingAsPaidEligibilityInput,
  now = new Date(),
) => {
  if (booking.paymentMethod !== "IN_PERSON") {
    return false;
  }

  if (booking.paymentStatus !== UNPAID_PAYMENT_STATUS) {
    return false;
  }

  if (booking.cancelledAt) {
    return false;
  }

  const bookingStartAt = booking.startAt ?? booking.date;
  return bookingStartAt.getTime() <= now.getTime();
};

export const ACTIVE_BOOKING_PAYMENT_WHERE: Prisma.BookingWhereInput = {
  OR: [
    {
      paymentMethod: "IN_PERSON",
    },
    {
      paymentStatus: {
        in: ["PENDING", "PAID"],
      },
    },
    {
      stripeChargeId: {
        not: null,
      },
    },
  ],
};

export const CONFIRMED_BOOKING_PAYMENT_WHERE: Prisma.BookingWhereInput = {
  OR: [
    {
      paymentMethod: "IN_PERSON",
    },
    {
      ...PAID_BOOKING_PAYMENT_WHERE,
    },
    {
      stripeChargeId: {
        not: null,
      },
    },
  ],
};
