import { createHmac } from "crypto";

interface CreateShareLinkTokenInput {
  barbershopId: string;
  publicSlug: string;
}

const resolveShareTokenSecret = () => {
  const configuredSecret =
    process.env.SHARE_LINK_TOKEN_SECRET?.trim() ??
    process.env.BETTER_AUTH_SECRET?.trim();

  if (configuredSecret && configuredSecret.length > 0) {
    return configuredSecret;
  }

  return "dev-share-link-token-secret";
};

export const createShareLinkToken = ({
  barbershopId,
  publicSlug,
}: CreateShareLinkTokenInput) => {
  const normalizedBarbershopId = barbershopId.trim();
  const normalizedPublicSlug = publicSlug.trim();
  const payload = `${normalizedBarbershopId}:${normalizedPublicSlug}`;

  return createHmac("sha256", resolveShareTokenSecret())
    .update(payload)
    .digest("base64url");
};
