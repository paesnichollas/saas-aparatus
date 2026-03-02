import { describe, expect, it } from "vitest";

import {
  canOwnerMarkBookingAsPaid,
  resolveInitialPaymentState,
} from "@/lib/booking-payment";

describe("booking-payment", () => {
  describe("resolveInitialPaymentState", () => {
    it("falls back to in-person unpaid when Stripe is disabled", () => {
      const state = resolveInitialPaymentState({
        stripeEnabled: false,
        requestedPaymentMethod: "STRIPE",
        allowStripeCheckout: true,
      });

      expect(state).toEqual({
        paymentMethod: "IN_PERSON",
        paymentStatus: "PENDING",
        requiresStripeCheckout: false,
      });
    });

    it("requires Stripe checkout when Stripe is enabled and selected", () => {
      const state = resolveInitialPaymentState({
        stripeEnabled: true,
        requestedPaymentMethod: "STRIPE",
        allowStripeCheckout: true,
      });

      expect(state).toEqual({
        paymentMethod: "STRIPE",
        paymentStatus: "PENDING",
        requiresStripeCheckout: true,
      });
    });

    it("uses in-person unpaid when Stripe checkout is not allowed", () => {
      const state = resolveInitialPaymentState({
        stripeEnabled: true,
        requestedPaymentMethod: "STRIPE",
        allowStripeCheckout: false,
      });

      expect(state).toEqual({
        paymentMethod: "IN_PERSON",
        paymentStatus: "PENDING",
        requiresStripeCheckout: false,
      });
    });

    it("uses in-person unpaid when customer chooses in-person payment", () => {
      const state = resolveInitialPaymentState({
        stripeEnabled: true,
        requestedPaymentMethod: "IN_PERSON",
        allowStripeCheckout: true,
      });

      expect(state).toEqual({
        paymentMethod: "IN_PERSON",
        paymentStatus: "PENDING",
        requiresStripeCheckout: false,
      });
    });
  });

  describe("canOwnerMarkBookingAsPaid", () => {
    const now = new Date("2026-03-01T12:00:00.000Z");

    it("allows in-person unpaid booking after service time", () => {
      expect(
        canOwnerMarkBookingAsPaid(
          {
            paymentMethod: "IN_PERSON",
            paymentStatus: "PENDING",
            cancelledAt: null,
            startAt: new Date("2026-03-01T11:00:00.000Z"),
            date: new Date("2026-03-01T11:00:00.000Z"),
          },
          now,
        ),
      ).toBe(true);
    });

    it("blocks unpaid booking before service time", () => {
      expect(
        canOwnerMarkBookingAsPaid(
          {
            paymentMethod: "IN_PERSON",
            paymentStatus: "PENDING",
            cancelledAt: null,
            startAt: new Date("2026-03-01T13:00:00.000Z"),
            date: new Date("2026-03-01T13:00:00.000Z"),
          },
          now,
        ),
      ).toBe(false);
    });

    it("blocks Stripe-method booking", () => {
      expect(
        canOwnerMarkBookingAsPaid(
          {
            paymentMethod: "STRIPE",
            paymentStatus: "PENDING",
            cancelledAt: null,
            startAt: new Date("2026-03-01T11:00:00.000Z"),
            date: new Date("2026-03-01T11:00:00.000Z"),
          },
          now,
        ),
      ).toBe(false);
    });

    it("blocks already paid booking", () => {
      expect(
        canOwnerMarkBookingAsPaid(
          {
            paymentMethod: "IN_PERSON",
            paymentStatus: "PAID",
            cancelledAt: null,
            startAt: new Date("2026-03-01T11:00:00.000Z"),
            date: new Date("2026-03-01T11:00:00.000Z"),
          },
          now,
        ),
      ).toBe(false);
    });

    it("blocks canceled booking", () => {
      expect(
        canOwnerMarkBookingAsPaid(
          {
            paymentMethod: "IN_PERSON",
            paymentStatus: "PENDING",
            cancelledAt: new Date("2026-03-01T11:30:00.000Z"),
            startAt: new Date("2026-03-01T11:00:00.000Z"),
            date: new Date("2026-03-01T11:00:00.000Z"),
          },
          now,
        ),
      ).toBe(false);
    });
  });
});
