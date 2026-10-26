import type { NodeOf } from "@/workflow/kinds";
import type { WorkflowNode, WorkflowNodeKind } from "@/workflow/schema";

export interface StepFormProps<K extends WorkflowNodeKind> {
  node: NodeOf<K>;
  patch: (next: Partial<NodeOf<K>>) => void;
  replace: (node: WorkflowNode) => void;
}
