import "server-only";
import sharp, { type Sharp } from "sharp";
import { extractImages, extractText, getDocumentProxy } from "unpdf";
import { z } from "zod";

import { BadRequestError } from "@/lib/errors/bad-request";
import { looksTextual, TEXT_LIMIT } from "@/lib/file-utils";
import { truncate } from "@/lib/utils";
import { isParsableAttachment, parseAttachment } from "@/mail/attachment-data";
import type { DraftAttachment } from "@/types/mail";

import type { AgentMailbox } from "./scope";

const MB = 1024 * 1024;
const MAX_PREVIEW_IMAGE_BYTES = 10 * MB;
const PREVIEW_IMAGE_SIDE = 1568;
const PREVIEW_JPEG_QUALITY = 80;
const MAX_INLINE_ATTACHMENT_BYTES = 5 * MB;
const MAX_DRAFT_ATTACHMENT_BYTES = 25 * MB;
const MAX_PREVIEW_PDF_BYTES = 40 * MB;
const MAX_PDF_PAGE_IMAGES = 4;
const MIN_PAGE_TEXT_CHARS = 40;
const MIN_PAGE_IMAGE_SIDE = 200;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export const getAttachmentOutput = z.object({
  attachmentId: z.string().optional(),
  filename: z.string().optional(),
  mimeType: z.string().optional(),
  size: z.number().optional(),
  kind: z.string().optional(),
  truncated: z.boolean().optional(),
  text: z.string().optional(),
  pages: z.number().optional(),
  fromPage: z.number().optional(),
  toPage: z.number().optional(),
  nextPage: z.number().optional(),
  scannedPages: z.array(z.number()).optional(),
  images: z
    .array(z.object({ page: z.number().optional(), data: z.string(), mimeType: z.string() }))
    .optional(),
  error: z.string().optional(),
});

export type AttachmentPreview = z.infer<typeof getAttachmentOutput>;

function baseType(mimeType: string): string {
  return mimeType.toLowerCase().split(";")[0]?.trim() ?? "";
}

function isPreviewImage(filename: string, mimeType: string): boolean {
  return IMAGE_TYPES.has(baseType(mimeType)) || /\.(png|jpe?g|webp|gif)$/i.test(filename);
}

function isPdf(filename: string, mimeType: string): boolean {
  return baseType(mimeType) === "application/pdf" || /\.pdf$/i.test(filename);
}

async function toJpeg(image: Sharp): Promise<{ data: string; mimeType: string }> {
  const jpeg = await image
    .rotate()
    .resize({
      width: PREVIEW_IMAGE_SIDE,
      height: PREVIEW_IMAGE_SIDE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: PREVIEW_JPEG_QUALITY })
    .toBuffer();
  return { data: jpeg.toString("base64"), mimeType: "image/jpeg" };
}

function previewImage(buffer: Buffer): Promise<{ data: string; mimeType: string }> {
  return toJpeg(sharp(buffer, { animated: false }));
}

async function pageImage(
  pdf: Awaited<ReturnType<typeof getDocumentProxy>>,
  page: number,
): Promise<{ data: string; mimeType: string } | null> {
  const images = await extractImages(pdf, page).catch(() => []);
  const largest = images
    .filter((i) => Math.max(i.width, i.height) >= MIN_PAGE_IMAGE_SIDE)
    .toSorted((a, b) => b.width * b.height - a.width * a.height)[0];
  if (!largest) return null;
  return toJpeg(
    sharp(Buffer.from(largest.data.buffer, largest.data.byteOffset, largest.data.byteLength), {
      raw: { width: largest.width, height: largest.height, channels: largest.channels },
    }),
  ).catch(() => null);
}

