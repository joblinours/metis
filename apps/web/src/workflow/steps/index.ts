import type { GraphNode, GraphShape } from "../schema";
import { AI_STEPS } from "./ai";
import { LOGIC_STEPS } from "./logic";
import { MAIL_STEPS } from "./mail";
import { RESOURCE_STEPS } from "./resources";
import { TRIGGER_STEPS } from "./triggers";
import type { CardContext, CardLine, StepCategory, StepDef, StepOutput } from "./types";
import { SINGLE_OUTPUT } from "./types";

const ALL_STEPS = [
  ...TRIGGER_STEPS,
  ...MAIL_STEPS,
  ...LOGIC_STEPS,
  ...AI_STEPS,
  ...RESOURCE_STEPS,
] as const;

export type StepKey = (typeof ALL_STEPS)[number]["key"];

export const STEP_KEYS: readonly StepKey[] = ALL_STEPS.map((def) => def.key);

const BY_KEY = new Map<string, StepDef>(ALL_STEPS.map((def) => [def.key, def]));

export function isStepKey(key: string): key is StepKey {
  return BY_KEY.has(key);
}

export function stepDef(key: string): StepDef | null {
  return BY_KEY.get(key) ?? null;
}

export function allSteps(): readonly StepDef[] {
  return ALL_STEPS;
}

export function isTriggerStep(key: string): boolean {
  return !!stepDef(key)?.trigger;
}

export function stepLabel(key: string): string {
  return stepDef(key)?.label ?? "Unknown step";
}

export function stepCategory(key: string): StepCategory {
  return stepDef(key)?.category ?? "logic";
}

export function nodeTitle(node: Pick<GraphNode, "step" | "title">): string {
  return node.title?.trim() || stepLabel(node.step);
}

const MAX_CARD_LINES = 4;

export function cardLines(node: GraphNode, ctx: CardContext): CardLine[] {
  const entries = stepDef(node.step)?.card?.(node, ctx) ?? [];
  return entries
    .flatMap((entry): CardLine[] => {
      if (!entry) return [];
      return [typeof entry === "string" ? { text: entry } : entry];
    })
    .filter((entry) => entry.text.trim().length > 0)
    .slice(0, MAX_CARD_LINES);
}

export function nodeOutputs(node: GraphNode, graph: GraphShape): StepOutput[] {
  const def = stepDef(node.step);
  if (!def) return [];
  const own = def.outputs ? def.outputs(node, graph) : SINGLE_OUTPUT;
  if (def.trigger || node.onError !== "branch") return own;
  return [...own, { id: "error", label: "Error" }];
}

export function emitsFor(node: GraphNode, handle: string): "result" | "input" {
  if (handle === "error") return "input";
  return stepDef(node.step)?.emits?.(handle) ?? "result";
}

export function outputLabel(
  graph: GraphShape,
  edge: { source: string; sourceHandle: string },
): string | undefined {
  const source = graph.nodes.find((n) => n.id === edge.source);
  if (!source) return undefined;
  return nodeOutputs(source, graph).find((o) => o.id === edge.sourceHandle)?.label;
}

export function edgeLabel(
  graph: GraphShape,
  edge: { source: string; sourceHandle: string; target: string },
): string {
  const title = (id: string) => {
    const node = graph.nodes.find((n) => n.id === id);
    return node ? nodeTitle(node) : "a step";
  };
  const output = outputLabel(graph, edge);
  return `${title(edge.source)}${output ? ` (${output})` : ""} to ${title(edge.target)}`;
}

export { CATEGORY_LABELS, RESOURCE_KINDS, STEP_CATEGORIES } from "./types";
export type {
  CardContext,
  CardEntry,
  CardLine,
  CheckContext,
  Effect,
  ParamKind,
  ParamOption,
  ParamSpec,
  ResourceKind,
  StepCategory,
  StepDef,
  StepOutput,
  TriggerSource,
  TypeContext,
} from "./types";
