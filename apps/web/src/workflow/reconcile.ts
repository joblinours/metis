import "server-only";
import { sanitizeError } from "@/lib/errors/sanitize-error";
import { mailValue } from "@/ops/values";
import type { Email } from "@/types/mail";

import {
  type Authorization,
  type AuthorizedMailbox,
  authorizeMailbox,
  resolvePrincipal,
} from "./authorization";
import { errorCode } from "./diagnostics";
import { addressSet, normalizeSubject, sendFingerprint } from "./fingerprint";
import { type DispatchCandidate, type FoundDispatch, RECONCILERS } from "./reconcilers";
import { type RunResume, resumeCheckedRun } from "./resume";
import type { StepResolution } from "./runtime";
import type { SendCloseReason, WorkflowGraph } from "./schema";
import { stepDef } from "./steps";
import {
  claimedDispatchIds,
  CLAIMED_OPERATIONS,
  clearRetainedOutputs,
  type DefinitionRow,
  deferResolutionFinish,
  dropDraftBlob,
  getDraftBlob,
  listSendStepRuns,
  listUnfinishedResolutions,
  loadDefinition,
  loadDispatchStepRun,
  markResolutionFinished,
  type ReceiptConflict,
  resolveDispatchStepRun,
  type SendStepRunRow,
  sendReceiptConflict,
  type StepRunRow,
} from "./store";

const CLOCK_SKEW_MS = 10 * 60 * 1000;
const DISPATCH_GRACE_MS = 30 * 60 * 1000;
const FINISH_RETRY_MS = 15 * 60 * 1000;
const CANDIDATE_PAGE = 25;
const SENT_SCAN_PAGES = 4;
const MAX_CANDIDATES = 5;

export interface ExpectedSend {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
}

export const MAIL_SEND_STEPS = ["mail.send", "mail.reply", "mail.forward", "mail.sendScheduled"];

export interface UnconfirmedSend {
  definition: DefinitionRow;
  graph: WorkflowGraph;
  runId: string;
  stepRun: StepRunRow;
  status: "dispatching" | "unknown";
  mailboxId: string;
  settled: boolean;
}

export interface SentCandidate {
  id: string;
  subject: string;
  to: string[];
  date: string;
}

export type SendDecision =
  | { outcome: "verified"; providerMessageId: string }
  | { outcome: "closed"; reason: SendCloseReason; note: string | null };

export type SendResolution =
  | { state: "resolved"; message: string }
  | { state: "refused"; message: string };

function sendNodeIds(graph: WorkflowGraph): string[] {
  return graph.nodes.filter((node) => MAIL_SEND_STEPS.includes(node.step)).map((node) => node.id);
}

function isUnsettled(status: StepRunRow["status"]): boolean {
  return status === "dispatching" || status === "unknown";
}

function senderMailbox(graph: WorkflowGraph, row: StepRunRow): string | null {
  const expected = row.state?.expected;
  if (
    expected &&
    typeof expected === "object" &&
    "mailboxId" in expected &&
    typeof expected.mailboxId === "string"
  ) {
    return expected.mailboxId;
  }
  const node = graph.nodes.find((n) => n.id === row.nodeId);
  const bound = node?.params.mailbox;
  return bound?.kind === "literal" && typeof bound.value === "string" ? bound.value : null;
}

export async function findUnconfirmedSend(
  workflowId: string,
  stepRunId?: string,
): Promise<UnconfirmedSend | null> {
  const loaded = await loadDefinition(workflowId);
  if (!loaded) return null;
  const { definition, graph } = loaded;
  const rows = await listSendStepRuns({
    workflowIds: [workflowId],
    nodeIds: sendNodeIds(graph),
  });
  const match = stepRunId
    ? rows.find((row) => row.stepRun.id === stepRunId)
    : rows.find((row) => isUnsettled(row.stepRun.status) && !row.stepRun.resolvedAt);
  if (!match) return null;
  return toUnconfirmed(definition, graph, match);
}

