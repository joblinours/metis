import type { ConnectionAuth, MailProvider } from "@/connections/types";
import { gatewayCredentials, imapCredentials, oauthToken } from "@/connections/types";
import type { AstSearch } from "@/search/types";
import type {
  Attachment,
  DraftPayload,
  Email,
  MailFolder,
  MessagesResponse,
  ProviderFolder,
  ProviderTag,
  UnsubscribeInfo,
} from "@/types/mail";

import type { MessageHeaders } from "./headers";
import { followMoves } from "./moves";
import { gatewayMail, gatewayTarget } from "./providers/gateway-client";
import { gmailMail } from "./providers/gmail";
import { imapMail } from "./providers/imap";
import { microsoftMail } from "./providers/microsoft";
import { zohoMail } from "./providers/zoho";

export interface MailChanges {
  cursor: string;
  ids: string[];
  expired?: boolean;
}

export interface MailAdapter {
  listMessages(folder: MailFolder, pageToken?: string, max?: number): Promise<MessagesResponse>;
  getMessage(id: string): Promise<Partial<Email>>;
  sendMessage(payload: DraftPayload): Promise<{ id: string | null }>;
  deleteMessage(id: string): Promise<string | null>;
  starMessage(id: string, starred: boolean): Promise<void>;
  markRead(id: string, read: boolean): Promise<void>;
  batchMarkRead(ids: string[], read: boolean): Promise<void>;
  search(query: string): Promise<MessagesResponse>;
  searchAst(search: AstSearch<Email>): Promise<MessagesResponse>;
  getRaw(id: string): Promise<string>;
  getThread(threadId: string): Promise<Email[]>;
  listAllInFolder(folder: MailFolder): Promise<string[]>;
  batchDelete(ids: string[]): Promise<Map<string, string>>;
  archiveMessage(id: string): Promise<string>;
  restoreMessage(id: string): Promise<string>;
  createDraft(payload: DraftPayload): Promise<{ id: string }>;
  updateDraft(draftId: string, payload: DraftPayload): Promise<{ id: string }>;
  deleteDraft(draftId: string): Promise<void>;
  getUnsubscribeInfo(id: string): Promise<UnsubscribeInfo | null>;
  getHeaders(id: string, names: string[]): Promise<MessageHeaders>;
  listAttachments(id: string): Promise<Attachment[]>;
  downloadAttachment(
    id: string,
    attachmentId: string,
  ): Promise<{ buffer: Buffer; mimeType?: string } | null>;
  changes?(folder: MailFolder, cursor: string | null): Promise<MailChanges | null>;
  listProviderFolders?(): Promise<ProviderFolder[]>;
  listInProviderFolder?(ref: string, pageToken?: string, max?: number): Promise<MessagesResponse>;
  moveToProviderFolder?(id: string, ref: string): Promise<string>;
  createProviderFolder?(name: string, parentRef?: string): Promise<ProviderFolder>;
  listProviderTags?(): Promise<ProviderTag[]>;
  setProviderTags?(ids: string[], add: string[], remove: string[]): Promise<void>;
  getProviderTags?(id: string): Promise<string[]>;
  draftMessageId?(draftId: string): Promise<string>;
  createProviderTag?(name: string): Promise<ProviderTag>;
  renameProviderTag?(ref: string, name: string): Promise<ProviderTag>;
  deleteProviderTag?(ref: string): Promise<void>;
  renameProviderFolder?(ref: string, name: string): Promise<ProviderFolder>;
  moveProviderFolder?(ref: string, parentRef?: string): Promise<ProviderFolder>;
  deleteProviderFolder?(ref: string): Promise<void>;
}

function credentialEmail(auth: ConnectionAuth): string {
  return auth.kind === "credentials" ? auth.email : "";
}

const gateway = (auth: ConnectionAuth) =>
  gatewayMail(gatewayTarget(gatewayCredentials(auth)), credentialEmail(auth));

const MAIL_ADAPTERS: Record<MailProvider, (auth: ConnectionAuth) => MailAdapter> = {
  google: (auth) => gmailMail(oauthToken(auth)),
  microsoft: (auth) => microsoftMail(oauthToken(auth)),
  zoho: (auth) => zohoMail(oauthToken(auth)),
  imap: (auth) => imapMail(imapCredentials(auth), credentialEmail(auth)),
  cloudflare: gateway,
  resend: gateway,
};

export function getMailAdapter(
  provider: MailProvider,
  auth: ConnectionAuth,
  mailboxId: string,
): MailAdapter {
  return followMoves(MAIL_ADAPTERS[provider](auth), mailboxId);
}
