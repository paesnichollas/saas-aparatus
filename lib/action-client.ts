import { createSafeActionClient } from "next-safe-action";
import { headers } from "next/headers";
import { auth } from "./auth";
import { requireAdmin } from "./rbac";

export const actionClient = createSafeActionClient();

export const protectedActionClient = actionClient.use(async ({ next }) => {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session?.user) {
    throw new Error("Não autorizado. Por favor, faça login para continuar.");
  }
  return next({ ctx: { user: session.user } });
});

export const adminActionClient = protectedActionClient.use(async ({ next }) => {
  const adminUser = await requireAdmin({ onUnauthorized: "throw" });

  return next({ ctx: { user: adminUser } });
});
