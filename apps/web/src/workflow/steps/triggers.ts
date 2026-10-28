import { describeSchedule, validCron, validTimezone } from "../cron";
import {
  fieldDeclProblems,
  fieldsType,
  parseFieldDecls,
  parseHeaderRules,
  parseStrings,
} from "../fields";
import { T } from "../values";
import { line, literal, literalOf, literalString, p, shown, step } from "./define";
import type { CardContext, StepDef } from "./types";

const FIRED = T.object({ firedAt: T.date, scheduledFor: T.date, missed: T.integer });

const filter = p.condition("Only when", {
  help: "A condition on the event; leave it empty to run on every one.",
});

function mailboxLine(ctx: CardContext, mailboxId: string, verb: string) {
  if (!mailboxId) return line("Pick a mailbox", "warn");
  return line(`${verb} ${ctx.mailboxEmail(mailboxId) ?? "a mailbox you can't see"}`);
}

function calendarLine(ctx: CardContext, accountId: string) {
  if (!accountId) return line("Pick a calendar", "warn");
  return line(`In ${ctx.calendarName(accountId) ?? "a calendar you can't see"}`);
}

function driveLine(ctx: CardContext, driveId: string) {
  if (!driveId) return line("Pick a drive", "warn");
  return line(`In ${ctx.driveName(driveId) ?? "a drive you can't see"}`);
}

const manual = step({
  key: "trigger.manual",
  label: "Run by hand",
  category: "trigger",
  description: "Starts when someone presses Run, with the inputs you declare.",
  trigger: { kind: "manual" },
  params: { inputs: p.fields("Inputs", { default: literal([]) }) },
  output: ({ node }) =>
    T.object({
      inputs: fieldsType(parseFieldDecls(literalOf(node, "inputs"))),
      requestedBy: T.person,
      requestedAt: T.date,
    }),
  effect: "read",
  check: ({ node }) => fieldDeclProblems(literalOf(node, "inputs"), "inputs"),
  card: (node) => {
    const inputs = parseFieldDecls(literalOf(node, "inputs"));
    return [
      line("When you press Run"),
      inputs.length > 0 &&
        line(`Asks for ${inputs.map((input) => input.name).join(", ")}`, "muted"),
    ];
  },
});

const schedule = step({
  key: "trigger.schedule",
  label: "On a schedule",
  category: "trigger",
  description: "Starts at the times a schedule names, in its time zone.",
  trigger: { kind: "time" },
  params: {
    cron: p.cron("Schedule", { required: true, default: literal("0 9 * * 1-5") }),
    timezone: p.timezone("Time zone", { required: true, default: literal("Etc/UTC") }),
  },
  output: () => FIRED,
  effect: "read",
  check: ({ node }) => {
    const cron = literalString(node, "cron");
    const timezone = literalString(node, "timezone");
    if (!validTimezone(timezone)) return ["Pick a valid time zone"];
    if (!validCron(cron, timezone)) return ["Use a five-field cron expression"];
    return [];
  },
  card: (node) => {
    const cron = literalString(node, "cron");
    const described = describeSchedule(cron);
    return [
      described ? line(described) : line(cron || "No schedule", cron ? undefined : "warn"),
      line(literalString(node, "timezone"), "muted"),
    ];
  },
});

const once = step({
  key: "trigger.once",
  label: "At a time",
  category: "trigger",
  description: "Starts once, at the time it names.",
  trigger: { kind: "once" },
  scope: "builtin",
  params: { at: p.datetime("When", { required: true, bindable: false }) },
  output: () => FIRED,
  effect: "read",
  card: (node) => [shown(node, "at", "At")],
});

