import type { InStatement } from "@libsql/client";

import type { Migration, MigrationDb, Row } from "@/db/migrations";

const ID = "0001_workflow_engine";
const GRAPH_VERSION = 2;
const NODE_ID = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const UPGRADE_REASON =
  "Stopped by the upgrade to the new workflow engine; this workflow runs again on its next trigger.";
const SNOOZE_MOVED =
  "Moved to the new workflow engine, which brings the message back in a new run.";

const TABLES: string[] = [
  "CREATE TABLE `workflow_blob` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`workflow_id` text NOT NULL,\n\t`run_id` text,\n\t`kind` text NOT NULL,\n\t`name` text,\n\t`mime_type` text,\n\t`size` integer DEFAULT 0 NOT NULL,\n\t`payload` text,\n\t`data` text,\n\t`created_at` integer NOT NULL,\n\tFOREIGN KEY (`workflow_id`) REFERENCES `workflow`(`id`) ON UPDATE no action ON DELETE cascade,\n\tFOREIGN KEY (`run_id`) REFERENCES `workflow_run`(`id`) ON UPDATE no action ON DELETE cascade\n)",
  "CREATE TABLE `workflow_cursor` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`trigger_id` text NOT NULL,\n\t`scope` text NOT NULL,\n\t`cursor` text NOT NULL,\n\t`updated_at` integer NOT NULL,\n\tFOREIGN KEY (`trigger_id`) REFERENCES `workflow_trigger`(`id`) ON UPDATE no action ON DELETE cascade\n)",
  "CREATE TABLE `workflow_endpoint` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`workflow_id` text NOT NULL,\n\t`trigger_id` text NOT NULL,\n\t`kind` text NOT NULL,\n\t`secret` text NOT NULL,\n\t`external_id` text,\n\t`resource_id` text,\n\t`expires_at` integer,\n\t`last_seen_at` integer,\n\t`last_error` text,\n\t`created_at` integer NOT NULL,\n\t`updated_at` integer NOT NULL,\n\tFOREIGN KEY (`workflow_id`) REFERENCES `workflow`(`id`) ON UPDATE no action ON DELETE cascade,\n\tFOREIGN KEY (`trigger_id`) REFERENCES `workflow_trigger`(`id`) ON UPDATE no action ON DELETE cascade\n)",
  "CREATE TABLE `workflow_event` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`workflow_id` text NOT NULL,\n\t`trigger_id` text NOT NULL,\n\t`key` text NOT NULL,\n\t`scheduled_for` integer NOT NULL,\n\t`payload` text,\n\t`skipped_reason` text,\n\t`created_at` integer NOT NULL,\n\tFOREIGN KEY (`workflow_id`) REFERENCES `workflow`(`id`) ON UPDATE no action ON DELETE cascade,\n\tFOREIGN KEY (`trigger_id`) REFERENCES `workflow_trigger`(`id`) ON UPDATE no action ON DELETE cascade\n)",
  'CREATE TABLE `__new_workflow_resource` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`workflow_id` text NOT NULL,\n\t`revision_id` text NOT NULL,\n\t`node_id` text NOT NULL,\n\t`kind` text NOT NULL,\n\t`mailbox_id` text,\n\t`calendar_id` text,\n\t`drive_id` text,\n\t`mailbox_workspace_id` text,\n\t`calendar_workspace_id` text,\n\t`drive_workspace_id` text,\n\tFOREIGN KEY (`workflow_id`) REFERENCES `workflow`(`id`) ON UPDATE no action ON DELETE cascade,\n\tFOREIGN KEY (`revision_id`) REFERENCES `workflow_revision`(`id`) ON UPDATE no action ON DELETE cascade,\n\tFOREIGN KEY (`mailbox_id`) REFERENCES `mailbox`(`id`) ON UPDATE no action ON DELETE cascade,\n\tFOREIGN KEY (`calendar_id`) REFERENCES `calendar`(`id`) ON UPDATE no action ON DELETE cascade,\n\tFOREIGN KEY (`drive_id`) REFERENCES `drive`(`id`) ON UPDATE no action ON DELETE cascade,\n\tFOREIGN KEY (`mailbox_workspace_id`) REFERENCES `mailbox_workspace`(`id`) ON UPDATE no action ON DELETE cascade,\n\tFOREIGN KEY (`calendar_workspace_id`) REFERENCES `calendar_workspace`(`id`) ON UPDATE no action ON DELETE cascade,\n\tFOREIGN KEY (`drive_workspace_id`) REFERENCES `drive_workspace`(`id`) ON UPDATE no action ON DELETE cascade,\n\tCONSTRAINT "workflow_resource_one_ck" CHECK(("kind" = \'mailbox\' AND "mailbox_id" IS NOT NULL AND "calendar_id" IS NULL AND "drive_id" IS NULL) OR ("kind" = \'calendar\' AND "calendar_id" IS NOT NULL AND "mailbox_id" IS NULL AND "drive_id" IS NULL) OR ("kind" = \'drive\' AND "drive_id" IS NOT NULL AND "mailbox_id" IS NULL AND "calendar_id" IS NULL))\n)',
  "CREATE TABLE `__new_workflow_run` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`workflow_id` text NOT NULL,\n\t`revision_id` text NOT NULL,\n\t`event_id` text NOT NULL,\n\t`kind` text NOT NULL,\n\t`workspace_id` text,\n\t`principal_user_id` text,\n\t`parent_run_id` text,\n\t`limit_key` text,\n\t`input` text NOT NULL,\n\t`output` text,\n\t`status` text DEFAULT 'pending' NOT NULL,\n\t`due_at` integer NOT NULL,\n\t`attempts` integer DEFAULT 0 NOT NULL,\n\t`lease_owner` text,\n\t`lease_token` text,\n\t`lease_expires_at` integer,\n\t`started_at` integer,\n\t`finished_at` integer,\n\t`blocked_at` integer,\n\t`error` text,\n\t`summary` text,\n\t`upgraded` integer DEFAULT false NOT NULL,\n\t`created_at` integer NOT NULL,\n\tFOREIGN KEY (`workflow_id`) REFERENCES `workflow`(`id`) ON UPDATE no action ON DELETE cascade,\n\tFOREIGN KEY (`revision_id`) REFERENCES `workflow_revision`(`id`) ON UPDATE no action ON DELETE cascade,\n\tFOREIGN KEY (`event_id`) REFERENCES `workflow_event`(`id`) ON UPDATE no action ON DELETE cascade,\n\tFOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE cascade,\n\tFOREIGN KEY (`principal_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade\n)",
  "CREATE TABLE `workflow_step_run` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`run_id` text NOT NULL,\n\t`node_id` text NOT NULL,\n\t`item_key` text NOT NULL,\n\t`branch` text,\n\t`status` text NOT NULL,\n\t`input` text,\n\t`output` text,\n\t`output_handles` text,\n\t`state` text,\n\t`wake_at` integer,\n\t`receipt` text,\n\t`attempts` integer DEFAULT 0 NOT NULL,\n\t`error` text,\n\t`started_at` integer,\n\t`finished_at` integer,\n\t`resolution` text,\n\t`resolved_by_user_id` text,\n\t`resolved_at` integer,\n\tFOREIGN KEY (`run_id`) REFERENCES `workflow_run`(`id`) ON UPDATE no action ON DELETE cascade,\n\tFOREIGN KEY (`resolved_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null\n)",
  "CREATE TABLE `__new_workflow_trigger` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`workflow_id` text NOT NULL,\n\t`revision_id` text NOT NULL,\n\t`node_id` text NOT NULL,\n\t`kind` text NOT NULL,\n\t`cron` text,\n\t`timezone` text DEFAULT 'Etc/UTC' NOT NULL,\n\t`armed` integer DEFAULT true NOT NULL,\n\t`next_due_at` integer,\n\t`baseline_at` integer,\n\t`claimed_at` integer,\n\t`claim_token` text,\n\t`last_run_at` integer,\n\t`last_error` text,\n\t`created_at` integer NOT NULL,\n\t`updated_at` integer NOT NULL,\n\tFOREIGN KEY (`workflow_id`) REFERENCES `workflow`(`id`) ON UPDATE no action ON DELETE cascade,\n\tFOREIGN KEY (`revision_id`) REFERENCES `workflow_revision`(`id`) ON UPDATE no action ON DELETE cascade\n)",
  "CREATE TABLE `workflow_wait` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`run_id` text NOT NULL,\n\t`step_run_id` text NOT NULL,\n\t`workflow_id` text NOT NULL,\n\t`workspace_id` text,\n\t`kind` text NOT NULL,\n\t`status` text DEFAULT 'open' NOT NULL,\n\t`wake_at` integer,\n\t`deadline_at` integer,\n\t`approvers` text,\n\t`request` text,\n\t`child_run_id` text,\n\t`decision` text,\n\t`decided_by_user_id` text,\n\t`decided_at` integer,\n\t`note` text,\n\t`created_at` integer NOT NULL,\n\tFOREIGN KEY (`run_id`) REFERENCES `workflow_run`(`id`) ON UPDATE no action ON DELETE cascade,\n\tFOREIGN KEY (`step_run_id`) REFERENCES `workflow_step_run`(`id`) ON UPDATE no action ON DELETE cascade,\n\tFOREIGN KEY (`workflow_id`) REFERENCES `workflow`(`id`) ON UPDATE no action ON DELETE cascade,\n\tFOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE cascade,\n\tFOREIGN KEY (`decided_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null\n)",
];

