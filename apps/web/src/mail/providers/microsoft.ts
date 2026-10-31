import { Client, ResponseType } from "@microsoft/microsoft-graph-client";
import type {
  Attachment as GraphAttachment,
  Message,
  Recipient,
} from "@microsoft/microsoft-graph-types";

import { bind } from "@/lib/bind";
import { BadRequestError } from "@/lib/errors/bad-request";
import { isRecord } from "@/lib/guards";
import { mapLimit } from "@/lib/map-limit";
import { errorStatus } from "@/lib/token-map";
import { isPlainTerm, type TagToken, tagKey, tagText } from "@/search/ast";
import {
  compileWith,
  type Dialect,
  planPushdown,
  topLevelValues,
  withoutTopLevel,
} from "@/search/pushdown";
import { type AstSearch, SEARCH_PAGE_SIZE } from "@/search/types";
import {
  type Attachment,
  type DraftAttachment,
  type DraftPayload,
  type Email,
  isMailFolder,
  MAIL_FOLDERS,
  type MailFolder,
  type MessagesResponse,
  type ProviderFolder,
  type ProviderTag,
  type UnsubscribeInfo,
} from "@/types/mail";

import type { MailAdapter, MailChanges } from "../adapter";
import { type MessageHeaders, pickHeaders } from "../headers";

export function microsoftMail(accessToken: string): MailAdapter {
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
      changes,
      listProviderFolders,
      listInProviderFolder,
      moveToProviderFolder,
      createProviderFolder,
      listProviderTags,
      setProviderTags,
      getProviderTags,
      createProviderTag,
      renameProviderTag,
      deleteProviderTag,
      renameProviderFolder,
      moveProviderFolder,
      deleteProviderFolder,
    },
    accessToken,
  );
}

const FOLDER_MAP: Record<MailFolder, string> = {
  inbox: "inbox",
  sent: "sentitems",
  drafts: "drafts",
  starred: "inbox",
  trash: "deleteditems",
  archive: "archive",
  spam: "junkemail",
};

const DELTA_PAGES = 20;

interface DeltaPage {
  value?: { id?: string; "@removed"?: unknown }[];
  "@odata.nextLink"?: string;
  "@odata.deltaLink"?: string;
}

async function changes(
  accessToken: string,
  folder: MailFolder,
  cursor: string | null,
): Promise<MailChanges | null> {
  if (folder === "starred") return null;
  const client = getGraphClient(accessToken);
  let url =
    cursor ??
    `/me/mailFolders/${FOLDER_MAP[folder]}/messages/delta?$select=id&$filter=receivedDateTime ge ${new Date().toISOString()}`;
  const ids: string[] = [];
  try {
    for (let page = 0; page < DELTA_PAGES; page += 1) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- each delta page needs the previous page's link
      const res: DeltaPage = await client.api(url).get();
      if (cursor) {
        for (const item of res.value ?? []) if (item.id && !item["@removed"]) ids.push(item.id);
      }
      const next = res["@odata.nextLink"];
      if (!next) return { cursor: res["@odata.deltaLink"] ?? url, ids };
      url = next;
    }
  } catch (err) {
    if (errorStatus(err) === 410) return { cursor: "", ids: [], expired: true };
    throw err;
  }
  return { cursor: url, ids };
}

interface MessagePage {
  value?: Message[];
  "@odata.nextLink"?: string;
}

function getGraphClient(accessToken: string): Client {
  return Client.init({
    authProvider: (done) => done(null, accessToken),
  });
}

function recipients(list: Recipient[] | undefined | null) {
  return (list ?? [])
    .map((r) => ({
      email: r.emailAddress?.address ?? "",
      name: r.emailAddress?.name || undefined,
    }))
    .filter((r) => r.email);
}