const called = step({
  key: "trigger.call",
  label: "When called",
  category: "trigger",
  description:
    "Starts when another workflow's Call workflow step runs it, with the inputs you declare.",
  trigger: { kind: "call" },
  params: { inputs: p.fields("Inputs", { default: literal([]) }) },
  output: ({ node }) =>
    T.object({
      inputs: fieldsType(parseFieldDecls(literalOf(node, "inputs"))),
      parentRunId: T.text,
    }),
  effect: "read",
  check: ({ node }) => fieldDeclProblems(literalOf(node, "inputs"), "inputs"),
  card: (node) => {
    const inputs = parseFieldDecls(literalOf(node, "inputs"));
    return [
      line("When another workflow calls it"),
      inputs.length > 0 && line(`Takes ${inputs.map((input) => input.name).join(", ")}`, "muted"),
    ];
  },
});

export const WEBHOOK_AUTH = [
  { value: "secret", label: "Secret header" },
  { value: "hmac", label: "HMAC signature" },
] as const;

const webhook = step({
  key: "trigger.webhook",
  label: "Webhook",
  category: "trigger",
  description:
    "Starts when another service posts JSON to this workflow's URL. The body becomes the run's input.",
  trigger: { kind: "inbound" },
  params: {
    body: p.fields("Body fields", { default: literal([]) }),
    auth: p.select("Check", WEBHOOK_AUTH, { default: literal("secret") }),
    ips: p.strings("Only from these IPs", {
      default: literal([]),
      help: "Leave empty to accept any address.",
    }),
    headers: p.headers("Required headers", { default: literal([]) }),
  },
  output: ({ node }) =>
    T.object({
      body: fieldsType(parseFieldDecls(literalOf(node, "body"))),
      headers: T.json,
      receivedAt: T.date,
    }),
  effect: "read",
  check: ({ node }) => {
    const problems = fieldDeclProblems(literalOf(node, "body"), "body fields");
    const ips = parseStrings(literalOf(node, "ips"));
    if (ips.some((ip) => !/^[0-9a-fA-F.:/]+$/.test(ip)))
      problems.push("Write each IP as an address or CIDR range");
    const headers = literalOf(node, "headers");
    const listed = Array.isArray(headers) ? headers.length : 0;
    if (parseHeaderRules(headers).length !== listed) problems.push("Fix the required headers");
    return problems;
  },
  card: (node) => [
    line(
      literalString(node, "auth") === "hmac" ? "Signed with HMAC" : "Checked by a secret header",
    ),
    parseStrings(literalOf(node, "ips")).length > 0 &&
      line(`From ${parseStrings(literalOf(node, "ips")).join(", ")}`, "muted"),
  ],
});

const received = step({
  key: "trigger.mail.received",
  label: "Mail arrives",
  category: "trigger",
  description: "Starts for each new message in a folder of a mailbox.",
  trigger: { kind: "feed", resource: "mailbox" },
  params: {
    mailbox: p.mailbox("Mailbox", { required: true }),
    folder: p.mailFolder("Folder"),
    filter,
  },
  output: () => T.mail,
  effect: "read",
  card: (node, ctx) => [
    mailboxLine(ctx, literalString(node, "mailbox"), "Watching"),
    literalString(node, "folder") !== "inbox" &&
      line(`In ${literalString(node, "folder")}`, "muted"),
    shown(node, "filter", "When"),
  ],
});

const sent = step({
  key: "trigger.mail.sent",
  label: "Mail is sent",
  category: "trigger",
  description: "Starts for each new message in a mailbox's Sent folder, whoever sent it.",
  trigger: { kind: "feed", resource: "mailbox" },
  params: { mailbox: p.mailbox("Mailbox", { required: true }), filter },
  output: () => T.mail,
  effect: "read",
  card: (node, ctx) => [
    mailboxLine(ctx, literalString(node, "mailbox"), "From"),
    shown(node, "filter", "When"),
  ],
});

const starred = step({
  key: "trigger.mail.starred",
  label: "Mail is starred",
  category: "trigger",
  description: "Starts when a message in a mailbox gets a star.",
  trigger: { kind: "feed", resource: "mailbox" },
  params: { mailbox: p.mailbox("Mailbox", { required: true }), filter },
  output: () => T.mail,
  effect: "read",
  card: (node, ctx) => [
    mailboxLine(ctx, literalString(node, "mailbox"), "Watching"),
    shown(node, "filter", "When"),
  ],
});

