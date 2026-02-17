import {
  DEFAULT_SERVER_ERROR_MESSAGE,
  createSafeActionClient,
} from "next-safe-action";

import { getSessionUser, requireAdmin } from "./rbac";
import {
  assertUserHasCompletedProfile,
  isProfileIncompleteError,
} from "./profile-completion-guard";
import { PROFILE_INCOMPLETE_CODE } from "./profile-completion";

const handleActionClientServerError = (error: Error) => {
  if (isProfileIncompleteError(error)) {
    return PROFILE_INCOMPLETE_CODE;
  }

  console.error("Action error:", error.message);
  return DEFAULT_SERVER_ERROR_MESSAGE;
};

export const actionClient = createSafeActionClient({
  handleServerError: handleActionClientServerError,
});

export const protectedActionClient = actionClient.use(async ({ next }) => {
  const user = await getSessionUser();

  if (!user) {
    throw new Error("Nao autorizado. Por favor, faca login para continuar.");
  }

  return next({ ctx: { user } });
});

export const criticalActionClient = protectedActionClient.use(
  async ({ next, ctx }) => {
    await assertUserHasCompletedProfile(ctx.user.id);

    return next({ ctx });
  },
);

export const adminActionClient = protectedActionClient.use(async ({ next }) => {
  const adminUser = await requireAdmin({ onUnauthorized: "throw" });

  return next({ ctx: { user: adminUser } });
});