function msMessageToEmail(msg: Message, folder: MailFolder): Email {
  if (!msg.id) throw new Error("Microsoft Graph returned a message without an id");
  const toEntries = recipients(msg.toRecipients);
  const ccEntries = recipients(msg.ccRecipients);

  return {
    id: msg.id,
    threadId: msg.conversationId ?? undefined,
    messageIdHeader: msg.internetMessageId ?? undefined,
    from: msg.from?.emailAddress?.address ?? "",
    fromName: msg.from?.emailAddress?.name ?? "",
    to: toEntries.map((r) => r.email),
    cc: ccEntries.map((r) => r.email),
    toRecipients: toEntries,
    ccRecipients: ccEntries,
    replyTo: recipients(msg.replyTo),
    subject: msg.subject || "(no subject)",
    snippet: msg.bodyPreview ?? "",
    date: msg.receivedDateTime ?? msg.createdDateTime ?? "",
    isRead: msg.isRead ?? false,
    isStarred: msg.flag?.flagStatus === "flagged",
    labels: msg.categories ?? [],
    provider: "microsoft",
    folder,
  };
}

async function listMessages(
  accessToken: string,
  folder: MailFolder,
  skipToken?: string,
  top = 50,
): Promise<MessagesResponse> {
  let request = getGraphClient(accessToken)
    .api(folder === "starred" ? "/me/messages" : `/me/mailFolders/${FOLDER_MAP[folder]}/messages`)
    .top(top)
    .orderby("receivedDateTime desc");

  if (folder === "starred") {
    request = request.filter("flag/flagStatus eq 'flagged'");
  }
  if (skipToken) {
    request = request.query({ $skipToken: skipToken });
  }

  const data: MessagePage = await request.get();
  const emails = (data.value ?? []).map((m) => msMessageToEmail(m, folder));

  const nextLink = data["@odata.nextLink"];
  const nextPageToken = nextLink
    ? (new URL(nextLink).searchParams.get("$skipToken") ?? undefined)
    : undefined;

  return { emails, nextPageToken };
}

async function getMessage(accessToken: string, id: string): Promise<Partial<Email>> {
  const msg: Message = await getGraphClient(accessToken)
    .api(`/me/messages/${id}`)
    .select("id,body,bodyPreview")
    .get();

  return {
    id: msg.id ?? id,
    bodyHtml: msg.body?.contentType === "html" ? (msg.body.content ?? undefined) : undefined,
    bodyText: msg.body?.contentType === "text" ? (msg.body.content ?? undefined) : undefined,
  };
}

function toRecipientList(addresses: string[] | undefined) {
  return (addresses ?? []).map((address) => ({ emailAddress: { address } }));
}

function msMessageBody(payload: DraftPayload) {
  return {
    subject: payload.subject,
    body: { contentType: "HTML", content: payload.bodyHtml },
    toRecipients: toRecipientList(payload.to),
    ccRecipients: toRecipientList(payload.cc),
    bccRecipients: toRecipientList(payload.bcc),
  };
}

const INLINE_ATTACHMENT_BYTES = 3 * 1024 * 1024;
const UPLOAD_CHUNK_BYTES = 320 * 1024 * 12;

async function addDraftAttachment(
  accessToken: string,
  draftId: string,
  attachment: DraftAttachment,
): Promise<void> {
  const client = getGraphClient(accessToken);
  const bytes = Buffer.from(attachment.contentBase64, "base64");
  if (bytes.length < INLINE_ATTACHMENT_BYTES) {
    await client.api(`/me/messages/${draftId}/attachments`).post({
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: attachment.filename,
      contentType: attachment.mimeType,
      contentBytes: attachment.contentBase64,
    });
    return;
  }
  const session: { uploadUrl?: string } = await client
    .api(`/me/messages/${draftId}/attachments/createUploadSession`)
    .post({
      AttachmentItem: {
        attachmentType: "file",
        name: attachment.filename,
        size: bytes.length,
        contentType: attachment.mimeType,
      },
    });
  if (!session.uploadUrl) throw new Error("Microsoft Graph returned no upload URL");
  for (let start = 0; start < bytes.length; start += UPLOAD_CHUNK_BYTES) {
    const chunk = bytes.subarray(start, Math.min(start + UPLOAD_CHUNK_BYTES, bytes.length));
    // oxlint-disable-next-line eslint/no-await-in-loop -- an upload session takes its byte ranges in order
    const res = await fetch(session.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Range": `bytes ${start}-${start + chunk.length - 1}/${bytes.length}`,
      },
      body: new Uint8Array(chunk),
    });
    if (!res.ok) {
      throw new Error(`Outlook refused the attachment upload (${res.status})`);
    }
  }
}