const labelled = step({
  key: "trigger.mail.labelled",
  label: "Mail is labelled",
  category: "trigger",
  description: "Starts when a label is put on a message in Metis, by a person, AI or a workflow.",
  trigger: { kind: "app" },
  params: {
    mailbox: p.mailbox("Mailbox", { required: true }),
    label: p.label("Label", { required: true }),
  },
  output: () => T.mail,
  effect: "read",
  card: (node, ctx) => [
    mailboxLine(ctx, literalString(node, "mailbox"), "In"),
    literalString(node, "label") && line(`Label ${ctx.labelName(literalString(node, "label"))}`),
  ],
});

const beforeSend = step({
  key: "trigger.mail.beforeSend",
  label: "Before mail is sent",
  category: "trigger",
  description:
    "Runs on each outgoing message before it leaves, so the workflow can amend it. Only logic and draft steps may follow.",
  trigger: { kind: "beforeSend" },
  params: { mailbox: p.mailbox("Only from", { help: "Leave empty for every mailbox." }) },
  output: () => T.draft,
  effect: "read",
  card: (node, ctx) => {
    const mailboxId = literalString(node, "mailbox");
    return [
      mailboxId
        ? mailboxLine(ctx, mailboxId, "Sent from")
        : line("Every mailbox in this workspace"),
    ];
  },
});

function calendarTrigger<const K extends string>(
  key: K,
  label: string,
  description: string,
): StepDef & { key: K } {
  return step({
    key,
    label,
    category: "trigger",
    description,
    trigger: { kind: "feed", resource: "calendar" },
    params: {
      calendar: p.calendar("Calendar", { required: true }),
      calendarId: p.text("Only in calendar", {
        bindable: false,
        help: "Leave empty for every calendar of the account.",
      }),
      filter,
    },
    output: () => T.event,
    effect: "read",
    card: (node, ctx) => [
      calendarLine(ctx, literalString(node, "calendar")),
      shown(node, "filter", "When"),
    ],
  });
}

const eventCreated = calendarTrigger(
  "trigger.calendar.created",
  "Event created",
  "Starts for each new event in a calendar.",
);
const eventUpdated = calendarTrigger(
  "trigger.calendar.updated",
  "Event changed",
  "Starts when an event's time, title, place or attendees change.",
);
const eventCancelled = calendarTrigger(
  "trigger.calendar.cancelled",
  "Event cancelled",
  "Starts when an event is cancelled or deleted.",
);
const invited = calendarTrigger(
  "trigger.calendar.invited",
  "Invitation received",
  "Starts for each new event that asks you to respond.",
);

const rsvp = step({
  key: "trigger.calendar.rsvp",
  label: "Reply to an invitation",
  category: "trigger",
  description: "Starts when an attendee accepts, declines or tentatively accepts an event.",
  trigger: { kind: "feed", resource: "calendar" },
  params: {
    calendar: p.calendar("Calendar", { required: true }),
    calendarId: p.text("Only in calendar", { bindable: false }),
    filter,
  },
  output: () => T.object({ event: T.event, attendee: T.attendee, previous: T.text }),
  effect: "read",
  card: (node, ctx) => [
    calendarLine(ctx, literalString(node, "calendar")),
    shown(node, "filter", "When"),
  ],
});

const starting = step({
  key: "trigger.calendar.starting",
  label: "Event starting",
  category: "trigger",
  description: "Starts a set number of minutes before each event begins.",
  trigger: { kind: "feed", resource: "calendar" },
  params: {
    calendar: p.calendar("Calendar", { required: true }),
    calendarId: p.text("Only in calendar", { bindable: false }),
    minutes: p.number("Minutes before", {
      bindable: false,
      default: literal(15),
      min: 0,
      max: 10_080,
    }),
    filter,
  },
  output: () => T.event,
  effect: "read",
  card: (node, ctx) => [
    calendarLine(ctx, literalString(node, "calendar")),
    line(`${Number(literalOf(node, "minutes") ?? 15)} minutes before`),
  ],
});