function toUnconfirmed(
  definition: DefinitionRow,
  graph: WorkflowGraph,
  row: SendStepRunRow,
): UnconfirmedSend | null {
  const stepRun = row.stepRun;
  const mailboxId = senderMailbox(graph, stepRun) ?? definition.mailboxId ?? null;
  if (!mailboxId) return null;
  return {
    definition,
    graph,
    runId: row.runId,
    stepRun,
    status: stepRun.status === "dispatching" ? "dispatching" : "unknown",
    mailboxId,
    settled: row.runSettled,
  };
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

async function expectedSend(send: UnconfirmedSend): Promise<ExpectedSend | null> {
  const payload = await getDraftBlob(send.definition.id);
  const stored = send.stepRun.state?.expected;
  const own =
    stored && typeof stored === "object" && !Array.isArray(stored)
      ? Object.fromEntries(Object.entries(stored))
      : null;
  const expected: ExpectedSend | null = payload
    ? { to: payload.to, cc: payload.cc ?? [], bcc: payload.bcc ?? [], subject: payload.subject }
    : own
      ? {
          to: stringList(own.to),
          cc: stringList(own.cc),
          bcc: stringList(own.bcc),
          subject: typeof own.subject === "string" ? own.subject : "",
        }
      : null;
  if (!expected) return null;
  const recipients = [...expected.to, ...expected.cc, ...expected.bcc];
  return recipients.length > 0 ? expected : null;
}

async function senderAccess(send: UnconfirmedSend): Promise<Authorization<AuthorizedMailbox>> {
  const principal = await resolvePrincipal(send.definition);
  if (!principal.ok) return principal;
  return authorizeMailbox({
    definition: send.definition,
    principal: principal.value,
    mailboxId: send.mailboxId,
  });
}

function sameSet(a: Set<string>, b: Set<string>): boolean {
  return a.size === b.size && [...a].every((item) => b.has(item));
}

const NO_DISPATCH_TIME =
  "When this send was dispatched was never recorded, so a Sent message cannot be matched to it. You can still close it without resending";

export interface DispatchWindow {
  from: Date;
  to: Date;
}

export function dispatchWindow(stepRun: StepRunRow): DispatchWindow | null {
  if (!stepRun.startedAt) return null;
  const started = stepRun.startedAt.getTime();
  return {
    from: new Date(started - CLOCK_SKEW_MS),
    to: new Date(started + DISPATCH_GRACE_MS),
  };
}

export function matchSent(
  email: Partial<Email>,
  opts: { sender: string; expected: ExpectedSend; window: DispatchWindow },
): { ok: true; matched: string[] } | { ok: false; reason: string } {
  if (email.folder !== "sent") {
    return { ok: false, reason: "that message is not in the Sent folder" };
  }
  if (!sameSet(addressSet([email.from]), addressSet([opts.sender]))) {
    return {
      ok: false,
      reason: `that message was not sent from ${opts.sender}`,
    };
  }
  if (normalizeSubject(email.subject) !== normalizeSubject(opts.expected.subject)) {
    return { ok: false, reason: "its subject does not match" };
  }
  if (!sameSet(addressSet(email.to), addressSet(opts.expected.to))) {
    return { ok: false, reason: "its To recipients do not match" };
  }
  if (!sameSet(addressSet(email.cc), addressSet(opts.expected.cc))) {
    return { ok: false, reason: "its Cc recipients do not match" };
  }
  const matched = ["sender", "subject", "to", "cc"];
  const shownBcc = addressSet(email.bcc);
  if (shownBcc.size > 0) {
    if (!sameSet(shownBcc, addressSet(opts.expected.bcc))) {
      return { ok: false, reason: "its Bcc recipients do not match" };
    }
    matched.push("bcc");
  }
  const visible = addressSet([...opts.expected.to, ...opts.expected.cc]);
  if (visible.size === 0 && !matched.includes("bcc")) {
    return {
      ok: false,
      reason:
        "this message has only Bcc recipients and the provider does not show them on sent mail, so there is nothing to match",
    };
  }
  const sentAt = email.date ? Date.parse(email.date) : Number.NaN;
  if (Number.isNaN(sentAt)) {
    return {
      ok: false,
      reason: "the provider did not report when it was sent",
    };
  }
  if (sentAt < opts.window.from.getTime()) {
    return {
      ok: false,
      reason: "it was sent before this scheduled send was dispatched",
    };
  }
  if (sentAt > opts.window.to.getTime()) {
    return {
      ok: false,
      reason:
        "it was sent well after this scheduled send was dispatched, so it may be a later copy sent by hand",
    };
  }
  return { ok: true, matched: [...matched, "sent-during-dispatch"] };
}

async function sentPages(
  box: AuthorizedMailbox,
  pages: number,
  stop?: (email: Email) => boolean,
): Promise<Email[]> {
  const emails: Email[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < pages; page++) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- each page needs the previous page's token
    const listed = await box.adapter.listMessages("sent", pageToken, CANDIDATE_PAGE);
    for (const email of listed.emails) {
      emails.push({ ...email, folder: "sent" });
      if (stop?.(email)) return emails;
    }
    pageToken = listed.nextPageToken;
    if (!pageToken) break;
  }
  return emails;
}