async function addDraftAttachments(
  accessToken: string,
  draftId: string,
  attachments: DraftAttachment[],
): Promise<void> {
  for (const attachment of attachments) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- Graph throttles concurrent writes per mailbox, so attachments are added one at a time
    await addDraftAttachment(accessToken, draftId, attachment);
  }
}

async function createDraft(accessToken: string, payload: DraftPayload): Promise<{ id: string }> {
  const data: Message = await getGraphClient(accessToken)
    .api("/me/messages")
    .post(msMessageBody(payload));

  if (!data.id) throw new Error("Microsoft Graph returned no draft id");
  if (payload.attachments?.length) {
    try {
      await addDraftAttachments(accessToken, data.id, payload.attachments);
    } catch (err) {
      await getGraphClient(accessToken)
        .api(`/me/messages/${data.id}`)
        .delete()
        .catch(() => {});
      throw err;
    }
  }
  return { id: data.id };
}

async function updateDraft(
  accessToken: string,
  draftId: string,
  payload: DraftPayload,
): Promise<{ id: string }> {
  await getGraphClient(accessToken)
    .api(`/me/messages/${draftId}`)
    .patch({
      subject: payload.subject,
      body: { contentType: "HTML", content: payload.bodyHtml },
      toRecipients: toRecipientList(payload.to),
      ccRecipients: toRecipientList(payload.cc),
      bccRecipients: toRecipientList(payload.bcc),
    });
  if (payload.attachments) await replaceDraftAttachments(accessToken, draftId, payload);
  return { id: draftId };
}

async function replaceDraftAttachments(
  accessToken: string,
  draftId: string,
  payload: DraftPayload,
): Promise<void> {
  const client = getGraphClient(accessToken);
  const existing: { value?: { id?: string }[] } = await client
    .api(`/me/messages/${draftId}/attachments`)
    .select("id")
    .get();
  for (const old of existing.value ?? []) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- Graph throttles concurrent writes per mailbox, so attachments are replaced one at a time
    if (old.id) await client.api(`/me/messages/${draftId}/attachments/${old.id}`).delete();
  }
  await addDraftAttachments(accessToken, draftId, payload.attachments ?? []);
}

async function deleteDraft(accessToken: string, draftId: string): Promise<void> {
  await getGraphClient(accessToken).api(`/me/messages/${draftId}`).delete();
}

async function sendMessage(
  accessToken: string,
  payload: DraftPayload,
): Promise<{ id: string | null }> {
  if (payload.attachments?.length) {
    const { id } = await createDraft(accessToken, payload);
    await getGraphClient(accessToken).api(`/me/messages/${id}/send`).post({});
    return { id: null };
  }
  await getGraphClient(accessToken)
    .api("/me/sendMail")
    .post({ message: msMessageBody(payload) });
  return { id: null };
}

async function getThread(accessToken: string, conversationId: string): Promise<Email[]> {
  const data: MessagePage = await getGraphClient(accessToken)
    .api("/me/messages")
    .filter(`conversationId eq '${conversationId}'`)
    .orderby("receivedDateTime asc")
    .top(50)
    .get();

  return (data.value ?? []).map((m) => msMessageToEmail(m, "inbox"));
}

async function getHeaders(
  accessToken: string,
  id: string,
  names: string[],
): Promise<MessageHeaders> {
  const msg: Message = await getGraphClient(accessToken)
    .api(`/me/messages/${id}`)
    .select("internetMessageHeaders")
    .get();
  return pickHeaders(msg.internetMessageHeaders ?? [], names);
}

