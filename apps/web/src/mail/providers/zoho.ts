import { createHash } from "node:crypto";

import { decodeHTML } from "entities";
import { z } from "zod";

import { detectZohoRegion, type ZohoRegion } from "@/connections/zoho-regions";
import { bind } from "@/lib/bind";
import { ProviderError } from "@/lib/errors/provider-error";
import { isRecord, keysOf } from "@/lib/guards";
import { mergeHeaders } from "@/lib/headers";
import { isPlainTerm, type TagToken, tagKey, tagText } from "@/search/ast";
import { parseSearchDate } from "@/search/dates";
import { compileWith, type Dialect, planPushdown } from "@/search/pushdown";
import { type AstSearch, SEARCH_PAGE_SIZE } from "@/search/types";
import { getCache } from "@/services/cache";
import {
  type DraftPayload,
  type Email,
  isMailFolder,
  type MailFolder,
  type MessagesResponse,
  type ProviderFolder,
  type ProviderTag,
  type UnsubscribeInfo,
} from "@/types/mail";

import type { MailAdapter } from "../adapter";
import { headersFromRaw, type MessageHeaders } from "../headers";
import { parseRecipientList } from "../recipients";

export function zohoMail(accessToken: string): MailAdapter {
  return bind<MailAdapter, string>(
    {
      listMessages,
      getMessage,
      sendMessage,
      deleteMessage,
      starMessage,
      markRead,
      batchMarkRead,
      search,
      searchAst,
      getRaw,
      getThread,
      listAllInFolder,
      batchDelete,
      archiveMessage,
      restoreMessage,
      createDraft,
      updateDraft,
      deleteDraft,
      getUnsubscribeInfo,
      getHeaders,
      listAttachments,
      downloadAttachment,
      listProviderFolders,
      listInProviderFolder,
      moveToProviderFolder,
      createProviderFolder,
      listProviderTags,
      setProviderTags,
      createProviderTag,
    },
    accessToken,
  );
}

type Region = ZohoRegion;

const SLOW_MS = 1000;

type ZohoValue = string | number;

interface ZohoMessage {
  messageId?: ZohoValue;
  id?: ZohoValue;
  threadId?: ZohoValue;
  folderId?: ZohoValue;
  fromAddress?: string;
  sender?: string;
  toAddress?: string;
  ccAddress?: string;
  subject?: string;
  summary?: string;
  shortSummary?: string;
  status?: ZohoValue;
  flagid?: string;
  receivedTime?: ZohoValue;
  sentDateInGMT?: ZohoValue;
  mailFormat?: string;
  labelId?: unknown;
}

interface ZohoAttachmentInfo {
  attachmentId?: ZohoValue;
  partId?: ZohoValue;
  attachmentName?: string;
  fileName?: string;
  contentType?: string;
  size?: ZohoValue;
}

interface ZohoUploadedAttachment {
  storeName?: string;
  attachmentName?: string;
}

interface ZohoRawMessage {
  content?: string;
  originalMessage?: string;
  mailContent?: string;
  rawMessage?: string;
}

function tokenKey(prefix: string, accessToken: string): string {
  const digest = createHash("sha256").update(accessToken).digest("base64url").slice(0, 32);
  return `zoho:${prefix}:${digest}`;
}

function mailBase(region: Region): string {
  return `https://mail.zoho.${region}/api`;
}

async function detectRegion(accessToken: string): Promise<Region> {
  return detectZohoRegion(accessToken, "mail", (region) => `${mailBase(region)}/accounts`);
}

const FOLDER_NAMES: Record<MailFolder, string[]> = {
  inbox: ["Inbox"],
  sent: ["Sent"],
  drafts: ["Drafts"],
  starred: ["Starred"],
  trash: ["Trash"],
  archive: ["Archive"],
  spam: ["Spam", "Junk"],
};

const zohoFolderSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  parentId: z.string().optional(),
  type: z.string().optional(),
  unread: z.number().optional(),
});

const accountCacheSchema = z.object({
  accountId: z.string().min(1),
  folderIds: z.record(z.string(), z.string()),
  folders: z.array(zohoFolderSchema),
  fromAddress: z.string(),
  ts: z.number(),
});

type ZohoFolder = z.infer<typeof zohoFolderSchema>;

type AccountCache = z.infer<typeof accountCacheSchema>;

const ACCOUNT_CACHE_TTL_SEC = 5 * 60;
const ACCOUNT_CACHE_TTL_MS = ACCOUNT_CACHE_TTL_SEC * 1000;
const accountCache = new Map<string, AccountCache>();

