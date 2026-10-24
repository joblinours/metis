import "server-only";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { getCalendarCtx } from "../runtime-context";
import * as calendar from "../toolkit/calendar";
import { requireCalendarAccount, withToolErrors } from "../toolkit/resolve";
import {
  createEventFields,
  eventTarget,
  respondEventFields,
  updateEventFields,
} from "../toolkit/schema";

const listPanelCalendarsTool = createTool({
  id: "listCalendars",
  description:
    "List the individual calendars this view can see, with their calendarId and owning account. Call this before anything that needs a calendarId.",
  inputSchema: z.object({}),
  execute: async (_input, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getCalendarCtx(requestContext);
      const { accountCount: _accountCount, ...rest } = await calendar.listCalendars(ctx.accounts);
      return {
        scope: ctx.isAggregate
          ? "every calendar account in this workspace"
          : ctx.accounts[0]?.accountEmail,
        ...rest,
      };
    }),
});

const listPanelEventsTool = createTool({
  id: "listEvents",
  description:
    "List events between two ISO-8601 timestamps in this calendar view, merged and sorted by start time.",
  inputSchema: z.object({
    timeMin: z.string().describe("ISO-8601 start of the window"),
    timeMax: z.string().describe("ISO-8601 end of the window"),
    calendarIds: z.array(z.string()).optional(),
    query: z.string().optional(),
    max: z.number().int().min(1).max(250).optional(),
  }),
  execute: async (input, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getCalendarCtx(requestContext);
      return calendar.listEvents(ctx.accounts, input);
    }),
});

const getPanelEventTool = createTool({
  id: "getEvent",
  description: "Read one event in full, including description and attendee responses.",
  inputSchema: z.object(eventTarget),
  execute: async ({ calendarAccountId, calendarId, eventId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getCalendarCtx(requestContext);
      const r = requireCalendarAccount(ctx.accounts, calendarAccountId);
      if ("error" in r) return r;
      return calendar.getEvent(r.account, calendarId, eventId);
    }),
});

const createPanelEventTool = createTool({
  id: "createEvent",
  description: "Create an event on a calendar in this view. Times are ISO-8601.",
  inputSchema: z.object({
    ...createEventFields,
    summary: z.string().describe("Short description of what will be created"),
  }),
  requireApproval: true,
  execute: async (input, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getCalendarCtx(requestContext);
      const r = requireCalendarAccount(ctx.accounts, input.calendarAccountId);
      if ("error" in r) return r;
      return calendar.createEvent(r.account, input);
    }),
});

const updatePanelEventTool = createTool({
  id: "updateEvent",
  description: "Change fields on an event in this view. Only the fields you pass change.",
  inputSchema: z.object({
    ...updateEventFields,
    summary: z.string().describe("Short description of what will change"),
  }),
  requireApproval: true,
  execute: async (input, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getCalendarCtx(requestContext);
      const r = requireCalendarAccount(ctx.accounts, input.calendarAccountId);
      if ("error" in r) return r;
      return calendar.updateEvent(r.account, input.calendarId, input.eventId, input);
    }),
});

const deletePanelEventTool = createTool({
  id: "deleteEvent",
  description: "Delete an event in this view and notify its attendees.",
  inputSchema: z.object({
    ...eventTarget,
    summary: z.string().describe("Short description of what will be deleted"),
  }),
  requireApproval: true,
  execute: async (input, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getCalendarCtx(requestContext);
      const r = requireCalendarAccount(ctx.accounts, input.calendarAccountId);
      if ("error" in r) return r;
      return calendar.deleteEvent(r.account, input.calendarId, input.eventId);
    }),
});

const respondPanelEventTool = createTool({
  id: "respondToEvent",
  description: "Answer an invitation as the connected account.",
  inputSchema: z.object({
    ...respondEventFields,
    summary: z.string().describe("Which invitation is answered, and how"),
  }),
  requireApproval: true,
  execute: async (input, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getCalendarCtx(requestContext);
      const r = requireCalendarAccount(ctx.accounts, input.calendarAccountId);
      if ("error" in r) return r;
      return calendar.respondToEvent(r.account, input.calendarId, input.eventId, input.response);
    }),
});

export const calendarTools = {
  listCalendars: listPanelCalendarsTool,
  listEvents: listPanelEventsTool,
  getEvent: getPanelEventTool,
  createEvent: createPanelEventTool,
  updateEvent: updatePanelEventTool,
  deleteEvent: deletePanelEventTool,
  respondToEvent: respondPanelEventTool,
};
