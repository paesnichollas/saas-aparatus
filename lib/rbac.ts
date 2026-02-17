import "server-only";

import { type UserRole } from "@/generated/prisma/client";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "./auth";
import { buildCompleteProfileUrl } from "./profile-completion";
import {
  assertUserHasCompletedProfile,
  isProfileIncompleteError,
} from "./profile-completion-guard";
import { prisma } from "./prisma";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: UserRole;
  barbershopId: string | null;
};

export const isAdmin = (role: UserRole | null | undefined) => role === "ADMIN";

export const isOwner = (role: UserRole | null | undefined) => role === "OWNER";

const getUnauthorizedErrorMessage = (roles: UserRole[]) => {
  return `Nao autorizado. Papel necessario: ${roles.join(" ou ")}.`;
};

export const getSessionUser = async (): Promise<SessionUser | null> => {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return null;
  }

  if (!session.session?.id) {
    return null;
  }

  const activeSession = await prisma.session.findUnique({
    where: {
      id: session.session.id,
    },
    select: {
      id: true,
    },
  });

  if (!activeSession) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: {
      id: session.user.id,
    },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      role: true,
      isActive: true,
      barbershopId: true,
      currentBarbershopId: true,
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

  if (!user) {
    return null;
  }

  if (!user.isActive) {
    return null;
  }

  if (user.barbershop && !user.barbershop.isActive) {
    return null;
  }

  if (user.ownedBarbershop && !user.ownedBarbershop.isActive) {
    return null;
  }

  if (
    user.role === "OWNER" &&
    user.barbershopId &&
    user.currentBarbershopId !== user.barbershopId
  ) {
    await prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        currentBarbershopId: user.barbershopId,
      },
      select: {
        id: true,
      },
    });
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
    role: user.role,
    barbershopId: user.barbershopId,
  };
};

export const requireAuthenticatedUser = async (): Promise<SessionUser> => {
  const user = await getSessionUser();

  if (!user) {
    redirect("/auth");
  }

  return user;
};

export const getUserRoleFromSession = async (): Promise<UserRole | null> => {
  const user = await getSessionUser();

  return user?.role ?? null;
};

interface RequireRoleOptions {
  onUnauthorized?: "redirect" | "throw";
  redirectTo?: string;
}

const DEFAULT_REDIRECT = "/";

const handleUnauthorized = (
  roles: UserRole[],
  options: RequireRoleOptions,
): never => {
  if (options.onUnauthorized === "throw") {
    throw new Error(getUnauthorizedErrorMessage(roles));
  }

  redirect(options.redirectTo ?? DEFAULT_REDIRECT);
};

export const requireRole = async (
  allowedRoles: UserRole[],
  options: RequireRoleOptions = {},
) => {
  const user = await getSessionUser();

  if (!user) {
    return handleUnauthorized(allowedRoles, options);
  }

  if (!allowedRoles.includes(user.role)) {
    return handleUnauthorized(allowedRoles, options);
  }

  return user;
};

export const requireAdmin = async (options: RequireRoleOptions = {}) => {
  return requireRole(["ADMIN"], options);
};

export const requireOwnerOrAdmin = async (
  options: RequireRoleOptions = {},
) => {
  return requireRole(["OWNER", "ADMIN"], options);
};

export const requireOwner = async (options: RequireRoleOptions = {}) => {
  return requireRole(["OWNER"], options);
};

const redirectIfProfileIncomplete = async (userId: string, returnTo: string) => {
  try {
    await assertUserHasCompletedProfile(userId);
  } catch (error) {
    if (isProfileIncompleteError(error)) {
      redirect(buildCompleteProfileUrl(returnTo));
    }

    throw error;
  }
};

export const requireOwnerOrAdminWithCompleteProfile = async (
  returnTo: string,
  options: RequireRoleOptions = {},
) => {
  const user = await requireOwnerOrAdmin(options);

  await redirectIfProfileIncomplete(user.id, returnTo);

  return user;
};

export const requireAdminWithCompleteProfile = async (
  returnTo: string,
  options: RequireRoleOptions = {},
) => {
  const user = await requireAdmin(options);

  await redirectIfProfileIncomplete(user.id, returnTo);

  return user;
};
