import "server-only";

import { PROFILE_INCOMPLETE_CODE } from "./profile-completion";
import { prisma } from "./prisma";

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
      profileCompleted: true,
    },
  });

  if (!user) {
    throw new Error("Nao autorizado. Por favor, faca login para continuar.");
  }

  if (!user.profileCompleted) {
    throw new ProfileIncompleteError();
  }
};
