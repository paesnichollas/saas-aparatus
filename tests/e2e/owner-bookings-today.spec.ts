import { expect, test } from "@playwright/test";

import { getBookingDayBounds } from "@/lib/booking-time";
import { loginWithPhoneApi } from "./fixtures/auth";
import {
  assignOwnerByPhone,
  createTestBookingForUser,
  findUserIdByPhone,
} from "./fixtures/db";
import { TEST_IDS } from "./fixtures/test-data";

const addMinutes = (date: Date, minutes: number) => {
  return new Date(date.getTime() + minutes * 60_000);
};

test.describe("owner/bookings/today", () => {
  test("shows only today grouped by display status and sorted by time", async ({
    page,
  }) => {
    const ownerPhone = "11981000021";

    await loginWithPhoneApi({
      page,
      name: "Owner Today",
      phoneDigits: ownerPhone,
      callbackPath: "/bookings",
    });

    await assignOwnerByPhone({
      phoneDigits: ownerPhone,
      barbershopId: TEST_IDS.barbershopPublic,
    });

    const ownerUserId = await findUserIdByPhone(ownerPhone);
    const { start: todayStart } = getBookingDayBounds(new Date());
    const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60_000);

    const pendingEarlyBookingId = await createTestBookingForUser({
      userId: ownerUserId,
      startAt: addMinutes(todayStart, 9 * 60),
      paymentMethod: "STRIPE",
      paymentStatus: "PENDING",
    });
    const pendingLateBookingId = await createTestBookingForUser({
      userId: ownerUserId,
      startAt: addMinutes(todayStart, 11 * 60),
      paymentMethod: "STRIPE",
      paymentStatus: "PENDING",
    });
    const failedBookingId = await createTestBookingForUser({
      userId: ownerUserId,
      startAt: addMinutes(todayStart, 13 * 60),
      paymentMethod: "STRIPE",
      paymentStatus: "FAILED",
    });
    const cancelledBookingStartAt = addMinutes(todayStart, 15 * 60);
    const cancelledBookingId = await createTestBookingForUser({
      userId: ownerUserId,
      startAt: cancelledBookingStartAt,
      paymentMethod: "IN_PERSON",
      paymentStatus: "PENDING",
      cancelledAt: addMinutes(cancelledBookingStartAt, 5),
    });
    const paidBookingId = await createTestBookingForUser({
      userId: ownerUserId,
      startAt: addMinutes(todayStart, 17 * 60),
      paymentMethod: "IN_PERSON",
      paymentStatus: "PAID",
    });
    const tomorrowBookingId = await createTestBookingForUser({
      userId: ownerUserId,
      startAt: addMinutes(tomorrowStart, 9 * 60),
      paymentMethod: "STRIPE",
      paymentStatus: "PENDING",
    });

    await page.goto("/bookings");

    await expect(page.getByTestId(`owner-booking-${tomorrowBookingId}`)).toHaveCount(0);

    const pendingGroup = page.getByTestId("owner-bookings-group-pending");
    await expect(pendingGroup).toBeVisible();

    const pendingCards = pendingGroup.locator("[data-testid^='owner-booking-']");
    await expect(pendingCards).toHaveCount(2);
    await expect(pendingCards.nth(0)).toHaveAttribute(
      "data-testid",
      `owner-booking-${pendingEarlyBookingId}`,
    );
    await expect(pendingCards.nth(1)).toHaveAttribute(
      "data-testid",
      `owner-booking-${pendingLateBookingId}`,
    );
    await expect(
      page.getByTestId(`owner-booking-${pendingEarlyBookingId}`).getByText("Não pago"),
    ).toBeVisible();
    await expect(
      page.getByTestId(`owner-booking-${pendingLateBookingId}`).getByText("Não pago"),
    ).toBeVisible();

    await expect(page.getByTestId("owner-bookings-group-failed")).toBeVisible();
    await expect(page.getByTestId(`owner-booking-${failedBookingId}`)).toBeVisible();
    await expect(
      page.getByTestId(`owner-booking-${failedBookingId}`).getByText("Não pago"),
    ).toBeVisible();

    await expect(page.getByTestId("owner-bookings-group-cancelled")).toBeVisible();
    await expect(page.getByTestId(`owner-booking-${cancelledBookingId}`)).toBeVisible();
    await expect(page.getByTestId(`owner-booking-${paidBookingId}`)).toBeVisible();
    await expect(
      page.getByTestId(`owner-booking-${paidBookingId}`).getByText("Pago"),
    ).toBeVisible();

    const otherDaysCta = page.getByRole("link", {
      name: /Ver outros dias no Painel administrativo/i,
    });
    await expect(otherDaysCta).toBeVisible();
    await expect(otherDaysCta).toHaveAttribute("href", "/owner");
  });

  test("shows a global empty state when there are no bookings today", async ({
    page,
  }) => {
    const ownerPhone = "11981000023";

    await loginWithPhoneApi({
      page,
      name: "Owner Empty Today",
      phoneDigits: ownerPhone,
      callbackPath: "/bookings",
    });

    await assignOwnerByPhone({
      phoneDigits: ownerPhone,
      barbershopId: TEST_IDS.barbershopExclusive,
    });

    await page.goto("/bookings");

    await expect(page.getByText("Nenhum agendamento para hoje.")).toBeVisible();
    await expect(page.locator("[data-testid^='owner-bookings-group-']")).toHaveCount(0);
    await expect(
      page.getByRole("link", {
        name: /Ver outros dias no Painel administrativo/i,
      }),
    ).toBeVisible();
  });
});
