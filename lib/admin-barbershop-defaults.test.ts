import { describe, expect, it } from "vitest";

import { ADMIN_CREATE_BARBERSHOP_DEFAULTS } from "@/data/admin/barbershop-defaults";

describe("admin barbershop defaults", () => {
  it("keeps Stripe disabled by default", () => {
    expect(ADMIN_CREATE_BARBERSHOP_DEFAULTS.stripeEnabled).toBe(false);
  });
});
