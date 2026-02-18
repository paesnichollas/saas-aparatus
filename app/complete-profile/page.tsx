import { redirect } from "next/navigation";

import { getSafeReturnToPath } from "@/lib/profile-completion";

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
  const resolvedSearchParams = await searchParams;
  const returnTo = getSafeReturnToPath(
    parseStringSearchParam(resolvedSearchParams.returnTo),
  );

  redirect(`/profile?mode=complete&returnTo=${encodeURIComponent(returnTo)}`);
};

export default CompleteProfilePage;
