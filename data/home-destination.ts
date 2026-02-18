import "server-only";

import { prisma } from "@/lib/prisma";

export const resolveAuthenticatedUserHomeDestination = async (userId: string) => {
  const normalizedUserId = userId.trim();

  if (!normalizedUserId) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: {
      id: normalizedUserId,
    },
    select: {
      role: true,
      barbershop: {
        select: {
          slug: true,
          isActive: true,
        },
      },
    },
  });

  if (!user || user.role !== "OWNER" || !user.barbershop || !user.barbershop.isActive) {
    return null;
  }

  return `/b/${user.barbershop.slug}`;
};
