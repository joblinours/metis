import "server-only";
import type { UIMessage } from "ai";

import {
  type ReferenceDetail,
  type ReferenceScope,
  resolveReferences,
} from "@/ai/reference-directory";
import {
  type AgentReference,
  extractReferences,
  REFERENCE_TYPE_NOUN,
  referenceKey,
  serializeReference,
} from "@/ai/references";

const HEADER = `INLINE REFERENCES
The user picks resources from a menu and they arrive in the message as <@type:id> tokens. Every token below has ALREADY been resolved and authorized for this request. Use the tool arguments given here directly. Do NOT call a listing tool to look them up, confirm them, or translate them — that round trip is exactly what these tokens exist to remove.`;

const UNRESOLVED_NOTE =
  "These tokens no longer point at anything you can reach — the resource was removed, hidden from this workspace, or the id was typed by hand. Say the reference is no longer available. Do not guess a replacement and do not go hunting for one unless the user asks.";

function textOf(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

interface SplitReferences {
  current: AgentReference[];
  earlier: AgentReference[];
}

function referencesInMessages(messages: UIMessage[]): SplitReferences {
  const userMessages = messages.filter((m) => m.role === "user");
  const lastIndex = userMessages.length - 1;

  const seen = new Set<string>();
  const current: AgentReference[] = [];
  const earlier: AgentReference[] = [];

  userMessages.forEach((message, index) => {
    for (const ref of extractReferences(textOf(message))) {
      const key = referenceKey(ref);
      if (seen.has(key)) continue;
      seen.add(key);
      (index === lastIndex ? current : earlier).push(ref);
    }
  });

  return { current, earlier };
}

function describeArgs(args: Record<string, string>): string {
  return Object.entries(args)
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");
}

function describe(ref: ReferenceDetail): string {
  const noun = REFERENCE_TYPE_NOUN[ref.type];
  const detail = ref.detail ? ` (${ref.detail})` : "";
  return `- ${serializeReference(ref)} → the ${noun} "${ref.label}"${detail} — pass ${describeArgs(ref.toolArgs)}`;
}

export async function referenceLegend(
  scope: ReferenceScope,
  messages: UIMessage[],
): Promise<string | null> {
  const { current, earlier } = referencesInMessages(messages);
  if (current.length === 0 && earlier.length === 0) return null;

  const [now, before] = await Promise.all([
    resolveReferences(scope, current, { hydrate: true }),
    resolveReferences(scope, earlier, { hydrate: false }),
  ]);

  const lines: string[] = [HEADER, ""];

  for (const ref of now.resolved) lines.push(describe(ref));

  if (before.resolved.length > 0) {
    lines.push("", "Referenced earlier in this conversation:");
    for (const ref of before.resolved) lines.push(describe(ref));
  }

  const unresolved = [...now.unresolved, ...before.unresolved];
  if (unresolved.length > 0) {
    lines.push("", "UNRESOLVED REFERENCES", UNRESOLVED_NOTE);
    for (const ref of unresolved) lines.push(`- ${serializeReference(ref)}`);
  }

  return lines.join("\n");
}
