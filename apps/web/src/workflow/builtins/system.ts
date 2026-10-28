import "server-only";
import { literal } from "../expr";
import { GRAPH_VERSION, type WorkflowGraph } from "../schema";
import { upsertSystemDefinition } from "../store";

export const CIMD_PRUNE_ID = "system:cimd-prune";
export const AUDIT_PRUNE_ID = "system:audit-prune";
export const WORKFLOW_PRUNE_ID = "system:workflow-prune";

function maintenanceGraph(cron: string, step: string): WorkflowGraph {
  return {
    version: GRAPH_VERSION,
    nodes: [
      {
        id: "schedule",
        step: "trigger.schedule",
        position: { x: 0, y: 0 },
        params: { cron: literal(cron), timezone: literal("Etc/UTC") },
      },
      { id: "prune", step, position: { x: 352, y: 0 }, params: {} },
    ],
    edges: [
      { id: "schedule:out->prune", source: "schedule", sourceHandle: "out", target: "prune" },
    ],
    settings: {},
  };
}

let ensured: Promise<void> | null = null;

export function ensureSystemWorkflows(): Promise<void> {
  ensured ??= (async () => {
    await upsertSystemDefinition({
      id: CIMD_PRUNE_ID,
      name: "Prune abandoned MCP clients",
      graph: maintenanceGraph("0 * * * *", "system.cimdPrune"),
    });
    await upsertSystemDefinition({
      id: AUDIT_PRUNE_ID,
      name: "Prune expired audit events",
      graph: maintenanceGraph("30 3 * * *", "system.auditPrune"),
    });
    await upsertSystemDefinition({
      id: WORKFLOW_PRUNE_ID,
      name: "Prune old workflow data",
      graph: maintenanceGraph("15 4 * * *", "system.workflowPrune"),
    });
  })().catch((err) => {
    ensured = null;
    throw err;
  });
  return ensured;
}
