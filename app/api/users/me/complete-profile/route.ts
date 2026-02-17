import { NextResponse } from "next/server";

import { Prisma } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { isValidE164Phone } from "@/lib/phone-normalization";
import {
  EMAIL_IN_USE_CODE,
  PROFILE_INCOMPLETE_FIELDS_CODE,
} from "@/lib/profile-completion";
import { prisma } from "@/lib/prisma";
import { resolveAndPersistUserProvider } from "@/lib/user-provider-server";
import { headers } from "next/headers";
import { z } from "zod";

interface CompleteProfileRequestBody {
  name?: string;
  contactEmail?: string;
}

interface CompleteProfileFieldErrors {
  name?: string;
  phone?: string;
  phoneVerified?: string;
  contactEmail?: string;
  password?: string;
}

const MIN_NAME_LENGTH = 2;
const INVALID_REQUEST_MESSAGE = "Dados de cadastro invalidos.";
const CONTACT_EMAIL_ALREADY_REGISTERED_ERROR_MESSAGE =
  "Ja ha um usuario cadastrado com esse email.";
const USER_NOT_FOUND_ERROR_MESSAGE = "Usuario nao encontrado.";

const requestSchema = z.object({
  name: z.string().trim().max(120).optional(),
  contactEmail: z.string().trim().max(320).optional(),
});

const isValidContactEmail = (email: string) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

const hasFieldErrors = (fieldErrors: CompleteProfileFieldErrors) => {
  return Object.values(fieldErrors).some(Boolean);
};

const getUniqueConstraintFields = (
  error: Prisma.PrismaClientKnownRequestError,
) => {
  const target = error.meta?.target;

  if (Array.isArray(target)) {
    return target.filter((field): field is string => typeof field === "string");
  }

  if (typeof target === "string" && target.trim().length > 0) {
    return [target.trim()];
  }

  return [];
};

export const runtime = "nodejs";

export async function PATCH(request: Request) {
  let requestBody: CompleteProfileRequestBody;

  try {
    requestBody = (await request.json()) as CompleteProfileRequestBody;
  } catch {
    return NextResponse.json(
      {
        code: PROFILE_INCOMPLETE_FIELDS_CODE,
        error: INVALID_REQUEST_MESSAGE,
        fields: {},
      },
      { status: 422 },
    );
  }

  const parsedRequest = requestSchema.safeParse(requestBody);
  if (!parsedRequest.success) {
    return NextResponse.json(
      {
        code: PROFILE_INCOMPLETE_FIELDS_CODE,
        error: INVALID_REQUEST_MESSAGE,
        fields: {},
      },
      { status: 422 },
    );
  }

  const normalizedNameInput = parsedRequest.data.name
    ?.trim()
    .replace(/\s+/g, " ");
  const normalizedContactEmailInput = parsedRequest.data.contactEmail
    ?.trim()
    .toLowerCase();
  const nextContactEmail =
    normalizedContactEmailInput && normalizedContactEmailInput.length > 0
      ? normalizedContactEmailInput
      : null;

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

  const currentUser = await prisma.user.findUnique({
    where: {
      id: session.user.id,
    },
    select: {
      id: true,
      name: true,
      email: true,
      provider: true,
      phone: true,
      phoneVerified: true,
      accounts: {
        where: {
          password: {
            not: null,
          },
        },
        select: {
          id: true,
        },
        take: 1,
      },
    },
  });

  if (!currentUser) {
    return NextResponse.json(
      {
        error: USER_NOT_FOUND_ERROR_MESSAGE,
      },
      { status: 404 },
    );
  }

  const provider = await resolveAndPersistUserProvider({
    id: currentUser.id,
    email: currentUser.email,
    provider: currentUser.provider,
  });

  const nextName = normalizedNameInput ?? currentUser.name.trim().replace(/\s+/g, " ");
  const fieldErrors: CompleteProfileFieldErrors = {};

  if (nextName.length < MIN_NAME_LENGTH) {
    fieldErrors.name = "Informe um nome valido.";
  }

  if (nextContactEmail && !isValidContactEmail(nextContactEmail)) {
    fieldErrors.contactEmail = "Informe um email valido.";
  }

  if (provider === "phone" || provider === "google") {
    if (!currentUser.phone || !isValidE164Phone(currentUser.phone)) {
      fieldErrors.phone = "Informe e verifique um telefone valido.";
    }

    if (!currentUser.phoneVerified) {
      fieldErrors.phoneVerified = "Verifique seu telefone por codigo OTP.";
    }
  }

  if (provider === "credentials" && currentUser.accounts.length === 0) {
    fieldErrors.password = "Defina uma senha para concluir seu cadastro.";
  }

  if (hasFieldErrors(fieldErrors)) {
    return NextResponse.json(
      {
        code: PROFILE_INCOMPLETE_FIELDS_CODE,
        error: "Ainda faltam campos obrigatorios para concluir o cadastro.",
        fields: fieldErrors,
      },
      { status: 422 },
    );
  }

  if (nextContactEmail) {
    const conflictingUser = await prisma.user.findFirst({
      where: {
        id: {
          not: currentUser.id,
        },
        contactEmail: nextContactEmail,
      },
      select: {
        id: true,
      },
    });

    if (conflictingUser) {
      return NextResponse.json(
        {
          code: EMAIL_IN_USE_CODE,
          error: CONTACT_EMAIL_ALREADY_REGISTERED_ERROR_MESSAGE,
          fields: {
            contactEmail: CONTACT_EMAIL_ALREADY_REGISTERED_ERROR_MESSAGE,
          },
        },
        { status: 409 },
      );
    }
  }

  try {
    await prisma.user.update({
      where: {
        id: currentUser.id,
      },
      data: {
        name: nextName,
        contactEmail: nextContactEmail,
        profileCompleted: true,
      },
      select: {
        id: true,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const uniqueConstraintFields = getUniqueConstraintFields(error);

      if (uniqueConstraintFields.includes("contactEmail")) {
        return NextResponse.json(
          {
            code: EMAIL_IN_USE_CODE,
            error: CONTACT_EMAIL_ALREADY_REGISTERED_ERROR_MESSAGE,
            fields: {
              contactEmail: CONTACT_EMAIL_ALREADY_REGISTERED_ERROR_MESSAGE,
            },
          },
          { status: 409 },
        );
      }

      return NextResponse.json(
        {
          error: "Ja existe um usuario com esses dados.",
        },
        { status: 409 },
      );
    }

    throw error;
  }

  const response = NextResponse.json(
    {
      ok: true,
    },
    { status: 200 },
  );

  response.headers.set("cache-control", "no-store");
  return response;
}
