export const CACHE_REVALIDATE_SECONDS = 300;

const BARBERSHOPS_LIST_TAG = "barbershops:list";
const POPULAR_BARBERSHOPS_TAG = "barbershops:popular";
const BARBERSHOP_BY_ID_TAG_PREFIX = "barbershop:id:";
const BARBERSHOP_BY_SLUG_TAG_PREFIX = "barbershop:slug:";
const BARBERSHOP_BY_PUBLIC_SLUG_TAG_PREFIX = "barbershop:public-slug:";

const normalizeTagValue = (value: string) => {
  const normalizedValue = value.trim();
  return normalizedValue.length > 0 ? normalizedValue : "unknown";
};

export const barbershopsListTag = () => BARBERSHOPS_LIST_TAG;
export const popularBarbershopsTag = () => POPULAR_BARBERSHOPS_TAG;
export const barbershopByIdTag = (barbershopId: string) => {
  return `${BARBERSHOP_BY_ID_TAG_PREFIX}${normalizeTagValue(barbershopId)}`;
};
export const barbershopBySlugTag = (slug: string) => {
  return `${BARBERSHOP_BY_SLUG_TAG_PREFIX}${normalizeTagValue(slug)}`;
};
export const barbershopByPublicSlugTag = (publicSlug: string) => {
  return `${BARBERSHOP_BY_PUBLIC_SLUG_TAG_PREFIX}${normalizeTagValue(publicSlug)}`;
};
