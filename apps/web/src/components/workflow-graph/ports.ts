import { type GraphShape, kindOf, nodeOutputs, PORT_LABELS, type PortType } from "@/workflow/kinds";
import {
  isMergeKind,
  MAX_MERGE_INPUTS,
  mergeInputHandle,
  mergeInputIndex,
  type WorkflowNode,
} from "@/workflow/schema";
import { outputPortOf } from "@/workflow/validation";

import type { CardPort } from "./node-card";

function portLabel(type: PortType | "any"): string {
  return type === "any" ? "Mail or outgoing mail" : PORT_LABELS[type];
}

function inboundType(graph: GraphShape, nodeId: string): PortType | null {
  const source = graph.edges.find((edge) => edge.target === nodeId)?.source;
  return source ? outputPortOf(graph, source) : null;
}

export function nodePorts(
  node: WorkflowNode,
  graph: GraphShape,
  opts: { spareInput: boolean },
): { inputs: CardPort[]; outputs: CardPort[] } {
  const kind = kindOf(node.kind);
  const inputs: CardPort[] = [];

  if (isMergeKind(node.kind)) {
    const highest = graph.edges.reduce(
      (max, edge) =>
        edge.target === node.id ? Math.max(max, mergeInputIndex(edge.targetHandle)) : max,
      -1,
    );
    const count = opts.spareInput
      ? Math.min(MAX_MERGE_INPUTS, Math.max(2, highest + 2))
      : highest + 1;
    for (let index = 0; index < count; index += 1) {
      inputs.push({ id: mergeInputHandle(index), label: `Mail ${index + 1}`, type: "message" });
    }
  } else if (kind.input) {
    const type =
      kind.input.type === "any" ? (inboundType(graph, node.id) ?? "any") : kind.input.type;
    inputs.push({ id: null, label: portLabel(type), type });
  }

  const declared = kind.input?.type;
  const outType: PortType | "any" =
    outputPortOf(graph, node.id) ??
    (declared === undefined
      ? kind.output(node, null)
      : declared === "any"
        ? "any"
        : kind.output(node, declared));
  const outputs = nodeOutputs(node, graph).map((output) => ({
    id: output.id,
    label: output.label ?? portLabel(outType),
    type: outType,
  }));

  return { inputs, outputs };
}
