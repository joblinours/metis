import "server-only";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import * as member from "@/mastra/toolkit/member";
import { requireMember, withToolErrors } from "@/mastra/toolkit/resolve";
import { memberEventFields, memberFileFields, memberMailFields } from "@/mastra/toolkit/schema";

import { mcpScopeFromCall } from "../context";
import { inWorkspace, workspaceTarget } from "../schema";

export const listWorkspaceMembers = createTool({
  id: "listWorkspaceMembers",
  description:
    "List the people in one Metis Suite workspace with their memberId, name, email address, and role.",
  inputSchema: z.object(workspaceTarget),
  execute: async ({ workspaceId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      return member.listMembers(ctx);
    }),
});

export const findMemberMail = createTool({
  id: "findMemberMail",
  description:
    "Find mail exchanged with one workspace member across every mailbox connected to that workspace. Get memberIds from listWorkspaceMembers.",
  inputSchema: inWorkspace(memberMailFields),
  execute: async ({ workspaceId, memberId, direction, limit }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      const r = await requireMember(ctx, memberId);
      if ("error" in r) return r;
      return member.findMemberMail(ctx, r.member, { direction, limit });
    }),
});

export const findMemberEvents = createTool({
  id: "findMemberEvents",
  description:
    "List calendar events in a time window that one workspace member organises or is invited to, across every calendar that workspace can see. Use to answer availability questions. Get memberIds from listWorkspaceMembers.",
  inputSchema: inWorkspace(memberEventFields),
  execute: async ({ workspaceId, memberId, timeMin, timeMax, max }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      const r = await requireMember(ctx, memberId);
      if ("error" in r) return r;
      return member.findMemberEvents(ctx, r.member, { timeMin, timeMax, max });
    }),
});

export const findMemberFiles = createTool({
  id: "findMemberFiles",
  description:
    "List the drives one workspace member connected and shares with that workspace, and optionally search inside them by name or content. It does not find files the member edited in other people's drives. Get memberIds from listWorkspaceMembers.",
  inputSchema: inWorkspace(memberFileFields),
  execute: async ({ workspaceId, memberId, query, limit }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      const r = await requireMember(ctx, memberId);
      if ("error" in r) return r;
      return member.findMemberFiles(ctx, r.member, { query, limit });
    }),
});
