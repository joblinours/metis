import "server-only";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { getWorkspaceCtx } from "../runtime-context";
import * as member from "../toolkit/member";
import { requireMember, withToolErrors } from "../toolkit/resolve";
import { memberEventFields, memberFileFields, memberMailFields } from "../toolkit/schema";

const listWorkspaceMembersTool = createTool({
  id: "listWorkspaceMembers",
  description:
    "List the people in this workspace with their memberId, name, email address, and role. Use when the user names a colleague without an inline <@member:id> reference.",
  inputSchema: z.object({}),
  execute: async (_input, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      return member.listMembers(ctx);
    }),
});

const findMemberMailTool = createTool({
  id: "findMemberMail",
  description:
    "Find mail exchanged with one workspace member across every connected mailbox. Takes the memberId from an inline <@member:id> reference or from listWorkspaceMembers, resolves it to that person's email address, and searches for it.",
  inputSchema: z.object(memberMailFields),
  execute: async ({ memberId, direction, limit }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = await requireMember(ctx, memberId);
      if ("error" in r) return r;
      return member.findMemberMail(ctx, r.member, { direction, limit });
    }),
});

const findMemberEventsTool = createTool({
  id: "findMemberEvents",
  description:
    "List calendar events in a time window that one workspace member organises or is invited to, across every visible calendar in the workspace. Use to answer availability questions about a colleague. Takes the memberId from an inline <@member:id> reference or from listWorkspaceMembers.",
  inputSchema: z.object(memberEventFields),
  execute: async ({ memberId, timeMin, timeMax, max }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = await requireMember(ctx, memberId);
      if ("error" in r) return r;
      return member.findMemberEvents(ctx, r.member, { timeMin, timeMax, max });
    }),
});

const findMemberFilesTool = createTool({
  id: "findMemberFiles",
  description:
    "List the drives one workspace member connected and shares with this workspace, and optionally search inside them by name or content. It does not find files the member edited in other people's drives. Takes the memberId from an inline <@member:id> reference or from listWorkspaceMembers.",
  inputSchema: z.object(memberFileFields),
  execute: async ({ memberId, query, limit }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = await requireMember(ctx, memberId);
      if ("error" in r) return r;
      return member.findMemberFiles(ctx, r.member, { query, limit });
    }),
});

export const workspaceMemberTools = {
  listWorkspaceMembers: listWorkspaceMembersTool,
  findMemberMail: findMemberMailTool,
  findMemberEvents: findMemberEventsTool,
  findMemberFiles: findMemberFilesTool,
};