async function getUnsubscribeInfo(
  accessToken: string,
  id: string,
): Promise<UnsubscribeInfo | null> {
  const msg: Message = await getGraphClient(accessToken)
    .api(`/me/messages/${id}`)
    .select("internetMessageHeaders")
    .get();

  const headers = msg.internetMessageHeaders ?? [];
  const find = (name: string) =>
    headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? undefined;

  const listUnsubscribe = find("List-Unsubscribe");
  if (!listUnsubscribe) return null;
  return {
    listUnsubscribe,
    listUnsubscribePost: find("List-Unsubscribe-Post"),
  };
}

async function getRaw(accessToken: string, id: string): Promise<string> {
  const mime: string = await getGraphClient(accessToken)
    .api(`/me/messages/${id}/$value`)
    .responseType(ResponseType.TEXT)
    .get();

  return Buffer.from(mime, "utf-8").toString("base64");
}

async function move(accessToken: string, id: string, destinationId: string): Promise<string> {
  const moved: { id?: string } = await getGraphClient(accessToken)
    .api(`/me/messages/${id}/move`)
    .post({ destinationId });
  return moved.id ?? id;
}

async function deleteMessage(accessToken: string, id: string): Promise<string> {
  return move(accessToken, id, "deleteditems");
}

async function restoreMessage(accessToken: string, id: string): Promise<string> {
  return move(accessToken, id, "inbox");
}

async function archiveMessage(accessToken: string, id: string): Promise<string> {
  return move(accessToken, id, "archive");
}

async function starMessage(accessToken: string, id: string, starred: boolean): Promise<void> {
  await getGraphClient(accessToken)
    .api(`/me/messages/${id}`)
    .patch({ flag: { flagStatus: starred ? "flagged" : "notFlagged" } });
}

async function markRead(accessToken: string, id: string, read: boolean): Promise<void> {
  await getGraphClient(accessToken).api(`/me/messages/${id}`).patch({ isRead: read });
}