const INDEXES: string[] = [
  'CREATE UNIQUE INDEX `workflow_blob_draft_idx` ON `workflow_blob` (`workflow_id`) WHERE "workflow_blob"."kind" = \'draft\'',
  "CREATE INDEX `workflow_blob_run_idx` ON `workflow_blob` (`run_id`)",
  "CREATE UNIQUE INDEX `workflow_cursor_trigger_scope_idx` ON `workflow_cursor` (`trigger_id`,`scope`)",
  "CREATE UNIQUE INDEX `workflow_endpoint_trigger_kind_idx` ON `workflow_endpoint` (`trigger_id`,`kind`)",
  "CREATE INDEX `workflow_endpoint_expiry_idx` ON `workflow_endpoint` (`kind`,`expires_at`)",
  "CREATE UNIQUE INDEX `workflow_event_key_idx` ON `workflow_event` (`trigger_id`,`key`)",
  "CREATE INDEX `workflow_event_workflow_idx` ON `workflow_event` (`workflow_id`)",
  "CREATE INDEX `workflow_event_created_idx` ON `workflow_event` (`created_at`)",
  "CREATE INDEX `workflow_resource_node_idx` ON `workflow_resource` (`revision_id`,`node_id`)",
  "CREATE INDEX `workflow_resource_mailbox_idx` ON `workflow_resource` (`mailbox_id`)",
  "CREATE INDEX `workflow_resource_calendar_idx` ON `workflow_resource` (`calendar_id`)",
  "CREATE INDEX `workflow_resource_drive_idx` ON `workflow_resource` (`drive_id`)",
  "CREATE UNIQUE INDEX `workflow_run_event_idx` ON `workflow_run` (`event_id`)",
  "CREATE INDEX `workflow_run_due_idx` ON `workflow_run` (`status`,`due_at`)",
  "CREATE INDEX `workflow_run_workflow_idx` ON `workflow_run` (`workflow_id`,`created_at`)",
  "CREATE INDEX `workflow_run_workspace_idx` ON `workflow_run` (`workspace_id`,`created_at`)",
  "CREATE INDEX `workflow_run_limit_idx` ON `workflow_run` (`workflow_id`,`limit_key`)",
  "CREATE INDEX `workflow_run_parent_idx` ON `workflow_run` (`parent_run_id`)",
  "CREATE UNIQUE INDEX `workflow_step_run_identity_idx` ON `workflow_step_run` (`run_id`,`node_id`,`item_key`)",
  "CREATE INDEX `workflow_step_run_run_idx` ON `workflow_step_run` (`run_id`)",
  "CREATE UNIQUE INDEX `workflow_trigger_node_idx` ON `workflow_trigger` (`workflow_id`,`node_id`)",
  "CREATE INDEX `workflow_trigger_due_idx` ON `workflow_trigger` (`armed`,`next_due_at`)",
  "CREATE INDEX `workflow_trigger_kind_idx` ON `workflow_trigger` (`kind`,`armed`)",
  "CREATE UNIQUE INDEX `workflow_wait_step_run_idx` ON `workflow_wait` (`step_run_id`)",
  "CREATE INDEX `workflow_wait_due_idx` ON `workflow_wait` (`status`,`wake_at`)",
  "CREATE INDEX `workflow_wait_workspace_idx` ON `workflow_wait` (`workspace_id`,`status`)",
  "CREATE INDEX `workflow_wait_run_idx` ON `workflow_wait` (`run_id`)",
];

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Binding = { kind: "literal"; value: Json } | { kind: "expr"; cel: string };

