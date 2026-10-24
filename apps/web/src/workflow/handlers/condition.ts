import "server-only";
import { ensureLoaded, type NodeHandler } from "../nodes";
import type { DraftFacts, Envelope, MessageFacts } from "../runtime";
import type { PredicateNode } from "../schema";

function needsFullMessage(node: PredicateNode): boolean {
  if (node.kind === "group") return node.children.some(needsFullMessage);
  return node.field === "body" || node.field === "hasAttachment";
}

function haystack(facts: MessageFacts, field: string): string {
  switch (field) {
    case "from":
      return `${facts.fromName ?? ""} <${facts.from}>`;
    case "to":
      return facts.to.join(", ");
    case "cc":
      return (facts.cc ?? []).join(", ");
    case "subject":
      return facts.subject;
    case "body":
      return facts.bodyText || facts.snippet || "";
    default:
      return "";
  }
}

function draftHaystack(draft: DraftFacts, field: string): string {
  switch (field) {
    case "from":
      return "";
    case "to":
      return draft.to.join(", ");
    case "cc":
      return (draft.cc ?? []).join(", ");
    case "subject":
      return draft.subject;
    case "body":
      return draft.bodyText || draft.bodyHtml || "";
    default:
      return "";
  }
}

function matchString(value: string, op: string, needle: string, caseSensitive: boolean): boolean {
  const h = caseSensitive ? value : value.toLowerCase();
  const n = caseSensitive ? needle : needle.toLowerCase();
  switch (op) {
    case "contains":
      return h.includes(n);
    case "equals":
      return h === n;
    case "startsWith":
      return h.startsWith(n);
    case "endsWith":
      return h.endsWith(n);
    default:
      return false;
  }
}

function evaluatePredicate(
  node: PredicateNode,
  subject: { facts?: MessageFacts; draft?: DraftFacts },
): boolean {
  if (node.kind === "group") {
    if (node.children.length === 0) return false;
    return node.logic === "any"
      ? node.children.some((child) => evaluatePredicate(child, subject))
      : node.children.every((child) => evaluatePredicate(child, subject));
  }

  if (node.field === "hasAttachment") {
    const has = subject.facts
      ? subject.facts.hasAttachment === true
      : subject.draft?.hasAttachment === true;
    return node.value === "true" ? has : !has;
  }

  const value = subject.facts
    ? haystack(subject.facts, node.field)
    : subject.draft
      ? draftHaystack(subject.draft, node.field)
      : "";
  return matchString(value, node.op, node.value, node.caseSensitive === true);
}

export const condition: NodeHandler<"condition"> = async (node, envelope, ctx) => {
  const lineage = [...envelope.lineage, node.id];
  let passed = false;
  let next: Envelope = envelope;

  if (envelope.port === "draft") {
    passed = evaluatePredicate(node.predicate, { draft: envelope.draft });
  } else if (envelope.port === "message") {
    const loaded = needsFullMessage(node.predicate) ? await ensureLoaded(envelope, ctx) : envelope;
    next = loaded;
    passed = evaluatePredicate(node.predicate, { facts: loaded.message });
  }

  return {
    outputs: [
      {
        handle: passed ? "matched" : "unmatched",
        envelopes: [{ ...next, lineage }],
      },
    ],
    detail: passed ? "matched" : "no match",
  };
};
