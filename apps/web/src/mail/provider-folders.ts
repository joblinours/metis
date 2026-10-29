import "server-only";
import { hasScope } from "@/connections/connection-store";
import type { MailProvider } from "@/connections/types";
import { BadRequestError } from "@/lib/errors/bad-request";
import { sanitizeError } from "@/lib/errors/sanitize-error";
import type { MessagesResponse, ProviderFolder, ProviderTag } from "@/types/mail";

import {
  adapterForMailbox,
  compositeId,
  type ResolvedMailbox,
  resolveScopedMessage,
  tagEmail,
} from "./aggregate";
import { type MailScope, scopeMessage } from "./session";

export type FolderScope = Pick<MailScope, "mailboxes" | "isAggregate">;

export interface MailboxFolders {
  mailboxId: string;
  mailboxSlug: string;
  mailboxEmail: string;
  provider: MailProvider;
  supportsFolders: boolean;
  supportsTags: boolean;
  tagsNeedReconnect: boolean;
  folders: ProviderFolder[];
  tags: ProviderTag[];
  error?: string;
}

const TAG_SCOPES: Partial<Record<MailProvider, string>> = {
  zoho: "ZohoMail.tags.ALL",
  microsoft: "MailboxSettings.ReadWrite",
};

const FOLDER_PAGE_SIZE = 50;

function tagsGranted(mailbox: ResolvedMailbox): boolean {
  const wanted = TAG_SCOPES[mailbox.provider];
  return !wanted || hasScope(mailbox.grantScope, wanted);
}

function outRef(scope: FolderScope, mailboxId: string, ref: string): string {
  return scope.isAggregate ? compositeId(mailboxId, ref) : ref;
}

function resolveRef(scope: FolderScope, ref: string): { mailbox: ResolvedMailbox; ref: string } {
  let target;
  try {
    target = resolveScopedMessage(scope.mailboxes, ref, scope.isAggregate);
  } catch (err) {
    throw new BadRequestError(err instanceof Error ? err.message : "Unknown folder");
  }
  const mailbox = scope.mailboxes.find((m) => m.mailboxId === target.mailboxId);
  if (!mailbox) throw new BadRequestError("That folder belongs to a mailbox you cannot reach");
  return { mailbox, ref: target.messageId };
}

function pickMailbox(scope: FolderScope, mailboxId?: string): ResolvedMailbox {
  if (mailboxId) {
    const found = scope.mailboxes.find((m) => m.mailboxId === mailboxId);
    if (found) return found;
  } else if (scope.mailboxes.length === 1 && scope.mailboxes[0]) {
    return scope.mailboxes[0];
  }
  const choices = scope.mailboxes.map((m) => `${m.mailboxId} (${m.mailboxEmail})`).join(", ");
  throw new BadRequestError(`Pick which mailbox to create it in: ${choices}`);
}

function withFolderRefs(scope: FolderScope, mailboxId: string, folder: ProviderFolder) {
  return {
    ...folder,
    ref: outRef(scope, mailboxId, folder.ref),
    ...(folder.parentRef ? { parentRef: outRef(scope, mailboxId, folder.parentRef) } : {}),
  };
}

function withTagRef(scope: FolderScope, mailboxId: string, tag: ProviderTag): ProviderTag {
  return { ...tag, ref: outRef(scope, mailboxId, tag.ref) };
}

function reconnectMessage(mailbox: ResolvedMailbox): string {
  return `Labels need new permissions on ${mailbox.mailboxEmail}: reconnect this account to use them.`;
}

export async function listMailboxFolders(scope: FolderScope): Promise<MailboxFolders[]> {
  return Promise.all(
    scope.mailboxes.map(async (mailbox): Promise<MailboxFolders> => {
      const base = {
        mailboxId: mailbox.mailboxId,
        mailboxSlug: mailbox.mailboxSlug,
        mailboxEmail: mailbox.mailboxEmail,
        provider: mailbox.provider,
      };
      try {
        const adapter = await adapterForMailbox(mailbox);
        const granted = tagsGranted(mailbox);
        const supportsTags =
          adapter.listProviderTags !== undefined && adapter.setProviderTags !== undefined;
        const [folders, tags] = await Promise.all([
          adapter.listProviderFolders?.() ?? Promise.resolve([]),
          supportsTags && granted
            ? (adapter.listProviderTags?.() ?? Promise.resolve([]))
            : Promise.resolve([]),
        ]);
        return {
          ...base,
          supportsFolders: adapter.listProviderFolders !== undefined,
          supportsTags: supportsTags && granted,
          tagsNeedReconnect: supportsTags && !granted,
          folders: folders.map((f) => withFolderRefs(scope, mailbox.mailboxId, f)),
          tags: tags.map((t) => withTagRef(scope, mailbox.mailboxId, t)),
        };
      } catch (err) {
        console.error(`[mail/folders] listing ${mailbox.provider} folders failed:`, err);
        return {
          ...base,
          supportsFolders: false,
          supportsTags: false,
          tagsNeedReconnect: false,
          folders: [],
          tags: [],
          error: sanitizeError(err),
        };
      }
    }),
  );
}

