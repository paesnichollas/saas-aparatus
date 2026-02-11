import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

import { prisma } from "./prisma";

const ACCOUNT_DEACTIVATED_ERROR_MESSAGE = "Conta desativada";

const isInactiveUser = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      isActive: true,
      barbershop: {
        select: {
          isActive: true,
        },
      },
      ownedBarbershop: {
        select: {
          isActive: true,
        },
      },
    },
  });

  if (!user) {
    return true;
  }

  if (!user.isActive) {
    return true;
  }

  if (user.barbershop && !user.barbershop.isActive) {
    return true;
  }

  if (user.ownedBarbershop && !user.ownedBarbershop.isActive) {
    return true;
  }

  return false;
};

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          const userId =
            typeof session.userId === "string" ? session.userId.trim() : "";

          if (!userId) {
            return false;
          }

          const shouldBlockSessionCreation = await isInactiveUser(userId);

          if (shouldBlockSessionCreation) {
            throw new Error(ACCOUNT_DEACTIVATED_ERROR_MESSAGE);
          }
        },
      },
    },
  },
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },
});
