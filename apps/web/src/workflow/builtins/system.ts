import "server-only";
import type { SystemOperation, WorkflowGraph } from "../schema";
import { upsertSystemDefinition } from "../store";

export const CIMD_PRUNE_ID = "system:cimd-prune";
export const AUDIT_PRUNE_ID = "system:audit-prune";

function maintenanceGraph(cron: string, operation: SystemOperation): WorkflowGraph {
  return {
    nodes: [
      {
        id: "schedule",
        kind: "trigger.schedule",
        position: { x: 0, y: 0 },
        cron,
        timezone: "Etc/UTC",
      },
      {
        id: "prune",
        kind: "action.system",
        position: { x: 0, y: 170 },
        operation,
      },
    ],
    edges: [
      {
        id: "schedule:out->prune",
        source: "schedule",
        sourceHandle: "out",
        target: "prune",
      },
    ],
  };
}

let ensured: Promise<void> | null = null;

export function ensureSystemWorkflows(): Promise<void> {
  ensured ??= Promise.all([
    upsertSystemDefinition({
      id: CIMD_PRUNE_ID,
      name: "Prune abandoned MCP clients",
      graph: maintenanceGraph("0 * * * *", "cimd-prune"),
    }),
    upsertSystemDefinition({
      id: AUDIT_PRUNE_ID,
      name: "Prune expired audit events",
      graph: maintenanceGraph("30 3 * * *", "audit-prune"),
    }),
  ])
    .then(() => undefined)
    .catch((err) => {
      ensured = null;
      throw err;
    });
  return ensured;
}
