import {
  error,
  type Gateway,
  GatewaySendError,
  type GatewayStore,
  handleRequest as handleGatewayRequest,
  json,
} from "@metis/gateway-contract/router";
import { SEARCH_LIMIT } from "@metis/gateway-contract/wire";
import { z } from "zod";

import { blobs, deleteBlobs } from "./blob";
import { jsonb, type MessageRow, sql, toStored } from "./db";
import { env } from "./env";
import { ingestReceived } from "./ingest";
import { ResendError, sendEmail } from "./resend";
import { verifyWebhook } from "./webhook";

const TAG = "metis-resend";

const webhookEventSchema = z.object({
  type: z.string().optional(),
  data: z.object({ email_id: z.string().optional() }).optional(),
});

function folderFilter(address: string, folder: string) {
  if (folder === "starred") {
    return sql`to_address = ${address} AND is_starred = true
      AND folder NOT IN ('trash', 'spam', 'drafts')`;
  }
  return sql`to_address = ${address} AND folder = ${folder}`;
}

const store: GatewayStore = {
  async tokenAddress(tokenHash) {
    const rows = await sql<{ address: string }[]>`
      SELECT address FROM tokens WHERE token_hash = ${tokenHash}
    `;
    return rows[0]?.address ?? null;
  },

  async listTokens() {
    const rows = await sql<{ address: string; created_at: Date }[]>`
      SELECT address, created_at FROM tokens ORDER BY address
    `;
    return rows.map((row) => ({
      address: row.address,
      created_at: row.created_at.toISOString(),
    }));
  },

  async saveToken(address, tokenHash) {
    await sql`
      INSERT INTO tokens (address, token_hash)
      VALUES (${address}, ${tokenHash})
      ON CONFLICT (address) DO UPDATE SET token_hash = excluded.token_hash
    `;
  },

  async revokeToken(address) {
    await sql`DELETE FROM tokens WHERE address = ${address}`;
  },

  async getMessage(address, id) {
    const rows = await sql<MessageRow[]>`
      SELECT * FROM messages WHERE id = ${id} AND to_address = ${address}
    `;
    const row = rows[0];
    return row ? toStored(row) : null;
  },

  async listMessages(address, { folder, limit, after }) {
    const keyset = after
      ? sql`AND (date < ${after.date} OR (date = ${after.date} AND id < ${after.id}))`
      : sql``;
    const [rows, count] = await Promise.all([
      sql<MessageRow[]>`
        SELECT * FROM messages WHERE ${folderFilter(address, folder)} ${keyset}
        ORDER BY date DESC, id DESC LIMIT ${limit}
      `,
      sql<{ total: string }[]>`
        SELECT COUNT(*) AS total FROM messages
        WHERE ${folderFilter(address, folder)}
      `,
    ]);
    return {
      messages: rows.map(toStored),
      total: Number(count[0]?.total ?? rows.length),
    };
  },

  async searchMessages(address, pattern) {
    const rows = await sql<MessageRow[]>`
      SELECT * FROM messages
      WHERE to_address = ${address} AND folder NOT IN ('trash', 'spam', 'drafts')
        AND (
          subject ILIKE ${pattern} OR from_email ILIKE ${pattern}
          OR from_name ILIKE ${pattern} OR snippet ILIKE ${pattern}
          OR body_text ILIKE ${pattern}
        )
      ORDER BY date DESC LIMIT ${SEARCH_LIMIT}
    `;
    return rows.map(toStored);
  },

  async folderIds(address, folder, limit) {
    const rows = await sql<{ id: string }[]>`
      SELECT id FROM messages WHERE ${folderFilter(address, folder)}
      ORDER BY date DESC LIMIT ${limit}
    `;
    return rows.map((row) => row.id);
  },

  async thread(address, threadId) {
    const rows = await sql<MessageRow[]>`
      SELECT * FROM messages
      WHERE to_address = ${address}
        AND thread_id = ${threadId}
        AND folder != 'trash'
      ORDER BY date ASC
    `;
    return rows.map(toStored);
  },

  async outgoingAttachments(address, id) {
    const rows = await sql<Pick<MessageRow, "attachments_json">[]>`
      SELECT attachments_json FROM messages
      WHERE id = ${id} AND to_address = ${address}
    `;
    return rows[0]?.attachments_json ?? null;
  },

  async upsertOutgoing(record) {
    await sql`
      INSERT INTO messages (
        id, thread_id, to_address, folder, from_email, to_json, cc_json,
        bcc_json, subject, snippet, body_html, body_text, date, is_read,
        is_starred, references_header, in_reply_to, attachments_json
      ) VALUES (
        ${record.id}, ${record.threadId}, ${record.address}, ${record.folder},
        ${record.fromEmail}, ${jsonb(record.to)},
        ${jsonb(record.cc)}, ${jsonb(record.bcc)},
        ${record.subject}, ${record.snippet},
        ${record.bodyHtml}, ${record.bodyText}, ${record.date}, true,
        false, ${record.references}, ${record.inReplyTo},
        ${jsonb(record.attachments)}
      )
      ON CONFLICT (id) DO UPDATE SET
        folder = excluded.folder, from_email = excluded.from_email,
        to_json = excluded.to_json, cc_json = excluded.cc_json,
        bcc_json = excluded.bcc_json, subject = excluded.subject,
        snippet = excluded.snippet, body_html = excluded.body_html,
        body_text = excluded.body_text, date = excluded.date,
        references_header = excluded.references_header,
        in_reply_to = excluded.in_reply_to,
        thread_id = excluded.thread_id,
        attachments_json = excluded.attachments_json
    `;
  },

  async setRead(address, ids, read) {
    await sql`
      UPDATE messages SET is_read = ${read}
      WHERE to_address = ${address} AND id = ANY(${ids})
    `;
  },

  async setFlags(id, { isRead, isStarred }) {
    if (isStarred !== undefined) {
      await sql`UPDATE messages SET is_starred = ${isStarred} WHERE id = ${id}`;
    }
    if (isRead !== undefined) {
      await sql`UPDATE messages SET is_read = ${isRead} WHERE id = ${id}`;
    }
  },

  async purgeTargets(address, ids) {
    const rows = await sql<Pick<MessageRow, "id" | "folder" | "raw_key" | "attachments_json">[]>`
      SELECT id, folder, raw_key, attachments_json FROM messages
      WHERE to_address = ${address} AND id = ANY(${ids})
    `;
    return rows.map((row) => ({
      id: row.id,
      folder: row.folder,
      rawKey: row.raw_key,
      attachments: row.attachments_json,
    }));
  },

  async moveToTrash(address, ids) {
    await sql`
      UPDATE messages SET prev_folder = folder, folder = 'trash'
      WHERE to_address = ${address} AND id = ANY(${ids})
    `;
  },

  async archive(id) {
    await sql`
      UPDATE messages SET prev_folder = folder, folder = 'archive'
      WHERE id = ${id}
    `;
  },

  async restore(id, folder) {
    await sql`
      UPDATE messages SET folder = ${folder}, prev_folder = NULL
      WHERE id = ${id}
    `;
  },

  async deleteMessages(ids) {
    await sql`DELETE FROM messages WHERE id = ANY(${ids})`;
  },

  async putBlob(key, bytes, contentType) {
    await blobs.put(key, bytes, contentType);
  },

  async getBlob(key) {
    const object = await blobs.get(key);
    return object ? object.bytes : null;
  },

  async deleteBlobs(keys) {
    await deleteBlobs(keys);
  },
};

