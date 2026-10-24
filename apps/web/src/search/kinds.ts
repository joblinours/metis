import { type ParserAst, positiveTags, type TagToken, tagKey, tagText } from "./ast";
import {
  CLIENT_KINDS,
  EXPLICIT_KINDS,
  kindsForValue,
  SEARCH_KINDS,
  type SearchKind,
  searchField,
} from "./fields";
import { bindTags } from "./pushdown";

function applies(tag: TagToken, kind: SearchKind): boolean | null {
  const key = tagKey(tag);
  if (key === null) return null;
  const field = searchField(key);
  if (!field) return false;
  const value =
    field.type === "enum" && tag.expression.type === "LiteralExpression" ? tagText(tag) : null;
  if (key === "type") return (value ?? "").toLowerCase() === kind;
  return kindsForValue(field, value).includes(kind) ? null : false;
}

export function pruneFor(ast: ParserAst, kind: SearchKind): ParserAst | boolean {
  return bindTags(ast, (tag) => applies(tag, kind));
}

function explicitlyAsked(ast: ParserAst, kind: SearchKind): boolean {
  return positiveTags(ast).some(
    (tag) => tagKey(tag) === "type" && (tagText(tag) ?? "").toLowerCase() === kind,
  );
}

export function kindsFor(ast: ParserAst): SearchKind[] {
  return SEARCH_KINDS.filter((kind) => {
    if (EXPLICIT_KINDS.includes(kind) && !explicitlyAsked(ast, kind)) {
      return false;
    }
    return pruneFor(ast, kind) !== false;
  });
}

export function serverKinds(ast: ParserAst): SearchKind[] {
  const client: readonly SearchKind[] = CLIENT_KINDS;
  return kindsFor(ast).filter((kind) => !client.includes(kind));
}
