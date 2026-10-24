import "server-only";
import { ORPCError } from "@orpc/server";

import { appActor, recordAuditEvent } from "@/audit";
import {
  attachOwnedMailbox,
  detachMailbox,
  getWorkspaceMailboxByLinkId,
  listUnattachedMailboxes,
  listWorkspaceMailboxes,
} from "@/connections";

import { workspaceSession } from "../middlewares/workspace-session";
import {
  attachMailboxInputSchema,
  attachMailboxOutputSchema,
  detachWorkspaceMailboxInputSchema,
  listAttachableOutputSchema,
  listWorkspaceMailboxesOutputSchema,
  successSchema,
  workspaceScopeSchema,
} from "../schema";

export const workspaceMailboxesRouter = {
  list: workspaceSession(workspaceScopeSchema)
    .output(listWorkspaceMailboxesOutputSchema)
    .handler(async ({ context }) => {
      const { appUser } = context;
      const mailboxes = await listWorkspaceMailboxes(appUser.workspaceId);

      return {
        primary: {
          email: appUser.user.email,
          name: appUser.user.name,
          image: appUser.user.image ?? null,
        },
        mailboxes: mailboxes.map((m) => ({
          mailboxId: m.id,
          linkId: m.linkId,
          provider: m.provider,
          email: m.email,
          server: m.server,
          slug: m.slug,
          image: m.image,
          ownedByMe: m.userId === appUser.userId,
          aiEnabled: m.aiEnabled,
          phishingDetectionEnabled: m.phishingDetectionEnabled,
          policy: m.policy,
        })),
        viewerRole: appUser.workspaceRole,
      };
    }),

  attachable: workspaceSession(workspaceScopeSchema)
    .output(listAttachableOutputSchema)
    .handler(async ({ context }) => {
      const { appUser } = context;
      const rows = await listUnattachedMailboxes(appUser.userId, appUser.workspaceId);

      return {
        mailboxes: rows.map((m) => ({
          mailboxId: m.id,
          provider: m.provider,
          email: m.email,
          server: m.server,
          image: m.image,
        })),
      };
    }),

  attach: workspaceSession(attachMailboxInputSchema)
    .output(attachMailboxOutputSchema)
    .handler(async ({ input, context }) => {
      const { appUser } = context;

      const linked = await attachOwnedMailbox({
        userId: appUser.userId,
        workspaceId: appUser.workspaceId,
        mailboxId: input.mailboxId,
      });
      if ("error" in linked) {
        throw new ORPCError(linked.reason === "conflict" ? "CONFLICT" : "NOT_FOUND", {
          message: linked.error,
        });
      }
      return linked;
    }),

  detach: workspaceSession(detachWorkspaceMailboxInputSchema)
    .output(successSchema)
    .handler(async ({ input, context }) => {
      const { appUser } = context;

      const link = await getWorkspaceMailboxByLinkId(input.linkId, appUser.workspaceId);
      if (!link) {
        throw new ORPCError("NOT_FOUND", { message: "Mailbox not found" });
      }

      const isAdmin = appUser.workspaceRole === "owner" || appUser.workspaceRole === "admin";
      if (!isAdmin && link.userId !== appUser.userId) {
        throw new ORPCError("FORBIDDEN", {
          message: "Only an admin can remove someone else's mailbox",
        });
      }

      await detachMailbox({
        linkId: link.linkId,
        workspaceId: appUser.workspaceId,
      });
      await recordAuditEvent(appActor(appUser, context.headers), {
        action: "resource.detached",
        resourceKind: "mailbox",
        workspaceId: appUser.workspaceId,
        targetUserId: link.userId,
        targetLabel: link.email,
      });
      return { success: true as const };
    }),
};
