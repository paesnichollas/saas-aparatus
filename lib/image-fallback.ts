const DEFAULT_BARBERSHOP_IMAGE_URL = "/banner.png";

export const resolveBarbershopImageUrl = (
  imageUrl: string | null | undefined,
) => {
  const normalizedImageUrl = imageUrl?.trim() ?? "";

  if (normalizedImageUrl.length > 0) {
    return normalizedImageUrl;
  }

  return DEFAULT_BARBERSHOP_IMAGE_URL;
};
