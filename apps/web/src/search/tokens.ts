import { parse } from "liqe";

import type { ParserAst, TagToken } from "./ast";
import { RETIRED_KEYS, searchField } from "./fields";

export type SearchTokenKind =
  | "key"
  | "operator"
  | "value"
  | "quoted"
  | "text"
  | "boolean"
  | "negation"
  | "paren"
  | "range"
  | "regex"
  | "invalid";

export interface SearchToken {
  start: number;
  end: number;
  kind: SearchTokenKind;
}

function tagTokens(tag: TagToken, out: SearchToken[]) {
  if (tag.field.type === "Field") {
    const known =
      searchField(tag.field.name) !== undefined && !RETIRED_KEYS[tag.field.name.toLowerCase()];
    out.push({
      start: tag.field.location.start,
      end: tag.field.location.end,
      kind: known ? "key" : "invalid",
    });
    out.push({
      start: tag.operator.location.start,
      end: tag.operator.location.end,
      kind: "operator",
    });
  }
  const { expression } = tag;
  switch (expression.type) {
    case "LiteralExpression":
      out.push({
        start: expression.location.start,
        end: expression.location.end,
        kind: expression.quoted ? "quoted" : tag.field.type === "Field" ? "value" : "text",
      });
      return;
    case "RegexExpression":
      out.push({ ...expression.location, kind: "regex" });
      return;
    case "RangeExpression":
      out.push({ ...expression.location, kind: "range" });
      return;
    default:
      return;
  }
}

function collect(ast: ParserAst, out: SearchToken[]) {
  switch (ast.type) {
    case "Tag":
      tagTokens(ast, out);
      return;
    case "LogicalExpression":
      collect(ast.left, out);
      if (ast.operator.type === "BooleanOperator") {
        out.push({ ...ast.operator.location, kind: "boolean" });
      }
      collect(ast.right, out);
      return;
    case "UnaryOperator":
      out.push({
        start: ast.location.start,
        end: ast.location.start + ast.operator.length,
        kind: "negation",
      });
      collect(ast.operand, out);
      return;
    case "ParenthesizedExpression":
      out.push({
        start: ast.location.start,
        end: ast.location.start + 1,
        kind: "paren",
      });
      collect(ast.expression, out);
      out.push({
        start: ast.location.end - 1,
        end: ast.location.end,
        kind: "paren",
      });
      return;
    default:
      return;
  }
}

export function searchTokens(ast: ParserAst): SearchToken[] {
  const out: SearchToken[] = [];
  collect(ast, out);
  return out.filter((t) => t.end > t.start).toSorted((a, b) => a.start - b.start);
}

export function matchingParen(text: string, at: number): number | null {
  const open = text[at] === "(";
  const close = text[at] === ")";
  if (!open && !close) return null;
  let depth = 0;
  let quoted = false;
  if (open) {
    for (let i = at; i < text.length; i += 1) {
      const ch = text[i];
      if (ch === '"') quoted = !quoted;
      if (quoted) continue;
      if (ch === "(") depth += 1;
      if (ch === ")") depth -= 1;
      if (depth === 0) return i;
    }
    return null;
  }
  for (let i = at; i >= 0; i -= 1) {
    const ch = text[i];
    if (ch === '"') quoted = !quoted;
    if (quoted) continue;
    if (ch === ")") depth += 1;
    if (ch === "(") depth -= 1;
    if (depth === 0) return i;
  }
  return null;
}

export type CaretContext =
  | { mode: "key"; prefix: string; start: number; end: number }
  | { mode: "value"; key: string; prefix: string; start: number; end: number };

const MARK = "zqcaretzq";
const WORD = /[^\s()"]/;

function wordEnd(text: string, from: number): number {
  let end = from;
  while (end < text.length && WORD.test(text[end] ?? "")) end += 1;
  return end;
}

function findMark(ast: ParserAst): TagToken | null {
  let found: TagToken | null = null;
  const visit = (node: ParserAst) => {
    if (found) return;
    switch (node.type) {
      case "Tag": {
        const fieldName = node.field.type === "Field" ? node.field.name : "";
        const value =
          node.expression.type === "LiteralExpression" ? String(node.expression.value ?? "") : "";
        if (fieldName.includes(MARK) || value.includes(MARK)) found = node;
        return;
      }
      case "LogicalExpression":
        visit(node.left);
        visit(node.right);
        return;
      case "UnaryOperator":
        visit(node.operand);
        return;
      case "ParenthesizedExpression":
        visit(node.expression);
        return;
      default:
        return;
    }
  };
  visit(ast);
  return found;
}

function fromParse(text: string, caret: number): CaretContext | null {
  let ast: ParserAst;
  try {
    ast = parse(`${text.slice(0, caret)}${MARK}${text.slice(caret)}`);
  } catch {
    return null;
  }
  const tag = findMark(ast);
  if (!tag) return null;
  const end = wordEnd(text, caret);
  if (tag.field.type === "Field" && tag.field.name.includes(MARK)) {
    const prefix = tag.field.name.slice(0, tag.field.name.indexOf(MARK));
    return { mode: "key", prefix, start: caret - prefix.length, end };
  }
  if (tag.expression.type !== "LiteralExpression") return null;
  const raw = String(tag.expression.value ?? "");
  const prefix = raw.slice(0, raw.indexOf(MARK));
  if (tag.field.type === "Field") {
    return {
      mode: "value",
      key: tag.field.name.toLowerCase(),
      prefix,
      start: caret - prefix.length,
      end,
    };
  }
  if (tag.expression.quoted) return null;
  return { mode: "key", prefix, start: caret - prefix.length, end };
}

function fromWord(text: string, caret: number): CaretContext | null {
  const before = text.slice(0, caret);
  const end = wordEnd(text, caret);
  const value = /(?:^|[\s(])-?([A-Za-z][\w-]*):([^\s()":]*)$/.exec(before);
  if (value) {
    const prefix = value[2] ?? "";
    return {
      mode: "value",
      key: (value[1] ?? "").toLowerCase(),
      prefix,
      start: caret - prefix.length,
      end,
    };
  }
  const key = /(?:^|[\s(])-?([^\s():"]*)$/.exec(before);
  if (!key) return null;
  const prefix = key[1] ?? "";
  return { mode: "key", prefix, start: caret - prefix.length, end };
}

export function caretContext(text: string, caret: number): CaretContext | null {
  return fromParse(text, caret) ?? fromWord(text, caret);
}
