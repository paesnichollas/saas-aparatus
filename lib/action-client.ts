import { createSafeActionClient } from "next-safe-action";

import { getSessionUser, requireAdmin } from "./rbac";

export const actionClient = createSafeActionClient();

export const protectedActionClient = actionClient.use(async ({ next }) => {
  const user = await getSessionUser();

  if (!user) {
    throw new Error("Nao autorizado. Por favor, faca login para continuar.");
  }

  return next({ ctx: { user } });
});

export const adminActionClient = protectedActionClient.use(async ({ next }) => {
  const adminUser = await requireAdmin({ onUnauthorized: "throw" });

  return next({ ctx: { user: adminUser } });
});
