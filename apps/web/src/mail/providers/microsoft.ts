import { Client, ResponseType } from "@microsoft/microsoft-graph-client";
import type {
  Attachment as GraphAttachment,
  Message,
  Recipient,
} from "@microsoft/microsoft-graph-types";

import { bind } from "@/lib/bind";
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
  type DraftPayload,
  type Email,
  isMailFolder,
  type MailFolder,
  type MessagesResponse,
  type UnsubscribeInfo,
} from "@/types/mail";

import type { MailAdapter } from "../adapter";
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
      batchMarkRead: async (token, ids, read) => {
        // oxlint-disable-next-line eslint/no-await-in-loop -- Graph throttles concurrent requests per mailbox, so large selections go one at a time
        for (const id of ids) await markRead(token, id, read);
      },
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
  const attachments = (payload.attachments ?? []).map((a) => ({
    "@odata.type": "#microsoft.graph.fileAttachment",
    name: a.filename,
    contentType: a.mimeType,
    contentBytes: a.contentBase64,
  }));

  return {
    subject: payload.subject,
    body: { contentType: "HTML", content: payload.bodyHtml },
    toRecipients: toRecipientList(payload.to),
    ccRecipients: toRecipientList(payload.cc),
    bccRecipients: toRecipientList(payload.bcc),
    ...(attachments.length > 0 ? { attachments } : {}),
  };
}

async function createDraft(accessToken: string, payload: DraftPayload): Promise<{ id: string }> {
  const data: Message = await getGraphClient(accessToken)
    .api("/me/messages")
    .post(msMessageBody(payload));

  if (!data.id) throw new Error("Microsoft Graph returned no draft id");
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
  return { id: draftId };
}

async function deleteDraft(accessToken: string, draftId: string): Promise<void> {
  await getGraphClient(accessToken).api(`/me/messages/${draftId}`).delete();
}

async function sendMessage(
  accessToken: string,
  payload: DraftPayload,
): Promise<{ id: string | null }> {
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
