const FALLBACK_PUBLIC_SLUG = "barbearia";

export const normalizePublicSlug = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");

export const getPublicSlugBase = (name: string) =>
  normalizePublicSlug(name.trim()) || FALLBACK_PUBLIC_SLUG;

export const buildPublicSlugCandidate = (baseSlug: string, suffix: number) =>
  suffix <= 1 ? baseSlug : `${baseSlug}-${suffix}`;
