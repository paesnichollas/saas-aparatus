import "server-only";

import {
  PROFILE_INCOMPLETE_CODE,
  isUserProfileComplete,
} from "./profile-completion";
import { prisma } from "./prisma";
import { resolveAndPersistUserProvider } from "./user-provider-server";

export class ProfileIncompleteError extends Error {
  readonly code = PROFILE_INCOMPLETE_CODE;

  constructor() {
    super(PROFILE_INCOMPLETE_CODE);
  }
}

export const isProfileIncompleteError = (
  error: unknown,
): error is ProfileIncompleteError => {
  return (
    error instanceof ProfileIncompleteError ||
    (error instanceof Error && error.message === PROFILE_INCOMPLETE_CODE)
  );
};

export const assertUserHasCompletedProfile = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      provider: true,
      profileCompleted: true,
    },
  });

  if (!user) {
    throw new Error("Nao autorizado. Por favor, faca login para continuar.");
  }

  const provider = await resolveAndPersistUserProvider({
    id: user.id,
    email: user.email,
    provider: user.provider,
  });

  const profileComplete = isUserProfileComplete({
    name: user.name,
    phone: user.phone,
    email: user.email,
    provider,
  });

  if (user.profileCompleted !== profileComplete) {
    await prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        profileCompleted: profileComplete,
      },
      select: {
        id: true,
      },
    });
  }

  if (!profileComplete) {
    throw new ProfileIncompleteError();
  }
};