interface NewNode {
  id: string;
  step: string;
  title?: string;
  skip?: boolean;
  position: { x: number; y: number };
  params: Record<string, Binding>;
}

interface NewEdge {
  id: string;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle?: string;
}

interface NewGraph {
  version: number;
  nodes: NewNode[];
  edges: NewEdge[];
  settings: Record<string, never>;
}

interface Converted {
  graph: NewGraph;
  ids: Map<string, string>;
  steps: Map<string, string>;
}

type Old = Record<string, unknown>;

class Unconvertible extends Error {}

const literal = (value: Json): Binding => ({ kind: "literal", value });
const expr = (cel: string): Binding => ({ kind: "expr", cel });

function isObject(value: unknown): value is Old {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function json(value: unknown): unknown {
  if (typeof value !== "string") return value ?? null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

const FIELD_EXPR: Record<string, string> = {
  from: 'item.fromName + " <" + item.from + ">"',
  to: 'joined(item.to, ", ")',
  cc: 'joined(item.cc, ", ")',
  subject: "item.subject",
  body: "item.body",
};

function predicateCel(node: unknown): string {
  if (!isObject(node)) throw new Unconvertible("a condition is malformed");
  if (node.kind === "group") {
    const children = Array.isArray(node.children) ? node.children.map(predicateCel) : [];
    if (children.length === 0) return "false";
    return `(${children.join(node.logic === "any" ? " || " : " && ")})`;
  }
  const field = str(node.field);
  if (field === "hasAttachment")
    return node.value === "true" ? "item.hasAttachments" : "!item.hasAttachments";
  const haystack = FIELD_EXPR[field];
  if (!haystack) throw new Unconvertible(`unknown condition field ${field}`);
  const sensitive = node.caseSensitive === true;
  const value = str(node.value);
  const left = sensitive ? `(${haystack})` : `lower(${haystack})`;
  const right = JSON.stringify(sensitive ? value : value.toLowerCase());
  switch (node.op) {
    case "equals":
      return `${left} == ${right}`;
    case "startsWith":
      return `${left}.startsWith(${right})`;
    case "endsWith":
      return `${left}.endsWith(${right})`;
    default:
      return `${left}.contains(${right})`;
  }
}

function needsFull(node: unknown): boolean {
  if (!isObject(node)) return false;
  if (node.kind === "group") return Array.isArray(node.children) && node.children.some(needsFull);
  return node.field === "body" || node.field === "hasAttachment";
}

const ASK_FIELDS: Record<string, string> = {
  from: "from",
  to: "to",
  cc: "cc",
  subject: "subject",
  snippet: "snippet",
  body: "body",
  hasAttachment: "hasAttachments",
  date: "date",
};

const HANDLES: Record<string, string> = { matched: "yes", unmatched: "no" };

function safeId(id: string, taken: Set<string>): string {
  if (NODE_ID.test(id) && !taken.has(id)) return id;
  const base = `s_${id.replace(/[^A-Za-z0-9_]/g, "_")}`.slice(0, 60);
  let candidate = base;
  for (let n = 2; taken.has(candidate); n += 1) candidate = `${base}_${n}`;
  return candidate;
}

function asJson(value: unknown): Json {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
    return value;
  if (Array.isArray(value)) return value.map(asJson);
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, asJson(entry)]));
  }
  return null;
}