const ended = calendarTrigger(
  "trigger.calendar.ended",
  "Event ended",
  "Starts when each event ends.",
);

function driveTrigger<const K extends string>(
  key: K,
  label: string,
  description: string,
): StepDef & { key: K } {
  return step({
    key,
    label,
    category: "trigger",
    description,
    trigger: { kind: "feed", resource: "drive" },
    params: {
      drive: p.drive("Drive", { required: true }),
      folder: p.driveFolder("Folder", {
        bindable: false,
        help: "Only files directly in this folder are watched. Leave empty for the top of the drive.",
      }),
      filter,
    },
    output: () => T.file,
    effect: "read",
    card: (node, ctx) => [
      driveLine(ctx, literalString(node, "drive")),
      literalString(node, "folder") && line(`Folder ${literalString(node, "folder")}`, "muted"),
      shown(node, "filter", "When"),
    ],
  });
}

const fileAdded = driveTrigger(
  "trigger.drive.added",
  "File added",
  "Starts for each new file in a folder.",
);
const fileChanged = driveTrigger(
  "trigger.drive.changed",
  "File changed",
  "Starts when a file in a folder is modified.",
);

const runFailed = step({
  key: "trigger.app.runFailed",
  label: "A run fails",
  category: "trigger",
  description:
    "Starts when a run of another workflow in this workspace fails, so this one can handle it.",
  trigger: { kind: "app" },
  params: { workflow: p.workflow("Only for", { help: "Leave empty for every workflow." }) },
  output: () =>
    T.object({
      workflowId: T.text,
      workflow: T.text,
      runId: T.text,
      error: T.text,
      failedAt: T.date,
    }),
  effect: "read",
  card: (node, ctx) => {
    const id = literalString(node, "workflow");
    return [
      line(id ? `When ${ctx.workflowName(id) ?? "a workflow"} fails` : "When any workflow fails"),
    ];
  },
});

const phishing = step({
  key: "trigger.app.phishing",
  label: "Phishing detected",
  category: "trigger",
  description: "Starts when phishing detection flags a message.",
  trigger: { kind: "app" },
  params: { mailbox: p.mailbox("Only in", { help: "Leave empty for every mailbox." }) },
  output: () => T.object({ message: T.mail, verdict: T.text, score: T.number }),
  effect: "read",
  card: (node, ctx) => {
    const id = literalString(node, "mailbox");
    return [id ? mailboxLine(ctx, id, "In") : line("Every mailbox")];
  },
});

const aiLabel = step({
  key: "trigger.app.aiLabel",
  label: "AI labels mail",
  category: "trigger",
  description: "Starts when AI classification puts a label on a message.",
  trigger: { kind: "app" },
  params: {
    mailbox: p.mailbox("Only in", { help: "Leave empty for every mailbox." }),
    label: p.label("Only label"),
  },
  output: () => T.object({ message: T.mail, label: T.text }),
  effect: "read",
  card: (node, ctx) => [
    literalString(node, "mailbox")
      ? mailboxLine(ctx, literalString(node, "mailbox"), "In")
      : line("Every mailbox"),
    literalString(node, "label") && line(`Label ${ctx.labelName(literalString(node, "label"))}`),
  ],
});

const memberJoined = step({
  key: "trigger.app.memberJoined",
  label: "Member joins",
  category: "trigger",
  description: "Starts when someone joins this workspace.",
  trigger: { kind: "app" },
  params: {},
  output: () => T.object({ member: T.person, userId: T.text, role: T.text, joinedAt: T.date }),
  effect: "read",
  card: () => [line("When someone joins the workspace")],
});

export const TRIGGER_STEPS = [
  manual,
  schedule,
  once,
  called,
  webhook,
  received,
  sent,
  starred,
  labelled,
  beforeSend,
  eventCreated,
  eventUpdated,
  eventCancelled,
  invited,
  rsvp,
  starting,
  ended,
  fileAdded,
  fileChanged,
  runFailed,
  phishing,
  aiLabel,
  memberJoined,
] as const satisfies readonly StepDef[];