async function previewPdf(
  bytes: Buffer,
  fromPage: number,
): Promise<Omit<AttachmentPreview, "attachmentId" | "filename" | "mimeType" | "size">> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const pages = pdf.numPages;
  if (fromPage > pages) {
    return { kind: "PDF", pages, error: `This PDF has ${pages} pages` };
  }
  const { text: pageTexts } = await extractText(pdf, { mergePages: false });
  const chunks: string[] = [];
  const images: { page: number; data: string; mimeType: string }[] = [];
  const scannedPages: number[] = [];
  let used = 0;
  let page = fromPage;
  for (; page <= pages; page++) {
    const text = (pageTexts[page - 1] ?? "").replace(/[ \t]+/g, " ").trim();
    if (text.length >= MIN_PAGE_TEXT_CHARS) {
      const block = `--- Page ${page} ---\n${text}`;
      if (used > 0 && used + block.length > TEXT_LIMIT) break;
      chunks.push(truncate(block, TEXT_LIMIT));
      used += block.length;
      continue;
    }
    if (images.length >= MAX_PDF_PAGE_IMAGES) break;
    // oxlint-disable-next-line eslint/no-await-in-loop -- pages are rendered in order until the image budget is spent
    const image = await pageImage(pdf, page);
    if (image) {
      scannedPages.push(page);
      images.push({ page, ...image });
      chunks.push(`--- Page ${page} ---\n(scanned page, see image)`);
    } else {
      chunks.push(`--- Page ${page} ---\n${text || "(no text)"}`);
    }
  }
  const toPage = page - 1;
  return {
    kind: "PDF",
    pages,
    fromPage,
    toPage,
    ...(toPage < pages ? { nextPage: toPage + 1 } : {}),
    ...(scannedPages.length > 0 ? { scannedPages } : {}),
    truncated: toPage < pages,
    text: chunks.join("\n\n"),
    ...(images.length > 0 ? { images } : {}),
  };
}

export async function getAttachment(
  mailbox: AgentMailbox,
  id: string,
  attachmentId: string,
  fromPage = 1,
): Promise<AttachmentPreview> {
  const attachments = await mailbox.adapter.listAttachments(id);
  const meta = attachments.find((a) => a.id === attachmentId);
  if (!meta) {
    return {
      error: `Unknown attachmentId "${attachmentId}" on this email. These are all of them: ${
        attachments.map((a) => `${a.id} (${a.filename})`).join(", ") || "none"
      }`,
    };
  }
  const base = {
    attachmentId,
    filename: meta.filename,
    mimeType: meta.mimeType,
    size: meta.size,
  };

  const image = isPreviewImage(meta.filename, meta.mimeType);
  const pdf = isPdf(meta.filename, meta.mimeType);
  const parsable = isParsableAttachment(meta);
  const textual = looksTextual(meta.filename, meta.mimeType);
  if (image && meta.size > MAX_PREVIEW_IMAGE_BYTES) {
    return { ...base, kind: "image", error: "That image is too large to preview (over 10 MB)" };
  }
  if (pdf && meta.size > MAX_PREVIEW_PDF_BYTES) {
    return { ...base, kind: "PDF", error: "That PDF is too large to preview (over 40 MB)" };
  }
  if (!image && !pdf && !parsable && !textual) {
    return {
      ...base,
      kind: "file",
      error:
        "This kind of file cannot be previewed. Images, PDFs, Word documents (.docx), spreadsheets (.xlsx), calendar invites, contact cards, wallet passes, forwarded emails and text files can.",
    };
  }

  const downloaded = await mailbox.adapter.downloadAttachment(id, attachmentId);
  if (!downloaded) return { ...base, error: "That attachment is no longer available" };

  if (image) {
    try {
      return { ...base, kind: "image", images: [await previewImage(downloaded.buffer)] };
    } catch {
      return { ...base, kind: "image", error: "That image could not be read" };
    }
  }

  if (pdf) {
    try {
      return { ...base, ...(await previewPdf(downloaded.buffer, fromPage)) };
    } catch {
      return { ...base, kind: "PDF", error: "That PDF could not be read" };
    }
  }

  const parsed = parsable ? await parseAttachment(meta, downloaded.buffer) : null;
  const text = parsed
    ? JSON.stringify(parsed.data)
    : downloaded.buffer.subarray(0, TEXT_LIMIT * 4).toString("utf-8");
  return {
    ...base,
    kind: parsed?.label ?? "text",
    truncated: text.length > TEXT_LIMIT,
    text: truncate(text, TEXT_LIMIT),
  };
}

