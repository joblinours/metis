import "server-only";
import { htmlToText } from "@/lib/utils";
import type { DraftPayload } from "@/types/mail";

import { authorizeMailboxAccess, resolvePrincipal } from "../authorization";
import { executeRun } from "../executor";
import type { DraftFacts } from "../runtime";
import { listDefinitions } from "../store";

export interface SendPolicyInput {
  workspaceId: string;
  mailboxId: string;
  draft: DraftFacts;
}

export async function collectSendPolicyBccs(opts: SendPolicyInput): Promise<string[]> {
  const definitions = await listDefinitions({
    workspaceId: opts.workspaceId,
    kind: "user",
  });

  const known = new Set(
    [...opts.draft.to, ...(opts.draft.cc ?? []), ...(opts.draft.bcc ?? [])]
      .map((address) => address.trim().toLowerCase())
      .filter(Boolean),
  );
  const added: string[] = [];

  const outcomes = await Promise.all(
    definitions.map(async (loaded) => {
      if (!loaded.definition.enabled) return null;
      const trigger = loaded.graph.nodes.find((node) => node.kind === "trigger.beforeSend");
      if (trigger?.kind !== "trigger.beforeSend") return null;
      if (trigger.mailboxId && trigger.mailboxId !== opts.mailboxId) return null;

      const principal = await resolvePrincipal(loaded.definition);
      if (!principal.ok) return null;

      const access = await authorizeMailboxAccess({
        definition: loaded.definition,
        principal: principal.value,
        mailboxId: opts.mailboxId,
      });
      if (!access.ok) return null;

      return executeRun({
        runId: null,
        pure: true,
        definition: loaded.definition,
        graph: loaded.graph,
        principal: principal.value,
        input: {
          kind: "manual",
          triggerNodeId: trigger.id,
          requestedByUserId: "",
        },
        now: new Date(),
        seedDraft: opts.draft,
      });
    }),
  );

  for (const outcome of outcomes) {
    if (!outcome) continue;
    for (const draft of outcome.drafts) {
      for (const address of draft.bcc ?? []) {
        const key = address.trim().toLowerCase();
        if (!key || known.has(key)) continue;
        known.add(key);
        added.push(address.trim());
      }
    }
  }

  return added;
}

export async function prepareOutgoing(opts: {
  workspaceId: string;
  mailboxId: string;
  payload: DraftPayload;
}): Promise<DraftPayload> {
  const { payload } = opts;
  const bccs = await collectSendPolicyBccs({
    workspaceId: opts.workspaceId,
    mailboxId: opts.mailboxId,
    draft: {
      to: payload.to,
      cc: payload.cc,
      bcc: payload.bcc,
      subject: payload.subject,
      bodyHtml: payload.bodyHtml,
      bodyText: payload.bodyText ?? (payload.bodyHtml ? htmlToText(payload.bodyHtml) : undefined),
      hasAttachment: (payload.attachments?.length ?? 0) > 0,
    },
  });
  if (bccs.length === 0) return payload;
  return { ...payload, bcc: [...(payload.bcc ?? []), ...bccs] };
}