export function convertGraph(raw: unknown): Converted {
  if (!isObject(raw) || !Array.isArray(raw.nodes) || !Array.isArray(raw.edges)) {
    throw new Unconvertible("the graph is malformed");
  }
  const oldNodes = raw.nodes.filter(isObject);
  const oldEdges = raw.edges.filter(isObject);
  const taken = new Set<string>();
  const ids = new Map<string, string>();
  for (const node of oldNodes) {
    const id = safeId(str(node.id), taken);
    taken.add(id);
    ids.set(str(node.id), id);
  }
  const idOf = (old: string) => ids.get(old) ?? old;
  const byId = new Map(oldNodes.map((n) => [str(n.id), n]));
  const sourcesOf = (target: string) =>
    oldEdges.filter((e) => e.target === target).map((e) => str(e.source));
  const steps = new Map<string, string>();
  const dropped = new Map<string, string>();
  const nodes: NewNode[] = [];
  const loadBefore = new Map<string, string>();

  const position = (node: Old) =>
    isObject(node.position) &&
    typeof node.position.x === "number" &&
    typeof node.position.y === "number"
      ? { x: node.position.x, y: node.position.y }
      : { x: 0, y: 0 };
  const add = (node: Old, step: string, params: Record<string, Binding>) => {
    const id = idOf(str(node.id));
    steps.set(id, step);
    nodes.push({
      id,
      step,
      position: position(node),
      params,
      ...(typeof node.title === "string" && node.title ? { title: node.title } : {}),
      ...(node.skip === true ? { skip: true } : {}),
    });
  };
  const listedUpstream = (nodeId: string): string | null => {
    const seen = new Set<string>();
    const stack = sourcesOf(nodeId);
    while (stack.length > 0) {
      const id = stack.pop() ?? "";
      if (seen.has(id)) continue;
      seen.add(id);
      const node = byId.get(id);
      if (node?.kind === "mailbox.source")
        return node.operation === "list" ? str(node.mailboxId) : null;
      stack.push(...sourcesOf(id));
    }
    return null;
  };

  for (const node of oldNodes) {
    const id = idOf(str(node.id));
    switch (str(node.kind)) {
      case "trigger.newMail": {
        const edge = oldEdges.find((e) => e.source === node.id);
        const source = edge ? byId.get(str(edge.target)) : undefined;
        if (source?.kind === "mailbox.source") dropped.set(idOf(str(source.id)), id);
        add(node, "trigger.mail.received", {
          mailbox: literal(source ? str(source.mailboxId) : ""),
          folder: literal(source && typeof source.folder === "string" ? source.folder : "inbox"),
        });
        break;
      }
      case "trigger.schedule":
        add(node, "trigger.schedule", {
          cron: literal(str(node.cron)),
          timezone: literal(str(node.timezone) || "Etc/UTC"),
        });
        break;
      case "trigger.manual":
        add(node, "trigger.manual", { inputs: literal([]) });
        break;
      case "trigger.once":
        add(node, "trigger.once", { at: literal(str(node.at)) });
        break;
      case "trigger.beforeSend":
        add(
          node,
          "trigger.mail.beforeSend",
          str(node.mailboxId) ? { mailbox: literal(str(node.mailboxId)) } : {},
        );
        break;
      case "mailbox.source": {
        if (dropped.has(id)) break;
        if (node.operation === "incoming")
          throw new Unconvertible("an incoming mailbox step has no new-mail trigger");
        if (node.operation === "draft") {
          dropped.set(id, idOf(sourcesOf(str(node.id))[0] ?? ""));
          break;
        }
        if (node.operation === "message") {
          add(node, "mail.get", {
            mailbox: literal(str(node.mailboxId)),
            id: literal(str(node.messageId)),
          });
          break;
        }
        const limit = typeof node.limit === "number" ? node.limit : 50;
        if (str(node.query)) {
          add(node, "mail.search", {
            mailbox: literal(str(node.mailboxId)),
            query: literal(str(node.query)),
            limit: literal(limit),
          });
        } else {
          add(node, "mail.list", {
            mailbox: literal(str(node.mailboxId)),
            folder: literal(str(node.folder) || "inbox"),
            limit: literal(limit),
          });
        }
        break;
      }
      case "condition": {
        add(node, "logic.if", { condition: expr(predicateCel(node.predicate)) });
        const mailbox = listedUpstream(str(node.id));
        if (needsFull(node.predicate) && mailbox) loadBefore.set(id, mailbox);
        break;
      }
      case "decision.ask": {
        const fields =
          isObject(node.state) && Array.isArray(node.state.fields)
            ? node.state.fields.map(String)
            : [];
        add(node, "ai.ask", {
          subject: expr("item"),
          include: literal(fields.map((field) => ASK_FIELDS[field] ?? field)),
          questions: literal(Array.isArray(node.questions) ? asJson(node.questions) : []),
        });
        const mailbox = listedUpstream(str(node.id));
        if ((fields.includes("body") || fields.includes("hasAttachment")) && mailbox)
          loadBefore.set(id, mailbox);
        break;
      }
      case "decision.branch":
        add(node, "ai.branch", {
          yesAt: literal(typeof node.yesAt === "number" ? node.yesAt : 0.8),
          noAt: literal(typeof node.noAt === "number" ? node.noAt : 0.2),
          minProbability: literal(
            typeof node.minProbability === "number" ? node.minProbability : 0.6,
          ),
        });
        break;
      case "merge.append":
        add(node, "logic.merge", {});
        break;
      case "merge.join":
        add(node, "logic.join", {});
        break;
      case "action.markRead":
        add(node, "mail.markRead", { message: expr("item"), read: literal(true) });
        break;
      case "action.star":
        add(node, "mail.star", { message: expr("item"), starred: literal(true) });
        break;
      case "action.label":
        add(node, "mail.label", {
          message: expr("item"),
          label: literal(str(node.label)),
          action: literal("add"),
        });
        break;
      case "action.mute":
        add(node, "mail.mute", { message: expr("item") });
        break;
      case "action.archive":
        add(node, "mail.archive", { message: expr("item") });
        break;
      case "action.trash":
        add(node, "mail.trash", { message: expr("item") });
        break;
      case "action.restore":
        add(node, "mail.toInbox", { message: expr("item") });
        break;
      case "action.send": {
        const draft = sourcesOf(str(node.id))
          .map((s) => byId.get(s))
          .find((s) => s?.kind === "mailbox.source");
        add(node, "mail.sendScheduled", { mailbox: literal(draft ? str(draft.mailboxId) : "") });
        break;
      }
      case "action.autoBcc":
        add(node, "mail.addBcc", { address: literal(str(node.address)) });
        break;
      case "action.system":
        add(node, node.operation === "audit-prune" ? "system.auditPrune" : "system.cimdPrune", {});
        break;
      default:
        throw new Unconvertible(`the step kind ${str(node.kind)} is not known`);
    }
  }

  const resolve = (old: string) => {
    let current = idOf(old);
    for (let hops = 0; dropped.has(current) && hops < 5; hops += 1)
      current = dropped.get(current) ?? current;
    return current;
  };
  const edges: NewEdge[] = [];
  for (const edge of oldEdges) {
    const target = idOf(str(edge.target));
    if (dropped.has(target)) continue;
    const source = resolve(str(edge.source));
    if (source === target) continue;
    const handle = HANDLES[str(edge.sourceHandle)] ?? (str(edge.sourceHandle) || "out");
    const targetHandle =
      typeof edge.targetHandle === "string" && edge.targetHandle !== "in"
        ? edge.targetHandle
        : undefined;
    const load = loadBefore.get(target);
    if (load) {
      const loadId = safeId(`${target}_load`, taken);
      taken.add(loadId);
      const at = nodes.find((n) => n.id === target)?.position ?? { x: 0, y: 0 };
      nodes.push({
        id: loadId,
        step: "mail.get",
        position: { x: at.x - 40, y: at.y + 40 },
        params: { mailbox: literal(load), id: expr("item.id") },
      });
      steps.set(loadId, "mail.get");
      edges.push({
        id: `${source}:${handle}->${loadId}`,
        source,
        sourceHandle: handle,
        target: loadId,
      });
      edges.push({ id: `${loadId}:out->${target}`, source: loadId, sourceHandle: "out", target });
      loadBefore.delete(target);
      continue;
    }
    edges.push({
      id: `${source}:${handle}->${target}${targetHandle ? `:${targetHandle}` : ""}`,
      source,
      sourceHandle: handle,
      target,
      ...(targetHandle ? { targetHandle } : {}),
    });
  }

  const known = new Set(nodes.map((n) => n.id));
  if (nodes.length === 0) throw new Unconvertible("the graph has no steps");
  if (edges.some((e) => !known.has(e.source) || !known.has(e.target))) {
    throw new Unconvertible("a connection points at a step that does not exist");
  }
  return { graph: { version: GRAPH_VERSION, nodes, edges, settings: {} }, ids, steps };
}

