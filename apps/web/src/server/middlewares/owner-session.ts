import "server-only";
import { ORPCError } from "@orpc/server";

import { isOwnerEmail } from "@/auth/owner";

import { appSession } from "./app-session";

export const ownerSession = appSession.use(async ({ context, next }) => {
  if (!isOwnerEmail(context.appUser.user.email)) {
    throw new ORPCError("NOT_FOUND");
  }

  return next({ context: {} });
});
