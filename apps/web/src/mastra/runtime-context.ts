import "server-only";
import { RequestContext } from "@mastra/core/request-context";

import type { ReferenceScope } from "@/ai/reference-directory";
import type { ReferenceType } from "@/ai/references";
import type { ResolvedCalendar } from "@/calendar/aggregate";
import { type CalendarSession, workspaceCalendarAccounts } from "@/calendar/session";
import {
  listWorkspaceMailboxes,
  resolveConnectionAuth,
  type WorkspaceMailboxRow,
} from "@/connections";
import type { MailProvider } from "@/connections/types";
import { aggregateDriveSurface, type DriveSurface, type ResolvedDrive } from "@/drive/aggregate";
import { type DriveSession, workspaceDrives } from "@/drive/session";
import { getMailAdapter, type MailAdapter } from "@/mail/adapter";
import {
  getAggregateAdapter,
  type ResolvedMailbox,
  resolveScopedMessage,
  type ScopedMessage,
  scopedForMailbox,
} from "@/mail/aggregate";
import type { MailScope, MailSession } from "@/mail/session";
import type { WorkspaceRole } from "@/types/workspace";
import { getWorkspacePolicy, listWorkspaceMembers } from "@/workspace";
import { aiEnabled, workspaceAllowsAi } from "@/workspace/policy";

const MAILBOX_CTX = "mailboxCtx";
const CALENDAR_CTX = "calendarCtx";
const DRIVE_CTX = "driveCtx";
const WORKSPACE_CTX = "workspaceCtx";

class MailboxCtxSlot {
  readonly ctx: MailboxCtx;
  constructor(ctx: MailboxCtx) {
    this.ctx = ctx;
  }
}

class CalendarCtxSlot {
  readonly ctx: CalendarCtx;
  constructor(ctx: CalendarCtx) {
    this.ctx = ctx;
  }
}

class DriveCtxSlot {
  readonly ctx: DriveCtx;
  constructor(ctx: DriveCtx) {
    this.ctx = ctx;
  }
}

class WorkspaceCtxSlot {
  readonly ctx: WorkspaceCtx;
  constructor(ctx: WorkspaceCtx) {
    this.ctx = ctx;
  }
}

export interface MailboxCtx {
  userId: string;
  workspaceId: string;
  mailboxId: string;
  linkId: string;
  provider: MailProvider;
  email: string;
  adapter: MailAdapter;
  scope: (id: string) => ScopedMessage;
  mailboxes: ResolvedMailbox[];
  isAggregate: boolean;
  headers: Headers;
}

export interface AgentMailbox {
  mailboxId: string;
  linkId: string;
  provider: MailProvider;
  email: string;
  adapter: MailAdapter;
  scope: (id: string) => ScopedMessage;
  mailboxes: ResolvedMailbox[];
  isAggregate: boolean;
}

export interface CalendarCtx {
  userId: string;
  workspaceId: string;
  workspaceRole: WorkspaceRole;
  calendarSlug: string;
  isAggregate: boolean;
  accounts: ResolvedCalendar[];
  headers: Headers;
}

function buildCalendarCtx(session: CalendarSession, headers: Headers): CalendarCtx | null {
  const accounts = session.accounts.filter(aiEnabled);
  if (accounts.length === 0) return null;

  return {
    userId: session.userId,
    workspaceId: session.workspaceId,
    workspaceRole: session.workspaceRole,
    calendarSlug: session.calendarSlug,
    isAggregate: session.isAggregate,
    accounts,
    headers,
  };
}

export function calendarRequestContext(
  session: CalendarSession,
  headers: Headers,
): RequestContext | null {
  const ctx = buildCalendarCtx(session, headers);
  if (!ctx) return null;
  const rc = new RequestContext();
  rc.set(CALENDAR_CTX, new CalendarCtxSlot(ctx));
  return rc;
}