export async function sentCandidates(
  send: UnconfirmedSend,
): Promise<
  { ok: true; candidates: SentCandidate[]; notice: string | null } | { ok: false; reason: string }
> {
  const expected = await expectedSend(send);
  if (!expected) {
    return {
      ok: false,
      reason:
        "The recipients and subject of this message are no longer stored, so there is nothing to compare the Sent folder against",
    };
  }
  const window = dispatchWindow(send.stepRun);
  if (!window) return { ok: false, reason: NO_DISPATCH_TIME };
  const access = await senderAccess(send);
  if (!access.ok) return { ok: false, reason: access.reason };
  const box = access.value;

  let emails: Email[];
  try {
    emails = await sentPages(box, 1);
  } catch (err) {
    return {
      ok: false,
      reason: `Could not read the Sent folder of ${box.email}: ${sanitizeError(err)}`,
    };
  }

  const candidates: SentCandidate[] = [];
  let indistinct = 0;
  const matched = emails.filter(
    (email) => matchSent(email, { sender: box.email, expected, window }).ok,
  );
  const conflicts = await Promise.all(matched.map((email) => receiptConflict(send, email)));
  for (const [i, email] of matched.entries()) {
    if (candidates.length >= MAX_CANDIDATES) break;
    const conflict = conflicts[i];
    if (conflict === "unidentified") indistinct += 1;
    if (conflict) continue;
    candidates.push({
      id: email.id,
      subject: email.subject,
      to: email.to,
      date: email.date,
    });
  }
  return {
    ok: true,
    candidates,
    notice:
      indistinct > 0
        ? `${indistinct} matching Sent message(s) were left out: another scheduled send from this mailbox was delivered around the same time without a provider message id, so they cannot be told apart from it.`
        : null,
  };
}

const refuse = (message: string): SendResolution => ({
  state: "refused",
  message,
});

function alreadyResolved(stepRun: StepRunRow): string {
  const when = stepRun.resolvedAt?.toISOString() ?? "earlier";
  return stepRun.resolution?.outcome === "verified"
    ? `This step was already confirmed (${when}).`
    : `This step was already closed without running it again (${when}).`;
}

function precheck(stepRun: StepRunRow, settled: boolean): SendResolution | null {
  if (stepRun.resolvedAt) return refuse(alreadyResolved(stepRun));
  if (!isUnsettled(stepRun.status)) {
    return refuse(
      stepRun.status === "completed"
        ? "This step already has a receipt — there is nothing to resolve."
        : "This step does not have an unconfirmed outcome.",
    );
  }
  if (!settled) {
    return refuse(
      "This run is still being handled — wait for it to finish before resolving the step.",
    );
  }
  return null;
}