function kqlValue(text: string): string {
  return /[\s:()"]/.test(text) ? `"${text.replaceAll('"', "")}"` : text;
}

const KQL_TEXT_KEYS: Record<string, string> = {
  from: "from",
  to: "to",
  cc: "cc",
  subject: "subject",
  filename: "attachment",
};

const kqlDialect: Dialect<string> = {
  leaf(tag: TagToken) {
    if (!isPlainTerm(tag)) return null;
    const key = tagKey(tag);
    const text = tagText(tag) ?? "";
    if (key === null) return { native: kqlValue(text), exact: true };
    const property = KQL_TEXT_KEYS[key];
    if (property) return { native: `${property}:${kqlValue(text)}`, exact: true };
    if (key === "has" && text.toLowerCase() === "attachment") {
      return { native: "hasAttachments:true", exact: true };
    }
    return null;
  },
  and: (parts) => parts.join(" AND "),
  or: (parts) => `(${parts.join(" OR ")})`,
  not: (part) => (/\s/.test(part) ? `NOT (${part})` : `NOT ${part}`),
};

async function searchAst(
  accessToken: string,
  astSearch: AstSearch<Email>,
): Promise<MessagesResponse> {
  const folder = endpointFolder(astSearch.query);
  const query = folder ? withoutTopLevel(astSearch.query, "mail-folder") : astSearch.query;
  const plan = planPushdown(query, compileWith(kqlDialect));

  if (plan.native.length === 0) {
    const page = await listMessages(
      accessToken,
      folder ?? "inbox",
      astSearch.cursor,
      SEARCH_PAGE_SIZE,
    );
    return {
      emails: await astSearch.accept(plan.residual, page.emails),
      nextPageToken: page.nextPageToken,
    };
  }

  const kql = plan.native.join(" AND ").replaceAll('"', '\\"');
  const client = getGraphClient(accessToken);
  const request = astSearch.cursor?.startsWith("https://graph.microsoft.com/")
    ? client.api(astSearch.cursor)
    : client
        .api(folder ? `/me/mailFolders/${FOLDER_MAP[folder]}/messages` : "/me/messages")
        .search(`"${kql}"`)
        .top(SEARCH_PAGE_SIZE);
  const data: MessagePage = await request.get();
  const emails = (data.value ?? []).map((m) => msMessageToEmail(m, folder ?? "inbox"));
  return {
    emails: await astSearch.accept(plan.residual, emails),
    nextPageToken: data["@odata.nextLink"],
  };
}

function endpointFolder(query: AstSearch<Email>["query"]): MailFolder | null {
  const [value] = topLevelValues(query, "mail-folder");
  const folder = value?.toLowerCase() ?? "";
  if (folder === "starred") return null;
  return isMailFolder(folder) ? folder : null;
}

async function search(accessToken: string, query: string, top = 20): Promise<MessagesResponse> {
  const data: MessagePage = await getGraphClient(accessToken)
    .api("/me/messages")
    .search(`"${query.replaceAll('"', '\\"')}"`)
    .top(top)
    .get();

  return {
    emails: (data.value ?? []).map((m) => msMessageToEmail(m, "inbox")),
  };
}

async function listAllInFolder(accessToken: string, folder: MailFolder): Promise<string[]> {
  const client = getGraphClient(accessToken);
  const ids: string[] = [];

  let page: MessagePage = await client
    .api(`/me/mailFolders/${FOLDER_MAP[folder]}/messages`)
    .select("id")
    .top(500)
    .get();

  while (true) {
    for (const message of page.value ?? []) {
      if (message.id) ids.push(message.id);
    }
    const next = page["@odata.nextLink"];
    if (!next) break;
    // oxlint-disable-next-line eslint/no-await-in-loop -- each page comes from the previous page's nextLink
    page = await client.api(next).get();
  }

  return ids;
}

interface GraphBatchResponse {
  responses?: { id: string; status: number; body?: unknown }[];
}

async function batchMarkRead(accessToken: string, ids: string[], read: boolean): Promise<void> {
  const client = getGraphClient(accessToken);
  for (let i = 0; i < ids.length; i += 20) {
    const chunk = ids.slice(i, i + 20);
    const requests = chunk.map((id, idx) => ({
      id: String(idx + 1),
      method: "PATCH",
      url: `/me/messages/${id}`,
      headers: { "Content-Type": "application/json" },
      body: { isRead: read },
    }));
    // oxlint-disable-next-line eslint/no-await-in-loop -- $batch requests of Graph's 20-request maximum run in order and stop at the first failure
    const data: GraphBatchResponse = await client.api("/$batch").post({ requests });
    const failed = (data.responses ?? []).filter((r) => r.status >= 400);
    if (failed.length > 0) {
      throw new Error(
        `Microsoft Graph error: failed to mark ${failed.length} of ${chunk.length} message(s) (${failed.map((r) => r.status).join(", ")})`,
      );
    }
  }
}

async function batchDelete(accessToken: string, ids: string[]): Promise<Map<string, string>> {
  const client = getGraphClient(accessToken);
  const movedIds = new Map<string, string>();

  for (let i = 0; i < ids.length; i += 20) {
    const chunk = ids.slice(i, i + 20);
    const requests = chunk.map((id, idx) => ({
      id: String(idx + 1),
      method: "POST",
      url: `/me/messages/${id}/move`,
      headers: { "Content-Type": "application/json" },
      body: { destinationId: "deleteditems" },
    }));

    // oxlint-disable-next-line eslint/no-await-in-loop -- $batch requests of Graph's 20-request maximum run in order and stop at the first failure
    const data: GraphBatchResponse = await client.api("/$batch").post({ requests });

    const failed = (data.responses ?? []).filter((r) => r.status >= 400);
    if (failed.length > 0) {
      throw new Error(
        `Microsoft Graph error: failed to delete ${failed.length} of ${chunk.length} message(s) (${failed.map((r) => r.status).join(", ")})`,
      );
    }
    for (const response of data.responses ?? []) {
      const from = chunk[Number(response.id) - 1];
      const body = response.body;
      const to =
        typeof body === "object" && body !== null && "id" in body && typeof body.id === "string"
          ? body.id
          : undefined;
      if (from && to && to !== from) movedIds.set(from, to);
    }
  }
  return movedIds;
}

async function listAttachments(accessToken: string, id: string): Promise<Attachment[]> {
  const data: { value?: GraphAttachment[] } = await getGraphClient(accessToken)
    .api(`/me/messages/${id}/attachments`)
    .select("id,name,contentType,size")
    .get();
  return (data.value ?? []).map((a) => ({
    id: a.id ?? "",
    filename: a.name ?? "attachment",
    mimeType: a.contentType ?? "application/octet-stream",
    size: a.size ?? 0,
  }));
}

async function downloadAttachment(
  accessToken: string,
  messageId: string,
  attachmentId: string,
): Promise<{ buffer: Buffer; mimeType?: string }> {
  const bytes: ArrayBuffer = await getGraphClient(accessToken)
    .api(`/me/messages/${messageId}/attachments/${attachmentId}/$value`)
    .responseType(ResponseType.ARRAYBUFFER)
    .get();
  return { buffer: Buffer.from(bytes) };
}

const WELL_KNOWN_FOLDERS = [
  "inbox",
  "sentitems",
  "drafts",
  "deleteditems",
  "archive",
  "junkemail",
  "outbox",
  "conversationhistory",
  "searchfolders",
  "syncissues",
];
const FOLDER_SELECT = "id,displayName,parentFolderId,childFolderCount,unreadItemCount";
const FOLDER_DEPTH = 6;

interface GraphFolder {
  id?: string;
  displayName?: string;
  parentFolderId?: string;
  childFolderCount?: number;
  unreadItemCount?: number;
}

async function wellKnownFolderIds(client: Client): Promise<Map<string, MailFolder | null>> {
  const requests = WELL_KNOWN_FOLDERS.map((name, idx) => ({
    id: String(idx + 1),
    method: "GET",
    url: `/me/mailFolders/${name}?$select=id`,
  }));
  const data: GraphBatchResponse = await client.api("/$batch").post({ requests });
  const standard = new Map<string, MailFolder | null>();
  for (const response of data.responses ?? []) {
    const name = WELL_KNOWN_FOLDERS[Number(response.id) - 1];
    const body = response.body;
    if (!name || response.status >= 400 || !isRecord(body) || typeof body.id !== "string") continue;
    const folder = MAIL_FOLDERS.find((f) => FOLDER_MAP[f] === name && f !== "starred");
    standard.set(body.id, folder ?? null);
  }
  return standard;
}

async function listFolderLevel(client: Client, url: string): Promise<GraphFolder[]> {
  const out: GraphFolder[] = [];
  let next: string | undefined = url;
  while (next) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- each page needs the previous page's link
    const page: { value?: GraphFolder[]; "@odata.nextLink"?: string } = await client
      .api(next)
      .get();
    out.push(...(page.value ?? []));
    next = page["@odata.nextLink"];
  }
  return out;
}

