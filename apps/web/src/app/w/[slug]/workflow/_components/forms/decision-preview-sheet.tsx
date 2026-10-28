"use client";

import { Dialog as SheetPrimitive } from "@base-ui/react/dialog";
import { Button } from "@metis/ui/components/button";
import { Sheet, SheetDescription, SheetHeader, SheetTitle } from "@metis/ui/components/sheet";
import { Loader2, XIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { useWorkspaceScope } from "@/hooks/use-workspace-path";
import { orpc } from "@/lib/orpc";
import type { PreviewDecisionOutput } from "@/server/schema";
import {
  answerLabel,
  type DecisionAnswer,
  type DecisionThresholds,
  nodeQuestions,
  questionIdOf,
  routeAnswer,
} from "@/workflow/decision";
import { DECISION_OTHER_OPTION_ID, type DecisionQuestion, type GraphNode } from "@/workflow/schema";

import { useEditorEnv } from "../editor-context";
import { useEditor } from "../editor-store";
import { FormSelect } from "./form-select";

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function describeAnswer(question: DecisionQuestion, answer: DecisionAnswer): string {
  if (answer.type === "refusal") return "Refused";
  if (answer.type === "boolean") return `Yes ${percent(answer.probability)}`;
  const best = Object.entries(answer.probabilities).toSorted((a, b) => b[1] - a[1])[0];
  if (!best) return "No answer";
  if (answer.type === "choice") {
    const label =
      best[0] === DECISION_OTHER_OPTION_ID ? "Other" : answerLabel(question, `opt:${best[0]}`);
    return `${label} ${percent(best[1])}`;
  }
  const level = question.type === "score" ? question.levels[Number(best[0])] : undefined;
  return `${level?.name ?? best[0]} ${percent(best[1])}`;
}

function threshold(node: GraphNode, name: keyof DecisionThresholds, fallback: number): number {
  const bound = node.params[name];
  return bound?.kind === "literal" && typeof bound.value === "number" ? bound.value : fallback;
}

function thresholdsOf(node: GraphNode): DecisionThresholds {
  return {
    yesAt: threshold(node, "yesAt", 0.8),
    noAt: threshold(node, "noAt", 0.2),
    minProbability: threshold(node, "minProbability", 0.6),
  };
}

export function DecisionPreviewSheet({
  open,
  onOpenChange,
  node,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  node: GraphNode;
}) {
  const scope = useWorkspaceScope();
  const { directory } = useEditorEnv();
  const usable = directory.mailboxes.filter((m) => m.aiEnabled);
  const questions = nodeQuestions(node);
  const [mailboxId, setMailboxId] = useState(usable[0]?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<PreviewDecisionOutput["items"]>([]);
  const graph = useEditor((s) => s.graph);
  const attached = useMemo(
    () =>
      graph.edges.flatMap((edge) => {
        if (edge.source !== node.id) return [];
        const target = graph.nodes.find((n) => n.id === edge.target);
        const questionId = questionIdOf(edge.sourceHandle);
        return target?.step === "ai.branch" && questionId
          ? [{ questionId, node: target, thresholds: thresholdsOf(target) }]
          : [];
      }),
    [graph, node.id],
  );

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const result = await orpc.workflows.previewDecision({
        ...scope,
        mailboxId,
        node: { params: node.params },
        limit: 10,
      });
      setItems(result.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not run the preview");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={false} disablePointerDismissal>
      <SheetPrimitive.Portal>
        <SheetPrimitive.Popup
          data-slot="sheet-content"
          data-side="left"
          className="fixed inset-y-0 left-0 z-50 flex h-full w-full flex-col gap-4 border-r bg-popover bg-clip-padding text-sm text-popover-foreground shadow-lg transition duration-200 ease-in-out data-ending-style:-translate-x-[2.5rem] data-ending-style:opacity-0 data-starting-style:-translate-x-[2.5rem] data-starting-style:opacity-0 sm:max-w-md"
        >
          <SheetHeader>
            <SheetTitle>Try on recent mail</SheetTitle>
            <SheetDescription>
              Asks this step's questions about the newest messages in a mailbox. Nothing is changed.
              Move a Branch step's thresholds and the routes below update without asking again.
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-3 overflow-y-auto px-4 pb-4">
            {usable.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No mailbox in this workspace has AI turned on.
              </p>
            ) : (
              <div className="flex items-center gap-2">
                <FormSelect
                  label="Mailbox"
                  className="flex-1"
                  value={mailboxId}
                  onValueChange={setMailboxId}
                  options={usable.map((m) => ({ value: m.id, label: m.email }))}
                />
                <Button size="sm" onClick={run} disabled={loading || !mailboxId}>
                  {loading && <Loader2 className="animate-spin" />}
                  Ask
                </Button>
              </div>
            )}
            {error && <p className="text-destructive-text text-sm">{error}</p>}
            {items.map((item) => (
              <div key={item.messageId} className="flex flex-col gap-1 rounded-md border p-2">
                <span className="truncate font-medium text-sm">
                  {item.subject || "(no subject)"}
                </span>
                <span className="truncate text-muted-foreground text-xs">{item.from}</span>
                {questions.map((question, index) => {
                  const answer = item.answers?.[question.id] ?? { type: "refusal" as const };
                  return (
                    <div key={question.id} className="text-xs">
                      <span className="text-muted-foreground">Q{index + 1}: </span>
                      {describeAnswer(question, answer)}
                      {attached
                        .filter((b) => b.questionId === question.id)
                        .map((b) => (
                          <span key={b.node.id} className="text-muted-foreground">
                            {" → "}
                            {answerLabel(
                              question,
                              routeAnswer(question, answer, b.thresholds).handle,
                            )}
                          </span>
                        ))}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <SheetPrimitive.Close
            data-slot="sheet-close"
            render={<Button variant="ghost" className="absolute top-3 right-3" size="icon-sm" />}
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        </SheetPrimitive.Popup>
      </SheetPrimitive.Portal>
    </Sheet>
  );
}