function parseAccountCache(raw: string): AccountCache | null {
  try {
    const parsed = accountCacheSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function authHeaders(accessToken: string, extra: Record<string, string> = {}) {
  return {
    Authorization: `Zoho-oauthtoken ${accessToken}`,
    Accept: "application/json",
    ...extra,
  };
}

async function zohoFetch(accessToken: string, path: string, init?: RequestInit): Promise<Response> {
  const region = await detectRegion(accessToken);
  const startedAt = Date.now();
  const res = await fetch(`${mailBase(region)}${path}`, {
    ...init,
    headers: mergeHeaders(authHeaders(accessToken), init?.headers),
  });
  const elapsed = Date.now() - startedAt;
  if (elapsed > SLOW_MS) {
    console.warn(`[zoho-mail] ${init?.method ?? "GET"} ${path.split("?")[0]} took ${elapsed}ms`);
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new ProviderError("zoho", res.status, txt, `Zoho ${path}`);
  }
  return res;
}

async function zohoBaseUrl(accessToken: string): Promise<string> {
  const region = await detectRegion(accessToken);
  return mailBase(region);
}

async function loadAccount(accessToken: string): Promise<AccountCache> {
  const local = accountCache.get(accessToken);
  if (local && Date.now() - local.ts < ACCOUNT_CACHE_TTL_MS) return local;

  const key = tokenKey("account", accessToken);
  const raw = await getCache().get(key);
  const shared = raw ? parseAccountCache(raw) : null;
  if (shared && Date.now() - shared.ts < ACCOUNT_CACHE_TTL_MS) {
    accountCache.set(accessToken, shared);
    return shared;
  }

  const accountsRes = await zohoFetch(accessToken, "/accounts");
  const accountsData = await accountsRes.json();
  const account = accountsData?.data?.[0];
  console.log(
    `[zoho-mail] loadAccount → ${accountsData?.data?.length ?? 0} account(s), using ${account?.accountId ?? "none"}`,
  );
  if (!account?.accountId) throw new Error("No Zoho account found for user");

  const accountId = String(account.accountId);
  const fromAddress = String(account.primaryEmailAddress ?? account.mailboxAddress ?? "");

  const foldersRes = await zohoFetch(accessToken, `/accounts/${accountId}/folders`);
  const foldersData = await foldersRes.json();
  const folders = parseFolders(foldersData?.data);
  const folderIds: Record<string, string> = {};
  for (const folder of folders.toSorted((a, b) => depth(b.path) - depth(a.path))) {
    folderIds[folder.name.toLowerCase()] = folder.id;
  }
  console.log(`[zoho-mail] loadAccount → ${folders.length} folder(s)`);

  const entry: AccountCache = {
    accountId,
    folderIds,
    folders,
    fromAddress,
    ts: Date.now(),
  };
  accountCache.set(accessToken, entry);
  await getCache().set(key, JSON.stringify(entry), ACCOUNT_CACHE_TTL_SEC);
  return entry;
}

function idText(value: unknown): string | undefined {
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

function depth(path: string): number {
  return path.split("/").filter(Boolean).length;
}

function optionalNumber(value: unknown): number | undefined {
  const n = Number(value);
  return value !== undefined && value !== null && value !== "" && Number.isFinite(n)
    ? n
    : undefined;
}

function parseFolders(data: unknown): ZohoFolder[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((raw: unknown): ZohoFolder[] => {
    if (!isRecord(raw)) return [];
    const id = idText(raw.folderId) ?? "";
    const name = typeof raw.folderName === "string" ? raw.folderName : "";
    if (!id || !name) return [];
    const path = typeof raw.path === "string" && raw.path ? raw.path : `/${name}`;
    const parent = idText(raw.parentFolderId);
    const parentId = parent && parent !== "0" ? parent : undefined;
    const unread = optionalNumber(raw.unreadCount ?? raw.unreadMessageCount);
    return [
      {
        id,
        name,
        path,
        ...(parentId ? { parentId } : {}),
        ...(typeof raw.folderType === "string" ? { type: raw.folderType } : {}),
        ...(unread === undefined ? {} : { unread }),
      },
    ];
  });
}

function resolveFolderId(cache: AccountCache, folder: MailFolder): string | undefined {
  for (const candidate of FOLDER_NAMES[folder]) {
    const id = cache.folderIds[candidate.toLowerCase()];
    if (id) return id;
  }
  return undefined;
}

function requireFolderId(cache: AccountCache, folder: MailFolder): string {
  const id = resolveFolderId(cache, folder);
  if (!id) throw new Error(`Zoho ${FOLDER_NAMES[folder][0]} folder not found`);
  return id;
}

interface MessageRef {
  folderId: string;
  messageId: string;
}

function encodeMessageId(ref: MessageRef): string {
  return Buffer.from(JSON.stringify([ref.folderId, ref.messageId]), "utf8").toString("base64url");
}

function decodeMessageId(id: string): MessageRef {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(id, "base64url").toString("utf8"));
  } catch {
    throw new Error("Malformed Zoho message id");
  }
  if (!Array.isArray(parsed) || parsed.length !== 2) {
    throw new Error("Malformed Zoho message id");
  }
  const [folderId, messageId]: unknown[] = parsed;
  if (typeof folderId !== "string" || typeof messageId !== "string" || !folderId || !messageId) {
    throw new Error("Malformed Zoho message id");
  }
  return { folderId, messageId };
}

function tagIds(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string" || typeof value === "number") {
    return String(value)
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
}

function zohoMessageToEmail(msg: ZohoMessage, folder: MailFolder, folderId: string): Email {
  const fromEntry = parseRecipientList(msg.fromAddress ?? msg.sender, {
    htmlEntities: true,
  })[0];
  const toEntries = parseRecipientList(msg.toAddress, { htmlEntities: true });
  const ccEntries = parseRecipientList(msg.ccAddress, { htmlEntities: true });
  const status = String(msg.status ?? "0");
  const flagid = msg.flagid ?? "";
  const receivedRaw = msg.receivedTime ?? msg.sentDateInGMT ?? Date.now();
  const receivedMs = Number(receivedRaw);
  const dateIso = Number.isFinite(receivedMs)
    ? new Date(receivedMs).toISOString()
    : new Date().toISOString();

  return {
    id: encodeMessageId({
      folderId: String(msg.folderId ?? folderId),
      messageId: String(msg.messageId ?? msg.id ?? ""),
    }),
    threadId: msg.threadId ? String(msg.threadId) : undefined,
    from: fromEntry?.email ?? "",
    fromName: fromEntry?.name ?? "",
    to: toEntries.map((r) => r.email),
    cc: ccEntries.map((r) => r.email),
    toRecipients: toEntries,
    ccRecipients: ccEntries,
    subject: decodeHTML(msg.subject ?? "") || "(no subject)",
    snippet: decodeHTML(msg.summary ?? msg.shortSummary ?? "").trim(),
    date: dateIso,
    isRead: status !== "0",
    isStarred: flagid === "flag_imp" || flagid === "flag_red",
    labels: tagIds(msg.labelId),
    provider: "zoho",
    folder,
  };
}

async function listMessages(
  accessToken: string,
  folder: MailFolder,
  pageToken?: string,
  max = 50,
): Promise<MessagesResponse> {
  const acc = await loadAccount(accessToken);
  const folderId = resolveFolderId(acc, folder);
  if (!folderId) {
    console.warn(
      `[zoho-mail] listMessages: no folderId for "${folder}" (known: ${Object.keys(acc.folderIds).length})`,
    );
    return { emails: [] };
  }

  const start = pageToken ? Number(pageToken) : 1;
  const limit = Math.min(Math.max(max, 1), 200);

  const path = `/accounts/${acc.accountId}/messages/view?folderId=${folderId}&start=${start}&limit=${limit}`;
  const res = await zohoFetch(accessToken, path);
  const data = await res.json();
  const items: ZohoMessage[] = data?.data ?? [];
  const emails = items.map((m) => zohoMessageToEmail(m, folder, folderId));

  const nextPageToken = items.length >= limit ? String(start + items.length) : undefined;

  return { emails, nextPageToken };
}

interface MessageContent {
  bodyHtml: string;
  bodyText: string;
  folderId?: string;
}

async function fetchMessageContent(
  accessToken: string,
  accountId: string,
  folderId: string,
  messageId: string,
): Promise<MessageContent> {
  const res = await zohoFetch(
    accessToken,
    `/accounts/${accountId}/folders/${folderId}/messages/${messageId}/content`,
  );
  const data = await res.json();
  const content = data?.data?.content ?? data?.content ?? "";
  return {
    bodyHtml: typeof content === "string" ? content : "",
    bodyText: "",
    folderId,
  };
}

async function getMessage(accessToken: string, id: string): Promise<Partial<Email>> {
  const ref = decodeMessageId(id);
  const acc = await loadAccount(accessToken);
  const content = await fetchMessageContent(
    accessToken,
    acc.accountId,
    ref.folderId,
    ref.messageId,
  );
  return { id, bodyHtml: content.bodyHtml, bodyText: content.bodyText };
}

async function createDraft(accessToken: string, payload: DraftPayload): Promise<{ id: string }> {
  const acc = await loadAccount(accessToken);
  const body: Record<string, unknown> = {
    fromAddress: acc.fromAddress,
    toAddress: payload.to.join(","),
    subject: payload.subject,
    content: payload.bodyHtml,
    mailFormat: "html",
    mode: "draft",
  };
  if (payload.cc?.length) body.ccAddress = payload.cc.join(",");
  if (payload.bcc?.length) body.bccAddress = payload.bcc.join(",");

  const res = await zohoFetch(accessToken, `/accounts/${acc.accountId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  const messageId = String(data?.data?.messageId ?? data?.data?.id ?? data?.messageId ?? "");
  if (!messageId) throw new Error("Zoho returned no draft id");
  const folderId = String(data?.data?.folderId ?? requireFolderId(acc, "drafts"));
  return { id: encodeMessageId({ folderId, messageId }) };
}

async function updateDraft(
  accessToken: string,
  draftId: string,
  payload: DraftPayload,
): Promise<{ id: string }> {
  await modifyMessages(accessToken, [draftId], "trashMessages").catch(() => {});
  return createDraft(accessToken, payload);
}

async function deleteDraft(accessToken: string, draftId: string): Promise<void> {
  await modifyMessages(accessToken, [draftId], "trashMessages");
}

async function sendMessage(
  accessToken: string,
  payload: DraftPayload,
): Promise<{ id: string | null }> {
  const acc = await loadAccount(accessToken);

  const base = await zohoBaseUrl(accessToken);
  const uploads = await Promise.all(
    (payload.attachments ?? []).map(async (att) => {
      const buffer = Buffer.from(att.contentBase64, "base64");
      const form = new FormData();
      form.append("file", new Blob([new Uint8Array(buffer)], { type: att.mimeType }), att.filename);

      const uploadRes = await fetch(
        `${base}/accounts/${acc.accountId}/messages/attachments?fileName=${encodeURIComponent(att.filename)}&isInline=false`,
        {
          method: "POST",
          headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
          body: form,
        },
      );
      if (!uploadRes.ok) {
        throw new Error(`Zoho attachment upload failed: ${uploadRes.status}`);
      }
      const uploaded = await uploadRes.json();
      const refs: ZohoUploadedAttachment[] = uploaded?.data ?? [];
      return refs[0]
        ? {
            storeName: refs[0].storeName ?? "",
            attachmentName: refs[0].attachmentName ?? att.filename,
          }
        : null;
    }),
  );
  const attachmentRefs = uploads.filter((ref) => ref !== null);

  const body: Record<string, unknown> = {
    fromAddress: acc.fromAddress,
    toAddress: payload.to.join(","),
    subject: payload.subject,
    content: payload.bodyHtml,
    mailFormat: "html",
  };
  if (payload.cc?.length) body.ccAddress = payload.cc.join(",");
  if (payload.bcc?.length) body.bccAddress = payload.bcc.join(",");
  if (attachmentRefs.length > 0) body.attachments = attachmentRefs;

  const replyTarget = payload.replyToMessageId
    ? decodeMessageId(payload.replyToMessageId).messageId
    : null;
  if (replyTarget) body.action = "reply";

  const res = await zohoFetch(
    accessToken,
    replyTarget
      ? `/accounts/${acc.accountId}/messages/${replyTarget}`
      : `/accounts/${acc.accountId}/messages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const json: unknown = await res.json().catch(() => null);
  const messageId = isRecord(json) && isRecord(json.data) ? json.data.messageId : undefined;
  const sentId = resolveFolderId(acc, "sent");
  return {
    id:
      sentId && (typeof messageId === "string" || typeof messageId === "number")
        ? encodeMessageId({ folderId: sentId, messageId: String(messageId) })
        : null,
  };
}

async function modifyMessages(
  accessToken: string,
  ids: string[],
  mode: "markAsRead" | "markAsUnread" | "flagMessages" | "unFlagMessages" | "trashMessages",
): Promise<void> {
  if (ids.length === 0) return;
  const acc = await loadAccount(accessToken);
  await zohoFetch(accessToken, `/accounts/${acc.accountId}/updatemessage`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode,
      messageId: ids.map((id) => decodeMessageId(id).messageId),
      ...(mode === "flagMessages" ? { flagid: "flag_imp" } : {}),
    }),
  });
}