function convertInput(raw: unknown, ids: Map<string, string>): Old {
  const input = isObject(raw) ? raw : {};
  const trigger = ids.get(str(input.triggerNodeId)) ?? str(input.triggerNodeId);
  const kind = str(input.kind);
  const firedFor = str(input.firedFor) || new Date(0).toISOString();
  const missed = typeof input.missed === "number" ? input.missed : 0;
  if (kind === "newMail") {
    const first =
      Array.isArray(input.messages) && isObject(input.messages[0]) ? input.messages[0] : {};
    return {
      triggerNodeId: trigger,
      source: "feed",
      event: {
        id: str(first.messageId),
        mailboxId: str(first.mailboxId),
        threadId: str(first.threadId),
        from: str(first.from),
        fromName: str(first.fromName),
        to: Array.isArray(first.to) ? first.to.map(String) : [],
        subject: str(first.subject),
        snippet: str(first.snippet),
        hydrate: { kind: "mail", mailboxId: str(first.mailboxId), id: str(first.messageId) },
      },
    };
  }
  if (kind === "schedule" || kind === "once") {
    return {
      triggerNodeId: trigger,
      source: kind,
      firedFor,
      missed,
      event: { firedAt: firedFor, scheduledFor: firedFor, missed },
    };
  }
  return {
    triggerNodeId: trigger,
    source: "manual",
    ...(str(input.requestedByUserId) ? { requestedByUserId: str(input.requestedByUserId) } : {}),
    event: { inputs: {}, requestedBy: { email: "", name: "" }, requestedAt: firedFor },
  };
}

function convertSummary(
  raw: unknown,
  ids: Map<string, string>,
  steps: Map<string, string>,
): Old[] | null {
  const lines = json(raw);
  if (!Array.isArray(lines)) return null;
  return lines.filter(isObject).map((line) => {
    const nodeId = ids.get(str(line.nodeId)) ?? str(line.nodeId);
    return {
      nodeId,
      step: steps.get(nodeId) ?? str(line.kind),
      status: str(line.status),
      count: typeof line.count === "number" ? line.count : 0,
      ...(typeof line.detail === "string" ? { detail: line.detail } : {}),
    };
  });
}

function snoozeGraph(triggerId: string): NewGraph {
  return {
    version: GRAPH_VERSION,
    nodes: [
      {
        id: triggerId,
        step: "trigger.manual",
        position: { x: 0, y: 0 },
        params: {
          inputs: literal([
            { name: "message", type: "mail" },
            { name: "folder", type: "text" },
            { name: "wakeAt", type: "date" },
          ]),
        },
      },
      {
        id: "archive",
        step: "mail.archive",
        position: { x: 352, y: 0 },
        params: { message: expr("trigger.inputs.message") },
      },
      {
        id: "wait",
        step: "flow.waitUntil",
        position: { x: 704, y: 0 },
        params: { at: expr("trigger.inputs.wakeAt") },
      },
      {
        id: "return",
        step: "mail.toInbox",
        position: { x: 1056, y: 0 },
        params: { message: expr("item") },
      },
    ],
    edges: [
      {
        id: `${triggerId}:out->archive`,
        source: triggerId,
        sourceHandle: "out",
        target: "archive",
      },
      { id: "archive:out->wait", source: "archive", sourceHandle: "out", target: "wait" },
      { id: "wait:out->return", source: "wait", sourceHandle: "out", target: "return" },
    ],
    settings: {},
  };
}

function guardScheduledLabel(graph: NewGraph): void {
  const send = graph.nodes.find((n) => n.step === "mail.sendScheduled");
  const edge = send ? graph.edges.find((e) => e.source === send.id) : undefined;
  if (!send || !edge) return;
  const filter = "sent";
  graph.nodes.push({
    id: filter,
    step: "logic.filter",
    position: { x: send.position.x + 176, y: send.position.y },
    params: { condition: expr('item.id != ""') },
  });
  graph.edges = [
    ...graph.edges.filter((e) => e !== edge),
    { id: `${send.id}:out->${filter}`, source: send.id, sourceHandle: "out", target: filter },
    {
      id: `${filter}:out->${edge.target}`,
      source: filter,
      sourceHandle: "out",
      target: edge.target,
    },
  ];
}

