import { LATE_ARRIVAL_WORKFLOW } from "@metis/e2e/lib/late-arrival";

interface SeededWorkflow {
  name: string;
  enabled: boolean;
  graph: { nodes: object[]; edges: object[] };
}

const STEP_X = 352;
const LANE_Y = 200;

function at(step: number, lane = 0) {
  return { x: step * STEP_X, y: lane * LANE_Y };
}

function edge(
  id: string,
  source: string,
  target: string,
  sourceHandle = "out",
  targetHandle?: string,
) {
  return { id, source, target, sourceHandle, targetHandle };
}

function inbox(mailboxId: string, row: number, limit: number) {
  return {
    id: "inbox",
    kind: "mailbox.source",
    position: at(row),
    mailboxId,
    operation: "list",
    folder: "inbox",
    limit,
  };
}

function contains(id: string, field: "subject" | "from", value: string, row: number, column = 0) {
  return {
    id,
    kind: "condition",
    position: at(row, column),
    predicate: { kind: "predicate", field, op: "contains", value },
  };
}

function label(id: string, key: string, row: number, column = 0) {
  return { id, kind: "action.label", position: at(row, column), label: key };
}

export function seededWorkflows(mailboxId: string): SeededWorkflow[] {
  return [
    {
      name: "Label rebrand mail",
      enabled: true,
      graph: {
        nodes: [
          { id: "manual", kind: "trigger.manual", position: at(0) },
          inbox(mailboxId, 1, 50),
          contains("rebrand", "subject", "Rebrand", 2),
          label("label", "custom:clients", 3),
        ],
        edges: [
          edge("e1", "manual", "inbox"),
          edge("e2", "inbox", "rebrand"),
          edge("e3", "rebrand", "label", "matched"),
        ],
      },
    },
    {
      name: "Morning newsletter sweep",
      enabled: true,
      graph: {
        nodes: [
          {
            id: "daily",
            kind: "trigger.schedule",
            position: at(0),
            cron: "0 7 * * *",
            timezone: "Etc/UTC",
          },
          inbox(mailboxId, 1, 20),
          contains("digest", "subject", "digest", 2),
          label("label", "newsletter", 3),
        ],
        edges: [
          edge("e1", "daily", "inbox"),
          edge("e2", "inbox", "digest"),
          edge("e3", "digest", "label", "matched"),
        ],
      },
    },
    {
      name: "File new mail from Raj",
      enabled: true,
      graph: {
        nodes: [
          { id: "arrives", kind: "trigger.newMail", position: at(0) },
          {
            id: "incoming",
            kind: "mailbox.source",
            position: at(1),
            mailboxId,
            operation: "incoming",
            folder: "inbox",
          },
          contains("raj", "from", "raj@", 2),
          label("label", "work", 3),
        ],
        edges: [
          edge("e1", "arrives", "incoming"),
          edge("e2", "incoming", "raj"),
          edge("e3", "raj", "label", "matched"),
        ],
      },
    },
    {
      name: "Collect rebrand and GitHub mail",
      enabled: true,
      graph: {
        nodes: [
          { id: "manual", kind: "trigger.manual", position: at(0) },
          inbox(mailboxId, 1, 50),
          contains("rebrand", "subject", "Rebrand", 2, 0),
          contains("github", "from", "github", 2, 1),
          { id: "append", kind: "merge.append", position: at(3) },
          label("label", "work", 4),
        ],
        edges: [
          edge("e1", "manual", "inbox"),
          edge("e2", "inbox", "rebrand"),
          edge("e3", "inbox", "github"),
          edge("e4", "rebrand", "append", "matched", "in:0"),
          edge("e5", "github", "append", "matched", "in:1"),
          edge("e6", "append", "label"),
        ],
      },
    },
    {
      name: "Label orders once both checks finish",
      enabled: true,
      graph: {
        nodes: [
          { id: "manual", kind: "trigger.manual", position: at(0) },
          inbox(mailboxId, 1, 50),
          contains("order", "subject", "order", 2, 0),
          contains("debit", "subject", "debited", 2, 1),
          { id: "join", kind: "merge.join", position: at(3) },
          label("label", "transactions", 4),
        ],
        edges: [
          edge("e1", "manual", "inbox"),
          edge("e2", "inbox", "order"),
          edge("e3", "inbox", "debit"),
          edge("e4", "order", "join", "matched", "in:0"),
          edge("e5", "debit", "join", "matched", "in:1"),
          edge("e6", "join", "label"),
        ],
      },
    },
    {
      name: LATE_ARRIVAL_WORKFLOW,
      enabled: false,
      graph: {
        nodes: [
          { id: "arrives", kind: "trigger.newMail", position: at(0) },
          {
            id: "incoming",
            kind: "mailbox.source",
            position: at(1),
            mailboxId,
            operation: "incoming",
            folder: "inbox",
          },
          {
            id: "ask",
            kind: "decision.ask",
            position: at(2),
            state: { fields: ["from", "subject", "snippet"] },
            questions: [
              {
                id: "q1",
                type: "boolean",
                instructions: "Does this email ask the reader to do something?",
              },
            ],
          },
          { id: "act", kind: "decision.branch", position: at(5) },
          label("todo", "action_required", 6, 0),
          label("fyi", "updates", 6, 1),
        ],
        edges: [
          edge("e1", "arrives", "incoming"),
          edge("e2", "incoming", "ask"),
          edge("e3", "ask", "act", "q:q1"),
          edge("e4", "act", "todo", "yes"),
          edge("e5", "act", "fyi", "no"),
        ],
      },
    },
    {
      name: "Triage with the decision model",
      enabled: true,
      graph: {
        nodes: [
          { id: "manual", kind: "trigger.manual", position: at(0) },
          inbox(mailboxId, 1, 10),
          {
            id: "ask",
            kind: "decision.ask",
            position: at(2),
            state: { fields: ["from", "subject", "snippet"] },
            questions: [
              {
                id: "q1",
                type: "boolean",
                instructions: "Does this email ask the reader to do something?",
              },
              {
                id: "q2",
                type: "choice",
                instructions: "Which team should handle this email?",
                options: [
                  {
                    id: "o1",
                    name: "Design",
                    description: "Brand, layout, assets",
                  },
                  {
                    id: "o2",
                    name: "Finance",
                    description: "Payments, orders, accounts",
                  },
                  {
                    id: "o3",
                    name: "Engineering",
                    description: "Code, accounts, security",
                  },
                ],
                other: true,
              },
              {
                id: "q3",
                type: "score",
                instructions: "How urgent is this email?",
                levels: [
                  { id: "l0", name: "Low" },
                  { id: "l1", name: "Medium" },
                  { id: "l2", name: "High" },
                ],
              },
            ],
          },
          { id: "act", kind: "decision.branch", position: at(5, 0) },
          { id: "team", kind: "decision.branch", position: at(5, 1) },
          { id: "urgency", kind: "decision.branch", position: at(5, 2) },
          label("todo", "action_required", 6, 0),
          label("finance", "transactions", 6, 1),
          label("urgent", "work", 6, 2),
        ],
        edges: [
          edge("e1", "manual", "inbox"),
          edge("e2", "inbox", "ask"),
          edge("e3", "ask", "act", "q:q1"),
          edge("e4", "ask", "team", "q:q2"),
          edge("e5", "ask", "urgency", "q:q3"),
          edge("e6", "act", "todo", "yes"),
          edge("e7", "team", "finance", "opt:o2"),
          edge("e8", "urgency", "urgent", "lvl:l2"),
        ],
      },
    },
  ];
}
