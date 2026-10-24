import "server-only";
import { ORPCError } from "@orpc/server";

import { getAppUser } from "@/auth/session";

import { base } from "./base";

export const appSession = base.use(async ({ context, next }) => {
  const appUser = await getAppUser(context.headers);

  if (!appUser) {
    throw new ORPCError("UNAUTHORIZED");
  }

  if (!appUser.twoFactorEnabled) {
    throw new ORPCError("FORBIDDEN", {
      message: "Set up two-factor authentication first.",
    });
  }

  return next({ context: { appUser } });
});