async function moveTo(accessToken: string, id: string, folder: MailFolder): Promise<string> {
  const acc = await loadAccount(accessToken);
  const destfolderId = requireFolderId(acc, folder);
  const { messageId } = decodeMessageId(id);
  await zohoFetch(accessToken, `/accounts/${acc.accountId}/updatemessage`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "moveMessage", messageId: [messageId], destfolderId }),
  });
  return encodeMessageId({ folderId: destfolderId, messageId });
}

async function trashedIds(accessToken: string, ids: string[]): Promise<Map<string, string>> {
  const acc = await loadAccount(accessToken);
  const trashId = requireFolderId(acc, "trash");
  const moved = new Map<string, string>();
  for (const id of ids) {
    const next = encodeMessageId({ folderId: trashId, messageId: decodeMessageId(id).messageId });
    if (next !== id) moved.set(id, next);
  }
  return moved;
}

async function starMessage(accessToken: string, id: string, starred: boolean): Promise<void> {
  await modifyMessages(accessToken, [id], starred ? "flagMessages" : "unFlagMessages");
}

async function markRead(accessToken: string, id: string, read: boolean): Promise<void> {
  await modifyMessages(accessToken, [id], read ? "markAsRead" : "markAsUnread");
}

async function batchMarkRead(accessToken: string, ids: string[], read: boolean): Promise<void> {
  await modifyMessages(accessToken, ids, read ? "markAsRead" : "markAsUnread");
}

