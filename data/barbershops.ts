import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { CONFIRMED_BOOKING_PAYMENT_WHERE } from "@/lib/booking-payment";
import { buildPublicSlugCandidate, getPublicSlugBase } from "@/lib/public-slug";
import { reconcilePendingBookingsForBarbershop } from "@/lib/stripe-booking-reconciliation";

export type AdminBarbershopWithRelations = Prisma.BarbershopGetPayload<{
  include: {
    services: true;
    barbers: true;
    openingHours: true;
    bookings: {
      include: {
        barber: true;
        service: true;
        services: {
          include: {
            service: true;
          };
        };
        user: true;
      };
    };
  };
}>;

const PUBLIC_SLUG_MAX_GENERATION_ATTEMPTS = 50;

const BARBERSHOP_DETAILS_INCLUDE = {
  barbers: {
    orderBy: {
      name: "asc",
    },
  },
  services: {
    where: {
      deletedAt: null,
    },
    orderBy: {
      name: "asc",
    },
  },
  openingHours: {
    orderBy: {
      dayOfWeek: "asc",
    },
  },
} satisfies Prisma.BarbershopInclude;

const parseAbsoluteHttpUrl = (value: string | null | undefined) => {
  const normalizedValue = value?.trim();

  if (!normalizedValue) {
    return null;
  }

  try {
    const parsedUrl = new URL(normalizedValue);

    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return null;
    }

    return parsedUrl;
  } catch {
    return null;
  }
};

const resolveAvailablePublicSlug = async ({
  baseSlug,
  excludeBarbershopId,
}: {
  baseSlug: string;
  excludeBarbershopId: string;
}) => {
  const existingSlugs = await prisma.barbershop.findMany({
    where: {
      NOT: {
        id: excludeBarbershopId,
      },
      OR: [
        {
          publicSlug: baseSlug,
        },
        {
          publicSlug: {
            startsWith: `${baseSlug}-`,
          },
        },
      ],
    },
    select: {
      publicSlug: true,
    },
  });

  const takenSlugs = new Set(existingSlugs.map((barbershop) => barbershop.publicSlug));

  let suffix = 1;
  for (;;) {
    const candidateSlug = buildPublicSlugCandidate(baseSlug, suffix);

    if (!takenSlugs.has(candidateSlug)) {
      return candidateSlug;
    }

    suffix += 1;
  }
};

export const getBarbershops = async () => {
  const barbershops = await prisma.barbershop.findMany({
    where: {
      exclusiveBarber: false,
    },
  });
  return barbershops;
};

export const getPopularBarbershops = async () => {
  const popularBarbershops = await prisma.barbershop.findMany({
    where: {
      exclusiveBarber: false,
    },
    orderBy: {
      name: "desc",
    },
  });
  return popularBarbershops;
};

export const getBarbershopById = async (id: string) => {
  const barbershop = await prisma.barbershop.findUnique({
    where: { id },
    include: BARBERSHOP_DETAILS_INCLUDE,
  });
  return barbershop;
};

export const getBarbershopBySlug = async (slug: string) => {
  const barbershop = await prisma.barbershop.findUnique({
    where: { slug },
    include: BARBERSHOP_DETAILS_INCLUDE,
  });
  return barbershop;
};

export const getExclusiveBarbershopByContextId = async (
  contextBarbershopId: string | null,
) => {
  const normalizedContextBarbershopId = contextBarbershopId?.trim();

  if (!normalizedContextBarbershopId) {
    return null;
  }

  const contextBarbershop = await prisma.barbershop.findUnique({
    where: {
      id: normalizedContextBarbershopId,
    },
    include: BARBERSHOP_DETAILS_INCLUDE,
  });

  if (!contextBarbershop) {
    return null;
  }

  if (!contextBarbershop.exclusiveBarber || !contextBarbershop.ownerId) {
    return null;
  }

  return contextBarbershop;
};

export const ensureBarbershopPublicSlug = async (barbershopId: string) => {
  const barbershop = await prisma.barbershop.findUnique({
    where: {
      id: barbershopId,
    },
    select: {
      id: true,
      name: true,
      publicSlug: true,
    },
  });

  if (!barbershop) {
    throw new Error("[ensureBarbershopPublicSlug] Barbershop not found.");
  }

  if (barbershop.publicSlug.trim().length > 0) {
    return barbershop.publicSlug;
  }

  const baseSlug = getPublicSlugBase(barbershop.name);

  for (let attempt = 0; attempt < PUBLIC_SLUG_MAX_GENERATION_ATTEMPTS; attempt += 1) {
    const candidatePublicSlug = await resolveAvailablePublicSlug({
      baseSlug,
      excludeBarbershopId: barbershopId,
    });

    try {
      const updateResult = await prisma.barbershop.updateMany({
        where: {
          id: barbershopId,
          publicSlug: "",
        },
        data: {
          publicSlug: candidatePublicSlug,
        },
      });

      if (updateResult.count === 1) {
        return candidatePublicSlug;
      }
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        continue;
      }

      throw error;
    }

    const barbershopWithSlug = await prisma.barbershop.findUnique({
      where: {
        id: barbershopId,
      },
      select: {
        publicSlug: true,
      },
    });

    if (!barbershopWithSlug) {
      throw new Error("[ensureBarbershopPublicSlug] Barbershop not found.");
    }

    if (barbershopWithSlug.publicSlug.trim().length > 0) {
      return barbershopWithSlug.publicSlug;
    }
  }

  throw new Error(
    "[ensureBarbershopPublicSlug] Could not generate unique public slug.",
  );
};

