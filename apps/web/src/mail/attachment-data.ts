import { unzipSync } from "fflate";
import ICAL from "ical.js";
import PostalMime, { type Address } from "postal-mime";
import { extractText } from "unpdf";
import { z } from "zod";

import { htmlToText, truncate } from "@/lib/utils";
import { lenient } from "@/lib/zod";

import {
  collapse,
  extractMessageExtras,
  type Json,
  MAX_TEXT_VALUE,
  prepareHtml,
  prepareText,
} from "./structured-data";

const KB = 1024;
const MB = 1024 * KB;
const PDF_TEXT_CHARS = 6000;
const EML_TEXT_CHARS = 4000;
const EML_ANCHORS = 20;
const MAX_FORWARD_DEPTH = 2;
const MAX_IMAGE_BYTES = 4 * MB;
const MIN_IMAGE_BYTES = 30 * KB;

export interface AttachmentMeta {
  filename: string;
  mimeType: string;
  size: number;
}

export interface ParsedAttachment {
  label: string;
  filename: string;
  data: Json[];
}

interface AttachmentParser {
  label: string;
  mimeTypes: string[];
  extensions: string[];
  maxBytes: number;
  parse: (bytes: Buffer) => Json[] | Promise<Json[]>;
}

function mimeOf(att: AttachmentMeta): string {
  return att.mimeType.toLowerCase().split(";")[0]?.trim() ?? "";
}

function matches(att: AttachmentMeta, parser: AttachmentParser): boolean {
  const name = att.filename.toLowerCase();
  return (
    parser.mimeTypes.includes(mimeOf(att)) || parser.extensions.some((ext) => name.endsWith(ext))
  );
}

function rootComponents(content: string): ICAL.Component[] {
  const parsed: unknown = ICAL.parse(content);
  if (!Array.isArray(parsed)) return [];
  const roots: unknown[] = typeof parsed[0] === "string" ? [parsed] : parsed;
  return roots.flatMap((root) => (Array.isArray(root) ? [new ICAL.Component(root)] : []));
}

function icalTime(value: unknown): string | null {
  if (!(value instanceof ICAL.Time)) return null;
  return value.isDate ? value.toString() : value.toJSDate().toISOString();
}

function propertyPerson(property: ICAL.Property): string | null {
  const value = property.getFirstValue();
  const address = typeof value === "string" ? value.replace(/^mailto:/i, "") : null;
  const name = property.getParameter("cn");
  const label = typeof name === "string" ? name : null;
  if (label && address) return `${label} <${address}>`;
  return label ?? address;
}

export function parseCalendarInvite(ics: string): Json[] {
  try {
    return rootComponents(ics).flatMap((root) => {
      const method = root.getFirstPropertyValue("method");
      return root.getAllSubcomponents("vevent").map((vevent) => {
        const event = new ICAL.Event(vevent);
        const start = event.startDate;
        const organizer = vevent.getFirstProperty("organizer");
        return {
          method: typeof method === "string" ? method : null,
          uid: event.uid ?? null,
          sequence: event.sequence ?? null,
          status: String(vevent.getFirstPropertyValue("status") ?? "") || null,
          summary: event.summary ?? null,
          start: icalTime(start),
          end: icalTime(event.endDate),
          allDay: start?.isDate ?? false,
          timeZone: start?.zone?.tzid ?? null,
          location: event.location ?? null,
          url: String(vevent.getFirstPropertyValue("url") ?? "") || null,
          description: event.description ? event.description.slice(0, MAX_TEXT_VALUE * 2) : null,
          organizer: organizer ? propertyPerson(organizer) : null,
          attendees: vevent
            .getAllProperties("attendee")
            .map(propertyPerson)
            .filter((a): a is string => !!a),
        };
      });
    });
  } catch {
    return [];
  }
}

