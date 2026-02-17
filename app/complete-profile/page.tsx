import { redirect } from "next/navigation";

import { getSafeReturnToPath } from "@/lib/profile-completion";
import { prisma } from "@/lib/prisma";
import { requireAuthenticatedUser } from "@/lib/rbac";
import { resolveAndPersistUserProvider } from "@/lib/user-provider-server";

import CompleteProfilePageClient from "./complete-profile-page-client";

interface CompleteProfilePageProps {
  searchParams: Promise<{
    returnTo?: string | string[];
  }>;
}

const parseStringSearchParam = (value: string | string[] | undefined) => {
  if (!value) {
    return null;
  }

  return Array.isArray(value) ? (value[0] ?? null) : value;
};

const CompleteProfilePage = async ({ searchParams }: CompleteProfilePageProps) => {
  const sessionUser = await requireAuthenticatedUser();
  const resolvedSearchParams = await searchParams;
  const returnTo = getSafeReturnToPath(
    parseStringSearchParam(resolvedSearchParams.returnTo),
  );

  const user = await prisma.user.findUnique({
    where: {
      id: sessionUser.id,
    },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      provider: true,
      contactEmail: true,
      phoneVerified: true,
      profileCompleted: true,
      accounts: {
        where: {
          password: {
            not: null,
          },
        },
        select: {
          id: true,
        },
        take: 1,
      },
    },
  });

  if (!user) {
    redirect("/auth");
  }

  if (user.profileCompleted) {
    redirect(returnTo);
  }

  const provider = await resolveAndPersistUserProvider({
    id: user.id,
    email: user.email,
    provider: user.provider,
  });

  return (
    <CompleteProfilePageClient
      initialName={user.name}
      initialPhone={user.phone ?? ""}
      initialContactEmail={user.contactEmail ?? ""}
      initialPhoneVerified={user.phoneVerified}
      provider={provider}
      hasPasswordAccount={user.accounts.length > 0}
      returnTo={returnTo}
    />
  );
};

export default CompleteProfilePage;
