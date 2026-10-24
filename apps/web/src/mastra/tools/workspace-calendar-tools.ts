import "server-only";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { getWorkspaceCtx } from "../runtime-context";
import * as calendar from "../toolkit/calendar";
import { requireCalendarAccount, withToolErrors } from "../toolkit/resolve";
import {
  createEventFields,
  eventTarget,
  listEventsFields,
  respondEventFields,
  updateEventFields,
} from "../toolkit/schema";

const listCalendarsTool = createTool({
  id: "listCalendars",
  description:
    "List every calendar account connected to this workspace, and the individual calendars inside each one that this workspace is allowed to see. Call this when you need a calendarAccountId or calendarId the conversation has not already given you. Skip it when the user's message carries an inline <@calendar:…> or <@event:…> reference — those ids are already resolved.",
  inputSchema: z.object({}),
  execute: async (_input, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      return calendar.listCalendars(ctx.calendars);
    }),
});

const listEventsTool = createTool({
  id: "listEvents",
  description:
    "List calendar events between two ISO-8601 timestamps across every visible calendar in the workspace, merged and sorted by start time. Narrow with calendarAccountId or calendarIds when you already know them.",
  inputSchema: z.object(listEventsFields),
  execute: async (
    { timeMin, timeMax, calendarAccountId, calendarIds, query, max },
    { requestContext },
  ) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
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

const getEventTool = createTool({
  id: "getEvent",
  description:
    "Fetch one calendar event in full, including description, attendees and their responses. Needs calendarId and eventId from listEvents.",
  inputSchema: z.object(eventTarget),
  execute: async ({ calendarAccountId, calendarId, eventId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireCalendarAccount(ctx.calendars, calendarAccountId);
      if ("error" in r) return r;
      return calendar.getEvent(r.account, calendarId, eventId);
    }),
});

const createEventTool = createTool({
  id: "createEvent",
  description: "Create a calendar event. Times are ISO-8601.",
  inputSchema: z.object({
    ...createEventFields,
    summary: z.string().describe("Short description of the event that will be created"),
  }),
  requireApproval: true,
  execute: async (input, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireCalendarAccount(ctx.calendars, input.calendarAccountId);
      if ("error" in r) return r;
      return calendar.createEvent(r.account, input);
    }),
});

const updateEventTool = createTool({
  id: "updateEvent",
  description:
    "Change fields on an existing calendar event. Only the fields you pass are modified.",
  inputSchema: z.object({
    ...updateEventFields,
    summary: z.string().describe("Short description of what will change"),
  }),
  requireApproval: true,
  execute: async (input, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireCalendarAccount(ctx.calendars, input.calendarAccountId);
      if ("error" in r) return r;
      return calendar.updateEvent(r.account, input.calendarId, input.eventId, input);
    }),
});

const deleteEventTool = createTool({
  id: "deleteEvent",
  description: "Delete a calendar event and notify its attendees.",
  inputSchema: z.object({
    ...eventTarget,
    summary: z.string().describe("Short description of what will be deleted"),
  }),
  requireApproval: true,
  execute: async (input, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireCalendarAccount(ctx.calendars, input.calendarAccountId);
      if ("error" in r) return r;
      return calendar.deleteEvent(r.account, input.calendarId, input.eventId);
    }),
});

const respondToEventTool = createTool({
  id: "respondToEvent",
  description: "Reply to a calendar invitation as the connected account.",
  inputSchema: z.object({
    ...respondEventFields,
    summary: z.string().describe("Which invitation is being answered, and how"),
  }),
  requireApproval: true,
  execute: async (input, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireCalendarAccount(ctx.calendars, input.calendarAccountId);
      if ("error" in r) return r;
      return calendar.respondToEvent(r.account, input.calendarId, input.eventId, input.response);
    }),
});

export const workspaceCalendarTools = {
  listCalendars: listCalendarsTool,
  listEvents: listEventsTool,
  getEvent: getEventTool,
  createEvent: createEventTool,
  updateEvent: updateEventTool,
  deleteEvent: deleteEventTool,
  respondToEvent: respondToEventTool,
};
