import { prisma } from "@/lib/prisma";

interface LinkCustomerToBarbershopInput {
  userId: string;
  barbershopId: string;
}

export const linkCustomerToBarbershop = async ({
  userId,
  barbershopId,
}: LinkCustomerToBarbershopInput) => {
  const normalizedUserId = userId.trim();
  const normalizedBarbershopId = barbershopId.trim();

  if (!normalizedUserId || !normalizedBarbershopId) {
    return {
      linked: false as const,
      barbershopId: null,
    };
  }

  const [user, barbershop] = await Promise.all([
    prisma.user.findUnique({
      where: {
        id: normalizedUserId,
      },
      select: {
        id: true,
        role: true,
        barbershopId: true,
      },
    }),
    prisma.barbershop.findUnique({
      where: {
        id: normalizedBarbershopId,
      },
      select: {
        id: true,
        isActive: true,
      },
    }),
  ]);

  if (!user || !barbershop || !barbershop.isActive) {
    return {
      linked: false as const,
      barbershopId: null,
    };
  }

  const resolvedCurrentBarbershopId =
    user.role === "OWNER" ? user.barbershopId : normalizedBarbershopId;

  if (!resolvedCurrentBarbershopId) {
    return {
      linked: false as const,
      barbershopId: null,
    };
  }

  await prisma.$transaction(async (tx) => {
    if (user.role === "CUSTOMER") {
      await tx.customerBarbershop.upsert({
        where: {
          customerId_barbershopId: {
            customerId: normalizedUserId,
            barbershopId: normalizedBarbershopId,
          },
        },
        create: {
          customerId: normalizedUserId,
          barbershopId: normalizedBarbershopId,
        },
        update: {},
      });
    }

    await tx.user.update({
      where: {
        id: normalizedUserId,
      },
      data: {
        currentBarbershopId: resolvedCurrentBarbershopId,
      },
      select: {
        id: true,
      },
    });
  });

  return {
    linked: true as const,
    barbershopId: resolvedCurrentBarbershopId,
  };
};

export const getPreferredBarbershopIdForUser = async (userId: string) => {
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
      barbershopId: true,
      currentBarbershopId: true,
      barbershop: {
        select: {
          isActive: true,
        },
      },
    },
  });

  if (user?.role === "OWNER") {
    if (!user.barbershopId || !user.barbershop?.isActive) {
      return null;
    }

    return user.barbershopId;
  }

  if (user?.currentBarbershopId) {
    const activeCurrentBarbershop = await prisma.barbershop.findFirst({
      where: {
        id: user.currentBarbershopId,
        isActive: true,
      },
      select: {
        id: true,
      },
    });

    if (activeCurrentBarbershop) {
      return activeCurrentBarbershop.id;
    }
  }

  const latestLinkedBarbershop = await prisma.customerBarbershop.findFirst({
    where: {
      customerId: normalizedUserId,
      barbershop: {
        isActive: true,
      },
    },
    select: {
      barbershopId: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return latestLinkedBarbershop?.barbershopId ?? null;
};
