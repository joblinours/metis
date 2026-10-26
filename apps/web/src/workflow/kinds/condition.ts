import {
  MAX_PREDICATE_DEPTH,
  MAX_PREDICATE_LEAVES,
  type LeafPredicate,
  type PredicateField,
  type PredicateNode,
  type StringOp,
} from "../schema";
import { type CardEntry, type NodeKindDefinition, passThrough } from "./types";

export const PREDICATE_FIELD_LABELS: Record<PredicateField, string> = {
  from: "Sender",
  to: "Recipient",
  cc: "Cc",
  subject: "Subject",
  body: "Body",
  hasAttachment: "Has attachment",
};

export const STRING_OP_LABELS: Record<StringOp, string> = {
  contains: "contains",
  equals: "is",
  startsWith: "starts with",
  endsWith: "ends with",
};

function checkPredicate(
  node: PredicateNode,
  depth: number,
  acc: { leaves: number },
): string | null {
  if (depth > MAX_PREDICATE_DEPTH) {
    return `Conditions are nested too deeply (max ${MAX_PREDICATE_DEPTH})`;
  }
  if (node.kind === "group") {
    if (node.children.length === 0) {
      return "Every condition group needs at least one condition";
    }
    for (const child of node.children) {
      const err = checkPredicate(child, depth + 1, acc);
      if (err) return err;
    }
    return null;
  }
  acc.leaves += 1;
  if (acc.leaves > MAX_PREDICATE_LEAVES) {
    return `Maximum ${MAX_PREDICATE_LEAVES} conditions per workflow`;
  }
  if (node.field !== "hasAttachment" && !node.value.trim()) {
    return "Fill in the value of every condition";
  }
  return null;
}

export function describeLeaf(leaf: LeafPredicate): string {
  if (leaf.field === "hasAttachment") {
    return leaf.value === "true" ? "Has an attachment" : "Has no attachment";
  }
  const value = leaf.value.trim() ? `“${leaf.value}”` : "…";
  return `${PREDICATE_FIELD_LABELS[leaf.field]} ${STRING_OP_LABELS[leaf.op]} ${value}`;
}

function leavesOf(node: PredicateNode): LeafPredicate[] {
  return node.kind === "group" ? node.children.flatMap(leavesOf) : [node];
}

const SHOWN_LEAVES = 2;

export const condition: NodeKindDefinition<"condition"> = {
  kind: "condition",
  label: "If",
  category: "logic",
  description:
    "Sends each message to Yes or No by its sender, recipients, subject, body or attachments.",
  scope: "any",
  retry: "safe",
  input: {
    type: "any",
    missing: "Connect this If step to a mailbox that provides mail",
  },
  output: passThrough,
  outputs: () => [
    { id: "matched", label: "Yes" },
    { id: "unmatched", label: "No" },
  ],
  outputError: "Connect an If step from its Yes or No output",
  check(node) {
    const err = checkPredicate(node.predicate, 1, { leaves: 0 });
    return err ? [err] : [];
  },
  card(node) {
    const leaves = leavesOf(node.predicate);
    const lines: CardEntry[] = [];
    if (node.predicate.kind === "group" && leaves.length > 1) {
      lines.push({
        text: node.predicate.logic === "all" ? "All of these" : "Any of these",
        tone: "muted",
      });
    }
    for (const leaf of leaves.slice(0, SHOWN_LEAVES)) lines.push(describeLeaf(leaf));
    if (leaves.length > SHOWN_LEAVES) {
      lines.push({ text: `and ${leaves.length - SHOWN_LEAVES} more`, tone: "muted" });
    }
    return lines;
  },
};
