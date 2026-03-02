import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    bookingFindFirst: vi.fn(),
    bookingFindMany: vi.fn(),
    bookingUpdate: vi.fn(),
    scheduleBookingNotificationJobs: vi.fn(),
    cancelPendingBookingNotificationJobs: vi.fn(),
    tryFulfillWaitlistForReleasedSlot: vi.fn(),
    checkoutSessionRetrieve: vi.fn(),
    stripeConstructor: vi.fn(),
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    booking: {
      findFirst: mocks.bookingFindFirst,
      findMany: mocks.bookingFindMany,
      update: mocks.bookingUpdate,
    },
  },
}));

vi.mock("@/lib/notifications/notification-jobs", () => ({
  scheduleBookingNotificationJobs: mocks.scheduleBookingNotificationJobs,
  cancelPendingBookingNotificationJobs:
    mocks.cancelPendingBookingNotificationJobs,
}));

vi.mock("@/lib/waitlist-fulfillment", () => ({
  tryFulfillWaitlistForReleasedSlot: mocks.tryFulfillWaitlistForReleasedSlot,
}));

vi.mock("stripe", () => {
  class StripeMock {
    checkout = {
      sessions: {
        retrieve: mocks.checkoutSessionRetrieve,
      },
    };

    constructor(...args: unknown[]) {
      mocks.stripeConstructor(...args);
    }
  }

  return {
    default: StripeMock,
  };
});

import { reconcilePendingBookingBySessionId } from "./stripe-booking-reconciliation";

const baseBooking = {
  id: "booking-1",
  stripeSessionId: "cs_test_123",
  stripeChargeId: null,
  paymentMethod: "STRIPE",
  paymentStatus: "PENDING",
  barbershopId: "barbershop-1",
  barberId: "barber-1",
  serviceId: "service-1",
  date: new Date("2035-06-18T10:00:00.000Z"),
  startAt: new Date("2035-06-18T10:00:00.000Z"),
  endAt: new Date("2035-06-18T10:30:00.000Z"),
  totalDurationMinutes: 30,
};

describe("stripe-booking-reconciliation", () => {
  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy";

    mocks.bookingFindFirst.mockReset();
    mocks.bookingFindMany.mockReset();
    mocks.bookingUpdate.mockReset();
    mocks.scheduleBookingNotificationJobs.mockReset();
    mocks.cancelPendingBookingNotificationJobs.mockReset();
    mocks.tryFulfillWaitlistForReleasedSlot.mockReset();
    mocks.checkoutSessionRetrieve.mockReset();
    mocks.stripeConstructor.mockReset();
  });

  it("marks pending booking as paid when checkout session is paid", async () => {
    mocks.bookingFindFirst.mockResolvedValue(baseBooking);
    mocks.checkoutSessionRetrieve.mockResolvedValue({
      status: "complete",
      payment_status: "paid",
      payment_intent: {
        latest_charge: "ch_test_123",
      },
    });

    await reconcilePendingBookingBySessionId({
      stripeSessionId: "cs_test_123",
      userId: "user-1",
    });

    expect(mocks.bookingFindFirst).toHaveBeenCalledWith({
      where: {
        stripeSessionId: "cs_test_123",
        paymentMethod: "STRIPE",
        userId: "user-1",
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

    expect(mocks.bookingUpdate).toHaveBeenCalledWith({
      where: {
        id: "booking-1",
      },
      data: {
        paymentStatus: "PAID",
        paymentConfirmedAt: expect.any(Date),
        cancelledAt: null,
        stripeChargeId: "ch_test_123",
      },
    });

    expect(mocks.scheduleBookingNotificationJobs).toHaveBeenCalledWith(
      "booking-1",
    );
    expect(mocks.cancelPendingBookingNotificationJobs).not.toHaveBeenCalled();
  });

  it("marks pending booking as failed when checkout session expires", async () => {
    mocks.bookingFindFirst.mockResolvedValue(baseBooking);
    mocks.checkoutSessionRetrieve.mockResolvedValue({
      status: "expired",
      payment_status: "unpaid",
      payment_intent: null,
    });

    await reconcilePendingBookingBySessionId({
      stripeSessionId: "cs_test_123",
      barbershopId: "barbershop-1",
    });

    expect(mocks.bookingUpdate).toHaveBeenCalledWith({
      where: {
        id: "booking-1",
      },
      data: {
        paymentStatus: "FAILED",
        paymentConfirmedAt: null,
        cancelledAt: expect.any(Date),
      },
    });

    expect(mocks.cancelPendingBookingNotificationJobs).toHaveBeenCalledWith(
      "booking-1",
      "payment_failed",
    );

    expect(mocks.tryFulfillWaitlistForReleasedSlot).toHaveBeenCalledWith({
      sourceBookingId: "booking-1",
      barbershopId: "barbershop-1",
      barberId: "barber-1",
      serviceId: "service-1",
      releasedStartAt: baseBooking.startAt,
      releasedEndAt: baseBooking.endAt,
      releasedDurationMinutes: baseBooking.totalDurationMinutes,
    });
  });
});