async function deleteMessage(accessToken: string, id: string): Promise<string> {
  const moved = await trashedIds(accessToken, [id]);
  await modifyMessages(accessToken, [id], "trashMessages");
  return moved.get(id) ?? id;
}

async function restoreMessage(accessToken: string, id: string): Promise<string> {
  return moveTo(accessToken, id, "inbox");
}

async function archiveMessage(accessToken: string, id: string): Promise<string> {
  return moveTo(accessToken, id, "archive");
}

async function batchDelete(accessToken: string, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const moved = await trashedIds(accessToken, ids);
  await modifyMessages(accessToken, ids, "trashMessages");
  return moved;
}

async function listAllInFolder(accessToken: string, folder: MailFolder): Promise<string[]> {
  const ids: string[] = [];
  let start = 1;
  const limit = 200;
  while (true) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- each page starts where the previous page ended
    const res = await listMessages(accessToken, folder, String(start), limit);
    for (const e of res.emails) ids.push(e.id);
    if (!res.nextPageToken || res.emails.length === 0) break;
    start = Number(res.nextPageToken);
    if (start > 5000) break;
  }
  return ids;
}

function folderOfMessage(acc: AccountCache, msg: ZohoMessage): MailFolder {
  const folderId = String(msg.folderId ?? "");
  const name = Object.entries(acc.folderIds).find(([, id]) => id === folderId)?.[0];
  if (!name) return "inbox";
  return (
    keysOf(FOLDER_NAMES).find((folder) =>
      FOLDER_NAMES[folder].some((c) => c.toLowerCase() === name),
    ) ?? "inbox"
  );
}

