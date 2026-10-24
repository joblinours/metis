import "server-only";
import { sanitizeError } from "@/lib/errors/sanitize-error";
import type { Email } from "@/types/mail";

import {
  type Authorization,
  type AuthorizedMailbox,
  authorizeMailbox,
  resolvePrincipal,
} from "./authorization";
import { errorCode } from "./diagnostics";
import { addressSet, normalizeSubject, sendFingerprint } from "./fingerprint";
import { factsFromEmail, isDispatchNode, messageEnvelope } from "./nodes";
import { type RunResume, resumeCheckedRun } from "./resume";
import type { Envelope, NodeResolution } from "./runtime";
import type { SendCloseReason, WorkflowGraph } from "./schema";
import {
  clearRetainedOutputs,
  type DefinitionRow,
  deferResolutionFinish,
  dropPayload,
  getPayload,
  listNodeRuns,
  listSendNodeRuns,
  listUnfinishedResolutions,
  loadDefinition,
  markResolutionFinished,
  type NodeRunRow,
  type ReceiptConflict,
  redactSentOutputs,
  resolveSendNodeRun,
  type SendNodeRunRow,
  sendReceiptConflict,
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

export interface UnconfirmedSend {
  definition: DefinitionRow;
  graph: WorkflowGraph;
  runId: string;
  nodeRun: NodeRunRow;
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
  return graph.nodes.filter((node) => isDispatchNode(node.kind)).map((node) => node.id);
}

function isUnsettled(status: NodeRunRow["status"]): boolean {
  return status === "dispatching" || status === "unknown";
}

function senderMailbox(graph: WorkflowGraph, nodeId: string): string | null {
  const into = graph.edges.find((edge) => edge.target === nodeId);
  const source = graph.nodes.find((node) => node.id === into?.source);
  return source?.kind === "mailbox.source" ? source.mailboxId : null;
}

export async function findUnconfirmedSend(
  workflowId: string,
  nodeRunId?: string,
): Promise<UnconfirmedSend | null> {
  const loaded = await loadDefinition(workflowId);
  if (!loaded) return null;
  const { definition, graph } = loaded;
  const rows = await listSendNodeRuns({
    workflowIds: [workflowId],
    nodeIds: sendNodeIds(graph),
  });
  const match = nodeRunId
    ? rows.find((row) => row.nodeRun.id === nodeRunId)
    : rows.find((row) => isUnsettled(row.nodeRun.status) && !row.nodeRun.resolvedAt);
  if (!match) return null;
  return toUnconfirmed(definition, graph, match);
}

function toUnconfirmed(
  definition: DefinitionRow,
  graph: WorkflowGraph,
  row: SendNodeRunRow,
): UnconfirmedSend | null {
  const { nodeRun } = row;
  const mailboxId = senderMailbox(graph, nodeRun.nodeId) ?? definition.mailboxId ?? null;
  if (!mailboxId) return null;
  return {
    definition,
    graph,
    runId: row.runId,
    nodeRun,
    status: nodeRun.status === "dispatching" ? "dispatching" : "unknown",
    mailboxId,
    settled: row.runSettled,
  };
}

async function upstreamEnvelope(send: UnconfirmedSend): Promise<Envelope | null> {
  const into = send.graph.edges.find((edge) => edge.target === send.nodeRun.nodeId);
  if (!into) return null;
  const nodeRuns = await listNodeRuns(send.runId);
  for (const nodeRun of nodeRuns) {
    if (nodeRun.nodeId !== into.source) continue;
    for (const out of nodeRun.output?.outputs ?? []) {
      if (out.handle !== into.sourceHandle) continue;
      const found = out.envelopes.find((envelope) => envelope.key === send.nodeRun.inputKey);
      if (found) return found;
    }
  }
  return null;
}

async function expectedSend(
  send: UnconfirmedSend,
  upstream: Envelope | null,
): Promise<ExpectedSend | null> {
  const payload = await getPayload(send.definition.id);
  const draft = payload ?? (upstream?.port === "draft" ? upstream.draft : null);
  if (!draft) return null;
  const expected = {
    to: draft.to,
    cc: draft.cc ?? [],
    bcc: draft.bcc ?? [],
    subject: draft.subject,
  };
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

export function dispatchWindow(nodeRun: NodeRunRow): DispatchWindow | null {
  if (!nodeRun.startedAt) return null;
  const started = nodeRun.startedAt.getTime();
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
  const expected = await expectedSend(send, await upstreamEnvelope(send));
  if (!expected) {
    return {
      ok: false,
      reason:
        "The recipients and subject of this message are no longer stored, so there is nothing to compare the Sent folder against",
    };
  }
  const window = dispatchWindow(send.nodeRun);
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

function alreadyResolved(nodeRun: NodeRunRow): string {
  const when = nodeRun.resolvedAt?.toISOString() ?? "earlier";
  return nodeRun.resolution?.outcome === "verified"
    ? `This send was already confirmed as delivered (${when}).`
    : `This send was already closed without resending (${when}).`;
}

export async function resolveUnconfirmedSend(opts: {
  send: UnconfirmedSend;
  userId: string;
  decision: SendDecision;
}): Promise<SendResolution> {
  const { send, decision } = opts;

  if (send.nodeRun.resolvedAt) return refuse(alreadyResolved(send.nodeRun));
  if (!isUnsettled(send.nodeRun.status)) {
    return refuse(
      send.nodeRun.status === "completed"
        ? "This send already has a delivery receipt — there is nothing to resolve."
        : "This send does not have an unconfirmed outcome.",
    );
  }
  if (!send.settled) {
    return refuse(
      "This run is still being handled — wait for it to finish before resolving the send.",
    );
  }

  const now = new Date();
  const base = {
    previousStatus: send.status,
    previousError: send.nodeRun.error,
  };

  if (decision.outcome === "closed") {
    const resolution: NodeResolution = {
      ...base,
      outcome: "closed",
      reason: decision.reason,
      note: decision.note?.trim() || null,
      evidence: null,
    };
    const closed = await resolveSendNodeRun({
      id: send.nodeRun.id,
      runId: send.runId,
      mailboxId: send.mailboxId,
      byUserId: opts.userId,
      now,
      resolution,
    });
    if (!closed) return refuse(await staleMessage(send));
    await finishResolution({
      workflowId: send.definition.id,
      runId: send.runId,
      nodeRunId: send.nodeRun.id,
      outcome: "closed",
    });
    return {
      state: "resolved",
      message:
        "Closed — the message will not be sent again, and its unconfirmed outcome stays in the history. The stored copy was discarded; to send it again, write a new message.",
    };
  }

  const upstream = await upstreamEnvelope(send);
  const expected = await expectedSend(send, upstream);
  if (!expected) {
    return refuse(
      "The recipients and subject of this message are no longer stored, so a sent message cannot be matched to it. You can still close it without resending.",
    );
  }
  const window = dispatchWindow(send.nodeRun);
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

  const nodeId = send.nodeRun.nodeId;
  const facts = factsFromEmail(
    {
      id: decision.providerMessageId,
      threadId: email.threadId,
      from: box.email,
      to: email.to,
      cc: email.cc,
      subject: email.subject,
      snippet: "",
    },
    false,
  );
  const lineage = [...(upstream?.lineage ?? []), nodeId];
  const verified = await resolveSendNodeRun({
    id: send.nodeRun.id,
    runId: send.runId,
    mailboxId: send.mailboxId,
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
        dispatchedAt: send.nodeRun.startedAt?.toISOString(),
        settledAt: new Date(Date.parse(email.date)).toISOString(),
        verifiedAt: now.toISOString(),
        fingerprint: sendFingerprint(email),
      },
      sentBetween: sentWindow(email),
      output: {
        outputs: [
          {
            handle: "out",
            envelopes: [messageEnvelope(nodeId, send.mailboxId, facts, lineage)],
          },
        ],
        detail: `confirmed in Sent as ${decision.providerMessageId}`,
      },
    },
  });
  if (!verified) return refuse(await staleMessage(send, email));

  const resumed = await finishResolution({
    workflowId: send.definition.id,
    runId: send.runId,
    nodeRunId: send.nodeRun.id,
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
  const fresh = await findUnconfirmedSend(send.definition.id, send.nodeRun.id);
  if (fresh?.nodeRun.resolvedAt) return alreadyResolved(fresh.nodeRun);
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
    exceptNodeRunId: send.nodeRun.id,
    sentBetween: sentWindow(email),
  });
}

export async function finishResolution(target: {
  workflowId: string;
  runId: string;
  nodeRunId: string;
  outcome: NodeResolution["outcome"];
}): Promise<RunResume | null> {
  await dropPayload(target.workflowId);
  if (target.outcome === "closed") {
    await clearRetainedOutputs(target.runId);
  } else {
    await redactSentOutputs(target.runId);
  }
  const resumed = target.outcome === "verified" ? await resumeCheckedRun(target.runId) : null;
  await markResolutionFinished(target.nodeRunId);
  return resumed;
}

export async function finishPendingResolutions(now: Date): Promise<number> {
  const pending = await listUnfinishedResolutions(25, now);
  /* oxlint-disable eslint/no-await-in-loop -- resolutions of one run clear its outputs and resume it; one at a time keeps those steps from interleaving */
  for (const target of pending) {
    try {
      await finishResolution(target);
    } catch (err) {
      await deferResolutionFinish(
        target.nodeRunId,
        new Date(now.getTime() + FINISH_RETRY_MS),
      ).catch(() => {});
      console.error(
        `[workflow] could not finish the resolution of node run ${target.nodeRunId} code=${errorCode(err)}`,
      );
    }
  }
  /* oxlint-enable eslint/no-await-in-loop */
  return pending.length;
}
