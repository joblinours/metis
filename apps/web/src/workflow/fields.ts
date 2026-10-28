import { z } from "zod";

import { bindingSchema } from "./expr";
import { T, type ValueType } from "./values";

export const FIELD_TYPES = [
  "text",
  "number",
  "boolean",
  "date",
  "mail",
  "thread",
  "event",
  "file",
  "folder",
  "person",
  "attachment",
  "blob",
  "json",
  "text list",
  "mail list",
  "event list",
  "file list",
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: "Text",
  number: "Number",
  boolean: "Yes / no",
  date: "Date",
  mail: "Mail",
  thread: "Thread",
  event: "Event",
  file: "File",
  folder: "Folder",
  person: "Person",
  attachment: "Attachment",
  blob: "File contents",
  json: "Any value",
  "text list": "List of text",
  "mail list": "List of mail",
  "event list": "List of events",
  "file list": "List of files",
};

export const AI_FIELD_TYPES = [
  "text",
  "number",
  "boolean",
  "date",
  "text list",
] as const satisfies readonly FieldType[];

export function fieldValueType(type: FieldType): ValueType {
  switch (type) {
    case "text list":
      return T.list(T.text);
    case "mail list":
      return T.list(T.mail);
    case "event list":
      return T.list(T.event);
    case "file list":
      return T.list(T.file);
    default:
      return { kind: type };
  }
}

export const FIELD_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,39}$/;

export const fieldDeclSchema = z.object({
  name: z.string().regex(FIELD_NAME, "A field name is a letter followed by letters, digits or _"),
  type: z.enum(FIELD_TYPES),
  description: z.string().trim().max(300).optional(),
  required: z.boolean().optional(),
});

export type FieldDecl = z.infer<typeof fieldDeclSchema>;

export const fieldDeclsSchema = z.array(fieldDeclSchema).max(30);

export function parseFieldDecls(value: unknown): FieldDecl[] {
  const parsed = fieldDeclsSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

export function fieldsType(decls: readonly FieldDecl[]): ValueType {
  return T.object(Object.fromEntries(decls.map((decl) => [decl.name, fieldValueType(decl.type)])));
}

export function fieldDeclProblems(value: unknown, what: string): string[] {
  const parsed = fieldDeclsSchema.safeParse(value ?? []);
  if (!parsed.success) return [`Fix the ${what}: ${parsed.error.issues[0]?.message ?? "invalid"}`];
  const names = parsed.data.map((decl) => decl.name);
  if (new Set(names).size !== names.length) return [`Two ${what} share a name`];
  return [];
}

export const assignmentSchema = z.object({
  name: z.string().regex(FIELD_NAME, "A field name is a letter followed by letters, digits or _"),
  value: bindingSchema,
});

export type Assignment = z.infer<typeof assignmentSchema>;

export const assignmentsSchema = z.array(assignmentSchema).max(30);

export function parseAssignments(value: unknown): Assignment[] {
  const parsed = assignmentsSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

export const caseSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_]{1,40}$/),
  name: z.string().trim().min(1).max(40),
  when: z.string().trim().max(2000),
});

export type SwitchCase = z.infer<typeof caseSchema>;

export const casesSchema = z.array(caseSchema).max(20);

export function parseCases(value: unknown): SwitchCase[] {
  const parsed = casesSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

export const categorySchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_]{1,40}$/),
  name: z.string().trim().min(1).max(40),
  description: z.string().trim().max(300).optional(),
});

export type Category = z.infer<typeof categorySchema>;

export const categoriesSchema = z.array(categorySchema).max(20);

export function parseCategories(value: unknown): Category[] {
  const parsed = categoriesSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

export const headerRuleSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[A-Za-z0-9-]+$/),
  value: z.string().max(500),
});

export const headerRulesSchema = z.array(headerRuleSchema).max(10);

export type HeaderRule = z.infer<typeof headerRuleSchema>;

export function parseHeaderRules(value: unknown): HeaderRule[] {
  const parsed = headerRulesSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

export function parseStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}
