export const USER_PROVIDERS = ["google", "phone", "credentials"] as const;

export type UserProvider = (typeof USER_PROVIDERS)[number];

export const isUserProvider = (value: unknown): value is UserProvider => {
  return (
    typeof value === "string" &&
    USER_PROVIDERS.includes(value as UserProvider)
  );
};

export const getUserProviderFromAccountProviderId = (
  providerId: string,
): UserProvider | null => {
  const normalizedProviderId = providerId.trim().toLowerCase();

  if (!normalizedProviderId) {
    return null;
  }

  if (normalizedProviderId.includes("google")) {
    return "google";
  }

  if (
    normalizedProviderId.includes("credential") ||
    normalizedProviderId.includes("email") ||
    normalizedProviderId.includes("password")
  ) {
    return "credentials";
  }

  if (normalizedProviderId.includes("phone")) {
    return "phone";
  }

  return null;
};
