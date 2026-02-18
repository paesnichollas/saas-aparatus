import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { CONFIRMED_BOOKING_PAYMENT_WHERE } from "@/lib/booking-payment";
import { buildPublicSlugCandidate, getPublicSlugBase } from "@/lib/public-slug";
import { reconcilePendingBookingsForBarbershop } from "@/lib/stripe-booking-reconciliation";
import { createShareLinkToken } from "@/lib/share-link-token";
import { unstable_cache } from "next/cache";
import {
  barbershopByIdTag,
  barbershopByPublicSlugTag,
  barbershopBySlugTag,
  barbershopsListTag,
  CACHE_REVALIDATE_SECONDS,
  popularBarbershopsTag,
} from "@/lib/cache-tags";

export type AdminBarbershopWithRelations = Prisma.BarbershopGetPayload<{
  select: {
    id: true;
    name: true;
    services: true;
    barbers: true;
    openingHours: true;
    bookings: {
      select: {
        id: true;
        date: true;
        paymentStatus: true;
        cancelledAt: true;
        barber: true;
        service: true;
        services: {
          select: {
            service: true;
          };
        };
        user: true;
      };
    };
  };
}>;

export interface BarbershopListItem {
  id: string;
  name: string;
  address: string;
  imageUrl: string;
  slug: string;
  isExclusive: boolean;
}

const PUBLIC_SLUG_MAX_GENERATION_ATTEMPTS = 50;
const DEFAULT_BARBERSHOPS_LIST_LIMIT = 24;
const DEFAULT_POPULAR_BARBERSHOPS_LIST_LIMIT = 12;
const MAX_BARBERSHOPS_LIST_LIMIT = 60;

const BARBERSHOP_SCALAR_SELECT = {
  id: true,
  name: true,
  slug: true,
  publicSlug: true,
  shareSlug: true,
  address: true,
  description: true,
  homePremiumTitle: true,
  homePremiumDescription: true,
  homePremiumChips: true,
  imageUrl: true,
  logoUrl: true,
  exclusiveBarber: true,
  phones: true,
  plan: true,
  whatsappProvider: true,
  whatsappFrom: true,
  whatsappEnabled: true,
  bookingIntervalMinutes: true,
  stripeEnabled: true,
  isActive: true,
  ownerId: true,
} satisfies Prisma.BarbershopSelect;

const BARBERSHOP_DETAILS_SELECT = {
  ...BARBERSHOP_SCALAR_SELECT,
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
} satisfies Prisma.BarbershopSelect;

const BARBERSHOP_LIST_ITEM_SELECT = {
  id: true,
  name: true,
  address: true,
  imageUrl: true,
  slug: true,
  exclusiveBarber: true,
} satisfies Prisma.BarbershopSelect;

type BarbershopListRecord = Prisma.BarbershopGetPayload<{
  select: typeof BARBERSHOP_LIST_ITEM_SELECT;
}>;

const mapBarbershopListItem = (
  barbershop: BarbershopListRecord,
): BarbershopListItem => {
  return {
    id: barbershop.id,
    name: barbershop.name,
    address: barbershop.address,
    imageUrl: barbershop.imageUrl,
    slug: barbershop.slug,
    isExclusive: barbershop.exclusiveBarber,
  };
};

const normalizeListLimit = (limit: number, fallback: number) => {
  if (!Number.isInteger(limit) || limit < 1) {
    return fallback;
  }

  return Math.min(limit, MAX_BARBERSHOPS_LIST_LIMIT);
};

const getBarbershopsCached = (limit: number) => {
  return unstable_cache(
    async () => {
      const barbershops = await prisma.barbershop.findMany({
        select: BARBERSHOP_LIST_ITEM_SELECT,
        orderBy: {
          name: "asc",
        },
        take: limit,
      });

      return barbershops.map(mapBarbershopListItem);
    },
    ["public-barbershops-list", String(limit)],
    {
      revalidate: CACHE_REVALIDATE_SECONDS,
      tags: [barbershopsListTag()],
    },
  );
};

const getPopularBarbershopsCached = (limit: number) => {
  return unstable_cache(
    async () => {
      const popularBarbershops = await prisma.barbershop.findMany({
        select: BARBERSHOP_LIST_ITEM_SELECT,
        orderBy: {
          name: "desc",
        },
        take: limit,
      });

      return popularBarbershops.map(mapBarbershopListItem);
    },
    ["public-popular-barbershops-list", String(limit)],
    {
      revalidate: CACHE_REVALIDATE_SECONDS,
      tags: [popularBarbershopsTag()],
    },
  );
};