export async function resolveUnconfirmedSend(opts: {
  send: UnconfirmedSend;
  userId: string;
  decision: SendDecision;
}): Promise<SendResolution> {
  const { send, decision } = opts;

  const refused = precheck(send.stepRun, send.settled);
  if (refused) return refused;

  const now = new Date();
  const base = {
    previousStatus: send.status,
    previousError: send.stepRun.error,
  };

  if (decision.outcome === "closed") {
    const resolution: StepResolution = {
      ...base,
      outcome: "closed",
      reason: decision.reason,
      note: decision.note?.trim() || null,
      evidence: null,
    };
    const closed = await resolveDispatchStepRun({
      id: send.stepRun.id,
      runId: send.runId,
      byUserId: opts.userId,
      now,
      resolution,
    });
    if (!closed) return refuse(await staleMessage(send));
    await finishResolution({
      workflowId: send.definition.id,
      runId: send.runId,
      stepRunId: send.stepRun.id,
      outcome: "closed",
    });
    return {
      state: "resolved",
      message:
        "Closed — the message will not be sent again, and its unconfirmed outcome stays in the history. The stored copy was discarded; to send it again, write a new message.",
    };
  }

  const expected = await expectedSend(send);
  if (!expected) {
    return refuse(
      "The recipients and subject of this message are no longer stored, so a sent message cannot be matched to it. You can still close it without resending.",
    );
  }
  const window = dispatchWindow(send.stepRun);
  if (!window) return refuse(`${NO_DISPATCH_TIME}.`);
  const access = await senderAccess(send);
  if (!access.ok) {
    return refuse(
      `${access.reason}, so the Sent folder cannot be checked. You can still close it without resending.`,
    );
  }
  const box = access.value;

  let email: Email | undefined;
  try {
    email = (
      await sentPages(box, SENT_SCAN_PAGES, (listed) => listed.id === decision.providerMessageId)
    ).find((listed) => listed.id === decision.providerMessageId);
  } catch (err) {
    return refuse(
      `Could not read the Sent folder of ${box.email}: ${sanitizeError(err)}. Delivery is not confirmed.`,
    );
  }
  if (!email) {
    return refuse(
      `That message is not among the most recent mail in the Sent folder of ${box.email}, so delivery is not confirmed.`,
    );
  }
  const match = matchSent(email, { sender: box.email, expected, window });
  if (!match.ok) {
    return refuse(
      `That message does not confirm this send: ${match.reason}. Delivery is not confirmed.`,
    );
  }
  const conflict = await receiptConflict(send, email);
  if (conflict) return refuse(CONFLICTS[conflict]);

  const value = mailValue(
    { mailboxId: send.mailboxId, email: box.email, adapter: box.adapter },
    { ...email, id: decision.providerMessageId, from: box.email, folder: "sent" },
  );
  const verified = await resolveDispatchStepRun({
    id: send.stepRun.id,
    runId: send.runId,
    byUserId: opts.userId,
    now,
    resolution: {
      ...base,
      outcome: "verified",
      reason: null,
      note: null,
      evidence: {
        providerMessageId: decision.providerMessageId,
        matched: match.matched,
      },
    },
    completion: {
      receipt: {
        operation: "send",
        providerMessageId: decision.providerMessageId,
        dispatchedAt: send.stepRun.startedAt?.toISOString(),
        settledAt: new Date(Date.parse(email.date)).toISOString(),
        verifiedAt: now.toISOString(),
        fingerprint: sendFingerprint(email),
      },
      send: {
        mailboxId: send.mailboxId,
        fingerprint: sendFingerprint(email),
        sentBetween: sentWindow(email),
      },
      output: {
        emits: [{ handle: "out", key: send.stepRun.itemKey, value, result: value }],
        detail: `confirmed in Sent as ${decision.providerMessageId}`,
      },
    },
  });
  if (!verified) return refuse(await staleMessage(send, email));

  const resumed = await finishResolution({
    workflowId: send.definition.id,
    runId: send.runId,
    stepRunId: send.stepRun.id,
    outcome: "verified",
  });
  const confirmed = `Confirmed — the message was found in the Sent folder of ${box.email}. It will not be sent again.`;
  if (resumed?.state === "resumed") {
    return {
      state: "resolved",
      message: `${confirmed} The steps after the send run on the next tick.`,
    };
  }
  return {
    state: "resolved",
    message: resumed
      ? `${confirmed} The steps after it were not queued: ${resumed.message}`
      : confirmed,
  };
}