const ZOHO_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function zohoDate(ms: number): string {
  const date = new Date(ms);
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${day}-${ZOHO_MONTHS[date.getUTCMonth()]}-${date.getUTCFullYear()}`;
}

const ZOHO_TEXT_KEYS: Record<string, string> = {
  from: "sender",
  to: "to",
  cc: "cc",
  subject: "subject",
  filename: "fileName",
};

function zohoValue(text: string): string {
  return /\s/.test(text) ? `"${text.replaceAll('"', "")}"` : text;
}

function zohoDialect(timeZone: string): Dialect<string> {
  return {
    leaf(tag: TagToken) {
      const key = tagKey(tag);
      const text = tagText(tag) ?? "";
      if (key === "after" || key === "before" || key === "on") {
        const span = parseSearchDate(text, timeZone);
        if (!span) return null;
        if (key === "after") {
          return { native: `fromDate:${zohoDate(span.start)}`, exact: false };
        }
        if (key === "before") {
          return { native: `toDate:${zohoDate(span.start)}`, exact: false };
        }
        return {
          native: `fromDate:${zohoDate(span.start)}::toDate:${zohoDate(span.start)}`,
          exact: false,
        };
      }
      if (!isPlainTerm(tag)) return null;
      if (key === null) return { native: `entire:${zohoValue(text)}`, exact: true };
      const param = ZOHO_TEXT_KEYS[key];
      if (param) return { native: `${param}:${zohoValue(text)}`, exact: true };
      const value = text.toLowerCase();
      if (key === "has" && value === "attachment") {
        return { native: "has:attachment", exact: true };
      }
      if (key === "mail-folder" && isMailFolder(value)) {
        const name = FOLDER_NAMES[value][0];
        return name ? { native: `in:${name}`, exact: false } : null;
      }
      return null;
    },
    and: (parts) => parts.join("::"),
    or: () => null,
    not: () => null,
  };
}

