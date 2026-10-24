import { z } from "zod";

import { THEME_BRAND_IDS } from "@/theme/brand";
import { WRITABLE_ATTENDEE_RESPONSES } from "@/types/calendar";
import { CUSTOM_LABEL_COLORS, MAIL_FOLDERS } from "@/types/mail";
import { askNodeSchema } from "@/workflow/schema";

export const folderEnum = z.enum(MAIL_FOLDERS);

export const mailboxTarget = { mailboxId: z.string() };

export const messageTarget = { mailboxId: z.string(), id: z.string() };

export const listEmailsFields = {
  ...mailboxTarget,
  folder: folderEnum,
  limit: z.number().min(1).max(50).default(10),
  pageToken: z.string().optional(),
};

export const draftFields = {
  to: z.array(z.string()).min(1),
  cc: z.array(z.string()).optional(),
  bcc: z.array(z.string()).optional(),
  subject: z.string(),
  bodyHtml: z.string(),
};

export const threadTarget = { mailboxId: z.string(), threadId: z.string() };

export const draftTarget = { mailboxId: z.string(), draftId: z.string() };

export const snoozeFields = {
  ...messageTarget,
  wakeAt: z
    .string()
    .describe("Absolute ISO-8601 time to bring the email back to the inbox; must be in the future"),
};

export const scheduleFields = {
  ...mailboxTarget,
  ...draftFields,
  scheduledFor: z.string().describe("Absolute ISO-8601 time to send it; must be in the future"),
};

export const scheduleTarget = {
  mailboxId: z.string(),
  scheduleId: z.string().describe("A scheduleId from listScheduled"),
};

export const attachmentTarget = {
  ...messageTarget,
  attachmentId: z.string().describe("An attachmentId from listAttachments"),
};

export const subscriptionScanFields = {
  ...mailboxTarget,
  scanLimit: z.number().int().min(10).max(200).default(100),
};

export const unsubscribeFields = {
  ...mailboxTarget,
  items: z
    .array(
      z.object({
        senderEmail: z.string().min(1),
        messageId: z
          .string()
          .min(1)
          .describe("The messageId listSubscriptions returned for this sender"),
      }),
    )
    .min(1)
    .max(25),
};

export const createLabelFields = {
  ...mailboxTarget,
  name: z.string().trim().min(1).max(40),
  color: z.enum(CUSTOM_LABEL_COLORS).optional(),
};

export const labelKeyTarget = {
  ...mailboxTarget,
  label: z.string().describe("A custom label key from listLabels"),
};

export const setLabelsFields = {
  ...mailboxTarget,
  ids: z.array(z.string().min(1)).min(1).max(200),
  label: z.string().min(1),
};

export const contactSearchFields = {
  ...mailboxTarget,
  query: z
    .string()
    .optional()
    .describe("Part of a name or address; omit for the most frequent contacts"),
  limit: z.number().int().min(1).max(100).default(20),
};

export const summarizeThreadFields = {
  ...messageTarget,
  threadId: z.string().optional(),
};

export const workflowTarget = {
  workflowId: z.string(),
};

const BASE_GRAPH_HINT =
  "A workflow is a node graph. Start with a trigger (trigger.newMail, trigger.schedule, trigger.manual or trigger.beforeSend), connect it to mailbox.source nodes (each carries its own mailboxId), then condition nodes (which expose 'matched' and 'unmatched' outputs) and action nodes. Every step other than a trigger, merge.append or merge.join takes exactly one incoming edge, but any node may fan out to several. merge.append and merge.join are the only steps that take several incoming edges: each one sets targetHandle to its own typed mail input ('in:0', 'in:1', … up to 'in:15'; every other edge omits targetHandle), every input must carry mail, and the output is mail, so only message actions or conditions may follow. Both pass the inputs on in input-number order and pass each message on once even when it arrives by two paths, so one downstream action path can serve several branches — for example a daily trigger.schedule fanning out to mailbox A and mailbox B (operation 'list'), both feeding one merge.append, which feeds a single action.label. merge.append continues with whatever its inputs found: an input that finds nothing adds nothing, and an input that fails shows in the run history while the other inputs still continue. merge.join instead waits for every input that ran in the same run to finish before passing anything on: an input that found nothing counts as finished, an input that failed or was blocked holds the whole join (nothing downstream runs until a retry succeeds) — and that includes a failure anywhere further up that input, even one that a merge.append in between passed over — and inputs belonging to a different trigger are not waited for. It never waits across runs — for example a daily trigger.schedule → mailbox A and mailbox B (operation 'list') → one merge.join → action.label labels mail from both only once both listings succeeded. One trigger.schedule or trigger.manual can therefore drive a separate branch per mailbox — for example a daily schedule fanning out to two mailbox.source nodes with operation 'list', one branch marking messages read in mailbox A while the other labels messages in mailbox B. operation 'incoming' only works under trigger.newMail, and a trigger.newMail connects to exactly one mailbox.source. To react to new mail in several mailboxes, add one trigger.newMail per mailbox, each feeding its own mailbox.source with operation 'incoming' — for example trigger A → mailbox A (incoming) → label, and trigger B → mailbox B (incoming) → star. Each trigger keeps its own baseline, so mail already present when a trigger is enabled is skipped, and new mail in A runs only A's branch.";