async function staleMessage(send: UnconfirmedSend, email?: Email): Promise<string> {
  const fresh = await findUnconfirmedSend(send.definition.id, send.stepRun.id);
  if (fresh?.stepRun.resolvedAt) return alreadyResolved(fresh.stepRun);
  const conflict = email ? await receiptConflict(send, email) : null;
  if (conflict) return CONFLICTS[conflict];
  return "This send changed while you were resolving it — refresh and try again.";
}

const CONFLICTS: Record<ReceiptConflict, string> = {
  taken: "That message is already the delivery receipt of another scheduled send.",
  unidentified:
    "Another scheduled send from this mailbox was delivered around the same time, and its provider did not return a message id, so this message cannot be told apart from it. Close this send instead.",
};

function sentWindow(email: Email): { from: Date; to: Date } {
  const at = Date.parse(email.date);
  return {
    from: new Date(at - CLOCK_SKEW_MS),
    to: new Date(at + CLOCK_SKEW_MS),
  };
}

function receiptConflict(send: UnconfirmedSend, email: Email): Promise<ReceiptConflict | null> {
  return sendReceiptConflict({
    mailboxId: send.mailboxId,
    providerMessageId: email.id,
    fingerprint: sendFingerprint(email),
    exceptStepRunId: send.stepRun.id,
    sentBetween: sentWindow(email),
  });
}

export async function finishResolution(target: {
  workflowId: string;
  runId: string;
  stepRunId: string;
  outcome: StepResolution["outcome"];
}): Promise<RunResume | null> {
  await dropDraftBlob(target.workflowId);
  if (target.outcome === "closed") await clearRetainedOutputs(target.runId);
  const resumed = target.outcome === "verified" ? await resumeCheckedRun(target.runId) : null;
  await markResolutionFinished(target.stepRunId);
  return resumed;
}

export async function finishPendingResolutions(now: Date): Promise<number> {
  const pending = (await listUnfinishedResolutions(25, now)).map((row) => ({
    workflowId: row.workflowId,
    runId: row.runId,
    stepRunId: row.stepRunId,
    outcome: row.outcome,
  }));
  /* oxlint-disable eslint/no-await-in-loop -- resolutions of one run clear its outputs and resume it; one at a time keeps those steps from interleaving */
  for (const target of pending) {
    try {
      await finishResolution(target);
    } catch (err) {
      await deferResolutionFinish(
        target.stepRunId,
        new Date(now.getTime() + FINISH_RETRY_MS),
      ).catch(() => {});
      console.error(
        `[workflow] could not finish the resolution of step run ${target.stepRunId} code=${errorCode(err)}`,
      );
    }
  }
  /* oxlint-enable eslint/no-await-in-loop */
  return pending.length;
}

export interface UnconfirmedDispatch {
  definition: DefinitionRow;
  graph: WorkflowGraph;
  runId: string;
  stepRun: StepRunRow;
  step: string;
  settled: boolean;
}

export type DispatchView =
  | { state: "none" }
  | {
      state: "unconfirmed";
      stepRunId: string;
      step: string;
      settled: boolean;
      reconcilable: boolean;
      dispatchedAt: Date | null;
      error: string | null;
      candidates: DispatchCandidate[];
      lookupError: string | null;
      notice: string | null;
    };