async function allFolders(client: Client): Promise<GraphFolder[]> {
  const all: GraphFolder[] = [];
  let level = await listFolderLevel(client, `/me/mailFolders?$top=250&$select=${FOLDER_SELECT}`);
  for (let depth = 0; depth < FOLDER_DEPTH && level.length > 0; depth += 1) {
    all.push(...level);
    const parents = level.filter((f) => f.id && (f.childFolderCount ?? 0) > 0);
    // oxlint-disable-next-line eslint/no-await-in-loop -- each level needs the ids of the one above it
    const settled = await mapLimit(parents, 4, (f) =>
      listFolderLevel(
        client,
        `/me/mailFolders/${f.id}/childFolders?$top=250&$select=${FOLDER_SELECT}`,
      ),
    );
    level = settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  }
  return all;
}

async function listProviderFolders(accessToken: string): Promise<ProviderFolder[]> {
  const client = getGraphClient(accessToken);
  const [folders, standard] = await Promise.all([allFolders(client), wellKnownFolderIds(client)]);
  const byId = new Map(folders.flatMap((f) => (f.id ? [[f.id, f] as const] : [])));
  const pathOf = (folder: GraphFolder, seen = 0): string => {
    const parent = folder.parentFolderId ? byId.get(folder.parentFolderId) : undefined;
    const name = folder.displayName ?? "";
    return parent && seen < FOLDER_DEPTH ? `${pathOf(parent, seen + 1)}/${name}` : name;
  };
  return folders
    .filter((f) => f.id && f.displayName && !standard.has(f.id))
    .map((f) => {
      const parentRef =
        f.parentFolderId && byId.has(f.parentFolderId) ? f.parentFolderId : undefined;
      return {
        // oxlint-disable-next-line typescript/no-non-null-assertion -- filtered to folders with an id
        ref: f.id!,
        name: f.displayName ?? "",
        path: pathOf(f),
        ...(parentRef ? { parentRef } : {}),
        kind: "folder" as const,
        ...(f.unreadItemCount === undefined ? {} : { unread: f.unreadItemCount }),
      };
    })
    .toSorted((a, b) => a.path.localeCompare(b.path));
}

