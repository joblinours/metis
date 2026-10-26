import "server-only";
import { htmlToText } from "@/lib/utils";
import type { DraftPayload, Email } from "@/types/mail";

import type { Authorization, AuthorizedMailbox, BackgroundPrincipal } from "./authorization";
import { kindOf, type NodeOf } from "./kinds";
import type { DraftFacts, Envelope, MessageFacts, NodeReceipt, RunInput } from "./runtime";
import type { SourceHandle, WorkflowNode, WorkflowNodeKind } from "./schema";
import type { DefinitionRow } from "./store";

export type OutHandle = SourceHandle;

export interface HandlerResult {
  outputs: { handle: OutHandle; envelopes: Envelope[] }[];
  receipt?: NodeReceipt;
  detail?: string;
}

export type ExecutionMode = "live" | "policy" | "test";

export interface NodeContext {
  mode: ExecutionMode;
  now: Date;
  runId: string | null;
  signal?: AbortSignal;
  principal: BackgroundPrincipal;
  definition: DefinitionRow;
  input: RunInput;
  draft: DraftFacts | null;
  mailbox(mailboxId: string): Promise<Authorization<AuthorizedMailbox>>;
  aiAllowed(mailboxId: string): Promise<Authorization<true>>;
  payload(): Promise<DraftPayload | null>;
}

export type NodeHandler<K extends WorkflowNodeKind> = (
  node: NodeOf<K>,
  envelope: Envelope,
  ctx: NodeContext,
) => Promise<HandlerResult> | HandlerResult;

export type MessageEnvelope = Extract<Envelope, { port: "message" }>;

export class BlockedError extends Error {}

export function isDispatchNode(kind: WorkflowNodeKind): boolean {
  return kindOf(kind).retry === "dispatch";
}

export function factsFromEmail(email: Partial<Email>, loaded: boolean): MessageFacts {
  const bodyText = email.bodyText ?? (email.bodyHtml ? htmlToText(email.bodyHtml) : undefined);
  return {
    id: email.id ?? "",
    threadId: email.threadId,
    from: email.from ?? "",
    fromName: email.fromName,
    to: email.to ?? [],
    cc: email.cc,
    subject: email.subject ?? "",
    snippet: email.snippet ?? "",
    bodyText,
    hasAttachment: email.attachments ? email.attachments.length > 0 : undefined,
    date: email.date,
    loaded,
  };
}

export function itemKey(nodeId: string, mailboxId: string, itemId: string): string {
  return `${nodeId}:${mailboxId}:${itemId}`;
}

export function messageEnvelope(
  nodeId: string,
  mailboxId: string,
  facts: MessageFacts,
  lineage: string[],
): Envelope {
  return {
    port: "message",
    key: itemKey(nodeId, mailboxId, facts.id),
    mailboxId,
    messageId: facts.id,
    message: facts,
    lineage,
  };
}

export async function requireMailbox(
  ctx: NodeContext,
  mailboxId: string,
): Promise<AuthorizedMailbox> {
  const resolved = await ctx.mailbox(mailboxId);
  if (!resolved.ok) throw new BlockedError(resolved.reason);
  return resolved.value;
}

export async function ensureLoaded(
  envelope: MessageEnvelope,
  ctx: NodeContext,
): Promise<MessageEnvelope> {
  const facts = envelope.message;
  if (facts.loaded) return envelope;
  const box = await requireMailbox(ctx, envelope.mailboxId);
  const [full, attachments] = await Promise.all([
    box.adapter.getMessage(envelope.messageId),
    box.adapter.listAttachments(envelope.messageId),
  ]);
  return {
    ...envelope,
    message: factsFromEmail(
      {
        ...full,
        id: envelope.messageId,
        threadId: full.threadId ?? facts.threadId,
        from: full.from ?? facts.from,
        fromName: full.fromName ?? facts.fromName,
        to: full.to ?? facts.to,
        cc: full.cc ?? facts.cc,
        subject: full.subject ?? facts.subject,
        snippet: full.snippet ?? facts.snippet,
        attachments,
      },
      true,
    ),
  };
}

function untouched(node: WorkflowNode, envelope: MessageEnvelope): HandlerResult {
  return {
    outputs: [
      { handle: "out", envelopes: [{ ...envelope, lineage: [...envelope.lineage, node.id] }] },
    ],
    detail: "not applied in a test run",
  };
}

export async function messageAction(
  node: WorkflowNode,
  envelope: Envelope,
  ctx: NodeContext,
  act: (box: AuthorizedMailbox, envelope: MessageEnvelope) => Promise<string | undefined>,
): Promise<HandlerResult> {
  if (envelope.port !== "message") {
    return { outputs: [], detail: "no message to act on" };
  }
  if (ctx.mode === "policy") return { outputs: [], detail: "skipped in send policy" };
  if (ctx.mode === "test") return untouched(node, envelope);

  const box = await requireMailbox(ctx, envelope.mailboxId);
  const detail = await act(box, envelope);
  return {
    outputs: [
      {
        handle: "out",
        envelopes: [{ ...envelope, lineage: [...envelope.lineage, node.id] }],
      },
    ],
    detail: detail ?? box.email,
  };
}

export async function moveAction(
  node: WorkflowNode,
  envelope: Envelope,
  ctx: NodeContext,
  move: (box: AuthorizedMailbox, messageId: string) => Promise<string>,
): Promise<HandlerResult> {
  if (envelope.port !== "message") {
    return { outputs: [], detail: "no message to act on" };
  }
  if (ctx.mode === "policy") return { outputs: [], detail: "skipped in send policy" };
  if (ctx.mode === "test") return untouched(node, envelope);

  const box = await requireMailbox(ctx, envelope.mailboxId);
  const messageId = await move(box, envelope.messageId);
  return {
    outputs: [
      {
        handle: "out",
        envelopes: [{ ...envelope, messageId, lineage: [...envelope.lineage, node.id] }],
      },
    ],
    detail: box.email,
  };
}

export function mergeEnvelope(node: WorkflowNode, envelope: Envelope): HandlerResult {
  if (envelope.port !== "message") {
    return { outputs: [], detail: "no message to combine" };
  }
  return {
    outputs: [
      {
        handle: "out",
        envelopes: [
          {
            ...envelope,
            key: itemKey(node.id, envelope.mailboxId, envelope.messageId),
            lineage: [...envelope.lineage, node.id],
          },
        ],
      },
    ],
  };
}

export function requirePrincipal(ctx: NodeContext): string {
  if (!ctx.principal.userId) {
    throw new BlockedError("This workflow has no execution principal");
  }
  return ctx.principal.userId;
}
