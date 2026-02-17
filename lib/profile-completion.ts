export const PROFILE_INCOMPLETE_CODE = "PROFILE_INCOMPLETE";
export const PROFILE_INCOMPLETE_ERROR_MESSAGE =
  "Complete seu cadastro para continuar.";
export const PROFILE_INCOMPLETE_FIELDS_CODE = "PROFILE_INCOMPLETE_FIELDS";
export const EMAIL_IN_USE_CODE = "EMAIL_IN_USE";
export const OTP_PROVIDER_UNAVAILABLE_CODE = "OTP_PROVIDER_UNAVAILABLE";

const DEFAULT_RETURN_TO_PATH = "/";

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

  if (normalizedValue.startsWith("/complete-profile")) {
    return fallbackPath;
  }

  return normalizedValue;
};

export const buildCompleteProfileUrl = (returnTo: string | null | undefined) => {
  const safeReturnTo = getSafeReturnToPath(returnTo);
  return `/complete-profile?returnTo=${encodeURIComponent(safeReturnTo)}`;
};