export async function listFolderEmails(
  scope: FolderScope,
  folderRef: string,
  pageToken?: string,
  limit = FOLDER_PAGE_SIZE,
): Promise<MessagesResponse> {
  const { mailbox, ref } = resolveRef(scope, folderRef);
  const adapter = await adapterForMailbox(mailbox);
  if (!adapter.listInProviderFolder) {
    throw new BadRequestError(`${mailbox.mailboxEmail} has no provider folders`);
  }
  const page = await adapter.listInProviderFolder(ref, pageToken, limit);
  return scope.isAggregate
    ? { ...page, emails: page.emails.map((email) => tagEmail(email, mailbox)) }
    : page;
}

export async function moveToFolder(
  scope: FolderScope,
  id: string,
  folderRef: string,
): Promise<string> {
  const message = scopeMessage(scope, id);
  const { mailbox, ref } = resolveRef(scope, folderRef);
  if (message.mailboxId !== mailbox.mailboxId) {
    throw new BadRequestError("A message can only move to a folder of its own mailbox");
  }
  const adapter = await adapterForMailbox(mailbox);
  if (!adapter.moveToProviderFolder) {
    throw new BadRequestError(`${mailbox.mailboxEmail} has no provider folders`);
  }
  const moved = await adapter.moveToProviderFolder(message.messageId, ref);
  return outRef(scope, mailbox.mailboxId, moved);
}

function tagsForMailbox(scope: FolderScope, mailboxId: string, refs: string[]): string[] {
  if (!scope.isAggregate) return refs;
  return refs.flatMap((ref) => {
    const resolved = resolveRef(scope, ref);
    return resolved.mailbox.mailboxId === mailboxId ? [resolved.ref] : [];
  });
}

export async function setMessageTags(
  scope: FolderScope,
  ids: string[],
  add: string[],
  remove: string[],
): Promise<void> {
  const groups = new Map<string, { mailbox: ResolvedMailbox; ids: string[] }>();
  for (const id of ids) {
    const message = scopeMessage(scope, id);
    const mailbox = scope.mailboxes.find((m) => m.mailboxId === message.mailboxId);
    if (!mailbox) continue;
    const group = groups.get(mailbox.mailboxId) ?? { mailbox, ids: [] };
    group.ids.push(message.messageId);
    groups.set(mailbox.mailboxId, group);
  }
  await Promise.all(
    Array.from(groups.values(), async ({ mailbox, ids: messageIds }) => {
      const adapter = await adapterForMailbox(mailbox);
      if (!adapter.setProviderTags) {
        throw new BadRequestError(`${mailbox.mailboxEmail} has no provider labels`);
      }
      if (!tagsGranted(mailbox)) throw new BadRequestError(reconnectMessage(mailbox));
      await adapter.setProviderTags(
        messageIds,
        tagsForMailbox(scope, mailbox.mailboxId, add),
        tagsForMailbox(scope, mailbox.mailboxId, remove),
      );
    }),
  );
}

export async function createFolder(
  scope: FolderScope,
  args: { name: string; parentRef?: string; mailboxId?: string },
): Promise<ProviderFolder> {
  const parent = args.parentRef ? resolveRef(scope, args.parentRef) : null;
  const mailbox = parent?.mailbox ?? pickMailbox(scope, args.mailboxId);
  const adapter = await adapterForMailbox(mailbox);
  if (!adapter.createProviderFolder) {
    throw new BadRequestError(`${mailbox.mailboxEmail} has no provider folders`);
  }
  const created = await adapter.createProviderFolder(args.name, parent?.ref);
  return withFolderRefs(scope, mailbox.mailboxId, created);
}

export async function createTag(
  scope: FolderScope,
  args: { name: string; mailboxId?: string },
): Promise<ProviderTag> {
  const mailbox = pickMailbox(scope, args.mailboxId);
  const adapter = await adapterForMailbox(mailbox);
  if (!adapter.createProviderTag) {
    throw new BadRequestError(`${mailbox.mailboxEmail} has no provider labels`);
  }
  if (!tagsGranted(mailbox)) throw new BadRequestError(reconnectMessage(mailbox));
  return withTagRef(scope, mailbox.mailboxId, await adapter.createProviderTag(args.name));
}