export function getCalendarCtx(rc: RequestContext | undefined): CalendarCtx {
  const slot = rc?.get(CALENDAR_CTX);
  if (!(slot instanceof CalendarCtxSlot)) {
    throw new Error("calendar context missing from request context");
  }
  return slot.ctx;
}

export interface DriveCtx {
  userId: string;
  workspaceId: string;
  workspaceRole: WorkspaceRole;
  driveSlug: string;
  isAggregate: boolean;
  drives: ResolvedDrive[];
  surface: DriveSurface;
  headers: Headers;
}

function buildDriveCtx(session: DriveSession, headers: Headers): DriveCtx | null {
  const drives = session.drives.filter(aiEnabled);
  if (drives.length === 0) return null;

  return {
    userId: session.userId,
    workspaceId: session.workspaceId,
    workspaceRole: session.workspaceRole,
    driveSlug: session.driveSlug,
    isAggregate: session.isAggregate,
    drives,
    surface: session.isAggregate ? aggregateDriveSurface(drives) : session.surface,
    headers,
  };
}

export function driveRequestContext(
  session: DriveSession,
  headers: Headers,
): RequestContext | null {
  const ctx = buildDriveCtx(session, headers);
  if (!ctx) return null;
  const rc = new RequestContext();
  rc.set(DRIVE_CTX, new DriveCtxSlot(ctx));
  return rc;
}

export function getDriveCtx(rc: RequestContext | undefined): DriveCtx {
  const slot = rc?.get(DRIVE_CTX);
  if (!(slot instanceof DriveCtxSlot)) {
    throw new Error("drive context missing from request context");
  }
  return slot.ctx;
}

export type WorkspaceMember = Awaited<ReturnType<typeof listWorkspaceMembers>>[number];

function workspaceMembersLoader(workspaceId: string): () => Promise<WorkspaceMember[]> {
  let rows: Promise<WorkspaceMember[]> | null = null;
  return () => {
    rows ??= listWorkspaceMembers(workspaceId);
    return rows;
  };
}

export type AgentActor = { kind: "session"; headers: Headers } | { kind: "mcp"; clientId: string };

export interface WorkspaceCtx {
  userId: string;
  workspaceId: string;
  workspaceRole: WorkspaceRole;
  mailboxes: AgentMailbox[];
  calendars: ResolvedCalendar[];
  drives: ResolvedDrive[];
  members: () => Promise<WorkspaceMember[]>;
  actor: AgentActor;
}

export function mailScopeFor(ctx: WorkspaceCtx, mailbox: AgentMailbox): MailScope {
  return {
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
    workspaceRole: ctx.workspaceRole,
    adapter: mailbox.adapter,
    mailboxes: mailbox.mailboxes,
    isAggregate: mailbox.isAggregate,
  };
}

export function actorHeaders(ctx: WorkspaceCtx): Headers | undefined {
  return ctx.actor.kind === "session" ? ctx.actor.headers : undefined;
}

function buildMailboxCtx(session: MailSession, headers: Headers): MailboxCtx | null {
  const allowed = session.mailboxes.filter(aiEnabled);
  const primary = allowed[0];
  if (!primary) return null;
  const adapter = session.isAggregate ? getAggregateAdapter(allowed) : session.adapter;

  return {
    userId: session.userId,
    workspaceId: session.workspaceId,
    mailboxId: primary.mailboxId,
    linkId: primary.linkId,
    provider: primary.provider,
    email: session.isAggregate ? "all mailboxes" : primary.mailboxEmail,
    adapter,
    scope: (id: string) => resolveScopedMessage(allowed, id, session.isAggregate),
    mailboxes: allowed,
    isAggregate: session.isAggregate,
    headers,
  };
}

export function mailboxRequestContext(
  session: MailSession,
  headers: Headers,
): RequestContext | null {
  const ctx = buildMailboxCtx(session, headers);
  if (!ctx) return null;
  const rc = new RequestContext();
  rc.set(MAILBOX_CTX, new MailboxCtxSlot(ctx));
  return rc;
}

