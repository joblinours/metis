import type { Auth } from "@/auth/server";
import { getAppUser, isWorkspaceUser, type WorkspaceUserSession } from "@/auth/session";
import type { ConnectionAuth } from "@/connections";
import {
  getWorkspaceMailboxBySlug,
  listWorkspaceMailboxes,
  resolveConnectionAuth,
  type WorkspaceMailboxRow,
} from "@/connections";
import { BadRequestError } from "@/lib/errors/bad-request";
import type { DraftPayload } from "@/types/mail";
import type { WorkspaceRole } from "@/types/workspace";
import { ALL_MAILBOXES_SLUG } from "@/workspace/path";
import type { ResolvedPolicy } from "@/workspace/policy";

import type { MailAdapter } from "./adapter";
import {
  adapterForMailbox,
  getAggregateAdapter,
  type ResolvedMailbox,
  resolveScopedMessage,
  type ScopedMessage,
} from "./aggregate";

export interface MailSession {
  userId: string;
  user: Auth["$Infer"]["Session"]["user"];
  mailboxSlug: string;
  isAggregate: boolean;
  adapter: MailAdapter;
  mailboxes: ResolvedMailbox[];
  workspaceId: string;
  workspaceSlug: string;
  workspaceRole: WorkspaceRole;
}

export type MailScope = Pick<
  MailSession,
  "userId" | "workspaceId" | "workspaceRole" | "adapter" | "mailboxes" | "isAggregate"
>;

type MessageScope = Pick<MailSession, "mailboxes" | "isAggregate">;

export function scopeMessage(mail: MessageScope, id: string): ScopedMessage {
  return resolveScopedMessage(mail.mailboxes, id, mail.isAggregate);
}

export function mailboxIds(mail: Pick<MailSession, "mailboxes">): string[] {
  return mail.mailboxes.map((m) => m.mailboxId);
}

export function policyForMailbox(
  mail: Pick<MailSession, "mailboxes">,
  mailboxId: string,
): ResolvedPolicy {
  const found = mail.mailboxes.find((m) => m.mailboxId === mailboxId);
  return found?.policy ?? { ai: false, phishingDetection: false };
}

export function forSender(
  mail: MessageScope,
  from: ResolvedMailbox,
  payload: DraftPayload,
): DraftPayload {
  const { replyToMessageId, ...rest } = payload;
  if (!replyToMessageId) return payload;
  try {
    const target = scopeMessage(mail, replyToMessageId);
    if (target.mailboxId === from.mailboxId) {
      return { ...rest, replyToMessageId: target.messageId };
    }
  } catch {}
  return rest;
}

export async function sendingMailbox(
  mail: Pick<MailSession, "workspaceId" | "mailboxes">,
  fromMailboxSlug?: string,
): Promise<ResolvedMailbox> {
  if (!fromMailboxSlug) {
    const only = mail.mailboxes.length === 1 ? mail.mailboxes[0] : null;
    if (!only) throw new BadRequestError("Pick which mailbox to send from");
    return only;
  }

  const inSession = mail.mailboxes.find((m) => m.mailboxSlug === fromMailboxSlug);
  if (inSession) return inSession;

  const found = await getWorkspaceMailboxBySlug(fromMailboxSlug, mail.workspaceId);
  if (!found) throw new Error("Unknown mailbox");

  const resolved = await toResolved(found);
  if (!resolved) throw new Error("Could not authenticate that mailbox");
  return resolved;
}

async function toResolved(found: WorkspaceMailboxRow): Promise<ResolvedMailbox | null> {
  const auth = await resolveConnectionAuth(found);
  if (!auth) return null;
  return {
    mailboxId: found.id,
    linkId: found.linkId,
    mailboxSlug: found.slug,
    mailboxEmail: found.email,
    provider: found.provider,
    policy: found.policy,
    grantScope: found.scope,
    auth: async () => auth,
  };
}

function lazyResolved(found: WorkspaceMailboxRow): ResolvedMailbox {
  let pending: Promise<ConnectionAuth> | null = null;
  return {
    mailboxId: found.id,
    linkId: found.linkId,
    mailboxSlug: found.slug,
    mailboxEmail: found.email,
    provider: found.provider,
    policy: found.policy,
    grantScope: found.scope,
    auth: () => {
      pending ??= resolveConnectionAuth(found).then((resolved) => {
        if (!resolved) {
          pending = null;
          throw new Error(`Could not authenticate ${found.email}`);
        }
        return resolved;
      });
      return pending;
    },
  };
}

export async function mailSessionFor(
  appUser: WorkspaceUserSession,
  mailboxSlug: string,
): Promise<MailSession | null> {
  const base = {
    userId: appUser.userId,
    user: appUser.user,
    workspaceId: appUser.workspaceId,
    workspaceSlug: appUser.workspaceSlug,
    workspaceRole: appUser.workspaceRole,
  };

  if (mailboxSlug === ALL_MAILBOXES_SLUG) {
    const found = await listWorkspaceMailboxes(appUser.workspaceId);
    const mailboxes = found.map(lazyResolved);
    if (mailboxes.length === 0) return null;
    return {
      ...base,
      mailboxSlug: ALL_MAILBOXES_SLUG,
      isAggregate: true,
      adapter: getAggregateAdapter(mailboxes),
      mailboxes,
    };
  }

  const found = await getWorkspaceMailboxBySlug(mailboxSlug, appUser.workspaceId);
  if (!found) return null;

  const resolved = await toResolved(found);
  if (!resolved) return null;

  return {
    ...base,
    mailboxSlug: found.slug,
    isAggregate: false,
    adapter: await adapterForMailbox(resolved),
    mailboxes: [resolved],
  };
}

export async function getMailSession(
  headers: Headers,
  workspaceSlug: string,
  mailboxSlug: string,
): Promise<MailSession | null> {
  const appUser = await getAppUser(headers, workspaceSlug);
  if (!isWorkspaceUser(appUser)) return null;
  return mailSessionFor(appUser, mailboxSlug);
}

export async function firstMailboxSlug(workspaceId: string): Promise<string | null> {
  const all = await listWorkspaceMailboxes(workspaceId);
  return all[0]?.slug ?? null;
}