interface RevisionRow {
  id: string;
  workflowId: string;
  revision: number;
  graph: unknown;
  kind: string;
  current: number;
  enabled: boolean;
  deleted: boolean;
  mailboxId: string;
  targetKey: string;
  workspaceId: string | null;
  principalUserId: string | null;
}

function num(value: unknown): number {
  return typeof value === "number"
    ? value
    : typeof value === "bigint"
      ? Number(value)
      : Number(value ?? 0);
}

function revisionRow(row: Row): RevisionRow {
  return {
    id: str(row.id),
    workflowId: str(row.workflow_id),
    revision: num(row.revision),
    graph: json(row.graph),
    kind: str(row.kind),
    current: num(row.current),
    enabled: num(row.enabled) === 1,
    deleted: row.deleted_at !== null && row.deleted_at !== undefined,
    mailboxId: str(row.mailbox_id),
    targetKey: str(row.target_key),
    workspaceId: typeof row.workspace_id === "string" ? row.workspace_id : null,
    principalUserId: typeof row.principal_user_id === "string" ? row.principal_user_id : null,
  };
}

function snoozeStatements(
  row: RevisionRow,
  graph: NewGraph,
  triggers: Row[],
  dueRun: number | null,
  now: number,
): InStatement[] {
  const manual = triggers.find(
    (t) => t.workflow_id === row.workflowId && t.kind === "trigger.manual",
  );
  const once = triggers.find((t) => t.workflow_id === row.workflowId && t.kind === "trigger.once");
  const first = graph.nodes[0];
  const out: InStatement[] = [];
  if (once) {
    out.push({
      sql: "UPDATE `workflow_trigger` SET `armed` = 0, `next_due_at` = NULL WHERE `id` = ?",
      args: [str(once.id)],
    });
  }
  const armed = once && num(once.armed) === 1 && once.next_due_at !== null;
  if (!first || !manual || (!armed && dueRun === null) || !row.enabled || row.deleted) {
    return out;
  }
  const oldGraph =
    isObject(row.graph) && Array.isArray(row.graph.nodes) ? row.graph.nodes.filter(isObject) : [];
  const source = oldGraph.find((n) => n.kind === "mailbox.source");
  const wakeAt = dueRun ?? num(once?.next_due_at);
  const current = str(source?.messageId) || row.targetKey;
  const message = {
    id: row.targetKey || current,
    mailboxId: row.mailboxId,
    threadId: str(source?.threadId),
  };
  const archived = { ...message, id: current, folder: "archive" };
  const event = {
    inputs: { message, folder: "inbox", wakeAt: new Date(wakeAt).toISOString() },
    requestedBy: { email: "", name: "" },
    requestedAt: new Date(now).toISOString(),
  };
  const eventId = crypto.randomUUID();
  const runId = crypto.randomUUID();
  const waitStep = crypto.randomUUID();
  out.push(
    {
      sql: "INSERT INTO `workflow_event` (`id`, `workflow_id`, `trigger_id`, `key`, `scheduled_for`, `payload`, `created_at`) VALUES (?, ?, ?, ?, ?, ?, ?)",
      args: [
        eventId,
        row.workflowId,
        str(manual.id),
        `upgrade:${row.workflowId}`,
        now,
        JSON.stringify(event),
        now,
      ],
    },
    {
      sql: "INSERT INTO `workflow_run` (`id`, `workflow_id`, `revision_id`, `event_id`, `kind`, `workspace_id`, `principal_user_id`, `input`, `status`, `due_at`, `attempts`, `started_at`, `upgraded`, `created_at`) VALUES (?, ?, ?, ?, 'snooze', ?, ?, ?, 'waiting', ?, 0, ?, 0, ?)",
      args: [
        runId,
        row.workflowId,
        row.id,
        eventId,
        row.workspaceId,
        row.principalUserId,
        JSON.stringify({ triggerNodeId: first.id, source: "manual", event }),
        wakeAt,
        now,
        now,
      ],
    },
    {
      sql: "INSERT INTO `workflow_step_run` (`id`, `run_id`, `node_id`, `item_key`, `status`, `input`, `output`, `output_handles`, `attempts`, `started_at`, `finished_at`) VALUES (?, ?, 'archive', 'trigger', 'completed', ?, ?, '[\"out\"]', 1, ?, ?)",
      args: [
        crypto.randomUUID(),
        runId,
        JSON.stringify(message),
        JSON.stringify({
          emits: [{ handle: "out", key: "trigger", value: archived, result: archived }],
        }),
        now,
        now,
      ],
    },
    {
      sql: "INSERT INTO `workflow_step_run` (`id`, `run_id`, `node_id`, `item_key`, `status`, `input`, `state`, `wake_at`, `attempts`, `started_at`) VALUES (?, ?, 'wait', 'trigger', 'waiting', ?, ?, ?, 1, ?)",
      args: [
        waitStep,
        runId,
        JSON.stringify(archived),
        JSON.stringify({ until: new Date(wakeAt).toISOString() }),
        wakeAt,
        now,
      ],
    },
    {
      sql: "INSERT INTO `workflow_wait` (`id`, `run_id`, `step_run_id`, `workflow_id`, `workspace_id`, `kind`, `status`, `wake_at`, `deadline_at`, `created_at`) VALUES (?, ?, ?, ?, ?, 'time', 'open', ?, ?, ?)",
      args: [
        crypto.randomUUID(),
        runId,
        waitStep,
        row.workflowId,
        row.workspaceId,
        wakeAt,
        wakeAt,
        now,
      ],
    },
  );
  return out;
}