async function listInProviderFolder(
  accessToken: string,
  ref: string,
  skipToken?: string,
  top = 50,
): Promise<MessagesResponse> {
  let request = getGraphClient(accessToken)
    .api(`/me/mailFolders/${encodeURIComponent(ref)}/messages`)
    .top(top)
    .orderby("receivedDateTime desc");
  if (skipToken) request = request.query({ $skipToken: skipToken });
  const data: MessagePage = await request.get();
  const nextLink = data["@odata.nextLink"];
  return {
    emails: (data.value ?? []).map((m) => msMessageToEmail(m, "archive")),
    nextPageToken: nextLink
      ? (new URL(nextLink).searchParams.get("$skipToken") ?? undefined)
      : undefined,
  };
}

async function moveToProviderFolder(accessToken: string, id: string, ref: string): Promise<string> {
  return move(accessToken, id, ref);
}

async function createProviderFolder(
  accessToken: string,
  name: string,
  parentRef?: string,
): Promise<ProviderFolder> {
  const client = getGraphClient(accessToken);
  const url = parentRef
    ? `/me/mailFolders/${encodeURIComponent(parentRef)}/childFolders`
    : "/me/mailFolders";
  const created: GraphFolder = await client.api(url).post({ displayName: name });
  if (!created.id) throw new Error("Microsoft Graph did not return the new folder");
  const parentPath = parentRef
    ? (await listProviderFolders(accessToken)).find((f) => f.ref === parentRef)?.path
    : undefined;
  return {
    ref: created.id,
    name,
    path: parentPath ? `${parentPath}/${name}` : name,
    ...(parentRef ? { parentRef } : {}),
    kind: "folder",
  };
}

const CATEGORY_COLORS: Record<string, string> = {
  preset0: "#e74c3c",
  preset1: "#e67e22",
  preset2: "#a0522d",
  preset3: "#f1c40f",
  preset4: "#2ecc71",
  preset5: "#1abc9c",
  preset6: "#7f8c3d",
  preset7: "#3498db",
  preset8: "#9b59b6",
  preset9: "#c0392b",
};

async function listProviderTags(accessToken: string): Promise<ProviderTag[]> {
  const data: { value?: { displayName?: string; color?: string }[] } = await getGraphClient(
    accessToken,
  )
    .api("/me/outlook/masterCategories")
    .get();
  return (data.value ?? [])
    .flatMap((c) => {
      if (!c.displayName) return [];
      const color = c.color ? CATEGORY_COLORS[c.color] : undefined;
      return [{ ref: c.displayName, name: c.displayName, ...(color ? { color } : {}) }];
    })
    .toSorted((a, b) => a.name.localeCompare(b.name));
}

async function createProviderTag(accessToken: string, name: string): Promise<ProviderTag> {
  await getGraphClient(accessToken)
    .api("/me/outlook/masterCategories")
    .post({ displayName: name, color: "preset7" });
  return { ref: name, name, color: CATEGORY_COLORS.preset7 };
}

