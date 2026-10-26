import "server-only";
import { enforceRateLimit } from "@/services/rate-limit";
import type { Email } from "@/types/mail";

import { authorizeMailbox, resolvePrincipal } from "./authorization";
import { executeRun, type TraceStep } from "./executor";
import { checkGraph, type WorkspaceScope } from "./index";
import type { Envelope, RunInput } from "./runtime";
import { isTriggerKind, type NodeStatus, type RunStatus, type WorkflowGraph } from "./schema";
import type { DefinitionRow } from "./store";

const SAMPLE_WINDOW = 25;

export interface TestRunItem {
  nodeId: string;
  status: NodeStatus;
  subject: string | null;
  from: string | null;
  outputs: string[];
  detail: string | null;
  error: string | null;
}

export interface TestRunResult {
  status: RunStatus;
  error: string | null;
  sample: { subject: string; from: string } | null;
  steps: { nodeId: string; status: NodeStatus; count: number; detail: string | null }[];
  items: TestRunItem[];
}

export interface TestSample {
  messageId: string;
  subject: string;
  from: string;
  date: string | null;
}

function draftDefinition(scope: WorkspaceScope): DefinitionRow {
  const now = new Date();
  return {
    id: "test-run",
    kind: "user",
    workspaceId: scope.workspaceId,
    principalUserId: scope.userId,
    mailboxId: null,
    originLinkId: null,
    name: "Test run",
    targetKey: null,
    enabled: true,
    revision: 0,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

function sender(email: Pick<Email, "from" | "fromName">): string {
  return email.fromName || email.from;
}

async function inboxOf(
  scope: WorkspaceScope,
  mailboxId: string,
): Promise<{ ok: true; emails: Email[] } | { ok: false; message: string }> {
  const definition = draftDefinition(scope);
  const principal = await resolvePrincipal(definition);
  if (!principal.ok) return { ok: false, message: principal.reason };
  const box = await authorizeMailbox({ definition, principal: principal.value, mailboxId });
  if (!box.ok) return { ok: false, message: box.reason };
  const listed = await box.value.adapter.listMessages("inbox", undefined, SAMPLE_WINDOW);
  return { ok: true, emails: listed.emails ?? [] };
}

export async function listTestSamples(
  scope: WorkspaceScope,
  mailboxId: string,
): Promise<TestSample[] | string> {
  if (!scope.mailboxes.some((m) => m.mailboxId === mailboxId)) {
    return "That mailbox is not in this workspace";
  }
  const inbox = await inboxOf(scope, mailboxId);
  if (!inbox.ok) return inbox.message;
  return inbox.emails.map((email) => ({
    messageId: email.id,
    subject: email.subject || "(no subject)",
    from: sender(email),
    date: email.date || null,
  }));
}

function itemFacts(envelope: Envelope): { subject: string | null; from: string | null } {
  if (envelope.port === "message") {
    return {
      subject: envelope.message.subject || "(no subject)",
      from: envelope.message.fromName || envelope.message.from,
    };
  }
  if (envelope.port === "draft") {
    return { subject: envelope.draft.subject || "(no subject)", from: null };
  }
  return { subject: null, from: null };
}

function toItem(step: TraceStep): TestRunItem {
  return {
    nodeId: step.nodeId,
    status: step.status,
    ...itemFacts(step.envelope),
    outputs: step.outputs.filter((out) => out.count > 0).map((out) => out.handle),
    detail: step.detail ?? null,
    error: step.error ?? null,
  };
}

export async function testRunGraph(args: {
  scope: WorkspaceScope;
  graph: WorkflowGraph;
  triggerNodeId: string;
  messageId?: string;
}): Promise<TestRunResult | string> {
  const { scope, graph } = args;
  await enforceRateLimit(scope.userId, {
    scope: "workflow-test-run",
    limit: 10,
    windowSec: 60,
  });

  const invalid = checkGraph(graph, scope);
  if (invalid) return invalid;

  const trigger = graph.nodes.find((n) => n.id === args.triggerNodeId);
  if (!trigger || !isTriggerKind(trigger.kind)) return "Pick a trigger to test from";
  if (trigger.kind === "trigger.beforeSend") {
    return "A test run starts from a new-mail, schedule or manual trigger";
  }

  const definition = draftDefinition(scope);
  const principal = await resolvePrincipal(definition);
  if (!principal.ok) return principal.reason;

  let input: RunInput = {
    kind: "manual",
    triggerNodeId: trigger.id,
    requestedByUserId: scope.userId,
  };
  let sample: TestRunResult["sample"] = null;

  if (trigger.kind === "trigger.newMail") {
    const targets = new Set(
      graph.edges.filter((e) => e.source === trigger.id).map((e) => e.target),
    );
    const source = graph.nodes.find((n) => targets.has(n.id) && n.kind === "mailbox.source");
    if (source?.kind !== "mailbox.source") return "Connect this trigger to a Mailbox step";
    const inbox = await inboxOf(scope, source.mailboxId);
    if (!inbox.ok) return inbox.message;
    const email = args.messageId
      ? inbox.emails.find((e) => e.id === args.messageId)
      : inbox.emails[0];
    if (!email) return "That message is no longer among the newest in the inbox";
    sample = { subject: email.subject || "(no subject)", from: sender(email) };
    input = {
      kind: "newMail",
      triggerNodeId: trigger.id,
      messages: [
        {
          mailboxId: source.mailboxId,
          messageId: email.id,
          threadId: email.threadId,
          from: email.from,
          fromName: email.fromName,
          to: email.to,
          cc: email.cc,
          subject: email.subject,
          snippet: email.snippet,
          date: email.date,
        },
      ],
    };
  }

  const trace: TraceStep[] = [];
  const outcome = await executeRun({
    runId: null,
    mode: "test",
    definition,
    graph,
    principal: principal.value,
    input,
    now: new Date(),
    trace: (step) => trace.push(step),
  });

  return {
    status: outcome.status,
    error: outcome.error ?? null,
    sample,
    steps: outcome.summary.map((line) => ({
      nodeId: line.nodeId,
      status: line.status,
      count: line.count,
      detail: line.detail ?? null,
    })),
    items: trace.map(toItem),
  };
}
