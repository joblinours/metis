import {
  type GraphNode,
  type GraphShape,
  MAX_MERGE_INPUTS,
  mergeInputHandle,
  mergeInputIndex,
} from "@/workflow/schema";
import { emitsFor, nodeOutputs, stepDef } from "@/workflow/steps";
import type { NodeTypes } from "@/workflow/validation";
import { typeLabel, type ValueType } from "@/workflow/values";

import type { CardPort } from "./node-card";
import { portTone } from "./node-meta";

function portLabel(type: ValueType | null): string {
  return type ? typeLabel(type) : "Anything";
}

export function nodePorts(
  node: GraphNode,
  graph: GraphShape,
  types: ReadonlyMap<string, NodeTypes>,
  opts: { spareInput: boolean },
): { inputs: CardPort[]; outputs: CardPort[] } {
  const def = stepDef(node.step);
  const own = types.get(node.id);
  const inputs: CardPort[] = [];

  if (def && !def.trigger) {
    if (def.merge === "append" || def.merge === "join") {
      const highest = graph.edges.reduce(
        (max, edge) =>
          edge.target === node.id ? Math.max(max, mergeInputIndex(edge.targetHandle)) : max,
        -1,
      );
      const count = opts.spareInput
        ? Math.min(MAX_MERGE_INPUTS, Math.max(2, highest + 2))
        : highest + 1;
      for (let index = 0; index < count; index += 1) {
        inputs.push({
          id: mergeInputHandle(index),
          label: `Branch ${index + 1}`,
          tone: portTone(own?.input ?? null),
        });
      }
    } else {
      inputs.push({
        id: null,
        label: portLabel(own?.input ?? null),
        tone: portTone(own?.input ?? null),
      });
    }
  }

  const outputs = nodeOutputs(node, graph).map((output) => {
    const type =
      emitsFor(node, output.id) === "input" ? (own?.input ?? null) : (own?.output ?? null);
    return { id: output.id, label: output.label ?? portLabel(type), tone: portTone(type) };
  });

  return { inputs, outputs };
}