async function searchAst(
  accessToken: string,
  astSearch: AstSearch<Email>,
): Promise<MessagesResponse> {
  const plan = planPushdown(astSearch.query, compileWith(zohoDialect(astSearch.timeZone)));
  if (plan.native.length === 0) {
    const page = await listMessages(accessToken, "inbox", astSearch.cursor, SEARCH_PAGE_SIZE);
    return {
      emails: await astSearch.accept(plan.residual, page.emails),
      nextPageToken: page.nextPageToken,
    };
  }
  const acc = await loadAccount(accessToken);
  const start = astSearch.cursor ? Number(astSearch.cursor) : 1;
  const key = encodeURIComponent(plan.native.join("::"));
  const path = `/accounts/${acc.accountId}/messages/search?searchKey=${key}&start=${start}&limit=${SEARCH_PAGE_SIZE}`;
  const res = await zohoFetch(accessToken, path);
  const data = await res.json();
  const items: ZohoMessage[] = data?.data ?? [];
  const emails = items.map((m) =>
    zohoMessageToEmail(m, folderOfMessage(acc, m), requireFolderId(acc, "inbox")),
  );
  return {
    emails: await astSearch.accept(plan.residual, emails),
    nextPageToken: items.length >= SEARCH_PAGE_SIZE ? String(start + items.length) : undefined,
  };
}

async function search(accessToken: string, query: string, limit = 25): Promise<MessagesResponse> {
  const acc = await loadAccount(accessToken);
  const path = `/accounts/${acc.accountId}/messages/search?searchKey=${encodeURIComponent(query)}&start=1&limit=${limit}`;
  const res = await zohoFetch(accessToken, path);
  const data = await res.json();
  const items: ZohoMessage[] = data?.data ?? [];
  return {
    emails: items.map((m) => zohoMessageToEmail(m, "inbox", requireFolderId(acc, "inbox"))),
  };
}

async function getHeaders(
  accessToken: string,
  id: string,
  names: string[],
): Promise<MessageHeaders> {
  return headersFromRaw(await getRaw(accessToken, id), names);
}

async function getUnsubscribeInfo(
  accessToken: string,
  id: string,
): Promise<UnsubscribeInfo | null> {
  let raw: string;
  try {
    raw = await getRaw(accessToken, id);
  } catch {
    return null;
  }

  let mime = raw;
  try {
    const decoded = Buffer.from(raw, "base64").toString("utf-8");
    if (/^[A-Za-z-]+:/m.test(decoded)) mime = decoded;
  } catch {}

  const headerBlock = mime.split(/\r?\n\r?\n/, 1)[0] ?? "";
  const unfolded = headerBlock.replace(/\r?\n[ \t]+/g, " ");
  const find = (name: string) => {
    const m = unfolded.match(new RegExp(`^${name}:[ \\t]*(.+)$`, "im"));
    return m?.[1]?.trim();
  };
  const listUnsubscribe = find("List-Unsubscribe");
  if (!listUnsubscribe) return null;
  return {
    listUnsubscribe,
    listUnsubscribePost: find("List-Unsubscribe-Post"),
  };
}

async function getRaw(accessToken: string, encodedId: string): Promise<string> {
  const { folderId, messageId: id } = decodeMessageId(encodedId);
  const acc = await loadAccount(accessToken);
  const base = await zohoBaseUrl(accessToken);

  const candidates: { url: string; note: string }[] = [
    {
      url: `${base}/accounts/${acc.accountId}/messages/${id}/originalmessage`,
      note: "no-folder",
    },
    {
      url: `${base}/accounts/${acc.accountId}/folders/${folderId}/messages/${id}/originalmessage`,
      note: `folder=${folderId}`,
    },
    {
      url: `${base}/accounts/${acc.accountId}/messages/${id}/emlview`,
      note: "emlview",
    },
  ];

  const attempts: string[] = [];
  for (const c of candidates) {
    try {
      /* oxlint-disable eslint/no-await-in-loop -- tries each raw-message endpoint in order and stops at the first that returns content */
      const res = await fetch(c.url, { headers: authHeaders(accessToken) });
      if (res.ok) {
        const text = await res.text();
        /* oxlint-enable eslint/no-await-in-loop */
        if (!text) {
          attempts.push(`${c.note}:empty`);
          continue;
        }

        let mime = text;
        const trimmed = text.trimStart();
        if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
          try {
            const parsed: { data?: string | ZohoRawMessage } = JSON.parse(text);
            const data = parsed.data;
            if (typeof data === "string") {
              mime = data;
            } else if (data) {
              mime =
                data.content ?? data.originalMessage ?? data.mailContent ?? data.rawMessage ?? "";
            }
            if (!mime) {
              attempts.push(`${c.note}:empty-json`);
              continue;
            }
          } catch {}
        }
        return Buffer.from(mime, "utf-8").toString("base64");
      }
      attempts.push(`${c.note}:${res.status}`);
    } catch (err) {
      attempts.push(`${c.note}:${err instanceof Error ? err.message.slice(0, 40) : "err"}`);
    }
  }

  try {
    const detailsRes = await fetch(
      `${base}/accounts/${acc.accountId}/folders/${folderId}/messages/${id}/details`,
      { headers: authHeaders(accessToken) },
    );
    const contentRes = await fetch(
      `${base}/accounts/${acc.accountId}/folders/${folderId}/messages/${id}/content`,
      { headers: authHeaders(accessToken) },
    );
    if (detailsRes.ok && contentRes.ok) {
      const details = await detailsRes.json();
      const content = await contentRes.json();
      const m: ZohoMessage = details?.data ?? details ?? {};
      const body = String(content?.data?.content ?? content?.content ?? "");
      const header = (k: string, v: ZohoValue | undefined) => (v ? `${k}: ${String(v)}\r\n` : "");
      const mime =
        header("From", m.fromAddress ?? m.sender) +
        header("To", m.toAddress) +
        header("Cc", m.ccAddress) +
        header("Subject", m.subject) +
        header("Date", m.receivedTime) +
        header("Message-ID", m.messageId) +
        header("Content-Type", m.mailFormat === "html" ? "text/html" : "text/plain") +
        "\r\n" +
        body;
      return Buffer.from(mime, "utf-8").toString("base64");
    }
  } catch {}

  throw new Error(
    `Zoho raw fetch failed (attempts: ${attempts.slice(0, 6).join(", ")}${
      attempts.length > 6 ? "…" : ""
    })`,
  );
}

