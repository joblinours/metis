import type { StoredMessage } from "@metis/gateway-contract/router";
import type { AttachmentMeta, Folder } from "@metis/gateway-contract/wire";
import postgres from "postgres";

import { env } from "./env";

export const sql = postgres(env.databaseUrl, {
  connection: { search_path: env.dbSchema },
  onnotice: () => {},
});

export function jsonb(value: Parameters<typeof sql.json>[0]) {
  return sql.json(value);
}

export interface MessageRow {
  id: string;
  thread_id: string;
  to_address: string;
  folder: Folder;
  prev_folder: string | null;
  from_email: string;
  from_name: string | null;
  to_json: string[];
  cc_json: string[];
  bcc_json: string[];
  subject: string;
  snippet: string;
  body_html: string | null;
  body_text: string | null;
  date: Date;
  is_read: boolean;
  is_starred: boolean;
  message_id_header: string | null;
  references_header: string | null;
  in_reply_to: string | null;
  list_unsubscribe: string | null;
  list_unsubscribe_post: string | null;
  attachments_json: AttachmentMeta[];
  raw_key: string | null;
  resend_email_id: string | null;
}

export function toStored(row: MessageRow): StoredMessage {
  return {
    id: row.id,
    threadId: row.thread_id,
    folder: row.folder,
    prevFolder: row.prev_folder,
    fromEmail: row.from_email,
    fromName: row.from_name,
    to: row.to_json,
    cc: row.cc_json,
    bcc: row.bcc_json,
    subject: row.subject,
    snippet: row.snippet,
    bodyHtml: row.body_html,
    bodyText: row.body_text,
    date: row.date.toISOString(),
    isRead: row.is_read,
    isStarred: row.is_starred,
    messageIdHeader: row.message_id_header,
    references: row.references_header,
    listUnsubscribe: row.list_unsubscribe,
    listUnsubscribePost: row.list_unsubscribe_post,
    attachments: row.attachments_json,
    rawKey: row.raw_key,
  };
}
