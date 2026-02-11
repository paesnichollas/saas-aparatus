import "server-only";

import { type Prisma, type UserRole } from "@/generated/prisma/client";
import { demoteOwnerToCustomerByAdmin, promoteUserToOwnerByAdmin } from "@/data/owner-assignment";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/rbac";

const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 50;

const normalizePage = (page: number | undefined) => {
  if (!page || Number.isNaN(page) || page < 1) {
    return 1;
  }

  return Math.floor(page);
};

const normalizePageSize = (pageSize: number | undefined) => {
  if (!pageSize || Number.isNaN(pageSize) || pageSize < 1) {
    return DEFAULT_PAGE_SIZE;
  }

  return Math.min(Math.floor(pageSize), MAX_PAGE_SIZE);
};

const normalizeSearch = (search: string | undefined) => {
  const normalizedSearch = search?.trim();
  return normalizedSearch?.length ? normalizedSearch : null;
};

const normalizeRequiredId = (value: string, errorMessage: string) => {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new Error(errorMessage);
  }

  return normalizedValue;
};

interface AdminListUsersInput {
  role?: UserRole | "ALL";
  search?: string;
  page?: number;
  pageSize?: number;
}

export const adminListUsers = async (input: AdminListUsersInput = {}) => {
  await requireAdmin({ onUnauthorized: "throw" });

  const page = normalizePage(input.page);
  const pageSize = normalizePageSize(input.pageSize);
  const search = normalizeSearch(input.search);
  const roleFilter = input.role && input.role !== "ALL" ? input.role : null;

  const where: Prisma.UserWhereInput = {
    ...(roleFilter ? { role: roleFilter } : {}),
    ...(search
      ? {
          OR: [
            {
              name: {
                contains: search,
                mode: "insensitive",
              },
            },
            {
              email: {
                contains: search,
                mode: "insensitive",
              },
            },
          ],
        }
      : {}),
  };

  const [totalCount, items] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: {
        createdAt: "desc",
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        barbershopId: true,
        ownedBarbershop: {
          select: {
            id: true,
            name: true,
            isActive: true,
          },
        },
      },
    }),
  ]);

  return {
    items,
    page,
    pageSize,
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
  };
};

interface AdminUpdateUserRoleInput {
  userId: string;
  role: UserRole;
}

const ensureCanChangeFromAdminRole = async ({
  targetUserId,
  targetRole,
  actorUserId,
}: {
  targetUserId: string;
  targetRole: UserRole;
  actorUserId: string;
}) => {
  if (targetRole === "ADMIN") {
    return;
  }

  if (targetUserId === actorUserId) {
    throw new Error("Nao e permitido remover seu proprio papel de ADMIN.");
  }

  const adminCount = await prisma.user.count({
    where: {
      role: "ADMIN",
    },
  });

  if (adminCount <= 1) {
    throw new Error("Nao e permitido remover o ultimo ADMIN do sistema.");
  }
};

