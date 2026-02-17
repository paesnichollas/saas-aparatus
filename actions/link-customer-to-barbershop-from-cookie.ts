"use server";

import { cookies } from "next/headers";

import { linkCustomerToBarbershop } from "@/data/customer-barbershops";
import { protectedActionClient } from "@/lib/action-client";
import {
  BARBERSHOP_INTENT_COOKIE_NAME,
  parseBarbershopIntentCookie,
} from "@/lib/barbershop-context";
import { verifyShareLinkToken } from "@/lib/share-link-token";
import { resolveAndPersistUserProviderById } from "@/lib/user-provider-server";

export const linkCustomerToBarbershopFromCookie = protectedActionClient.action(
  async ({ ctx: { user } }) => {
    await resolveAndPersistUserProviderById(user.id);

    const cookieStore = await cookies();
    const barbershopIntentCookie = cookieStore.get(
      BARBERSHOP_INTENT_COOKIE_NAME,
    )?.value;
    const parsedBarbershopIntent = parseBarbershopIntentCookie(
      barbershopIntentCookie,
    );

    if (barbershopIntentCookie && !parsedBarbershopIntent) {
      cookieStore.delete(BARBERSHOP_INTENT_COOKIE_NAME);
    }

    if (!parsedBarbershopIntent) {
      return {
        linked: false as const,
        barbershopId: null,
      };
    }

    if (parsedBarbershopIntent.entrySource !== "share_link") {
      cookieStore.delete(BARBERSHOP_INTENT_COOKIE_NAME);

      return {
        linked: false as const,
        barbershopId: null,
      };
    }

    const tokenVerification = verifyShareLinkToken({
      token: parsedBarbershopIntent.shareToken,
      expectedBarbershopId: parsedBarbershopIntent.barbershopId,
      expectedPublicSlug: parsedBarbershopIntent.shareSlug,
    });

    if (!tokenVerification.valid) {
      console.warn(
        "[linkCustomerToBarbershopFromCookie] Invalid share-link token during post-auth linking.",
        {
          userId: user.id,
          barbershopId: parsedBarbershopIntent.barbershopId,
          reason: tokenVerification.reason,
        },
      );
      cookieStore.delete(BARBERSHOP_INTENT_COOKIE_NAME);

      return {
        linked: false as const,
        barbershopId: null,
      };
    }

    const linkResult = await linkCustomerToBarbershop({
      userId: user.id,
      barbershopId: parsedBarbershopIntent.barbershopId,
    });

    cookieStore.delete(BARBERSHOP_INTENT_COOKIE_NAME);

    return linkResult;
  },
);