function textValues(component: ICAL.Component, name: string): string[] {
  return component
    .getAllProperties(name)
    .map((property) => {
      const value = property.getFirstValue();
      const text = Array.isArray(value)
        ? value.flat().filter(Boolean).join(", ")
        : String(value ?? "");
      const type = property.getParameter("type");
      const label = Array.isArray(type) ? type.join("/") : type;
      const clean = collapse(text.replace(/^(mailto|tel):/i, ""));
      return clean && label ? `${clean} (${label.toLowerCase()})` : clean;
    })
    .filter(Boolean);
}

function firstText(component: ICAL.Component, name: string): string | null {
  return textValues(component, name)[0] ?? null;
}

export function parseContactCard(vcf: string): Json[] {
  try {
    return rootComponents(vcf)
      .filter((c) => c.name === "vcard")
      .map((card) => ({
        name: firstText(card, "fn") ?? firstText(card, "n"),
        organization: firstText(card, "org"),
        title: firstText(card, "title") ?? firstText(card, "role"),
        emails: textValues(card, "email"),
        phones: textValues(card, "tel"),
        addresses: textValues(card, "adr"),
        urls: textValues(card, "url"),
        birthday: firstText(card, "bday"),
        note: firstText(card, "note")?.slice(0, MAX_TEXT_VALUE) ?? null,
      }));
  } catch {
    return [];
  }
}

const PASS_STYLES = ["boardingPass", "eventTicket", "coupon", "storeCard", "generic"] as const;

const PASS_FIELD_GROUPS = [
  "headerFields",
  "primaryFields",
  "secondaryFields",
  "auxiliaryFields",
  "backFields",
] as const;

const passFieldsSchema = lenient(
  z.array(
    z.object({
      key: lenient(z.string()),
      label: lenient(z.string()),
      value: lenient(z.union([z.string(), z.number()])),
    }),
  ),
);

const passSectionSchema = lenient(
  z.object({
    headerFields: passFieldsSchema,
    primaryFields: passFieldsSchema,
    secondaryFields: passFieldsSchema,
    auxiliaryFields: passFieldsSchema,
    backFields: passFieldsSchema,
    transitType: lenient(z.string()),
  }),
);

const passBarcodeSchema = z.object({
  format: lenient(z.string()),
  message: lenient(z.string()),
});

const passJsonSchema = z.object({
  boardingPass: passSectionSchema,
  eventTicket: passSectionSchema,
  coupon: passSectionSchema,
  storeCard: passSectionSchema,
  generic: passSectionSchema,
  organizationName: lenient(z.string()),
  description: lenient(z.string()),
  logoText: lenient(z.string()),
  relevantDate: lenient(z.string()),
  expirationDate: lenient(z.string()),
  voided: lenient(z.boolean()),
  barcode: lenient(passBarcodeSchema),
  barcodes: lenient(z.array(passBarcodeSchema)),
});

type PassSection = NonNullable<z.infer<typeof passSectionSchema>>;

export function parseWalletPass(bytes: Buffer): Json[] {
  try {
    const files = unzipSync(new Uint8Array(bytes), {
      filter: (file) => file.name === "pass.json",
    });
    const raw = files["pass.json"];
    if (!raw) return [];
    const pass = passJsonSchema.parse(JSON.parse(new TextDecoder().decode(raw).replace(/^﻿/, "")));
    const style = PASS_STYLES.find((s) => pass[s]);
    const section: PassSection = (style && pass[style]) || {};
    const barcode = pass.barcodes?.[0] ?? pass.barcode;
    return [
      {
        passType: style ?? null,
        transitType: section.transitType?.replace(/^PKTransitType/, "") ?? null,
        organization: pass.organizationName ?? null,
        description: pass.description ?? null,
        logoText: pass.logoText ?? null,
        relevantDate: pass.relevantDate ?? null,
        expirationDate: pass.expirationDate ?? null,
        voided: pass.voided ?? false,
        barcode: barcode?.message
          ? {
              format: barcode.format?.replace(/^PKBarcodeFormat/, "").toLowerCase() ?? null,
              message: barcode.message,
            }
          : null,
        fields: PASS_FIELD_GROUPS.flatMap((group) => section[group] ?? []).map((field) => ({
          label: field.label ?? field.key ?? "",
          value: truncate(collapse(String(field.value ?? "")), 300),
        })),
      },
    ];
  } catch {
    return [];
  }
}

