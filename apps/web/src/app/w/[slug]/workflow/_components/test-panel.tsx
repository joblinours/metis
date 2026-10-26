"use client";

import { Button } from "@metis/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { FlaskConical, Loader2 } from "lucide-react";
import { useState } from "react";

import { NodeIcon } from "@/components/workflow-graph/node-meta";
import { testOverlay } from "@/components/workflow-graph/overlay";
import { StatusIcon, statusLabel } from "@/components/workflow-history/run-status";
import { useWorkspaceScope } from "@/hooks/use-workspace-path";
import { orpc, rpc } from "@/lib/orpc";
import type { TestWorkflowOutput } from "@/server/schema";
import { nodeTitle } from "@/workflow/kinds";
import { isTriggerKind } from "@/workflow/schema";

import { useDiagnostics, useOverlay } from "./editor-context";
import { useEditor, useEditorStore } from "./editor-store";
import { FormSelect } from "./forms/form-select";

export function TestPanel() {
  const scope = useWorkspaceScope();
  const store = useEditorStore();
  const graph = useEditor((s) => s.graph);
  const select = useEditor((s) => s.select);
  const diagnostics = useDiagnostics();
  const { show, source } = useOverlay();
  const triggers = graph.nodes.filter(
    (n) => isTriggerKind(n.kind) && n.kind !== "trigger.beforeSend",
  );
  const [chosenTrigger, setTrigger] = useState<string | null>(null);
  const trigger = triggers.find((t) => t.id === chosenTrigger) ?? triggers[0] ?? null;
  const watched =
    trigger?.kind === "trigger.newMail"
      ? graph.nodes.find(
          (n) =>
            n.kind === "mailbox.source" &&
            graph.edges.some((e) => e.source === trigger.id && e.target === n.id),
        )
      : undefined;
  const mailboxId = watched?.kind === "mailbox.source" ? watched.mailboxId : null;

  const samples = useQuery({
    ...rpc.workflows.testSamples.queryOptions({
      input: { ...scope, mailboxId: mailboxId ?? "" },
    }),
    enabled: !!mailboxId,
  });
  const [chosenMessage, setMessage] = useState<string | null>(null);
  const messages = samples.data?.messages ?? [];
  const messageId =
    messages.find((m) => m.messageId === chosenMessage)?.messageId ?? messages[0]?.messageId;

  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TestWorkflowOutput | null>(null);

  async function run() {
    if (!trigger) return;
    setRunning(true);
    setError(null);
    try {
      const tested = store.getState().graph;
      const output = await orpc.workflows.test({
        ...scope,
        graph: tested,
        triggerNodeId: trigger.id,
        ...(mailboxId && messageId ? { messageId } : {}),
      });
      setResult(output);
      show({ kind: "test" }, testOverlay(tested, output), false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The test run did not go through");
    } finally {
      setRunning(false);
    }
  }

  const blocked = diagnostics.count > 0;
  const reached = result
    ? graph.nodes.filter((n) => result.steps.some((s) => s.nodeId === n.id))
    : [];

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto px-4 py-3">
      <p className="text-[12px] text-muted-foreground">
        Runs this version of the workflow, saved or not, and changes nothing: actions report what
        they would do. Ask steps still call the decision model.
      </p>
      {triggers.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">
          Add a new-mail, schedule or manual trigger to test from.
        </p>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          {triggers.length > 1 && trigger && (
            <FormSelect
              label="Start from"
              className="w-56"
              value={trigger.id}
              onValueChange={setTrigger}
              options={triggers.map((t) => ({ value: t.id, label: nodeTitle(t) }))}
            />
          )}
          {mailboxId && (
            <div className="min-w-0 flex-1">
              {samples.isPending ? (
                <p className="text-[12px] text-faint">Loading the newest mail…</p>
              ) : samples.isError ? (
                <p className="text-[12px] text-destructive-text">{samples.error.message}</p>
              ) : messages.length === 0 ? (
                <p className="text-[12px] text-faint">That inbox has no mail to test with.</p>
              ) : (
                <FormSelect
                  label="Sample message"
                  value={messageId ?? ""}
                  onValueChange={setMessage}
                  options={messages.map((m) => ({
                    value: m.messageId,
                    label: `${m.subject} — ${m.from}`,
                  }))}
                />
              )}
            </div>
          )}
          <Button
            size="sm"
            onClick={run}
            disabled={running || blocked || (!!mailboxId && !messageId)}
          >
            {running ? <Loader2 className="animate-spin" /> : <FlaskConical />}
            Run test
          </Button>
        </div>
      )}
      {blocked && (
        <p className="text-[12px] text-destructive-text">
          Fix the problems in the workflow before testing it.
        </p>
      )}
      {error && <p className="text-[13px] text-destructive-text">{error}</p>}
      {result && source?.kind === "test" && (
        <section aria-label="Test result" className="flex flex-col gap-2">
          <p className="flex items-center gap-1.5 text-[13px]">
            <StatusIcon status={result.status} className="size-3.5" />
            <span className="font-medium capitalize">{result.status}</span>
            {result.sample && (
              <span className="truncate text-muted-foreground">
                · {result.sample.subject} — {result.sample.from}
              </span>
            )}
          </p>
          {result.error && <p className="text-[12px] text-destructive-text">{result.error}</p>}
          <ul className="flex flex-col">
            {reached.map((node) => {
              const lines = result.steps.filter((s) => s.nodeId === node.id);
              const items = result.items.filter((i) => i.nodeId === node.id).length;
              return (
                <li key={node.id}>
                  <button
                    type="button"
                    onClick={() => select([node.id])}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[13px] hover:bg-hover"
                  >
                    <NodeIcon
                      kind={node.kind}
                      className="size-3.5 shrink-0 text-muted-foreground"
                    />
                    <span className="w-40 shrink-0 truncate">{nodeTitle(node)}</span>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">
                      {lines
                        .map(
                          (line) =>
                            `${statusLabel(line.status)}${line.detail ? `: ${line.detail}` : ""}`,
                        )
                        .join(" · ")}
                    </span>
                    {items > 0 && <span className="shrink-0 text-[12px] text-faint">×{items}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