const gateway: Gateway = {
  tag: TAG,
  domain: env.mailDomain,
  apiToken: env.apiToken,
  health: { backend: "resend" },
  store,
  async send(mail) {
    try {
      await sendEmail({
        from: mail.from,
        to: mail.to,
        ...(mail.cc ? { cc: mail.cc } : {}),
        ...(mail.bcc ? { bcc: mail.bcc } : {}),
        subject: mail.subject,
        ...(mail.html ? { html: mail.html } : {}),
        ...(mail.text ? { text: mail.text } : {}),
        ...(mail.headers ? { headers: mail.headers } : {}),
        ...(mail.attachments
          ? {
              attachments: mail.attachments.map((attachment) => ({
                filename: attachment.filename,
                content: attachment.contentBase64,
                content_type: attachment.mimeType,
              })),
            }
          : {}),
      });
    } catch (err) {
      if (err instanceof ResendError) throw new GatewaySendError(err.message);
      throw err;
    }
    return { messageIdHeader: null };
  },
};

async function handleWebhook(request: Request): Promise<Response> {
  if (!env.webhookSecret) {
    return error("Inbound webhooks are not configured on this gateway", 503);
  }
  const body = await request.text();
  if (
    !verifyWebhook({
      secret: env.webhookSecret,
      body,
      headers: request.headers,
    })
  ) {
    return error("Invalid webhook signature", 401);
  }

  const event = webhookEventSchema.safeParse(JSON.parse(body)).data;
  if (event?.type !== "email.received") return json({ ok: true });

  const emailId = event.data?.email_id;
  if (!emailId) return error("Missing email_id", 400);

  const outcome = await ingestReceived(emailId);
  return json({ ok: true, outcome });
}

export async function handleRequest(request: Request): Promise<Response> {
  const path = new URL(request.url).pathname.replace(/\/+$/, "");
  if (request.method === "POST" && path === "/webhooks/resend") {
    try {
      return await handleWebhook(request);
    } catch (err) {
      console.error(`[${TAG}]`, err);
      const detail = err instanceof Error ? err.message : "Internal error";
      return error(detail, 500);
    }
  }
  return handleGatewayRequest(request, gateway);
}
