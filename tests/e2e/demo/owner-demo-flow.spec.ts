import { expect, test } from "@playwright/test";

import { loginWithPhoneApi } from "../fixtures/auth";
import { assignOwnerByPhone } from "../fixtures/db";
import { TEST_DATES, TEST_IDS } from "../fixtures/test-data";

test("demo: owner uses today agenda and admin panel while cancellation reflects back", async ({
  browser,
}) => {
  const customerContext = await browser.newContext();
  const customerPage = await customerContext.newPage();

  const ownerContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();

  const customerPhone = "11981000011";
  const ownerPhone = "11981000012";

  let bookingId = "";

  await test.step("customer creates a booking", async () => {
    await loginWithPhoneApi({
      page: customerPage,
      name: "Demo Customer",
      phoneDigits: customerPhone,
      callbackPath: "/",
    });

    const createResponse = await customerPage.request.post("/api/bookings", {
      data: {
        barbershopId: TEST_IDS.barbershopPublic,
        serviceId: TEST_IDS.serviceCut,
        barberId: TEST_IDS.barberPublicPrimary,
        date: `${TEST_DATES.availableDayIso}T15:00:00.000Z`,
      },
    });

    expect(createResponse.status()).toBe(201);

    const createResponseJson = (await createResponse.json()) as {
      bookingId: string;
    };
    bookingId = createResponseJson.bookingId;
  });

  await test.step("owner sees only today in /bookings and can open admin panel", async () => {
    await loginWithPhoneApi({
      page: ownerPage,
      name: "Demo Owner",
      phoneDigits: ownerPhone,
      callbackPath: "/bookings",
    });

    await assignOwnerByPhone({
      phoneDigits: ownerPhone,
      barbershopId: TEST_IDS.barbershopPublic,
    });

    await ownerPage.goto("/bookings");
    await expect(ownerPage.getByTestId(`owner-booking-${bookingId}`)).toHaveCount(0);
    await expect(
      ownerPage.getByRole("link", {
        name: /Ver outros dias no Painel administrativo/i,
      }),
    ).toBeVisible();

    await ownerPage.goto("/owner");
    await expect(ownerPage.getByTestId(`owner-booking-${bookingId}`).first()).toBeVisible();
  });

  await test.step("customer cancels the booking", async () => {
    await customerPage.goto("/bookings");
    await customerPage.getByTestId(`booking-item-${bookingId}`).first().click();
    await customerPage.getByTestId("booking-cancel-open").click();
    await customerPage.getByTestId("booking-cancel-confirm").click();

    await expect(
      customerPage.getByText(/Agendamento cancelado com sucesso/i),
    ).toBeVisible();
  });

  await test.step("owner sees canceled status after refresh in admin panel", async () => {
    await expect
      .poll(
        async () => {
          await ownerPage.goto("/owner");
          const bookingCard = ownerPage.getByTestId(`owner-booking-${bookingId}`);

          if ((await bookingCard.count()) === 0) {
            return "";
          }

          return (await bookingCard.first().textContent()) ?? "";
        },
        {
          timeout: 20_000,
        },
      )
      .toMatch(/CANCELAD[AO]/i);
  });

  await ownerContext.close();
  await customerContext.close();
});
