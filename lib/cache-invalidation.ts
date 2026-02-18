import { revalidatePath, revalidateTag } from "next/cache";

import {
  barbershopByIdTag,
  barbershopByPublicSlugTag,
  barbershopBySlugTag,
  barbershopsListTag,
  popularBarbershopsTag,
} from "@/lib/cache-tags";

interface RevalidatePublicBarbershopCacheInput {
  barbershopId: string;
  slug?: string | null;
  previousSlug?: string | null;
  publicSlug?: string | null;
}

interface RevalidateBookingSurfacesInput {
  includeHome?: boolean;
  includeOwner?: boolean;
  includeAdmin?: boolean;
}

const normalizeOptionalValue = (value: string | null | undefined) => {
  const normalizedValue = value?.trim();
  return normalizedValue && normalizedValue.length > 0 ? normalizedValue : null;
};

export const revalidatePublicBarbershopCache = ({
  barbershopId,
  slug,
  previousSlug,
  publicSlug,
}: RevalidatePublicBarbershopCacheInput) => {
  const normalizedBarbershopId = barbershopId.trim();

  if (!normalizedBarbershopId) {
    return;
  }

  const normalizedSlug = normalizeOptionalValue(slug);
  const normalizedPreviousSlug = normalizeOptionalValue(previousSlug);
  const normalizedPublicSlug = normalizeOptionalValue(publicSlug);

  revalidateTag(barbershopsListTag(), "max");
  revalidateTag(popularBarbershopsTag(), "max");
  revalidateTag(barbershopByIdTag(normalizedBarbershopId), "max");

  revalidatePath("/");
  revalidatePath("/barbershops");
  revalidatePath(`/barbershops/${normalizedBarbershopId}`);

  if (normalizedSlug) {
    revalidateTag(barbershopBySlugTag(normalizedSlug), "max");
    revalidatePath(`/b/${normalizedSlug}`);
    revalidatePath(`/e/${normalizedSlug}`);
  }

  if (normalizedPreviousSlug && normalizedPreviousSlug !== normalizedSlug) {
    revalidateTag(barbershopBySlugTag(normalizedPreviousSlug), "max");
    revalidatePath(`/b/${normalizedPreviousSlug}`);
    revalidatePath(`/e/${normalizedPreviousSlug}`);
  }

  if (normalizedPublicSlug) {
    revalidateTag(barbershopByPublicSlugTag(normalizedPublicSlug), "max");
    revalidatePath(`/s/${normalizedPublicSlug}`);
  }
};

export const revalidateBookingSurfaces = ({
  includeHome = true,
  includeOwner = true,
  includeAdmin = true,
}: RevalidateBookingSurfacesInput = {}) => {
  revalidatePath("/bookings");

  if (includeHome) {
    revalidatePath("/");
  }

  if (includeOwner) {
    revalidatePath("/owner");
  }

  if (includeAdmin) {
    revalidatePath("/admin");
    revalidatePath("/admin/bookings");
  }
};
