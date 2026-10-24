import { z } from "zod";

import { env } from "./env";

const BASE = "https://api.resend.com";

const receivedAttachmentSchema = z.object({
  id: z.string(),
  filename: z.string(),
  content_type: z.string(),
  content_disposition: z.string().nullable(),
  content_id: z.string().nullable(),
  size: z.number(),
});

const receivedEmailSchema = z.object({
  id: z.string(),
  to: z.array(z.string()),
  from: z.string(),
  cc: z.array(z.string()),
  bcc: z.array(z.string()),
  reply_to: z.array(z.string()),
  received_for: z.array(z.string()),
  subject: z.string(),
  created_at: z.string(),
  message_id: z.string().nullable(),
  html: z.string().nullable(),
  text: z.string().nullable(),
  headers: z.record(z.string(), z.string()),
  raw: z.object({ download_url: z.string(), expires_at: z.string() }).nullable(),
  attachments: z.array(receivedAttachmentSchema),
});
export type ReceivedEmail = z.infer<typeof receivedEmailSchema>;

export interface SendPayload {
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html?: string;
  text?: string;
  headers?: Record<string, string>;
  attachments?: { filename: string; content: string; content_type?: string }[];
}

const errorBodySchema = z.object({
  message: z.string().optional(),
  error: z.string().optional(),
});

async function call<T>(path: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  const headers = new Headers({
    Authorization: `Bearer ${env.resendApiKey}`,
    "User-Agent": "metis-resend-gateway",
    ...(init?.body ? { "Content-Type": "application/json" } : {}),
  });
  for (const [name, value] of new Headers(init?.headers)) {
    headers.set(name, value);
  }
  const res = await fetch(`${BASE}${path}`, { ...init, headers });

  if (!res.ok) {
    let detail = "";
    try {
      const body = errorBodySchema.safeParse(await res.json()).data;
      detail = body?.message ?? body?.error ?? "";
    } catch {}
    throw new ResendError(
      `Resend responded ${res.status}${detail ? `: ${detail}` : ""}`,
      res.status,
    );
  }

  return schema.parse(await res.json());
}

export class ResendError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function getReceived(id: string): Promise<ReceivedEmail> {
  return call(`/emails/receiving/${encodeURIComponent(id)}?html_format=cid`, receivedEmailSchema);
}

export function listReceived(args: {
  limit: number;
  after?: string;
}): Promise<{ data: { id: string }[]; has_more: boolean }> {
  const params = new URLSearchParams({ limit: String(args.limit) });
  if (args.after) params.set("after", args.after);
  return call(
    `/emails/receiving?${params.toString()}`,
    z.object({
      data: z.array(z.object({ id: z.string() })),
      has_more: z.boolean(),
    }),
  );
}

export function getReceivedAttachment(
  emailId: string,
  attachmentId: string,
): Promise<z.infer<typeof receivedAttachmentSchema> & { download_url: string }> {
  return call(
    `/emails/receiving/${encodeURIComponent(emailId)}/attachments/${encodeURIComponent(attachmentId)}`,
    receivedAttachmentSchema.extend({ download_url: z.string() }),
  );
}

export async function download(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new ResendError(`download URL responded ${res.status}`, res.status);
  }
  return new Uint8Array(await res.arrayBuffer());
}

export function sendEmail(payload: SendPayload, idempotencyKey?: string): Promise<{ id: string }> {
  return call("/emails", z.object({ id: z.string() }), {
    method: "POST",
    body: JSON.stringify(payload),
    headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {},
  });
}

const domainSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  records: z
    .array(
      z.object({
        record: z.string(),
        name: z.string(),
        type: z.string(),
        value: z.string(),
        priority: z.number().optional(),
        status: z.string(),
      }),
    )
    .optional(),
  capabilities: z
    .object({
      sending: z.string().optional(),
      receiving: z.string().optional(),
    })
    .optional(),
});
export type Domain = z.infer<typeof domainSchema>;

export function listDomains(): Promise<{ data: Domain[] }> {
  return call("/domains", z.object({ data: z.array(domainSchema) }));
}

export function getDomain(id: string): Promise<Domain> {
  return call(`/domains/${encodeURIComponent(id)}`, domainSchema);
}