export const draftAttachmentInput = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("email"),
    messageId: z.string().min(1).describe("The email that carries the attachment"),
    attachmentId: z.string().min(1).describe("An attachmentId from listAttachments"),
    mailboxId: z
      .string()
      .optional()
      .describe("The mailbox of that email; the draft's mailbox when left out"),
  }),
  z.object({
    source: z.literal("inline"),
    filename: z.string().trim().min(1).max(200),
    mimeType: z.string().optional(),
    text: z.string().optional().describe("The file's content as text (txt, csv, md, html, ics…)"),
    contentBase64: z
      .string()
      .optional()
      .describe("The file's bytes in base64, for any other file; at most 5 MB"),
  }),
]);

export type DraftAttachmentInput = z.infer<typeof draftAttachmentInput>;

function guessMimeType(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  const known: Record<string, string> = {
    txt: "text/plain",
    csv: "text/csv",
    md: "text/markdown",
    html: "text/html",
    json: "application/json",
    ics: "text/calendar",
    vcf: "text/vcard",
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    zip: "application/zip",
  };
  return known[ext] ?? "application/octet-stream";
}

export async function resolveDraftAttachments(
  mailbox: AgentMailbox,
  inputs: DraftAttachmentInput[],
  mailboxFor: (mailboxId: string) => AgentMailbox | null,
): Promise<DraftAttachment[]> {
  const out: DraftAttachment[] = [];
  let total = 0;
  const add = (attachment: DraftAttachment, bytes: number) => {
    total += bytes;
    if (total > MAX_DRAFT_ATTACHMENT_BYTES) {
      throw new BadRequestError("Attachments are limited to 25 MB in total");
    }
    out.push(attachment);
  };

  for (const input of inputs) {
    if (input.source === "inline") {
      if (input.text === undefined && input.contentBase64 === undefined) {
        throw new BadRequestError(`Give the text or the contentBase64 of ${input.filename}`);
      }
      const bytes =
        input.contentBase64 === undefined
          ? Buffer.from(input.text ?? "", "utf8")
          : Buffer.from(input.contentBase64, "base64");
      if (bytes.length > MAX_INLINE_ATTACHMENT_BYTES) {
        throw new BadRequestError(`${input.filename} is over the 5 MB limit for a created file`);
      }
      add(
        {
          filename: input.filename,
          mimeType: input.mimeType ?? guessMimeType(input.filename),
          contentBase64: bytes.toString("base64"),
        },
        bytes.length,
      );
      continue;
    }

    const source = input.mailboxId ? mailboxFor(input.mailboxId) : mailbox;
    if (!source) throw new BadRequestError(`Unknown mailboxId "${input.mailboxId}"`);
    // oxlint-disable-next-line eslint/no-await-in-loop -- attachments are read one by one so the size budget stops at the first file over it
    const attachments = await source.adapter.listAttachments(input.messageId);
    const meta = attachments.find((a) => a.id === input.attachmentId);
    if (!meta) {
      throw new BadRequestError(
        `Unknown attachmentId "${input.attachmentId}" on email ${input.messageId}. These are all of them: ${
          attachments.map((a) => `${a.id} (${a.filename})`).join(", ") || "none"
        }`,
      );
    }
    // oxlint-disable-next-line eslint/no-await-in-loop -- attachments are read one by one so the size budget stops at the first file over it
    const downloaded = await source.adapter.downloadAttachment(input.messageId, input.attachmentId);
    if (!downloaded) throw new BadRequestError(`${meta.filename} is no longer available`);
    add(
      {
        filename: meta.filename,
        mimeType: downloaded.mimeType ?? meta.mimeType,
        contentBase64: downloaded.buffer.toString("base64"),
      },
      downloaded.buffer.length,
    );
  }
  return out;
}

export async function currentDraftAttachments(
  mailbox: AgentMailbox,
  draftId: string,
): Promise<DraftAttachment[]> {
  const messageId = (await mailbox.adapter.draftMessageId?.(draftId)) ?? draftId;
  const attachments = await mailbox.adapter.listAttachments(messageId);
  const out: DraftAttachment[] = [];
  for (const meta of attachments) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- the draft's attachments are re-read in order to keep them on the rebuilt draft
    const downloaded = await mailbox.adapter.downloadAttachment(messageId, meta.id);
    if (downloaded) {
      out.push({
        filename: meta.filename,
        mimeType: downloaded.mimeType ?? meta.mimeType,
        contentBase64: downloaded.buffer.toString("base64"),
      });
    }
  }
  return out;
}