export const getBarbershopShareLink = async (
  barbershopId: string,
  origin?: string | null,
) => {
  const publicSlug = await ensureBarbershopPublicSlug(barbershopId);
  const baseUrl =
    parseAbsoluteHttpUrl(process.env.NEXT_PUBLIC_APP_URL) ??
    parseAbsoluteHttpUrl(origin);

  if (!baseUrl) {
    throw new Error(
      "[getBarbershopShareLink] Invalid NEXT_PUBLIC_APP_URL and origin fallback.",
    );
  }

  return new URL(`/s/${publicSlug}`, baseUrl).toString();
};

export type ShareTokenResolutionSource =
  | "public-slug"
  | "legacy-id"
  | "legacy-share-slug";

export const getBarbershopByPublicSlug = async (publicSlug: string) => {
  const normalizedPublicSlug = publicSlug.trim();

  if (!normalizedPublicSlug) {
    return null;
  }

  const barbershop = await prisma.barbershop.findUnique({
    where: {
      publicSlug: normalizedPublicSlug,
    },
    include: BARBERSHOP_DETAILS_INCLUDE,
  });

  return barbershop;
};

export const resolveBarbershopByShareToken = async (shareToken: string) => {
  const normalizedShareToken = shareToken.trim();

  if (!normalizedShareToken) {
    return null;
  }

  const byPublicSlug = await getBarbershopByPublicSlug(normalizedShareToken);

  if (byPublicSlug) {
    return {
      barbershop: byPublicSlug,
      source: "public-slug" as ShareTokenResolutionSource,
    };
  }

  const byLegacyId = await prisma.barbershop.findUnique({
    where: {
      id: normalizedShareToken,
    },
    include: BARBERSHOP_DETAILS_INCLUDE,
  });

  if (byLegacyId) {
    return {
      barbershop: byLegacyId,
      source: "legacy-id" as ShareTokenResolutionSource,
    };
  }

  const byLegacyShareSlug = await prisma.barbershop.findUnique({
    where: {
      shareSlug: normalizedShareToken,
    },
    include: BARBERSHOP_DETAILS_INCLUDE,
  });

  if (byLegacyShareSlug) {
    return {
      barbershop: byLegacyShareSlug,
      source: "legacy-share-slug" as ShareTokenResolutionSource,
    };
  }

  return null;
};

export const getBarbershopsByServiceName = async (serviceName: string) => {
  const barbershops = await prisma.barbershop.findMany({
    where: {
      exclusiveBarber: false,
      services: {
        some: {
          deletedAt: null,
          name: {
            contains: serviceName,
            mode: "insensitive",
          },
        },
      },
    },
  });
  return barbershops;
};

export const getAdminBarbershopByUserId = async (userId: string) => {
  const ownedBarbershop = await prisma.barbershop.findFirst({
    where: {
      ownerId: userId,
    },
    select: {
      id: true,
    },
  });

  if (!ownedBarbershop) {
    return null;
  }

  try {
    await reconcilePendingBookingsForBarbershop(ownedBarbershop.id);
  } catch (error) {
    console.error(
      "[getAdminBarbershopByUserId] Failed to reconcile pending bookings for barbershop.",
      {
        error,
        userId,
        barbershopId: ownedBarbershop.id,
      },
    );
  }

  const barbershop = await prisma.barbershop.findUnique({
    where: {
      id: ownedBarbershop.id,
    },
    include: {
      barbers: {
        orderBy: {
          name: "asc",
        },
      },
      services: {
        where: {
          deletedAt: null,
        },
        orderBy: {
          name: "asc",
        },
      },
      openingHours: {
        orderBy: {
          dayOfWeek: "asc",
        },
      },
      bookings: {
        where: {
          OR: [
            CONFIRMED_BOOKING_PAYMENT_WHERE,
            {
              cancelledAt: {
                not: null,
              },
            },
          ],
        },
        include: {
          barber: true,
          service: true,
          services: {
            include: {
              service: true,
            },
          },
          user: true,
        },
        orderBy: {
          date: "desc",
        },
      },
    },
  });
  return barbershop;
};

export const getAdminBarbershopIdByUserId = async (userId: string) => {
  const barbershop = await prisma.barbershop.findFirst({
    where: {
      ownerId: userId,
    },
    select: {
      id: true,
    },
  });

  return barbershop;
};

export const getOwnerBarbershopByUserId = getAdminBarbershopByUserId;
export const getOwnerBarbershopIdByUserId = getAdminBarbershopIdByUserId;