async function getThread(accessToken: string, threadId: string): Promise<Email[]> {
  const acc = await loadAccount(accessToken);
  const path = `/accounts/${acc.accountId}/messages/view?threadId=${threadId}&start=1&limit=50`;
  const res = await zohoFetch(accessToken, path);
  const data = await res.json();
  const items: ZohoMessage[] = data?.data ?? [];
  return items.map((m) => zohoMessageToEmail(m, "inbox", requireFolderId(acc, "inbox")));
}

async function listAttachments(
  accessToken: string,
  id: string,
): Promise<{ id: string; filename: string; mimeType: string; size: number }[]> {
  const { folderId, messageId } = decodeMessageId(id);
  const acc = await loadAccount(accessToken);
  const res = await zohoFetch(
    accessToken,
    `/accounts/${acc.accountId}/folders/${folderId}/messages/${messageId}/attachmentinfo`,
  );
  const data = await res.json();
  const list: ZohoAttachmentInfo[] = data?.data?.attachments ?? data?.attachments ?? [];
  return list.map((a) => ({
    id: String(a.attachmentId ?? a.partId ?? ""),
    filename: a.attachmentName ?? a.fileName ?? "attachment",
    mimeType: a.contentType ?? "application/octet-stream",
    size: Number(a.size ?? 0),
  }));
}

async function downloadAttachment(
  accessToken: string,
  id: string,
  attachmentId: string,
): Promise<{ buffer: Buffer; mimeType: string }> {
  const { folderId, messageId } = decodeMessageId(id);
  const acc = await loadAccount(accessToken);
  const res = await zohoFetch(
    accessToken,
    `/accounts/${acc.accountId}/folders/${folderId}/messages/${messageId}/attachments/${encodeURIComponent(attachmentId)}`,
    { headers: { Accept: "application/octet-stream" } },
  );
  const buf = Buffer.from(await res.arrayBuffer());
  const mimeType = res.headers.get("content-type") ?? "application/octet-stream";
  return { buffer: buf, mimeType };
}

const HIDDEN_FOLDER_TYPES = new Set(["outbox", "templates", "snoozed"]);

function standardFolderIds(acc: AccountCache): Map<string, MailFolder> {
  const ids = new Map<string, MailFolder>();
  for (const folder of keysOf(FOLDER_NAMES)) {
    const id = resolveFolderId(acc, folder);
    if (id) ids.set(id, folder);
  }
  return ids;
}

function toProviderFolder(folder: ZohoFolder, byPath: Map<string, string>): ProviderFolder {
  const path = folder.path.replace(/^\/+/, "");
  const cut = path.lastIndexOf("/");
  const parentRef = folder.parentId ?? (cut > 0 ? byPath.get(path.slice(0, cut)) : undefined);
  return {
    ref: folder.id,
    name: folder.name,
    path,
    ...(parentRef ? { parentRef } : {}),
    kind: "folder",
    ...(folder.unread === undefined ? {} : { unread: folder.unread }),
  };
}

async function listProviderFolders(accessToken: string): Promise<ProviderFolder[]> {
  const acc = await loadAccount(accessToken);
  const standard = standardFolderIds(acc);
  const byPath = new Map(acc.folders.map((f) => [f.path.replace(/^\/+/, ""), f.id]));
  return acc.folders
    .filter((f) => !standard.has(f.id) && !HIDDEN_FOLDER_TYPES.has((f.type ?? "").toLowerCase()))
    .map((f) => toProviderFolder(f, byPath))
    .toSorted((a, b) => a.path.localeCompare(b.path));
}

