import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

type UserRole = "CUSTOMER" | "OWNER" | "ADMIN";

const ADMIN_ROLE: UserRole = "ADMIN";
const CUSTOMER_ROLE: UserRole = "CUSTOMER";
const OWNER_ROLE: UserRole = "OWNER";

const normalizeRequiredId = (value: string, message: string) => {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new OwnerAssignmentError(message);
  }

  return normalizedValue;
};

const normalizeOptionalId = (value: string | undefined | null) => {
  const normalizedValue = value?.trim();
  return normalizedValue ? normalizedValue : null;
};

const toNonOwnerRole = (role: UserRole): UserRole => {
  if (role === OWNER_ROLE) {
    return CUSTOMER_ROLE;
  }

  return role;
};

const assertAdminActor = async (actorUserId: string) => {
  const actor = await prisma.user.findUnique({
    where: {
      id: actorUserId,
    },
    select: {
      role: true,
    },
  });

  if (!actor || actor.role !== ADMIN_ROLE) {
    throw new OwnerAssignmentError(
      "Somente administradores podem alterar ownership de usuarios.",
    );
  }
};

const resolveBarbershopIdForPromotion = async ({
  tx,
  userId,
  explicitBarbershopId,
  currentBarbershopId,
}: {
  tx: Prisma.TransactionClient;
  userId: string;
  explicitBarbershopId: string | null;
  currentBarbershopId: string | null;
}) => {
  if (explicitBarbershopId) {
    return explicitBarbershopId;
  }

  if (currentBarbershopId) {
    return currentBarbershopId;
  }

  const linkedBarbershops = await tx.customerBarbershop.findMany({
    where: {
      customerId: userId,
    },
    select: {
      barbershopId: true,
    },
    distinct: ["barbershopId"],
  });

  if (linkedBarbershops.length === 1) {
    return linkedBarbershops[0].barbershopId;
  }

  throw new OwnerAssignmentError("Selecione uma barbearia para vincular.");
};