const getBarbershopByIdCached = (barbershopId: string) => {
  return unstable_cache(
    async () => {
      return prisma.barbershop.findUnique({
        where: { id: barbershopId },
        select: BARBERSHOP_DETAILS_SELECT,
      });
    },
    ["public-barbershop-by-id", barbershopId],
    {
      revalidate: CACHE_REVALIDATE_SECONDS,
      tags: [barbershopByIdTag(barbershopId)],
    },
  );
};

const getBarbershopBySlugCached = (slug: string) => {
  return unstable_cache(
    async () => {
      return prisma.barbershop.findUnique({
        where: { slug },
        select: BARBERSHOP_DETAILS_SELECT,
      });
    },
    ["public-barbershop-by-slug", slug],
    {
      revalidate: CACHE_REVALIDATE_SECONDS,
      tags: [barbershopBySlugTag(slug)],
    },
  );
};

const getBarbershopByPublicSlugCached = (publicSlug: string) => {
  return unstable_cache(
    async () => {
      return prisma.barbershop.findUnique({
        where: {
          publicSlug,
        },
        select: BARBERSHOP_DETAILS_SELECT,
      });
    },
    ["public-barbershop-by-public-slug", publicSlug],
    {
      revalidate: CACHE_REVALIDATE_SECONDS,
      tags: [barbershopByPublicSlugTag(publicSlug)],
    },
  );
};

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

export const getBarbershops = async (
  limit = DEFAULT_BARBERSHOPS_LIST_LIMIT,
) => {
  const normalizedLimit = normalizeListLimit(
    limit,
    DEFAULT_BARBERSHOPS_LIST_LIMIT,
  );
  return getBarbershopsCached(normalizedLimit)();
};

export const getPopularBarbershops = async (
  limit = DEFAULT_POPULAR_BARBERSHOPS_LIST_LIMIT,
) => {
  const normalizedLimit = normalizeListLimit(
    limit,
    DEFAULT_POPULAR_BARBERSHOPS_LIST_LIMIT,
  );
  return getPopularBarbershopsCached(normalizedLimit)();
};

export const getBarbershopById = async (id: string) => {
  const normalizedId = id.trim();

  if (!normalizedId) {
    return null;
  }

  return getBarbershopByIdCached(normalizedId)();
};

export const getBarbershopBySlug = async (slug: string) => {
  const normalizedSlug = slug.trim();

  if (!normalizedSlug) {
    return null;
  }

  return getBarbershopBySlugCached(normalizedSlug)();
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
    select: BARBERSHOP_DETAILS_SELECT,
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
  const shareToken = createShareLinkToken({
    barbershopId,
    publicSlug,
  });
  const baseUrl =
    parseAbsoluteHttpUrl(process.env.NEXT_PUBLIC_APP_URL) ??
    parseAbsoluteHttpUrl(origin);

  if (!baseUrl) {
    throw new Error(
      "[getBarbershopShareLink] Invalid NEXT_PUBLIC_APP_URL and origin fallback.",
    );
  }

  const shareLinkUrl = new URL(`/s/${publicSlug}`, baseUrl);
  shareLinkUrl.searchParams.set("st", shareToken);

  return shareLinkUrl.toString();
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

  return getBarbershopByPublicSlugCached(normalizedPublicSlug)();
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
    select: BARBERSHOP_DETAILS_SELECT,
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
    select: BARBERSHOP_DETAILS_SELECT,
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
    select: BARBERSHOP_LIST_ITEM_SELECT,
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
  return barbershops.map(mapBarbershopListItem);
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
    select: {
      id: true,
      name: true,
      address: true,
      description: true,
      imageUrl: true,
      phones: true,
      slug: true,
      stripeEnabled: true,
      exclusiveBarber: true,
      plan: true,
      homePremiumTitle: true,
      homePremiumDescription: true,
      homePremiumChips: true,
      barbers: {
        select: {
          id: true,
          name: true,
          imageUrl: true,
        },
        orderBy: {
          name: "asc",
        },
      },
      openingHours: {
        select: {
          dayOfWeek: true,
          openMinute: true,
          closeMinute: true,
          closed: true,
        },
        orderBy: {
          dayOfWeek: "asc",
        },
      },
      whatsappSettings: {
        select: {
          sendBookingConfirmation: true,
          sendReminder24h: true,
          sendReminder1h: true,
          updatedAt: true,
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
        select: {
          id: true,
          date: true,
          startAt: true,
          cancelledAt: true,
          paymentMethod: true,
          paymentStatus: true,
          stripeChargeId: true,
          totalPriceInCents: true,
          barber: {
            select: {
              name: true,
            },
          },
          service: {
            select: {
              name: true,
            },
          },
          services: {
            select: {
              service: {
                select: {
                  name: true,
                },
              },
            },
          },
          user: {
            select: {
              name: true,
              phone: true,
            },
          },
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
