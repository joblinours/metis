import {
  NEEDS_TRIGGER,
  type NodeKindDefinition,
  passThrough,
  SINGLE_OUTPUT,
  SINGLE_OUTPUT_ERROR,
} from "./types";

const OPERATION_LABELS = {
  "cimd-prune": "Prune abandoned MCP clients",
  "audit-prune": "Prune old audit events",
} as const;

export const actionSystem: NodeKindDefinition<"action.system"> = {
  kind: "action.system",
  label: "Maintenance",
  category: "system",
  description: "Runs one of the instance's maintenance jobs.",
  scope: "system",
  retry: "safe",
  input: NEEDS_TRIGGER,
  output: passThrough,
  outputs: () => SINGLE_OUTPUT,
  outputError: SINGLE_OUTPUT_ERROR,
  card: (node) => [OPERATION_LABELS[node.operation]],
};