export function getMailboxCtx(rc: RequestContext | undefined): MailboxCtx {
  const slot = rc?.get(MAILBOX_CTX);
  if (!(slot instanceof MailboxCtxSlot)) {
    throw new Error("mailbox context missing from request context");
  }
  return slot.ctx;
}

export async function toAgentMailbox(stored: WorkspaceMailboxRow): Promise<AgentMailbox | null> {
  const auth = await resolveConnectionAuth(stored);
  if (!auth) return null;
  const provider = stored.provider;
  const resolved: ResolvedMailbox = {
    mailboxId: stored.id,
    linkId: stored.linkId,
    mailboxSlug: stored.slug,
    mailboxEmail: stored.email,
    provider,
    policy: stored.policy,
    auth: async () => auth,
  };
  return {
    mailboxId: stored.id,
    linkId: stored.linkId,
    provider,
    email: stored.email,
    adapter: getMailAdapter(provider, auth, stored.id),
    scope: (id: string) => scopedForMailbox(resolved, id),
    mailboxes: [resolved],
    isAggregate: false,
  };
}

export async function resolveWorkspaceScope(
  session: {
    userId: string;
    workspaceId: string;
    workspaceRole: WorkspaceRole;
  },
  actor: AgentActor,
): Promise<WorkspaceCtx | null> {
  const policy = await getWorkspacePolicy(session.workspaceId);
  if (!policy) {
    throw new Error(`Workspace ${session.workspaceId} no longer exists`);
  }
  if (!workspaceAllowsAi(policy)) return null;

  const [stored, calendars, drives] = await Promise.all([
    listWorkspaceMailboxes(session.workspaceId),
    workspaceCalendarAccounts(session.workspaceId),
    workspaceDrives(session.userId, session.workspaceId),
  ]);
  const resolved = await Promise.all(stored.filter(aiEnabled).map(toAgentMailbox));
  const mailboxes = resolved.filter((m): m is AgentMailbox => m !== null);
  return {
    userId: session.userId,
    workspaceId: session.workspaceId,
    workspaceRole: session.workspaceRole,
    mailboxes,
    calendars: calendars.filter(aiEnabled),
    drives: drives.filter(aiEnabled),
    members: workspaceMembersLoader(session.workspaceId),
    actor,
  };
}

export async function workspaceRequestContext(
  session: {
    userId: string;
    workspaceId: string;
    workspaceRole: WorkspaceRole;
  },
  headers: Headers,
): Promise<RequestContext | null> {
  const ctx = await resolveWorkspaceScope(session, {
    kind: "session",
    headers,
  });
  if (!ctx) return null;
  const rc = new RequestContext();
  rc.set(WORKSPACE_CTX, new WorkspaceCtxSlot(ctx));
  return rc;
}

export function getWorkspaceCtx(rc: RequestContext | undefined): WorkspaceCtx {
  const slot = rc?.get(WORKSPACE_CTX);
  if (!(slot instanceof WorkspaceCtxSlot)) {
    throw new Error("workspace context missing from request context");
  }
  return slot.ctx;
}

export function workspaceCtxReferenceScope(
  ctx: WorkspaceCtx,
  types: readonly ReferenceType[],
): ReferenceScope {
  return {
    workspaceId: ctx.workspaceId,
    types,
    mailboxes: ctx.mailboxes.map((m) => ({
      mailboxId: m.mailboxId,
      email: m.email,
      provider: m.provider,
      adapter: async () => m.adapter,
    })),
    calendars: ctx.calendars,
    drives: ctx.drives,
  };
}

export function mailboxById(ctx: WorkspaceCtx, mailboxId: string) {
  return ctx.mailboxes.find((m) => m.mailboxId === mailboxId) ?? null;
}

export function calendarById(ctx: WorkspaceCtx, accountId: string) {
  return ctx.calendars.find((c) => c.accountId === accountId) ?? null;
}

export function driveById(ctx: WorkspaceCtx, driveId: string) {
  return ctx.drives.find((d) => d.driveId === driveId) ?? null;
}
