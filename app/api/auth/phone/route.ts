import { NextResponse } from "next/server";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import {
  getPhoneAuthEmail,
  getPhoneAuthPassword,
  isValidPhoneNumber,
  normalizePhoneNumber,
} from "@/lib/auth-phone";
import { normalizePhoneToE164 } from "@/lib/phone-normalization";

interface PhoneAuthRequestBody {
  name?: string;
  phone?: string;
  callbackUrl?: string;
}

const MIN_NAME_LENGTH = 2;
const FALLBACK_CUSTOMER_NAME = "Cliente";
const ACCOUNT_DEACTIVATED_ERROR_MESSAGE = "Conta desativada";
const PHONE_ALREADY_REGISTERED_ERROR_MESSAGE =
  "J\u00E1 h\u00E1 um usu\u00E1rio cadastrado com esse telefone.";

const appendSetCookieHeaders = (
  sourceHeaders: Headers,
  targetHeaders: Headers,
) => {
  const headersWithGetSetCookie = sourceHeaders as Headers & {
    getSetCookie?: () => string[];
  };

  if (typeof headersWithGetSetCookie.getSetCookie === "function") {
    for (const cookieValue of headersWithGetSetCookie.getSetCookie()) {
      targetHeaders.append("set-cookie", cookieValue);
    }
    return;
  }

  const setCookieHeader = sourceHeaders.get("set-cookie");
  if (setCookieHeader) {
    targetHeaders.append("set-cookie", setCookieHeader);
  }
};

const getNormalizedCustomerName = (name: string | undefined) => {
  const normalizedName = name?.trim().replace(/\s+/g, " ");

  if (!normalizedName || normalizedName.length < MIN_NAME_LENGTH) {
    return FALLBACK_CUSTOMER_NAME;
  }

  return normalizedName;
};

const getComparableCustomerName = (name: string) => {
  return name.trim().replace(/\s+/g, " ");
};

const isInactiveUser = (user: {
  isActive: boolean;
  barbershop: {
    isActive: boolean;
  } | null;
  ownedBarbershop: {
    isActive: boolean;
  } | null;
}) => {
  if (!user.isActive) {
    return true;
  }

  if (user.barbershop && !user.barbershop.isActive) {
    return true;
  }

  if (user.ownedBarbershop && !user.ownedBarbershop.isActive) {
    return true;
  }

  return false;
};

const getAuthErrorMessage = async (response: Response) => {
  try {
    const responseJson = (await response
      .clone()
      .json()) as { message?: string; error?: string };

    if (typeof responseJson.error === "string" && responseJson.error.trim()) {
      return responseJson.error.trim();
    }

    if (typeof responseJson.message === "string" && responseJson.message.trim()) {
      return responseJson.message.trim();
    }
  } catch {
    // No-op.
  }

  return null;
};

export const runtime = "nodejs";

export async function POST(request: Request) {
  let requestBody: PhoneAuthRequestBody;

  try {
    requestBody = (await request.json()) as PhoneAuthRequestBody;
  } catch {
    return NextResponse.json(
      {
        error: "Dados de autenticacao invalidos.",
      },
      { status: 400 },
    );
  }

  const normalizedPhoneNumber = normalizePhoneNumber(requestBody.phone ?? "");
  const normalizedPhoneE164 = normalizePhoneToE164(normalizedPhoneNumber);

  if (!isValidPhoneNumber(normalizedPhoneNumber) || !normalizedPhoneE164) {
    return NextResponse.json(
      {
        error: "Informe um telefone valido.",
      },
      { status: 400 },
    );
  }

  const normalizedCustomerName = getNormalizedCustomerName(requestBody.name);
  const phoneAuthEmail = getPhoneAuthEmail(normalizedPhoneNumber);
  const phoneAuthPassword = getPhoneAuthPassword(normalizedPhoneNumber);

  const existingUser = await prisma.user.findUnique({
    where: {
      email: phoneAuthEmail,
    },
    select: {
      id: true,
      name: true,
      phone: true,
      isActive: true,
      barbershop: {
        select: {
          isActive: true,
        },
      },
      ownedBarbershop: {
        select: {
          isActive: true,
        },
      },
    },
  });

  if (existingUser && isInactiveUser(existingUser)) {
    return NextResponse.json(
      {
        error: ACCOUNT_DEACTIVATED_ERROR_MESSAGE,
      },
      { status: 403 },
    );
  }

  if (existingUser) {
    const comparableExistingUserName = getComparableCustomerName(
      existingUser.name,
    );

    if (comparableExistingUserName !== normalizedCustomerName) {
      return NextResponse.json(
        {
          error: PHONE_ALREADY_REGISTERED_ERROR_MESSAGE,
        },
        { status: 409 },
      );
    }
  }

  let authResponse: Response;

  if (existingUser) {
    authResponse = await auth.api.signInEmail({
      request,
      asResponse: true,
      body: {
        email: phoneAuthEmail,
        password: phoneAuthPassword,
      },
    });
  } else {
    const signUpResponse = await auth.api.signUpEmail({
      request,
      asResponse: true,
      body: {
        name: normalizedCustomerName,
        email: phoneAuthEmail,
        password: phoneAuthPassword,
      },
    });

    if (signUpResponse.ok) {
      authResponse = signUpResponse;
    } else {
      authResponse = await auth.api.signInEmail({
        request,
        asResponse: true,
        body: {
          email: phoneAuthEmail,
          password: phoneAuthPassword,
        },
      });
    }
  }

  if (!authResponse.ok) {
    const authErrorMessage = await getAuthErrorMessage(authResponse);

    if (
      authErrorMessage &&
      authErrorMessage.toLowerCase().includes("conta desativada")
    ) {
      return NextResponse.json(
        {
          error: ACCOUNT_DEACTIVATED_ERROR_MESSAGE,
        },
        { status: 403 },
      );
    }

    return NextResponse.json(
      {
        error: "Nao foi possivel autenticar com nome e telefone.",
      },
      { status: 401 },
    );
  }

  const user = await prisma.user.findUnique({
    where: {
      email: phoneAuthEmail,
    },
    select: {
      id: true,
      name: true,
      phone: true,
      provider: true,
      phoneVerified: true,
      phoneVerifiedAt: true,
    },
  });

  if (user) {
    const shouldUpdatePhone = user.phone !== normalizedPhoneE164;
    const shouldUpdateProvider = user.provider !== "phone";
    const shouldUpdatePhoneVerification =
      !user.phoneVerified || user.phoneVerifiedAt === null;

    if (
      shouldUpdatePhone ||
      shouldUpdateProvider ||
      shouldUpdatePhoneVerification
    ) {
      const userDataToUpdate: Prisma.UserUpdateInput = {
        provider: "phone",
      };

      if (shouldUpdatePhone) {
        userDataToUpdate.phone = normalizedPhoneE164;
      }

      if (shouldUpdatePhoneVerification) {
        userDataToUpdate.phoneVerified = true;
        userDataToUpdate.phoneVerifiedAt = new Date();
      }

      try {
        await prisma.user.update({
          where: {
            id: user.id,
          },
          data: userDataToUpdate,
          select: {
            id: true,
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          return NextResponse.json(
            {
              error: PHONE_ALREADY_REGISTERED_ERROR_MESSAGE,
            },
            { status: 409 },
          );
        }

        throw error;
      }
    }
  }

  const response = NextResponse.json({ ok: true }, { status: 200 });
  appendSetCookieHeaders(authResponse.headers, response.headers);
  response.headers.set("cache-control", "no-store");
  return response;
}
