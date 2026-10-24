import { MAX_PREDICATE_DEPTH, MAX_PREDICATE_LEAVES, type PredicateNode } from "../schema";
import { type NodeKindDefinition, passThrough } from "./types";

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
  return null;
}

export const condition: NodeKindDefinition<"condition"> = {
  kind: "condition",
  label: "If",
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
};