const resolveCurrentBarbershopIdForDemotion = async ({
  tx,
  userId,
  previousBarbershopId,
  currentBarbershopId,
}: {
  tx: Prisma.TransactionClient;
  userId: string;
  previousBarbershopId: string | null;
  currentBarbershopId: string | null;
}) => {
  if (!previousBarbershopId) {
    return currentBarbershopId;
  }

  if (currentBarbershopId !== previousBarbershopId) {
    return currentBarbershopId;
  }

  const fallbackLinkedBarbershop = await tx.customerBarbershop.findFirst({
    where: {
      customerId: userId,
      barbershopId: {
        not: previousBarbershopId,
      },
    },
    select: {
      barbershopId: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return fallbackLinkedBarbershop?.barbershopId ?? null;
};

interface PromoteUserToOwnerInput {
  actorUserId: string;
  userId: string;
  barbershopId?: string;
  allowTransfer?: boolean;
}

interface PromoteUserToOwnerResult {
  user: {
    id: string;
    role: UserRole;
    barbershopId: string | null;
  };
  barbershop: {
    id: string;
    name: string;
    ownerId: string | null;
  };
  transferredOwnershipFromUserId: string | null;
}

export class OwnerAssignmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OwnerAssignmentError";
  }
}

export const promoteUserToOwnerByAdmin = async ({
  actorUserId,
  userId,
  barbershopId,
  allowTransfer = false,
}: PromoteUserToOwnerInput): Promise<PromoteUserToOwnerResult> => {
  const normalizedActorUserId = normalizeRequiredId(
    actorUserId,
    "Usuario administrador invalido.",
  );
  const normalizedUserId = normalizeRequiredId(userId, "Usuario invalido.");
  const normalizedBarbershopId = normalizeOptionalId(barbershopId);

  await assertAdminActor(normalizedActorUserId);

  try {
    return await prisma.$transaction(async (tx) => {
      const targetUser = await tx.user.findUnique({
        where: {
          id: normalizedUserId,
        },
        select: {
          id: true,
          role: true,
          barbershopId: true,
          currentBarbershopId: true,
        },
      });

      if (!targetUser) {
        throw new OwnerAssignmentError("Usuario nao encontrado.");
      }

      const resolvedBarbershopId = await resolveBarbershopIdForPromotion({
        tx,
        userId: targetUser.id,
        explicitBarbershopId: normalizedBarbershopId,
        currentBarbershopId: targetUser.currentBarbershopId,
      });

      const targetBarbershop = await tx.barbershop.findUnique({
        where: {
          id: resolvedBarbershopId,
        },
        select: {
          id: true,
          name: true,
          ownerId: true,
        },
      });

      if (!targetBarbershop) {
        throw new OwnerAssignmentError("Barbearia nao encontrada.");
      }

      let transferredOwnershipFromUserId: string | null = null;
      const hasDifferentCurrentOwner =
        targetBarbershop.ownerId !== null &&
        targetBarbershop.ownerId !== targetUser.id;

      if (hasDifferentCurrentOwner && !allowTransfer) {
        throw new OwnerAssignmentError(
          "A barbearia selecionada ja possui dono. Ative allowTransfer para transferir a propriedade.",
        );
      }

      if (hasDifferentCurrentOwner && allowTransfer) {
        const previousOwner = await tx.user.findUnique({
          where: {
            id: targetBarbershop.ownerId as string,
          },
          select: {
            id: true,
            role: true,
            barbershopId: true,
            currentBarbershopId: true,
          },
        });

        if (previousOwner) {
          const previousOwnerCurrentBarbershopId =
            await resolveCurrentBarbershopIdForDemotion({
              tx,
              userId: previousOwner.id,
              previousBarbershopId:
                previousOwner.barbershopId ?? targetBarbershop.id,
              currentBarbershopId: previousOwner.currentBarbershopId,
            });

          await tx.user.update({
            where: {
              id: previousOwner.id,
            },
            data: {
              role: toNonOwnerRole(previousOwner.role as UserRole),
              barbershopId: null,
              currentBarbershopId: previousOwnerCurrentBarbershopId,
            },
          });
          transferredOwnershipFromUserId = previousOwner.id;
        }
      }

      const previouslyOwnedBarbershop = await tx.barbershop.findFirst({
        where: {
          ownerId: targetUser.id,
        },
        select: {
          id: true,
        },
      });

      if (
        previouslyOwnedBarbershop &&
        previouslyOwnedBarbershop.id !== targetBarbershop.id
      ) {
        await tx.barbershop.update({
          where: {
            id: previouslyOwnedBarbershop.id,
          },
          data: {
            ownerId: null,
          },
        });
      }

      const updatedUser = await tx.user.update({
        where: {
          id: targetUser.id,
        },
        data: {
          role: OWNER_ROLE,
          barbershopId: targetBarbershop.id,
          currentBarbershopId: targetBarbershop.id,
        },
        select: {
          id: true,
          role: true,
          barbershopId: true,
        },
      });

      const updatedBarbershop = await tx.barbershop.update({
        where: {
          id: targetBarbershop.id,
        },
        data: {
          ownerId: targetUser.id,
        },
        select: {
          id: true,
          name: true,
          ownerId: true,
        },
      });

      return {
        user: {
          id: updatedUser.id,
          role: updatedUser.role as UserRole,
          barbershopId: updatedUser.barbershopId,
        },
        barbershop: updatedBarbershop,
        transferredOwnershipFromUserId,
      };
    });
  } catch (error) {
    if (error instanceof OwnerAssignmentError) {
      throw error;
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new OwnerAssignmentError(
        "Nao foi possivel concluir a promocao por conflito de ownership. Tente novamente.",
      );
    }

    throw error;
  }
};

interface DemoteOwnerToCustomerInput {
  actorUserId: string;
  userId: string;
}

interface DemoteOwnerToCustomerResult {
  user: {
    id: string;
    role: UserRole;
    barbershopId: string | null;
  };
  unlinkedBarbershopId: string | null;
}

export const demoteOwnerToCustomerByAdmin = async ({
  actorUserId,
  userId,
}: DemoteOwnerToCustomerInput): Promise<DemoteOwnerToCustomerResult> => {
  const normalizedActorUserId = normalizeRequiredId(
    actorUserId,
    "Usuario administrador invalido.",
  );
  const normalizedUserId = normalizeRequiredId(userId, "Usuario invalido.");

  await assertAdminActor(normalizedActorUserId);

  return prisma.$transaction(async (tx) => {
    const targetUser = await tx.user.findUnique({
      where: {
        id: normalizedUserId,
      },
      select: {
        id: true,
        role: true,
        barbershopId: true,
        currentBarbershopId: true,
      },
    });

    if (!targetUser) {
      throw new OwnerAssignmentError("Usuario nao encontrado.");
    }

    const ownedBarbershop = await tx.barbershop.findFirst({
      where: {
        ownerId: targetUser.id,
      },
      select: {
        id: true,
      },
    });

    if (ownedBarbershop) {
      await tx.barbershop.update({
        where: {
          id: ownedBarbershop.id,
        },
        data: {
          ownerId: null,
        },
      });
    }

    const previousBarbershopId = ownedBarbershop?.id ?? targetUser.barbershopId;
    const demotedCurrentBarbershopId =
      await resolveCurrentBarbershopIdForDemotion({
        tx,
        userId: targetUser.id,
        previousBarbershopId,
        currentBarbershopId: targetUser.currentBarbershopId,
      });

    const updatedUser = await tx.user.update({
      where: {
        id: targetUser.id,
      },
      data: {
        role: toNonOwnerRole(targetUser.role as UserRole),
        barbershopId: null,
        currentBarbershopId: demotedCurrentBarbershopId,
      },
      select: {
        id: true,
        role: true,
        barbershopId: true,
      },
    });

    return {
      user: {
        id: updatedUser.id,
        role: updatedUser.role as UserRole,
        barbershopId: updatedUser.barbershopId,
      },
      unlinkedBarbershopId: ownedBarbershop?.id ?? targetUser.barbershopId,
    };
  });
};
