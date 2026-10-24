import type { ResolvedReference } from "@/ai/references";
import type { WorkspaceTurnEnvelope } from "@/ai/turn";

let draft: ResolvedReference[] | null = null;

export function setPendingDraft(references: ResolvedReference[]) {
  draft = references;
}

export function takePendingDraft(): ResolvedReference[] | null {
  const taken = draft;
  draft = null;
  return taken;
}

interface Pending {
  threadId: string;
  text: string;
  turn: WorkspaceTurnEnvelope;
}

let pending: Pending | null = null;

export function setPendingMessage(threadId: string, text: string, turn: WorkspaceTurnEnvelope) {
  pending = { threadId, text, turn };
}

export function takePendingMessage(
  threadId: string,
): { text: string; turn: WorkspaceTurnEnvelope } | null {
  if (pending && pending.threadId === threadId) {
    const { text, turn } = pending;
    pending = null;
    return { text, turn };
  }
  return null;
}