const DECISION_HINT =
  "decision.ask and decision.branch steps add AI decisions. A decision.ask takes mail; state.fields picks what is sent about each message (from, to, cc, subject, snippet, body, hasAttachment, date), and questions lists what to ask, each { id ('q1', 'q2', …), type, instructions } where type 'boolean' is a yes/no question, type 'choice' carries options [{ id ('o1', 'o2', …), name, description? }] plus other (true adds a 'None of the listed options fits' answer), and type 'score' carries levels [{ id ('l0', 'l1', …), name, description? }] ordered lowest first. Every question is asked in one call per message. Each question has its own output 'q:<questionId>', which connects only to decision.branch steps, and a question with nothing connected is still asked. A decision.branch takes exactly one question output and routes each message by that answer: boolean → 'yes' (probability ≥ yesAt, default 0.8), 'no' (≤ noAt, default 0.2) or 'unsure'; choice → 'opt:<optionId>', 'other' or 'unsure' (the top answer below minProbability, default 0.6); score → 'lvl:<levelId>' or 'unsure'. Several decision.branch steps may share one question with different thresholds. Ask steps never run under trigger.beforeSend, and every mailbox feeding one must have AI turned on.";

export function graphHint(decisionSteps: boolean): string {
  return decisionSteps ? `${BASE_GRAPH_HINT} ${DECISION_HINT}` : BASE_GRAPH_HINT;
}

export const SOURCES_HINT =
  "Each workflow's 'sources' lists one entry per trigger.newMail: triggerNodeId, the mailboxId it watches, paused (the workflow is disabled or the trigger was removed, so nothing is being watched), baselined (false while the first scan is still recording mail that was already there, which is never acted on), lastScanAt, and error (the last discovery failure, null once a scan succeeds).";

export const workflowRunFields = {
  workflowId: z.string().optional(),
  limit: z.number().min(1).max(100).default(25),
};

export const workflowRunDetailFields = {
  runId: z.string().min(1).describe("A run id from listWorkflowRuns"),
};

export const CANCEL_RUN_HINT =
  "Only that one run is cancelled; the workflow stays enabled and later triggers still run. A queued or retry-waiting run is cancelled at once (state 'cancelled'). A run that is executing right now is marked cancelled and stops before its next step (state 'stopping'); a step already in progress — including a send — cannot be called back and may still complete, and nothing already done at the provider is undone. A run that already finished comes back as state 'finished' with its status. Completed steps and unconfirmed outcomes stay in the run history. Relay the returned message to the user as is.";

export const RESUME_RUN_HINT =
  "Only a failed, partial or blocked run can be retried, within 7 days of finishing, and only while its workflow is on. It re-queues that same run on the revision that originally executed: steps that completed keep their results and are never repeated (a send that went out is not sent again), and only the steps that failed or were blocked run again. It is refused — state 'refused' with the reason — when a send in the run has an unconfirmed outcome, when the workflow's owner or a mailbox lost access, or when the run is already queued, running, completed or cancelled. It is not a new run: to act on mail again from the start, use applyWorkflows. Relay the returned message to the user as is.";

