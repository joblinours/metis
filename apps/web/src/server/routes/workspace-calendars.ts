import "server-only";
import { ORPCError } from "@orpc/server";

import { appActor, recordAuditEvent } from "@/audit";
import { listProviderCalendars } from "@/calendar/available";
import {
  attachOwnedCalendar,
  detachCalendar,
  getWorkspaceCalendarByLinkId,
  listUnattachedCalendars,
  listWorkspaceCalendars,
  setCalendarVisibility,
} from "@/connections";

import { workspaceSession } from "../middlewares/workspace-session";
import {
  attachCalendarInputSchema,
  attachCalendarOutputSchema,
  detachWorkspaceCalendarInputSchema,
  listAttachableCalendarsOutputSchema,
  listProviderCalendarsOutputSchema,
  listWorkspaceCalendarsOutputSchema,
  setCalendarVisibilityInputSchema,
  setCalendarVisibilityOutputSchema,
  successSchema,
  workspaceCalendarLinkInputSchema,
  workspaceScopeSchema,
} from "../schema";

export const workspaceCalendarsRouter = {
  list: workspaceSession(workspaceScopeSchema)
    .output(listWorkspaceCalendarsOutputSchema)
    .handler(async ({ context }) => {
      const { appUser } = context;
      const rows = await listWorkspaceCalendars(appUser.workspaceId);

      return {
        calendars: rows.map((c) => ({
          calendarId: c.id,
          linkId: c.linkId,
          provider: c.provider,
          email: c.email,
          server: c.server,
          slug: c.slug,
          image: c.image,
          ownedByMe: c.userId === appUser.userId,
          visibleCalendarIds: c.visibleCalendarIds,
          aiEnabled: c.aiEnabled,
          policy: c.policy,
        })),
        viewerRole: appUser.workspaceRole,
      };
    }),

  attachable: workspaceSession(workspaceScopeSchema)
    .output(listAttachableCalendarsOutputSchema)
    .handler(async ({ context }) => {
      const { appUser } = context;
      const rows = await listUnattachedCalendars(appUser.userId, appUser.workspaceId);

      return {
        calendars: rows.map((c) => ({
          calendarId: c.id,
          provider: c.provider,
          email: c.email,
          server: c.server,
          image: c.image,
        })),
      };
    }),

  available: workspaceSession(workspaceCalendarLinkInputSchema)
    .output(listProviderCalendarsOutputSchema)
    .handler(async ({ input, context }) => {
      const { appUser } = context;

      const link = await getWorkspaceCalendarByLinkId(input.linkId, appUser.workspaceId);
      if (!link) {
        throw new ORPCError("NOT_FOUND", { message: "Calendar not found" });
      }

      try {
        return { calendars: await listProviderCalendars(link) };
      } catch (err) {
        throw new ORPCError("BAD_GATEWAY", { cause: err });
      }
    }),

  attach: workspaceSession(attachCalendarInputSchema)
    .output(attachCalendarOutputSchema)
    .handler(async ({ input, context }) => {
      const { appUser } = context;

      const linked = await attachOwnedCalendar({
        userId: appUser.userId,
        workspaceId: appUser.workspaceId,
        calendarId: input.calendarId,
      });
      if ("error" in linked) {
        throw new ORPCError(linked.reason === "conflict" ? "CONFLICT" : "NOT_FOUND", {
          message: linked.error,
        });
      }
      return linked;
    }),

  detach: workspaceSession(detachWorkspaceCalendarInputSchema)
    .output(successSchema)
    .handler(async ({ input, context }) => {
      const { appUser } = context;

      const link = await getWorkspaceCalendarByLinkId(input.linkId, appUser.workspaceId);
      if (!link) {
        throw new ORPCError("NOT_FOUND", { message: "Calendar not found" });
      }

      const isAdmin = appUser.workspaceRole === "owner" || appUser.workspaceRole === "admin";
      if (!isAdmin && link.userId !== appUser.userId) {
        throw new ORPCError("FORBIDDEN", {
          message: "Only an admin can remove someone else's calendar",
        });
      }

      await detachCalendar({
        linkId: link.linkId,
        workspaceId: appUser.workspaceId,
      });
      await recordAuditEvent(appActor(appUser, context.headers), {
        action: "resource.detached",
        resourceKind: "calendar",
        workspaceId: appUser.workspaceId,
        targetUserId: link.userId,
        targetLabel: link.email,
      });
      return { success: true as const };
    }),

  setVisibility: workspaceSession(setCalendarVisibilityInputSchema)
    .output(setCalendarVisibilityOutputSchema)
    .handler(async ({ input, context }) => {
      const { appUser } = context;

      const link = await getWorkspaceCalendarByLinkId(input.linkId, appUser.workspaceId);
      if (!link) {
        throw new ORPCError("NOT_FOUND", { message: "Calendar not found" });
      }

      const isAdmin = appUser.workspaceRole === "owner" || appUser.workspaceRole === "admin";
      if (!isAdmin && link.userId !== appUser.userId) {
        throw new ORPCError("FORBIDDEN", {
          message: "Only an admin can change what someone else's account shows",
        });
      }

      await setCalendarVisibility({
        linkId: link.linkId,
        workspaceId: appUser.workspaceId,
        visibleCalendarIds: input.visibleCalendarIds,
      });

      return {
        linkId: link.linkId,
        visibleCalendarIds: input.visibleCalendarIds,
      };
    }),
};
