"use server";

import { Prisma } from "@/generated/prisma/client";
import { protectedActionClient } from "@/lib/action-client";
import { normalizePhoneToE164 } from "@/lib/phone-normalization";
import { isUserProfileComplete } from "@/lib/profile-completion";
import { prisma } from "@/lib/prisma";
import { resolveAndPersistUserProvider } from "@/lib/user-provider-server";
import { returnValidationErrors } from "next-safe-action";
import { z } from "zod";

const MIN_NAME_LENGTH = 2;
const MIN_PHONE_LENGTH = 10;
const MAX_PHONE_LENGTH = 11;
const PHONE_ALREADY_REGISTERED_ERROR_MESSAGE =
  "Ja ha um usuario cadastrado com esse telefone.";
const CONTACT_EMAIL_ALREADY_REGISTERED_ERROR_MESSAGE =
  "Ja ha um usuario cadastrado com esse email.";

const inputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(40).optional(),
  contactEmail: z.string().trim().max(320).optional(),
});

const normalizeName = (value: string) => {
  return value.trim().replace(/\s+/g, " ");
};

const normalizePhoneDigits = (value: string) => {
  return value.replace(/\D/g, "");
};

const isValidContactEmail = (email: string) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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

export const updateMyProfile = protectedActionClient
  .inputSchema(inputSchema)
  .action(async ({ parsedInput, ctx: { user } }) => {
    const currentUser = await prisma.user.findUnique({
      where: {
        id: user.id,
      },
      select: {
        id: true,
        name: true,
        email: true,
        provider: true,
        phone: true,
        contactEmail: true,
        phoneVerifiedAt: true,
      },
    });

    if (!currentUser) {
      throw new Error("Nao autorizado. Por favor, faca login para continuar.");
    }

    const provider = await resolveAndPersistUserProvider({
      id: currentUser.id,
      email: currentUser.email,
      provider: currentUser.provider,
    });

    const requiresPhone = provider === "phone" || provider === "google";
    const canEditContactEmail = provider === "phone";

    const normalizedName = normalizeName(parsedInput.name);
    const hasPhoneInput = parsedInput.phone !== undefined;
    const normalizedPhoneInput = parsedInput.phone?.trim() ?? "";
    const normalizedPhoneFromInput = normalizedPhoneInput
      ? normalizePhoneToE164(normalizedPhoneInput)
      : null;
    const normalizedCurrentPhone = currentUser.phone
      ? normalizePhoneToE164(currentUser.phone)
      : null;
    const nextPhone = hasPhoneInput ? normalizedPhoneFromInput : normalizedCurrentPhone;

    const hasContactEmailInput = parsedInput.contactEmail !== undefined;
    const normalizedContactEmailInput = parsedInput.contactEmail?.trim().toLowerCase();
    const nextContactEmail = canEditContactEmail
      ? hasContactEmailInput
        ? normalizedContactEmailInput && normalizedContactEmailInput.length > 0
          ? normalizedContactEmailInput
          : null
        : currentUser.contactEmail
      : currentUser.contactEmail;

    const validationErrors: {
      _errors?: string[];
      name?: { _errors?: string[] };
      phone?: { _errors?: string[] };
      contactEmail?: { _errors?: string[] };
    } = {};

    if (normalizedName.length < MIN_NAME_LENGTH) {
      validationErrors.name = { _errors: ["Informe um nome valido."] };
    }

    if (requiresPhone) {
      const phoneDigits = normalizePhoneDigits(normalizedPhoneInput);

      if (hasPhoneInput && phoneDigits.length > 0) {
        if (
          phoneDigits.length < MIN_PHONE_LENGTH ||
          phoneDigits.length > MAX_PHONE_LENGTH ||
          !normalizedPhoneFromInput
        ) {
          validationErrors.phone = { _errors: ["Informe um telefone valido."] };
        }
      } else if (!nextPhone) {
        validationErrors.phone = { _errors: ["Informe um telefone valido."] };
      }
    }

    if (canEditContactEmail && nextContactEmail && !isValidContactEmail(nextContactEmail)) {
      validationErrors.contactEmail = { _errors: ["Informe um email valido."] };
    }

    if (Object.keys(validationErrors).length > 0) {
      returnValidationErrors(inputSchema, validationErrors);
    }

    if (
      nextPhone &&
      nextPhone !== normalizedCurrentPhone
    ) {
      const conflictingUserByPhone = await prisma.user.findFirst({
        where: {
          id: {
            not: currentUser.id,
          },
          phone: nextPhone,
        },
        select: {
          id: true,
        },
      });

      if (conflictingUserByPhone) {
        returnValidationErrors(inputSchema, {
          phone: {
            _errors: [PHONE_ALREADY_REGISTERED_ERROR_MESSAGE],
          },
        });
      }
    }

    if (
      canEditContactEmail &&
      nextContactEmail &&
      nextContactEmail !== currentUser.contactEmail
    ) {
      const conflictingUserByContactEmail = await prisma.user.findFirst({
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

      if (conflictingUserByContactEmail) {
        returnValidationErrors(inputSchema, {
          contactEmail: {
            _errors: [CONTACT_EMAIL_ALREADY_REGISTERED_ERROR_MESSAGE],
          },
        });
      }
    }

    const profileComplete = isUserProfileComplete({
      name: normalizedName,
      phone: nextPhone,
      email: currentUser.email,
      provider,
    });

    const userDataToUpdate: Prisma.UserUpdateInput = {
      name: normalizedName,
      profileCompleted: profileComplete,
    };

    if (canEditContactEmail) {
      userDataToUpdate.contactEmail = nextContactEmail;
    }

    if (requiresPhone && nextPhone) {
      userDataToUpdate.phone = nextPhone;
      userDataToUpdate.phoneVerified = true;
      userDataToUpdate.phoneVerifiedAt = currentUser.phoneVerifiedAt ?? new Date();
    }

    let updatedUser: {
      id: string;
      name: string;
      phone: string | null;
      contactEmail: string | null;
      profileCompleted: boolean;
    };

    try {
      updatedUser = await prisma.user.update({
        where: {
          id: currentUser.id,
        },
        data: userDataToUpdate,
        select: {
          id: true,
          name: true,
          phone: true,
          contactEmail: true,
          profileCompleted: true,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const uniqueConstraintFields = getUniqueConstraintFields(error);

        if (uniqueConstraintFields.includes("phone")) {
          returnValidationErrors(inputSchema, {
            phone: {
              _errors: [PHONE_ALREADY_REGISTERED_ERROR_MESSAGE],
            },
          });
        }

        if (uniqueConstraintFields.includes("contactEmail")) {
          returnValidationErrors(inputSchema, {
            contactEmail: {
              _errors: [CONTACT_EMAIL_ALREADY_REGISTERED_ERROR_MESSAGE],
            },
          });
        }

        returnValidationErrors(inputSchema, {
          _errors: ["Ja existe um usuario com esses dados."],
        });
      }

      throw error;
    }

    return {
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        phone: updatedUser.phone,
        contactEmail: updatedUser.contactEmail,
        email: currentUser.email,
      },
      provider,
      profileComplete,
    };
  });
