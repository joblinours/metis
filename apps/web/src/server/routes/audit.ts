import "server-only";
import { ORPCError } from "@orpc/server";

import { listUserAuditEvents, listWorkspaceAuditEvents } from "@/audit";
import { isAdmin } from "@/workspace";

import { appSession } from "../middlewares/app-session";
import { workspaceSession } from "../middlewares/workspace-session";
import { auditEventPageSchema, auditPageInputSchema, workspaceAuditInputSchema } from "../schema";

export const auditRouter = {
  mine: appSession
    .input(auditPageInputSchema)
    .output(auditEventPageSchema)
    .handler(async ({ input, context }) => listUserAuditEvents(context.appUser.userId, input)),

  workspace: workspaceSession(workspaceAuditInputSchema)
    .output(auditEventPageSchema)
    .handler(async ({ input, context }) => {
      if (!isAdmin(context.appUser.workspaceRole)) {
        throw new ORPCError("FORBIDDEN", {
          message: "Only workspace owners and admins can see activity",
        });
      }
      return listWorkspaceAuditEvents(context.appUser.workspaceId, input);
    }),
};