const COPY: string[] = [
  "INSERT INTO `workflow_event` (`id`, `workflow_id`, `trigger_id`, `key`, `scheduled_for`, `payload`, `skipped_reason`, `created_at`) SELECT `id`, `workflow_id`, `trigger_id`, `key`, `scheduled_for`, NULL, NULL, `created_at` FROM `workflow_occurrence`",
  "INSERT INTO `__new_workflow_trigger` (`id`, `workflow_id`, `revision_id`, `node_id`, `kind`, `cron`, `timezone`, `armed`, `next_due_at`, `baseline_at`, `claimed_at`, `claim_token`, `last_run_at`, `last_error`, `created_at`, `updated_at`) SELECT `id`, `workflow_id`, `revision_id`, `node_id`, CASE `kind` WHEN 'trigger.newMail' THEN 'trigger.mail.received' WHEN 'trigger.beforeSend' THEN 'trigger.mail.beforeSend' ELSE `kind` END, `cron`, `timezone`, `armed`, `next_due_at`, `baseline_at`, NULL, NULL, `last_run_at`, `last_error`, `created_at`, `updated_at` FROM `workflow_trigger`",
  `INSERT INTO \`__new_workflow_run\` (\`id\`, \`workflow_id\`, \`revision_id\`, \`event_id\`, \`kind\`, \`workspace_id\`, \`principal_user_id\`, \`parent_run_id\`, \`limit_key\`, \`input\`, \`output\`, \`status\`, \`due_at\`, \`attempts\`, \`lease_owner\`, \`lease_token\`, \`lease_expires_at\`, \`started_at\`, \`finished_at\`, \`blocked_at\`, \`error\`, \`summary\`, \`upgraded\`, \`created_at\`) SELECT \`id\`, \`workflow_id\`, \`revision_id\`, \`occurrence_id\`, \`kind\`, \`workspace_id\`, \`principal_user_id\`, NULL, NULL, \`input\`, NULL, CASE WHEN \`status\` IN ('pending', 'running') AND \`kind\` = 'user' THEN 'failed' WHEN \`status\` IN ('pending', 'running') AND \`kind\` IN ('snooze', 'system') THEN 'cancelled' WHEN \`status\` = 'running' AND \`kind\` = 'scheduled-send' THEN 'pending' ELSE \`status\` END, \`due_at\`, \`attempts\`, NULL, NULL, NULL, \`started_at\`, CASE WHEN \`status\` IN ('pending', 'running') AND \`kind\` <> 'scheduled-send' THEN ${Date.now()} ELSE \`finished_at\` END, \`blocked_at\`, CASE WHEN \`status\` IN ('pending', 'running') AND \`kind\` = 'user' THEN '${UPGRADE_REASON}' WHEN \`status\` IN ('pending', 'running') AND \`kind\` = 'snooze' THEN '${SNOOZE_MOVED}' ELSE \`error\` END, \`summary\`, CASE WHEN \`kind\` = 'scheduled-send' AND \`status\` IN ('pending', 'running') THEN 0 ELSE 1 END, \`created_at\` FROM \`workflow_run\``,
  "INSERT INTO `workflow_step_run` (`id`, `run_id`, `node_id`, `item_key`, `branch`, `status`, `input`, `output`, `output_handles`, `state`, `wake_at`, `receipt`, `attempts`, `error`, `started_at`, `finished_at`, `resolution`, `resolved_by_user_id`, `resolved_at`) SELECT `id`, `run_id`, `node_id`, `input_key`, `branch`, `status`, NULL, NULL, `output_handles`, NULL, NULL, `receipt`, `attempts`, `error`, `started_at`, `finished_at`, `resolution`, `resolved_by_user_id`, `resolved_at` FROM `workflow_node_run`",
  "INSERT INTO `workflow_blob` (`id`, `workflow_id`, `run_id`, `kind`, `name`, `mime_type`, `size`, `payload`, `data`, `created_at`) SELECT `id`, `workflow_id`, NULL, 'draft', NULL, NULL, 0, `payload`, NULL, `created_at` FROM `workflow_payload`",
  "INSERT INTO `__new_workflow_resource` (`id`, `workflow_id`, `revision_id`, `node_id`, `kind`, `mailbox_id`, `calendar_id`, `drive_id`, `mailbox_workspace_id`, `calendar_workspace_id`, `drive_workspace_id`) SELECT `id`, `workflow_id`, `revision_id`, `node_id`, 'mailbox', `mailbox_id`, NULL, NULL, `mailbox_workspace_id`, NULL, NULL FROM `workflow_resource`",
];

const SWAP: string[] = [
  "DROP TABLE `workflow_occurrence`",
  "DROP TABLE `workflow_node_run`",
  "DROP TABLE `workflow_payload`",
  "DROP TABLE `workflow_trigger`",
  "ALTER TABLE `__new_workflow_trigger` RENAME TO `workflow_trigger`",
  "DROP TABLE `workflow_run`",
  "ALTER TABLE `__new_workflow_run` RENAME TO `workflow_run`",
  "DROP TABLE `workflow_resource`",
  "ALTER TABLE `__new_workflow_resource` RENAME TO `workflow_resource`",
];

const COLUMNS: string[] = [
  "ALTER TABLE `workflow` ADD `disabled_reason` text",
  "ALTER TABLE `workflow` ADD `samples` text",
  "ALTER TABLE `instance_config` ADD `runner_step_data_days` integer DEFAULT 7 NOT NULL",
  "ALTER TABLE `instance_config` ADD `runner_history_days` integer DEFAULT 90 NOT NULL",
  "ALTER TABLE `instance_config` ADD `runner_public_url` text",
  "ALTER TABLE `instance_config` ADD `runner_trusted_proxies` text",
];

