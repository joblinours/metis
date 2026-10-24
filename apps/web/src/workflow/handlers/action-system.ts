import "server-only";
import { pruneAuditEvents } from "@/audit/prune";
import { pruneAbandonedCimdClients } from "@/mcp/prune-cimd-clients";

import { BlockedError, type NodeHandler } from "../nodes";

export const actionSystem: NodeHandler<"action.system"> = async (node, envelope, ctx) => {
  if (ctx.definition.kind !== "system") {
    throw new BlockedError("Maintenance steps only run in system workflows");
  }
  if (ctx.pure) return { outputs: [], detail: "skipped in send policy" };

  const passOn = [
    {
      handle: "out" as const,
      envelopes: [{ ...envelope, lineage: [...envelope.lineage, node.id] }],
    },
  ];

  switch (node.operation) {
    case "cimd-prune": {
      const pruned = await pruneAbandonedCimdClients(ctx.now);
      return { outputs: passOn, detail: `${pruned} client(s) pruned` };
    }
    case "audit-prune": {
      const pruned = await pruneAuditEvents(ctx.now);
      return { outputs: passOn, detail: `${pruned} audit event(s) pruned` };
    }
    default:
      return { outputs: [], detail: "unknown maintenance operation" };
  }
};