export async function parsePdfText(bytes: Buffer): Promise<Json[]> {
  try {
    const { totalPages, text } = await extractText(new Uint8Array(bytes), {
      mergePages: true,
    });
    const clean = collapse(text);
    return clean ? [{ pages: totalPages, text: truncate(clean, PDF_TEXT_CHARS) }] : [];
  } catch {
    return [];
  }
}

function addressText(address: Address | undefined): string | null {
  if (!address) return null;
  if (address.group) {
    return address.group.map((m) => m.address).join(", ") || address.name;
  }
  return address.name ? `${address.name} <${address.address}>` : address.address;
}

export async function parseForwardedEmail(bytes: Buffer): Promise<Json[]> {
  try {
    const email = await PostalMime.parse(bytes, {
      maxRfc822NestingDepth: MAX_FORWARD_DEPTH,
    });
    const html = email.html ? prepareHtml(email.html) : null;
    const text = email.text ? prepareText(email.text) : null;
    const extras = extractMessageExtras(html, text);
    const body = text?.trim() ? text : html ? prepareText(htmlToText(html)) : "";
    return [
      {
        from: addressText(email.from),
        to: (email.to ?? []).map(addressText).filter(Boolean),
        date: email.date ?? null,
        subject: email.subject ?? null,
        text: truncate(collapse(body), EML_TEXT_CHARS),
        structuredData: extras.structuredData,
        links: extras.anchors.slice(0, EML_ANCHORS).map((a) => `${a.text}: ${a.href}`),
        attachments: email.attachments.map((a) => a.filename ?? a.mimeType),
      },
    ];
  } catch {
    return [];
  }
}

const ATTACHMENT_PARSERS: AttachmentParser[] = [
  {
    label: "Calendar invite",
    mimeTypes: ["text/calendar", "application/ics", "text/x-vcalendar"],
    extensions: [".ics", ".ical", ".ifb"],
    maxBytes: 256 * KB,
    parse: (bytes) => parseCalendarInvite(bytes.toString("utf8")),
  },
  {
    label: "Contact card",
    mimeTypes: ["text/vcard", "text/x-vcard", "text/directory"],
    extensions: [".vcf", ".vcard"],
    maxBytes: 256 * KB,
    parse: (bytes) => parseContactCard(bytes.toString("utf8")),
  },
  {
    label: "Wallet pass",
    mimeTypes: ["application/vnd.apple.pkpass"],
    extensions: [".pkpass"],
    maxBytes: 2 * MB,
    parse: parseWalletPass,
  },
  {
    label: "PDF text",
    mimeTypes: ["application/pdf"],
    extensions: [".pdf"],
    maxBytes: 5 * MB,
    parse: parsePdfText,
  },
  {
    label: "Forwarded email",
    mimeTypes: ["message/rfc822"],
    extensions: [".eml"],
    maxBytes: 2 * MB,
    parse: parseForwardedEmail,
  },
];

function parserFor(att: AttachmentMeta): AttachmentParser | null {
  return ATTACHMENT_PARSERS.find((p) => matches(att, p)) ?? null;
}

export function isParsableAttachment(att: AttachmentMeta): boolean {
  const parser = parserFor(att);
  return parser !== null && att.size <= parser.maxBytes;
}

export async function parseAttachment(
  att: AttachmentMeta,
  bytes: Buffer,
): Promise<ParsedAttachment | null> {
  const parser = parserFor(att);
  if (!parser) return null;
  const data = await parser.parse(bytes);
  return data.length > 0 ? { label: parser.label, filename: att.filename, data } : null;
}

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export function isVisionImage(att: AttachmentMeta): boolean {
  return IMAGE_TYPES.has(mimeOf(att)) && att.size >= MIN_IMAGE_BYTES && att.size <= MAX_IMAGE_BYTES;
}

export function imageMediaType(att: AttachmentMeta): string {
  return mimeOf(att);
}
