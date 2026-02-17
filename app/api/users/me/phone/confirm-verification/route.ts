import { NextResponse } from "next/server";

import { Prisma } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { confirmPhoneVerificationOtp } from "@/lib/phone-verification";
import { PROFILE_INCOMPLETE_FIELDS_CODE } from "@/lib/profile-completion";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";
import { z } from "zod";

const requestSchema = z.object({
  code: z.string().trim().min(1).max(12),
});

const INVALID_CODE_MESSAGE = "Codigo invalido ou expirado.";
const PHONE_ALREADY_REGISTERED_ERROR_MESSAGE =
  "Ja ha um usuario cadastrado com esse telefone.";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let requestBody: unknown;

  try {
    requestBody = await request.json();
  } catch {
    return NextResponse.json(
      {
        code: PROFILE_INCOMPLETE_FIELDS_CODE,
        error: INVALID_CODE_MESSAGE,
        fields: {
          code: INVALID_CODE_MESSAGE,
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
        error: INVALID_CODE_MESSAGE,
        fields: {
          code: INVALID_CODE_MESSAGE,
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

  const confirmOtpResult = await confirmPhoneVerificationOtp({
    userId: session.user.id,
    code: parsedRequest.data.code,
  });

  if (!confirmOtpResult.ok) {
    if (confirmOtpResult.reason === "too_many_attempts") {
      return NextResponse.json(
        {
          code: "PHONE_OTP_TOO_MANY_ATTEMPTS",
          error: "Voce excedeu o limite de tentativas. Solicite um novo codigo.",
        },
        { status: 429 },
      );
    }

    return NextResponse.json(
      {
        code: PROFILE_INCOMPLETE_FIELDS_CODE,
        error: INVALID_CODE_MESSAGE,
        fields: {
          code: INVALID_CODE_MESSAGE,
        },
      },
      { status: 422 },
    );
  }

  try {
    const updatedUser = await prisma.user.update({
      where: {
        id: session.user.id,
      },
      data: {
        phone: confirmOtpResult.phone,
        phoneVerified: true,
        phoneVerifiedAt: new Date(),
      },
      select: {
        phone: true,
        phoneVerified: true,
      },
    });

    const response = NextResponse.json(
      {
        ok: true,
        phone: updatedUser.phone,
        phoneVerified: updatedUser.phoneVerified,
      },
      { status: 200 },
    );

    response.headers.set("cache-control", "no-store");
    return response;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
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

    throw error;
  }
}
