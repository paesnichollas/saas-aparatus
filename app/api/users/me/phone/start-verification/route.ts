import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { normalizePhoneToE164 } from "@/lib/phone-normalization";
import { startPhoneVerificationOtp } from "@/lib/phone-verification";
import {
  OTP_PROVIDER_UNAVAILABLE_CODE,
  PROFILE_INCOMPLETE_FIELDS_CODE,
} from "@/lib/profile-completion";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";
import { z } from "zod";

const OTP_PROVIDER_UNAVAILABLE_ERROR_MESSAGE =
  "Servico de verificacao por codigo indisponivel no momento.";
const PHONE_ALREADY_REGISTERED_ERROR_MESSAGE =
  "Ja ha um usuario cadastrado com esse telefone.";

const requestSchema = z.object({
  phone: z.string().trim().min(1),
});

export const runtime = "nodejs";

export async function POST(request: Request) {
  let requestBody: unknown;

  try {
    requestBody = await request.json();
  } catch {
    return NextResponse.json(
      {
        code: PROFILE_INCOMPLETE_FIELDS_CODE,
        error: "Dados invalidos.",
        fields: {
          phone: "Informe um telefone valido.",
        },
      },
      { status: 422 },
    );
  }

  const parsedRequest = requestSchema.safeParse(requestBody);
  if (!parsedRequest.success) {
    return NextResponse.json(
      {
        code: PROFILE_INCOMPLETE_FIELDS_CODE,
        error: "Dados invalidos.",
        fields: {
          phone: "Informe um telefone valido.",
        },
      },
      { status: 422 },
    );
  }

  const normalizedPhone = normalizePhoneToE164(parsedRequest.data.phone);
  if (!normalizedPhone) {
    return NextResponse.json(
      {
        code: PROFILE_INCOMPLETE_FIELDS_CODE,
        error: "Dados invalidos.",
        fields: {
          phone: "Informe um telefone valido.",
        },
      },
      { status: 422 },
    );
  }

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    return NextResponse.json(
      {
        error: "Nao autorizado.",
      },
      { status: 401 },
    );
  }

  const isProduction = process.env.NODE_ENV === "production";
  if (isProduction) {
    return NextResponse.json(
      {
        code: OTP_PROVIDER_UNAVAILABLE_CODE,
        error: OTP_PROVIDER_UNAVAILABLE_ERROR_MESSAGE,
      },
      { status: 503 },
    );
  }

  const conflictingUser = await prisma.user.findFirst({
    where: {
      id: {
        not: session.user.id,
      },
      phone: normalizedPhone,
    },
    select: {
      id: true,
    },
  });

  if (conflictingUser) {
    return NextResponse.json(
      {
        code: "PHONE_IN_USE",
        error: PHONE_ALREADY_REGISTERED_ERROR_MESSAGE,
        fields: {
          phone: PHONE_ALREADY_REGISTERED_ERROR_MESSAGE,
        },
      },
      { status: 409 },
    );
  }

  const startOtpResult = await startPhoneVerificationOtp({
    userId: session.user.id,
    phone: normalizedPhone,
  });

  if (!startOtpResult.ok) {
    return NextResponse.json(
      {
        code: "PHONE_OTP_RATE_LIMITED",
        error: "Aguarde alguns instantes antes de solicitar um novo codigo.",
        retryAfterSeconds: startOtpResult.rateLimit.retryAfterSeconds,
      },
      { status: 429 },
    );
  }

  if (!isProduction) {
    console.info("[phone-verification] OTP generated.", {
      userId: session.user.id,
      phone: normalizedPhone,
      code: startOtpResult.code,
      expiresAt: startOtpResult.expiresAt.toISOString(),
    });
  }

  const response = NextResponse.json(
    {
      ok: true,
      expiresAt: startOtpResult.expiresAt.toISOString(),
      retryAfterSeconds: startOtpResult.retryAfterSeconds,
      ...(isProduction ? {} : { devCode: startOtpResult.code }),
    },
    { status: 200 },
  );

  response.headers.set("cache-control", "no-store");
  return response;
}
