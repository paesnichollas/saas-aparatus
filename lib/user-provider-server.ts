import "server-only";

import { isPhoneAuthEmail } from "./auth-phone";
import { prisma } from "./prisma";
import {
  getUserProviderFromAccountProviderId,
  isUserProvider,
  type UserProvider,
} from "./user-provider";

interface ResolveAndPersistUserProviderInput {
  id: string;
  email: string;
  provider: string | null | undefined;
}

const getUserProviderPriority = (provider: UserProvider) => {
  switch (provider) {
    case "phone":
      return 3;
    case "google":
      return 2;
    case "credentials":
      return 1;
  }
};

const selectHighestPriorityProvider = (providers: UserProvider[]) => {
  return providers.reduce<UserProvider | null>((selectedProvider, provider) => {
    if (!selectedProvider) {
      return provider;
    }

    return getUserProviderPriority(provider) >
      getUserProviderPriority(selectedProvider)
      ? provider
      : selectedProvider;
  }, null);
};

export const resolveAndPersistUserProvider = async ({
  id,
  email,
  provider,
}: ResolveAndPersistUserProviderInput): Promise<UserProvider> => {
  const providerFromEmail = isPhoneAuthEmail(email) ? "phone" : null;

  const accountProviders = await prisma.account.findMany({
    where: {
      userId: id,
    },
    select: {
      providerId: true,
    },
  });

  const providerFromAccounts = selectHighestPriorityProvider(
    accountProviders
      .map((account) => getUserProviderFromAccountProviderId(account.providerId))
      .filter((accountProvider): accountProvider is UserProvider => {
        return accountProvider !== null;
      }),
  );

  const validStoredProvider = isUserProvider(provider) ? provider : null;

  const resolvedProvider: UserProvider =
    providerFromEmail ??
    providerFromAccounts ??
    validStoredProvider ??
    "credentials";

  if (resolvedProvider !== provider) {
    await prisma.user.update({
      where: {
        id,
      },
      data: {
        provider: resolvedProvider,
      },
      select: {
        id: true,
      },
    });
  }

  return resolvedProvider;
};

export const resolveAndPersistUserProviderById = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      id: true,
      email: true,
      provider: true,
    },
  });

  if (!user) {
    throw new Error("Nao autorizado.");
  }

  return resolveAndPersistUserProvider(user);
};