export type DispatchDecision =
  | { outcome: "verified"; candidateId: string }
  | { outcome: "closed"; reason: SendCloseReason; note: string | null };

export async function findUnconfirmedDispatch(
  runId: string,
  stepRunId: string,
): Promise<UnconfirmedDispatch | null> {
  const row = await loadDispatchStepRun({ runId, stepRunId });
  if (!row) return null;
  const loaded = await loadDefinition(row.workflowId);
  if (!loaded) return null;
  const node = loaded.graph.nodes.find((n) => n.id === row.stepRun.nodeId);
  if (!node || stepDef(node.step)?.effect !== "dispatch") return null;
  return {
    definition: loaded.definition,
    graph: loaded.graph,
    runId: row.runId,
    stepRun: row.stepRun,
    step: node.step,
    settled: row.runSettled,
  };
}

function asSend(target: UnconfirmedDispatch): UnconfirmedSend | null {
  return toUnconfirmed(target.definition, target.graph, {
    workflowId: target.definition.id,
    runId: target.runId,
    runSettled: target.settled,
    stepRun: target.stepRun,
  });
}

function expectedOf(stepRun: StepRunRow): Record<string, unknown> | null {
  const stored = stepRun.state?.expected;
  return stored && typeof stored === "object" && !Array.isArray(stored)
    ? Object.fromEntries(Object.entries(stored))
    : null;
}

async function findDispatched(target: UnconfirmedDispatch): Promise<FoundDispatch[]> {
  const reconciler = RECONCILERS[target.step];
  if (!reconciler) return [];
  const window = dispatchWindow(target.stepRun);
  if (!window) throw new Error(NO_DISPATCH_TIME);
  const expected = expectedOf(target.stepRun);
  if (!expected) throw new Error("What this step was meant to do was not recorded");
  const principal = await resolvePrincipal(target.definition);
  if (!principal.ok) throw new Error(principal.reason);
  const found = await reconciler.find({ principal: principal.value, expected, window });
  const first = found[0]?.receipt;
  if (!first?.operation || !CLAIMED_OPERATIONS.has(first.operation)) return found;
  const claimed = await claimedDispatchIds({
    operation: first.operation,
    resourceId: first.resourceId ?? "",
    providerIds: found.map((entry) => entry.receipt.providerMessageId),
    exceptStepRunId: target.stepRun.id,
  });
  return found.filter((entry) => !claimed.has(entry.receipt.providerMessageId));
}

export async function inspectDispatch(target: UnconfirmedDispatch): Promise<DispatchView> {
  const base = {
    state: "unconfirmed" as const,
    stepRunId: target.stepRun.id,
    step: target.step,
    settled: target.settled,
    dispatchedAt: target.stepRun.startedAt,
    error: target.stepRun.error,
  };
  if (MAIL_SEND_STEPS.includes(target.step)) {
    const send = asSend(target);
    if (!send) {
      return {
        ...base,
        reconcilable: false,
        candidates: [],
        lookupError: "The mailbox of this send is unknown",
        notice: null,
      };
    }
    const found = target.settled
      ? await sentCandidates(send)
      : { ok: true as const, candidates: [], notice: null };
    return {
      ...base,
      reconcilable: true,
      candidates: found.ok
        ? found.candidates.map((candidate) => ({
            id: candidate.id,
            title: candidate.subject,
            subtitle: `To: ${candidate.to.join(", ")}`,
            at: candidate.date,
          }))
        : [],
      lookupError: found.ok ? null : found.reason,
      notice: found.ok ? found.notice : null,
    };
  }
  const reconcilable = target.step in RECONCILERS;
  if (!reconcilable || !target.settled) {
    return { ...base, reconcilable, candidates: [], lookupError: null, notice: null };
  }
  try {
    const found = await findDispatched(target);
    return {
      ...base,
      reconcilable,
      candidates: found
        .slice(0, MAX_CANDIDATES)
        .map(({ id, title, subtitle, at }) => ({ id, title, subtitle, at })),
      lookupError: null,
      notice: null,
    };
  } catch (err) {
    return {
      ...base,
      reconcilable,
      candidates: [],
      lookupError: sanitizeError(err),
      notice: null,
    };
  }
}