async function setProviderTags(
  accessToken: string,
  ids: string[],
  add: string[],
  remove: string[],
): Promise<void> {
  if (add.length === 0 && remove.length === 0) return;
  const client = getGraphClient(accessToken);
  const dropped = new Set(remove);
  for (let i = 0; i < ids.length; i += 20) {
    const chunk = ids.slice(i, i + 20);
    // oxlint-disable-next-line eslint/no-await-in-loop -- $batch requests of Graph's 20-request maximum run in order and stop at the first failure
    const read: GraphBatchResponse = await client.api("/$batch").post({
      requests: chunk.map((id, idx) => ({
        id: String(idx + 1),
        method: "GET",
        url: `/me/messages/${id}?$select=categories`,
      })),
    });
    const requests = (read.responses ?? []).flatMap((response) => {
      const id = chunk[Number(response.id) - 1];
      const body = response.body;
      if (!id || response.status >= 400 || !isRecord(body)) return [];
      const current = Array.isArray(body.categories) ? body.categories.map(String) : [];
      const categories = [...new Set([...current.filter((c) => !dropped.has(c)), ...add])];
      return [
        {
          id: response.id,
          method: "PATCH",
          url: `/me/messages/${id}`,
          headers: { "Content-Type": "application/json" },
          body: { categories },
        },
      ];
    });
    if (requests.length < chunk.length) {
      throw new Error(
        `Microsoft Graph error: could not read ${chunk.length - requests.length} message(s)`,
      );
    }
    // oxlint-disable-next-line eslint/no-await-in-loop -- the PATCHes of a chunk follow its reads
    const data: GraphBatchResponse = await client.api("/$batch").post({ requests });
    const failed = (data.responses ?? []).filter((r) => r.status >= 400);
    if (failed.length > 0) {
      throw new Error(
        `Microsoft Graph error: failed to update ${failed.length} of ${chunk.length} message(s) (${failed.map((r) => r.status).join(", ")})`,
      );
    }
  }
}

async function freshFolder(accessToken: string, ref: string): Promise<ProviderFolder> {
  const folder = (await listProviderFolders(accessToken)).find((f) => f.ref === ref);
  if (!folder) throw new Error(`Outlook folder "${ref}" is gone`);
  return folder;
}

async function renameProviderFolder(
  accessToken: string,
  ref: string,
  name: string,
): Promise<ProviderFolder> {
  await getGraphClient(accessToken)
    .api(`/me/mailFolders/${encodeURIComponent(ref)}`)
    .patch({ displayName: name });
  return freshFolder(accessToken, ref);
}

async function moveProviderFolder(
  accessToken: string,
  ref: string,
  parentRef?: string,
): Promise<ProviderFolder> {
  if (parentRef === ref) throw new Error("A folder cannot move inside itself");
  const moved: GraphFolder = await getGraphClient(accessToken)
    .api(`/me/mailFolders/${encodeURIComponent(ref)}/move`)
    .post({ destinationId: parentRef ?? "msgfolderroot" });
  return freshFolder(accessToken, moved.id ?? ref);
}

async function deleteProviderFolder(accessToken: string, ref: string): Promise<void> {
  await getGraphClient(accessToken)
    .api(`/me/mailFolders/${encodeURIComponent(ref)}`)
    .delete();
}

async function masterCategoryId(accessToken: string, name: string): Promise<string> {
  const data: { value?: { id?: string; displayName?: string }[] } = await getGraphClient(
    accessToken,
  )
    .api("/me/outlook/masterCategories")
    .get();
  const found = (data.value ?? []).find((c) => c.displayName === name);
  if (!found?.id) {
    throw new Error(
      `Unknown Outlook category "${name}". These are all of them: ${(data.value ?? []).map((c) => c.displayName).join(", ")}`,
    );
  }
  return found.id;
}

async function renameProviderTag(): Promise<ProviderTag> {
  throw new BadRequestError("Outlook does not allow renaming a category: create a new one instead");
}

async function deleteProviderTag(accessToken: string, ref: string): Promise<void> {
  const id = await masterCategoryId(accessToken, ref);
  await getGraphClient(accessToken).api(`/me/outlook/masterCategories/${id}`).delete();
}

async function getProviderTags(accessToken: string, id: string): Promise<string[]> {
  const msg: Message = await getGraphClient(accessToken)
    .api(`/me/messages/${id}`)
    .select("categories")
    .get();
  return msg.categories ?? [];
}
