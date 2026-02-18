import "server-only";

import { isUserProfileComplete } from "@/lib/profile-completion";
import { prisma } from "@/lib/prisma";
import { type UserProvider } from "@/lib/user-provider";
import { resolveAndPersistUserProvider } from "@/lib/user-provider-server";

export interface MyProfileData {
  id: string;
  name: string;
  email: string;
  contactEmail: string | null;
  phone: string | null;
  provider: UserProvider;
  profileComplete: boolean;
}

export const getMyProfileData = async (userId: string): Promise<MyProfileData | null> => {
  const normalizedUserId = userId.trim();

  if (!normalizedUserId) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: {
      id: normalizedUserId,
    },
    select: {
      id: true,
      name: true,
      email: true,
      contactEmail: true,
      phone: true,
      provider: true,
    },
  });

  if (!user) {
    return null;
  }

  const provider = await resolveAndPersistUserProvider({
    id: user.id,
    email: user.email,
    provider: user.provider,
  });

  const profileComplete = isUserProfileComplete({
    name: user.name,
    phone: user.phone,
    email: user.email,
    provider,
  });

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    contactEmail: user.contactEmail,
    phone: user.phone,
    provider,
    profileComplete,
  };
};