export async function resolveDispatch(opts: {
  target: UnconfirmedDispatch;
  userId: string;
  decision: DispatchDecision;
}): Promise<SendResolution> {
  const { target, decision } = opts;
  if (MAIL_SEND_STEPS.includes(target.step)) {
    const send = asSend(target);
    if (!send) return refuse("The mailbox of this send is unknown, so it cannot be resolved.");
    return resolveUnconfirmedSend({
      send,
      userId: opts.userId,
      decision:
        decision.outcome === "verified"
          ? { outcome: "verified", providerMessageId: decision.candidateId }
          : decision,
    });
  }

  const refused = precheck(target.stepRun, target.settled);
  if (refused) return refused;
  const now = new Date();
  const previousStatus = target.stepRun.status === "dispatching" ? "dispatching" : "unknown";
  const base = { previousStatus, previousError: target.stepRun.error } as const;

  if (decision.outcome === "closed") {
    const closed = await resolveDispatchStepRun({
      id: target.stepRun.id,
      runId: target.runId,
      byUserId: opts.userId,
      now,
      resolution: {
        ...base,
        outcome: "closed",
        reason: decision.reason,
        note: decision.note?.trim() || null,
        evidence: null,
      },
    });
    if (!closed) return refuse(await staleDispatch(target));
    await finishResolution({
      workflowId: target.definition.id,
      runId: target.runId,
      stepRunId: target.stepRun.id,
      outcome: "closed",
    });
    return {
      state: "resolved",
      message:
        "Closed — this step will not run again, nothing after it runs, and its unconfirmed outcome stays in the history.",
    };
  }

  let found: FoundDispatch[];
  try {
    found = await findDispatched(target);
  } catch (err) {
    return refuse(`Could not check the provider: ${sanitizeError(err)}. Nothing is confirmed.`);
  }
  const match = found.find((entry) => entry.id === decision.candidateId);
  if (!match) {
    return refuse(
      "That no longer matches what this step was meant to do, so nothing is confirmed.",
    );
  }
  const verified = await resolveDispatchStepRun({
    id: target.stepRun.id,
    runId: target.runId,
    byUserId: opts.userId,
    now,
    resolution: {
      ...base,
      outcome: "verified",
      reason: null,
      note: null,
      evidence: { providerMessageId: match.receipt.providerMessageId, matched: ["expected"] },
    },
    completion: {
      receipt: {
        ...match.receipt,
        dispatchedAt: target.stepRun.startedAt?.toISOString(),
        verifiedAt: now.toISOString(),
      },
      output: {
        emits: [
          { handle: "out", key: target.stepRun.itemKey, value: match.value, result: match.value },
        ],
        detail: match.detail,
      },
    },
  });
  if (!verified) return refuse(await staleDispatch(target));
  const resumed = await finishResolution({
    workflowId: target.definition.id,
    runId: target.runId,
    stepRunId: target.stepRun.id,
    outcome: "verified",
  });
  const confirmed = `Confirmed — ${match.title} is at the provider. It will not run again.`;
  if (resumed?.state === "resumed") {
    return { state: "resolved", message: `${confirmed} The steps after it run on the next tick.` };
  }
  return {
    state: "resolved",
    message: resumed
      ? `${confirmed} The steps after it were not queued: ${resumed.message}`
      : confirmed,
  };
}

async function staleDispatch(target: UnconfirmedDispatch): Promise<string> {
  const fresh = await loadDispatchStepRun({ runId: target.runId, stepRunId: target.stepRun.id });
  if (fresh?.stepRun.resolvedAt) return alreadyResolved(fresh.stepRun);
  return "This step changed while you were resolving it, or what it found is already the result of another step — refresh and try again.";
}