export const adminUpdateUserRole = async ({
  userId,
  role,
}: AdminUpdateUserRoleInput) => {
  const adminUser = await requireAdmin({ onUnauthorized: "throw" });

  const normalizedUserId = userId.trim();

  if (!normalizedUserId) {
    throw new Error("Usuario invalido.");
  }

  if (role === "OWNER") {
    throw new Error(
      "Use a promocao com barbearia para mover um usuario para OWNER.",
    );
  }

  const targetUser = await prisma.user.findUnique({
    where: {
      id: normalizedUserId,
    },
    select: {
      id: true,
      role: true,
      barbershopId: true,
      ownedBarbershop: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!targetUser) {
    throw new Error("Usuario nao encontrado.");
  }

  if (targetUser.role === "ADMIN") {
    await ensureCanChangeFromAdminRole({
      targetUserId: targetUser.id,
      targetRole: role,
      actorUserId: adminUser.id,
    });
  }

  if (targetUser.role === "OWNER" && role === "CUSTOMER") {
    const demotion = await demoteOwnerToCustomerByAdmin({
      actorUserId: adminUser.id,
      userId: targetUser.id,
    });

    const updatedUser = await prisma.user.findUnique({
      where: {
        id: demotion.user.id,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        barbershopId: true,
        ownedBarbershop: {
          select: {
            id: true,
            name: true,
            isActive: true,
          },
        },
      },
    });

    if (!updatedUser) {
      throw new Error("Falha ao buscar usuario atualizado.");
    }

    return updatedUser;
  }

  const updatedUser = await prisma.$transaction(async (tx) => {
    if (targetUser.ownedBarbershop && role === "CUSTOMER") {
      await tx.barbershop.update({
        where: {
          id: targetUser.ownedBarbershop.id,
        },
        data: {
          ownerId: null,
        },
      });
    }

    return tx.user.update({
      where: {
        id: targetUser.id,
      },
      data: {
        role,
        ...(role === "CUSTOMER" ? { barbershopId: null } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        barbershopId: true,
        ownedBarbershop: {
          select: {
            id: true,
            name: true,
            isActive: true,
          },
        },
      },
    });
  });

  return updatedUser;
};

interface AdminPromoteToOwnerAndAssignBarbershopInput {
  userId: string;
  barbershopId: string;
  allowTransfer?: boolean;
}

export const adminPromoteToOwnerAndAssignBarbershop = async ({
  userId,
  barbershopId,
  allowTransfer = true,
}: AdminPromoteToOwnerAndAssignBarbershopInput) => {
  const adminUser = await requireAdmin({ onUnauthorized: "throw" });

  const normalizedUserId = userId.trim();
  const normalizedBarbershopId = barbershopId.trim();

  if (!normalizedUserId || !normalizedBarbershopId) {
    throw new Error("Usuario e barbearia sao obrigatorios.");
  }

  return promoteUserToOwnerByAdmin({
    actorUserId: adminUser.id,
    userId: normalizedUserId,
    barbershopId: normalizedBarbershopId,
    allowTransfer,
  });
};

interface AdminToggleBarbershopAccessInput {
  actorUserId: string;
  barbershopId: string;
}

const getLinkedUserIdsByBarbershop = async (
  tx: Prisma.TransactionClient,
  barbershopId: string,
) => {
  const barbershop = await tx.barbershop.findUnique({
    where: {
      id: barbershopId,
    },
    select: {
      id: true,
      isActive: true,
      ownerId: true,
    },
  });

  if (!barbershop) {
    throw new Error("Barbearia nao encontrada.");
  }

  const [directCustomers, customerLinks] = await Promise.all([
    tx.user.findMany({
      where: {
        barbershopId,
        role: "CUSTOMER",
      },
      select: {
        id: true,
      },
    }),
    tx.customerBarbershop.findMany({
      where: {
        barbershopId,
        customer: {
          role: "CUSTOMER",
        },
      },
      select: {
        customerId: true,
      },
    }),
  ]);

  const linkedUserIds = new Set<string>();

  if (barbershop.ownerId) {
    linkedUserIds.add(barbershop.ownerId);
  }

  for (const customer of directCustomers) {
    linkedUserIds.add(customer.id);
  }

  for (const customerLink of customerLinks) {
    linkedUserIds.add(customerLink.customerId);
  }

  return {
    barbershop,
    linkedUserIds: Array.from(linkedUserIds),
  };
};

export const adminDisableBarbershopAccess = async ({
  actorUserId,
  barbershopId,
}: AdminToggleBarbershopAccessInput) => {
  const adminUser = await requireAdmin({ onUnauthorized: "throw" });

  const normalizedActorUserId = normalizeRequiredId(
    actorUserId,
    "Administrador invalido.",
  );
  const normalizedBarbershopId = normalizeRequiredId(
    barbershopId,
    "Barbearia invalida.",
  );

  if (adminUser.id !== normalizedActorUserId) {
    throw new Error("Administrador invalido.");
  }

  return prisma.$transaction(async (tx) => {
    const { barbershop, linkedUserIds } = await getLinkedUserIdsByBarbershop(
      tx,
      normalizedBarbershopId,
    );

    await tx.barbershop.update({
      where: {
        id: barbershop.id,
      },
      data: {
        isActive: false,
      },
    });

    const [updatedUsers, deletedSessions] = await Promise.all([
      linkedUserIds.length > 0
        ? tx.user.updateMany({
            where: {
              id: {
                in: linkedUserIds,
              },
            },
            data: {
              isActive: false,
            },
          })
        : Promise.resolve({ count: 0 }),
      linkedUserIds.length > 0
        ? tx.session.deleteMany({
            where: {
              userId: {
                in: linkedUserIds,
              },
            },
          })
        : Promise.resolve({ count: 0 }),
    ]);

    return {
      barbershopId: barbershop.id,
      barbershopIsActive: false,
      affectedUsersCount: updatedUsers.count,
      revokedSessionsCount: deletedSessions.count,
    };
  });
};

export const adminEnableBarbershopAccess = async ({
  actorUserId,
  barbershopId,
}: AdminToggleBarbershopAccessInput) => {
  const adminUser = await requireAdmin({ onUnauthorized: "throw" });

  const normalizedActorUserId = normalizeRequiredId(
    actorUserId,
    "Administrador invalido.",
  );
  const normalizedBarbershopId = normalizeRequiredId(
    barbershopId,
    "Barbearia invalida.",
  );

  if (adminUser.id !== normalizedActorUserId) {
    throw new Error("Administrador invalido.");
  }

  return prisma.$transaction(async (tx) => {
    const { barbershop, linkedUserIds } = await getLinkedUserIdsByBarbershop(
      tx,
      normalizedBarbershopId,
    );

    await tx.barbershop.update({
      where: {
        id: barbershop.id,
      },
      data: {
        isActive: true,
      },
    });

    const updatedUsers =
      linkedUserIds.length > 0
        ? await tx.user.updateMany({
            where: {
              id: {
                in: linkedUserIds,
              },
            },
            data: {
              isActive: true,
            },
          })
        : { count: 0 };

    return {
      barbershopId: barbershop.id,
      barbershopIsActive: true,
      affectedUsersCount: updatedUsers.count,
      revokedSessionsCount: 0,
    };
  });
};
