import { isUserProvider, type UserProvider } from "./user-provider";

export const PROFILE_INCOMPLETE_CODE = "PROFILE_INCOMPLETE";
export const PROFILE_INCOMPLETE_ERROR_MESSAGE =
  "Complete seu cadastro para continuar.";
export const PROFILE_INCOMPLETE_FIELDS_CODE = "PROFILE_INCOMPLETE_FIELDS";
export const EMAIL_IN_USE_CODE = "EMAIL_IN_USE";
export const OTP_PROVIDER_UNAVAILABLE_CODE = "OTP_PROVIDER_UNAVAILABLE";
export const PHONE_VERIFICATION_DISABLED_CODE = "PHONE_VERIFICATION_DISABLED";

const DEFAULT_RETURN_TO_PATH = "/";

export interface UserProfileCompletionInput {
  name: string | null | undefined;
  phone?: string | null | undefined;
  email?: string | null | undefined;
  provider: UserProvider | string | null | undefined;
}

export const isBlank = (value: string | null | undefined) => {
  return value === null || value === undefined || value.trim().length === 0;
};

const requiresPhoneForProfileCompletion = (provider: UserProvider) => {
  return provider === "phone" || provider === "google";
};

export const isUserProfileComplete = (user: UserProfileCompletionInput) => {
  if (isBlank(user.name)) {
    return false;
  }

  const provider = isUserProvider(user.provider) ? user.provider : "credentials";

  if (requiresPhoneForProfileCompletion(provider) && isBlank(user.phone)) {
    return false;
  }

  return true;
};

export const isProfileIncompleteCode = (
  value: unknown,
): value is typeof PROFILE_INCOMPLETE_CODE => {
  return value === PROFILE_INCOMPLETE_CODE;
};

export const getSafeReturnToPath = (
  returnTo: string | null | undefined,
  fallbackPath = DEFAULT_RETURN_TO_PATH,
) => {
  const normalizedValue = returnTo?.trim();

  if (!normalizedValue) {
    return fallbackPath;
  }

  if (!normalizedValue.startsWith("/")) {
    return fallbackPath;
  }

  if (normalizedValue.startsWith("//")) {
    return fallbackPath;
  }

  const disallowedReturnPaths = ["/complete-profile", "/profile", "/me"];
  const isDisallowedReturnPath = disallowedReturnPaths.some((path) => {
    return normalizedValue === path || normalizedValue.startsWith(`${path}?`);
  });

  if (isDisallowedReturnPath) {
    return fallbackPath;
  }

  return normalizedValue;
};

export const buildCompleteProfileUrl = (returnTo: string | null | undefined) => {
  const safeReturnTo = getSafeReturnToPath(returnTo);
  return `/profile?mode=complete&returnTo=${encodeURIComponent(safeReturnTo)}`;
};
