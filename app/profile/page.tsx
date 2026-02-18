import Footer from "@/components/footer";
import Header from "@/components/header";
import { Card, CardContent } from "@/components/ui/card";
import { PageContainer } from "@/components/ui/page";
import { getMyProfileData } from "@/data/profile";
import { getSafeReturnToPath } from "@/lib/profile-completion";
import { requireAuthenticatedUser } from "@/lib/rbac";
import { redirect } from "next/navigation";

import ProfilePageClient from "./profile-page-client";

interface ProfilePageProps {
  searchParams: Promise<{
    mode?: string | string[];
    returnTo?: string | string[];
  }>;
}

const parseStringSearchParam = (value: string | string[] | undefined) => {
  if (!value) {
    return null;
  }

  return Array.isArray(value) ? (value[0] ?? null) : value;
};

const ProfilePage = async ({ searchParams }: ProfilePageProps) => {
  const sessionUser = await requireAuthenticatedUser();
  const resolvedSearchParams = await searchParams;
  const mode = parseStringSearchParam(resolvedSearchParams.mode);
  const isCompleteMode = mode === "complete";
  const returnTo = getSafeReturnToPath(
    parseStringSearchParam(resolvedSearchParams.returnTo),
  );

  const profile = await getMyProfileData(sessionUser.id);

  if (!profile) {
    redirect("/auth");
  }

  if (isCompleteMode && profile.profileComplete) {
    redirect(returnTo);
  }

  return (
    <div>
      <Header />
      <PageContainer>
        <Card className="mx-auto w-full max-w-lg">
          <CardContent className="pt-6">
            <ProfilePageClient
              initialName={profile.name}
              initialPhone={profile.phone ?? ""}
              initialContactEmail={profile.contactEmail ?? ""}
              accountEmail={profile.email}
              provider={profile.provider}
              isCompleteMode={isCompleteMode}
              returnTo={returnTo}
            />
          </CardContent>
        </Card>
      </PageContainer>
      <Footer />
    </div>
  );
};

export default ProfilePage;