function requireCustomFolder(acc: AccountCache, ref: string): ZohoFolder {
  const folder = acc.folders.find((f) => f.id === ref);
  if (!folder) {
    throw new Error(
      `Unknown Zoho folder "${ref}". These are all of them: ${acc.folders.map((f) => `${f.id} (${f.path})`).join(", ")}`,
    );
  }
  return folder;
}

async function listInProviderFolder(
  accessToken: string,
  ref: string,
  pageToken?: string,
  max = 50,
): Promise<MessagesResponse> {
  const acc = await loadAccount(accessToken);
  requireCustomFolder(acc, ref);
  const folder = standardFolderIds(acc).get(ref) ?? "archive";
  const start = pageToken ? Number(pageToken) : 1;
  const limit = Math.min(Math.max(max, 1), 200);
  const res = await zohoFetch(
    accessToken,
    `/accounts/${acc.accountId}/messages/view?folderId=${ref}&start=${start}&limit=${limit}`,
  );
  const data = await res.json();
  const items: ZohoMessage[] = data?.data ?? [];
  return {
    emails: items.map((m) => zohoMessageToEmail(m, folder, ref)),
    nextPageToken: items.length >= limit ? String(start + items.length) : undefined,
  };
}

async function moveToProviderFolder(accessToken: string, id: string, ref: string): Promise<string> {
  const acc = await loadAccount(accessToken);
  requireCustomFolder(acc, ref);
  const { messageId } = decodeMessageId(id);
  await zohoFetch(accessToken, `/accounts/${acc.accountId}/updatemessage`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "moveMessage", messageId: [messageId], destfolderId: ref }),
  });
  return encodeMessageId({ folderId: ref, messageId });
}

async function forgetAccount(accessToken: string): Promise<void> {
  accountCache.delete(accessToken);
  await getCache().del(tokenKey("account", accessToken));
}

async function createProviderFolder(
  accessToken: string,
  name: string,
  parentRef?: string,
): Promise<ProviderFolder> {
  const acc = await loadAccount(accessToken);
  if (parentRef) requireCustomFolder(acc, parentRef);
  const res = await zohoFetch(accessToken, `/accounts/${acc.accountId}/folders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folderName: name, ...(parentRef ? { parentFolderId: parentRef } : {}) }),
  });
  const data = await res.json();
  await forgetAccount(accessToken);
  const [created] = parseFolders([{ folderName: name, parentFolderId: parentRef, ...data?.data }]);
  if (!created) throw new Error("Zoho did not return the new folder");
  const fresh = await loadAccount(accessToken);
  const byPath = new Map(fresh.folders.map((f) => [f.path.replace(/^\/+/, ""), f.id]));
  return toProviderFolder(fresh.folders.find((f) => f.id === created.id) ?? created, byPath);
}

const DEFAULT_TAG_COLOR = "#5C9EF0";

function parseTags(data: unknown): ProviderTag[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((raw: unknown): ProviderTag[] => {
    if (!isRecord(raw)) return [];
    const ref = idText(raw.labelId) ?? "";
    const name = typeof raw.displayName === "string" ? raw.displayName : "";
    if (!ref || !name) return [];
    return [{ ref, name, ...(typeof raw.color === "string" ? { color: raw.color } : {}) }];
  });
}

async function listProviderTags(accessToken: string): Promise<ProviderTag[]> {
  const acc = await loadAccount(accessToken);
  const res = await zohoFetch(accessToken, `/accounts/${acc.accountId}/labels`);
  const data = await res.json();
  return parseTags(data?.data).toSorted((a, b) => a.name.localeCompare(b.name));
}

async function createProviderTag(accessToken: string, name: string): Promise<ProviderTag> {
  const acc = await loadAccount(accessToken);
  const res = await zohoFetch(accessToken, `/accounts/${acc.accountId}/labels`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ displayName: name, color: DEFAULT_TAG_COLOR }),
  });
  const data = await res.json();
  const [created] = parseTags([{ displayName: name, color: DEFAULT_TAG_COLOR, ...data?.data }]);
  if (!created) throw new Error("Zoho did not return the new tag");
  return created;
}

async function setProviderTags(
  accessToken: string,
  ids: string[],
  add: string[],
  remove: string[],
): Promise<void> {
  if (ids.length === 0) return;
  const acc = await loadAccount(accessToken);
  const messageId = ids.map((id) => decodeMessageId(id).messageId);
  for (const [mode, labelId] of [
    ["applyLabel", add],
    ["removeLabel", remove],
  ] as const) {
    if (labelId.length === 0) continue;
    // oxlint-disable-next-line eslint/no-await-in-loop -- add then remove, in order, so a tag in both ends removed
    await zohoFetch(accessToken, `/accounts/${acc.accountId}/updatemessage`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, labelId, messageId, isFolderSpecific: false }),
    });
  }
}
