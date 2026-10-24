import "server-only";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import * as calendar from "@/mastra/toolkit/calendar";
import { requireCalendarAccount, withToolErrors } from "@/mastra/toolkit/resolve";
import {
  createEventFields,
  eventTarget,
  listEventsFields,
  respondEventFields,
  updateEventFields,
} from "@/mastra/toolkit/schema";

import { mcpScopeFromCall } from "../context";
import { inWorkspace, workspaceTarget } from "../schema";

export const listCalendars = createTool({
  id: "listCalendars",
  description:
    "List the calendar accounts connected to one Metis Suite workspace and the individual calendars inside each that the workspace is allowed to see. Call this first to learn which calendarAccountId and calendarId values exist in that workspace.",
  inputSchema: z.object(workspaceTarget),
  execute: async ({ workspaceId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      return calendar.listCalendars(ctx.calendars);
    }),
});

export const listEvents = createTool({
  id: "listEvents",
  description:
    "List calendar events between two ISO-8601 timestamps across every calendar the workspace can see, merged and sorted by start time.",
  inputSchema: inWorkspace(listEventsFields),
  execute: async (
    { workspaceId, timeMin, timeMax, calendarAccountId, calendarIds, query, max },
    { requestContext },
  ) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      const accounts = calendarAccountId
        ? ctx.calendars.filter((c) => c.accountId === calendarAccountId)
        : ctx.calendars;
      if (accounts.length === 0) {
        return { error: "No calendar account matches that id" };
      }
      return calendar.listEvents(accounts, {
        timeMin,
        timeMax,
        calendarIds,
        query,
        max,
      });
    }),
});

export const getEvent = createTool({
  id: "getEvent",
  description:
    "Fetch one calendar event in full, including its description and attendee responses.",
  inputSchema: inWorkspace(eventTarget),
  execute: async ({ workspaceId, calendarAccountId, calendarId, eventId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      const r = requireCalendarAccount(ctx.calendars, calendarAccountId);
      if ("error" in r) return r;
      return calendar.getEvent(r.account, calendarId, eventId);
    }),
});

export const createEvent = createTool({
  id: "createEvent",
  description:
    "Create a calendar event. Times are ISO-8601. This writes to the user's real calendar and notifies attendees.",
  inputSchema: inWorkspace(createEventFields),
  execute: async (input, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, input.workspaceId);
      const r = requireCalendarAccount(ctx.calendars, input.calendarAccountId);
      if ("error" in r) return r;
      return calendar.createEvent(r.account, input);
    }),
});

export const updateEvent = createTool({
  id: "updateEvent",
  description:
    "Change fields on an existing calendar event. Only the fields you pass are modified.",
  inputSchema: inWorkspace(updateEventFields),
  execute: async (input, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, input.workspaceId);
      const r = requireCalendarAccount(ctx.calendars, input.calendarAccountId);
      if ("error" in r) return r;
      return calendar.updateEvent(r.account, input.calendarId, input.eventId, input);
    }),
});

export const deleteEvent = createTool({
  id: "deleteEvent",
  description: "Delete a calendar event and notify its attendees.",
  inputSchema: inWorkspace(eventTarget),
  execute: async (input, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, input.workspaceId);
      const r = requireCalendarAccount(ctx.calendars, input.calendarAccountId);
      if ("error" in r) return r;
      return calendar.deleteEvent(r.account, input.calendarId, input.eventId);
    }),
});

export const respondToEvent = createTool({
  id: "respondToEvent",
  description:
    "Reply to a calendar invitation as the connected account (accept, decline, or tentative).",
  inputSchema: inWorkspace(respondEventFields),
  execute: async (input, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, input.workspaceId);
      const r = requireCalendarAccount(ctx.calendars, input.calendarAccountId);
      if ("error" in r) return r;
      return calendar.respondToEvent(r.account, input.calendarId, input.eventId, input.response);
    }),
});
