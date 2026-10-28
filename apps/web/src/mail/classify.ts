import "server-only";
import { inArray } from "drizzle-orm";

import { recordAiUsage } from "@/ai/usage";
import { db } from "@/db";
import { mailboxLabel, mailLabel } from "@/db/schema";
import { classifierAgent } from "@/mastra/agents/classifier";
import { BUILT_IN_LABELS, type ClassifyItemInput } from "@/server/schema";
import { decisionEnabled } from "@/services/decision";
import { getLlm } from "@/services/llm";
import { labelsApplied } from "@/workflow/hooks";

import { compositeId } from "./aggregate";
import { CLASSIFY_GENERATE_OPTIONS, classifyPrompt } from "./classify-prompt";
import { classifyByDecision, labelsIn, labelTargets } from "./labels";
import { type MailSession, mailboxIds, policyForMailbox, scopeMessage } from "./session";

export type LabelMap = Record<string, { label: string; confidence: number }>;

export async function classifyMessages(
  mail: MailSession,
  items: ClassifyItemInput[],
): Promise<LabelMap> {
  if (items.length === 0) return {};

  const incomingIds = items.map((i) => i.id).filter(Boolean);
  const targets = labelTargets(mail, incomingIds).filter(
    (t) => policyForMailbox(mail, t.target.mailboxId).ai,
  );
  if (targets.length === 0) return {};

  const existing = await db
    .select({
      messageId: mailLabel.messageId,
      mailboxId: mailLabel.mailboxId,
      label: mailLabel.label,
      confidence: mailLabel.confidence,
    })
    .from(mailLabel)
    .where(labelsIn(targets));

  const byPair = new Map(
    targets.map((t) => [compositeId(t.target.mailboxId, t.target.messageId), t.id]),
  );

  const alreadyKnown = new Map<string, { label: string; confidence: number }>();
  for (const row of existing) {
    const id = byPair.get(compositeId(row.mailboxId, row.messageId));
    if (!id) continue;
    alreadyKnown.set(id, { label: row.label, confidence: row.confidence });
  }

  const customLabels = await db
    .selectDistinct({ key: mailboxLabel.key, name: mailboxLabel.name })
    .from(mailboxLabel)
    .where(inArray(mailboxLabel.mailboxId, mailboxIds(mail)));

  const validLabelKeys = new Set<string>([...BUILT_IN_LABELS, ...customLabels.map((l) => l.key)]);

  const allowed = new Set(targets.map((t) => t.id));
  const toClassify = items.filter((i) => allowed.has(i.id) && !alreadyKnown.has(i.id));
  let newClassifications: { id: string; label: string; confidence: number }[] = [];

  if (toClassify.length > 0 && decisionEnabled("classifier")) {
    try {
      newClassifications = await classifyByDecision(mail, toClassify, customLabels);
    } catch (err) {
      console.error("[mail/labels] classify by decision failed:", err);
    }
  } else if (toClassify.length > 0) {
    const refToId = new Map<string, string>();
    for (const [i, e] of toClassify.entries()) {
      refToId.set(`e${i + 1}`, e.id);
    }

    try {
      const result = await classifierAgent.generate(
        classifyPrompt(toClassify, customLabels),
        CLASSIFY_GENERATE_OPTIONS,
      );

      recordAiUsage({
        userId: mail.userId,
        workspaceId: mail.workspaceId,
        feature: "classify",
        model: getLlm().classifier.modelId,
        usage: result.totalUsage,
        steps: result.steps?.length,
        finishReason: typeof result.finishReason === "string" ? result.finishReason : undefined,
      });

      const { classifications } = result.object;
      newClassifications = classifications
        .map((c) => {
          const id = refToId.get(c.ref);
          if (!id) return null;
          if (!validLabelKeys.has(c.label)) return null;
          return { id, label: c.label, confidence: Math.round(c.confidence) };
        })
        .filter((c): c is { id: string; label: string; confidence: number } => c !== null);
    } catch (err) {
      console.error("[mail/labels] classify AI call failed:", err);
    }
  }

  if (newClassifications.length > 0) {
    const now = new Date();
    await db
      .insert(mailLabel)
      .values(
        newClassifications.map((c) => {
          const target = scopeMessage(mail, c.id);
          return {
            id: crypto.randomUUID(),
            mailboxId: target.mailboxId,
            messageId: target.messageId,
            label: c.label,
            confidence: c.confidence,
            classifiedAt: now,
          };
        }),
      )
      .onConflictDoNothing({
        target: [mailLabel.mailboxId, mailLabel.messageId],
      });
    for (const c of newClassifications) {
      labelsApplied([scopeMessage(mail, c.id)], c.label, "ai");
    }
  }

  const merged: LabelMap = {};
  for (const [id, info] of alreadyKnown) merged[id] = info;
  for (const c of newClassifications) {
    merged[c.id] = { label: c.label, confidence: c.confidence };
  }
  return merged;
}