async function dataStatements(db: MigrationDb): Promise<InStatement[]> {
  if (
    (
      await db.read(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'workflow_node_run'",
      )
    ).length === 0
  ) {
    return [];
  }
  const now = Date.now();
  const revisions = (
    await db.read(
      "SELECT r.`id`, r.`workflow_id`, r.`revision`, r.`graph`, w.`kind`, w.`revision` AS `current`, w.`enabled`, w.`deleted_at`, w.`mailbox_id`, w.`target_key`, w.`workspace_id`, w.`principal_user_id` FROM `workflow_revision` r JOIN `workflow` w ON w.`id` = r.`workflow_id` ORDER BY r.`workflow_id`, r.`revision`",
    )
  ).map(revisionRow);
  const triggers = await db.read(
    "SELECT `id`, `workflow_id`, `node_id`, `kind`, `armed`, `next_due_at`, `cursor` FROM `workflow_trigger`",
  );
  const runs = await db.read(
    "SELECT `id`, `workflow_id`, `revision_id`, `kind`, `status`, `input`, `summary`, `due_at` FROM `workflow_run`",
  );
  const out: InStatement[] = [];

  for (const row of revisions) {
    const isCurrent = row.revision === row.current;
    if (row.kind === "snooze") {
      const manual =
        isObject(row.graph) && Array.isArray(row.graph.nodes)
          ? row.graph.nodes.filter(isObject).find((n) => n.kind === "trigger.manual")
          : undefined;
      const graph = snoozeGraph(safeId(str(manual?.id) || "manual", new Set()));
      out.push({
        sql: "UPDATE `workflow_revision` SET `graph` = ? WHERE `id` = ?",
        args: [JSON.stringify(graph), row.id],
      });
      if (isCurrent) {
        const due = runs
          .filter(
            (r) =>
              r.workflow_id === row.workflowId &&
              (r.status === "pending" || r.status === "running"),
          )
          .map((r) => num(r.due_at));
        const dueRun = due.length > 0 ? Math.min(...due) : null;
        out.push(...snoozeStatements(row, graph, triggers, dueRun, now));
      }
      continue;
    }
    let converted: Converted;
    try {
      converted = convertGraph(row.graph);
    } catch (err) {
      if (isCurrent && row.kind !== "system") {
        out.push({
          sql: "UPDATE `workflow` SET `enabled` = 0, `disabled_reason` = ? WHERE `id` = ?",
          args: [
            `This workflow could not be moved to the new workflow engine (${err instanceof Error ? err.message : "unknown reason"}). Rebuild it.`,
            row.workflowId,
          ],
        });
      }
      continue;
    }
    if (row.kind === "scheduled-send") guardScheduledLabel(converted.graph);
    out.push({
      sql: "UPDATE `workflow_revision` SET `graph` = ? WHERE `id` = ?",
      args: [JSON.stringify(converted.graph), row.id],
    });
    for (const run of runs.filter((r) => r.revision_id === row.id)) {
      const summary = convertSummary(run.summary, converted.ids, converted.steps);
      out.push({
        sql: "UPDATE `workflow_run` SET `input` = ?, `summary` = ? WHERE `id` = ?",
        args: [
          JSON.stringify(convertInput(json(run.input), converted.ids)),
          summary ? JSON.stringify(summary) : null,
          str(run.id),
        ],
      });
    }
    for (const [oldId, newId] of converted.ids) {
      if (oldId === newId) continue;
      out.push({
        sql: "UPDATE `workflow_step_run` SET `node_id` = ? WHERE `node_id` = ? AND `run_id` IN (SELECT `id` FROM `workflow_run` WHERE `revision_id` = ?)",
        args: [newId, oldId, row.id],
      });
      out.push({
        sql: "UPDATE `workflow_resource` SET `node_id` = ? WHERE `node_id` = ? AND `revision_id` = ?",
        args: [newId, oldId, row.id],
      });
      if (isCurrent) {
        out.push({
          sql: "UPDATE `workflow_trigger` SET `node_id` = ? WHERE `node_id` = ? AND `workflow_id` = ?",
          args: [newId, oldId, row.workflowId],
        });
      }
    }
  }

  for (const trigger of triggers) {
    const cursor = json(trigger.cursor);
    if (!isObject(cursor) || !str(cursor.mailboxId)) continue;
    const scope = `mail:${str(cursor.mailboxId)}:${str(cursor.folder) || "inbox"}`;
    out.push({
      sql: "INSERT INTO `workflow_cursor` (`id`, `trigger_id`, `scope`, `cursor`, `updated_at`) VALUES (?, ?, ?, ?, ?)",
      args: [
        crypto.randomUUID(),
        str(trigger.id),
        scope,
        JSON.stringify({
          scope,
          seen: Array.isArray(cursor.seen) ? cursor.seen.map(String) : [],
          ...(str(cursor.pageToken) ? { pageToken: str(cursor.pageToken) } : {}),
          ...(typeof cursor.sweepPages === "number" ? { sweepPages: cursor.sweepPages } : {}),
          scans: typeof cursor.scans === "number" ? cursor.scans : 0,
          baselined: cursor.baselined === true,
          updatedAt: str(cursor.updatedAt) || new Date(now).toISOString(),
        }),
        now,
      ],
    });
  }
  return out;
}

export default {
  id: ID,
  async up(db) {
    const data = await dataStatements(db);
    await db.apply([
      ...TABLES,
      ...COPY,
      ...SWAP,
      ...INDEXES,
      ...COLUMNS,
      "UPDATE `workflow_step_run` SET `status` = 'skipped', `error` = 'Stopped by the upgrade to the new workflow engine' WHERE `status` IN ('pending', 'running') AND `run_id` IN (SELECT `id` FROM `workflow_run` WHERE `upgraded` = 1)",
      "UPDATE `workflow_step_run` SET `item_key` = 'trigger' WHERE `run_id` IN (SELECT `id` FROM `workflow_run` WHERE `kind` = 'scheduled-send' AND `upgraded` = 0)",
      ...data,
    ]);
  },
} satisfies Migration;
