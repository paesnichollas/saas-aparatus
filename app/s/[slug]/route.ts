import {
  ensureBarbershopPublicSlug,
  resolveBarbershopByShareToken,
} from "@/data/barbershops";
import { linkCustomerToBarbershop } from "@/data/customer-barbershops";
import { auth } from "@/lib/auth";
import {
  BARBERSHOP_CONTEXT_COOKIE_MAX_AGE_IN_SECONDS,
  BARBERSHOP_CONTEXT_COOKIE_NAME,
  BARBERSHOP_INTENT_COOKIE_NAME,
  serializeBarbershopIntentCookie,
} from "@/lib/barbershop-context";
import { NextResponse } from "next/server";

interface ShareRouteContext {
  params: Promise<{
    slug: string;
  }>;
}

export async function GET(request: Request, context: ShareRouteContext) {
  const { slug } = await context.params;
  const shareResolution = await resolveBarbershopByShareToken(slug);

  if (!shareResolution) {
    return NextResponse.redirect(new URL("/?share=invalid", request.url));
  }

  const { barbershop, source } = shareResolution;

  if (source !== "public-slug") {
    const canonicalPublicSlug =
      barbershop.publicSlug.trim() || (await ensureBarbershopPublicSlug(barbershop.id));

    return NextResponse.redirect(
      new URL(`/s/${canonicalPublicSlug}`, request.url),
      301,
    );
  }

  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (session?.user) {
    await linkCustomerToBarbershop({
      userId: session.user.id,
      barbershopId: barbershop.id,
    });
  }

  const response = session?.user
    ? NextResponse.redirect(new URL("/", request.url))
    : NextResponse.redirect(
        new URL("/auth?callbackUrl=%2F", request.url),
      );

  response.cookies.set({
    name: BARBERSHOP_CONTEXT_COOKIE_NAME,
    value: barbershop.id,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: BARBERSHOP_CONTEXT_COOKIE_MAX_AGE_IN_SECONDS,
  });

  response.cookies.set({
    name: BARBERSHOP_INTENT_COOKIE_NAME,
    value: serializeBarbershopIntentCookie({
      barbershopId: barbershop.id,
      shareSlug: barbershop.publicSlug,
      timestamp: Date.now(),
    }),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: BARBERSHOP_CONTEXT_COOKIE_MAX_AGE_IN_SECONDS,
  });

  return response;
}