export const RUN_DETAIL_HINT =
  "Returns the trigger that opened it (new mail, schedule, one-shot or manual, with who requested a manual run), the immutable graph revision that executed and whether the workflow has been edited since, the workflow's principal, each mailbox it references (email is null when that mailbox is no longer available to you), and every step in execution order with its outcome lines and per-item attempts, timings and sanitized errors. A Wait-for-all step also lists each input's state and item count. Message bodies and recipient lists are never included; the graph omits mailbox steps' messageId, threadId and query, and details or errors touching a mailbox you can no longer see come back null — use listWorkflows for the live definition.";

export const listEventsFields = {
  timeMin: z.string().describe("ISO-8601 start of the window"),
  timeMax: z.string().describe("ISO-8601 end of the window"),
  calendarAccountId: z.string().optional(),
  calendarIds: z.array(z.string()).optional(),
  query: z.string().optional(),
  max: z.number().int().min(1).max(250).optional(),
};

export const eventTarget = {
  calendarAccountId: z.string().optional(),
  calendarId: z.string(),
  eventId: z.string(),
};

export const createEventFields = {
  calendarAccountId: z.string().optional(),
  calendarId: z.string().optional(),
  title: z.string(),
  description: z.string().optional(),
  location: z.string().optional(),
  start: z.string(),
  end: z.string(),
  allDay: z.boolean().optional(),
  attendees: z.array(z.string()).optional(),
  timeZone: z.string().optional(),
};

export const updateEventFields = {
  ...eventTarget,
  title: z.string().optional(),
  description: z.string().optional(),
  location: z.string().optional(),
  start: z.string().optional(),
  end: z.string().optional(),
  allDay: z.boolean().optional(),
  attendees: z.array(z.string()).optional(),
  timeZone: z.string().optional(),
};

export const respondEventFields = {
  ...eventTarget,
  response: z.enum(WRITABLE_ATTENDEE_RESPONSES),
};

export const memberMailFields = {
  memberId: z.string(),
  direction: z.enum(["from", "to", "either"]).default("either"),
  limit: z.number().int().min(1).max(50).default(15),
};

export const memberEventFields = {
  memberId: z.string(),
  timeMin: z.string().describe("ISO-8601 start of the window"),
  timeMax: z.string().describe("ISO-8601 end of the window"),
  max: z.number().int().min(1).max(100).default(50),
};

export const memberFileFields = {
  memberId: z.string(),
  query: z.string().optional().describe("Search inside the member's drives by name or content"),
  limit: z.number().int().min(1).max(100).default(25),
};

export const driveTarget = { driveId: z.string() };

export const fileTarget = {
  fileId: z
    .string()
    .describe("A fileId from listFolder, searchFiles, attached files or an <@file:…> chip"),
};

export const listFolderFields = {
  folderId: z
    .string()
    .optional()
    .describe("Omit for the top level, then pass a folder's fileId to go deeper"),
  cursor: z.string().optional(),
};

export const searchFilesFields = {
  query: z.string().min(1).max(200),
  cursor: z.string().optional(),
};

export const createFolderFields = {
  parentFolderId: z
    .string()
    .optional()
    .describe("The folder to create inside; omit for the top level"),
  name: z.string().min(1).max(255),
};

export const renameFileFields = {
  ...fileTarget,
  name: z.string().min(1).max(255),
};

export const pinFolderFields = {
  ...driveTarget,
  folderId: z.string().describe("A folder's fileId from listFolder or searchFiles"),
  label: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .optional()
    .describe("The name shown on the pin; defaults to the folder's name"),
};

export const pinTarget = {
  pinId: z.string().describe("A pinId from listPins"),
};

export const previewDecisionFields = {
  ...mailboxTarget,
  node: askNodeSchema,
  limit: z.number().int().min(1).max(20).default(10),
};

export const memberTarget = {
  memberId: z.string().describe("A memberId from listWorkspaceMembers"),
};

export const inviteTarget = {
  inviteId: z.string().describe("An inviteId from listInvites"),
};

export const themeFields = {
  themeBrand: z.enum(THEME_BRAND_IDS),
};

export const moveFileFields = {
  ...fileTarget,
  parentFolderId: z
    .string()
    .optional()
    .describe("The folder to move it into; omit for the top level"),
};
