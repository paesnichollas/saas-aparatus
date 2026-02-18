import "server-only";

import { type Prisma } from "@/generated/prisma/client";
import { ensureBarbershopPublicSlug } from "@/data/barbershops";
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

const normalizePhones = (phones: string[] | undefined) => {
  if (!phones) {
    return undefined;
  }

  const normalizedPhones = phones.map((phone) => phone.trim()).filter(Boolean);

  if (normalizedPhones.length === 0) {
    throw new Error("Informe pelo menos um telefone valido.");
  }

  return normalizedPhones;
};

interface AdminListBarbershopsInput {
  search?: string;
  page?: number;
  pageSize?: number;
}

export const adminListBarbershops = async (input: AdminListBarbershopsInput = {}) => {
  await requireAdmin({ onUnauthorized: "throw" });

  const page = normalizePage(input.page);
  const pageSize = normalizePageSize(input.pageSize);
  const search = normalizeSearch(input.search);

  const where: Prisma.BarbershopWhereInput = search
    ? {
        OR: [
          {
            name: {
              contains: search,
              mode: "insensitive",
            },
          },
          {
            slug: {
              contains: search,
              mode: "insensitive",
            },
          },
          {
            publicSlug: {
              contains: search,
              mode: "insensitive",
            },
          },
          {
            owner: {
              is: {
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
              },
            },
          },
        ],
      }
    : {};

  const [totalCount, items] = await Promise.all([
    prisma.barbershop.count({ where }),
    prisma.barbershop.findMany({
      where,
      orderBy: {
        name: "asc",
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        name: true,
        slug: true,
        publicSlug: true,
        shareSlug: true,
        phones: true,
        exclusiveBarber: true,
        stripeEnabled: true,
        plan: true,
        whatsappProvider: true,
        whatsappEnabled: true,
        ownerId: true,
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
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

export const adminGetBarbershop = async (barbershopId: string) => {
  await requireAdmin({ onUnauthorized: "throw" });

  const normalizedBarbershopId = barbershopId.trim();

  if (!normalizedBarbershopId) {
    throw new Error("Barbearia invalida.");
  }

  const barbershop = await prisma.barbershop.findUnique({
    where: {
      id: normalizedBarbershopId,
    },
    select: {
      id: true,
      name: true,
      slug: true,
      publicSlug: true,
      shareSlug: true,
      phones: true,
      exclusiveBarber: true,
      stripeEnabled: true,
      plan: true,
      whatsappProvider: true,
      whatsappFrom: true,
      whatsappEnabled: true,
      whatsappSettings: {
        select: {
          sendBookingConfirmation: true,
          sendReminder24h: true,
          sendReminder1h: true,
        },
      },
      ownerId: true,
      owner: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      },
    },
  });

  return barbershop;
};

interface AdminUpdateBarbershopInput {
  barbershopId: string;
  name: string;
  phones: string[];
  exclusiveBarber: boolean;
  stripeEnabled: boolean;
  ownerId?: string | null;
}

export const adminUpdateBarbershop = async ({
  barbershopId,
  name,
  phones,
  exclusiveBarber,
  stripeEnabled,
  ownerId,
}: AdminUpdateBarbershopInput) => {
  const adminUser = await requireAdmin({ onUnauthorized: "throw" });

  const normalizedBarbershopId = barbershopId.trim();
  const normalizedName = name.trim();
  const normalizedPhones = normalizePhones(phones);

  if (!normalizedBarbershopId || !normalizedName || !normalizedPhones) {
    throw new Error("Dados invalidos para atualizacao da barbearia.");
  }

  const barbershop = await prisma.barbershop.findUnique({
    where: {
      id: normalizedBarbershopId,
    },
    select: {
      id: true,
      ownerId: true,
    },
  });

  if (!barbershop) {
    throw new Error("Barbearia nao encontrada.");
  }

  if (ownerId !== undefined) {
    const normalizedOwnerId = ownerId?.trim() || null;

    if (!normalizedOwnerId && barbershop.ownerId) {
      await demoteOwnerToCustomerByAdmin({
        actorUserId: adminUser.id,
        userId: barbershop.ownerId,
      });
    }

    if (normalizedOwnerId && normalizedOwnerId !== barbershop.ownerId) {
      const targetOwner = await prisma.user.findUnique({
        where: {
          id: normalizedOwnerId,
        },
        select: {
          id: true,
          role: true,
        },
      });

      if (!targetOwner) {
        throw new Error("Usuario owner nao encontrado.");
      }

      if (targetOwner.role === "ADMIN") {
        throw new Error("Nao vincule um ADMIN como owner por esta tela.");
      }

      await promoteUserToOwnerByAdmin({
        actorUserId: adminUser.id,
        userId: normalizedOwnerId,
        barbershopId: barbershop.id,
        allowTransfer: true,
      });
    }
  }

  const updatedBarbershop = await prisma.barbershop.update({
    where: {
      id: barbershop.id,
    },
    data: {
      name: normalizedName,
      phones: normalizedPhones,
      exclusiveBarber,
      stripeEnabled,
    },
    select: {
      id: true,
      name: true,
      slug: true,
      publicSlug: true,
      shareSlug: true,
      phones: true,
      exclusiveBarber: true,
      stripeEnabled: true,
      plan: true,
      whatsappProvider: true,
      whatsappFrom: true,
      whatsappEnabled: true,
      whatsappSettings: {
        select: {
          sendBookingConfirmation: true,
          sendReminder24h: true,
          sendReminder1h: true,
        },
      },
      ownerId: true,
      owner: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      },
    },
  });

  const publicSlug = await ensureBarbershopPublicSlug(updatedBarbershop.id);

  return {
    ...updatedBarbershop,
    publicSlug,
  };
};
