import "server-only";
import { errorCode } from "./diagnostics";
import { fireEvent } from "./discovery";
import { armedTriggersOfKind } from "./store";

export const APP_TRIGGER_KINDS = [
  "trigger.mail.labelled",
  "trigger.app.runFailed",
  "trigger.app.phishing",
  "trigger.app.aiLabel",
  "trigger.app.memberJoined",
] as const;
export type AppTriggerKind = (typeof APP_TRIGGER_KINDS)[number];

export interface AppEvent {
  kind: AppTriggerKind;
  key: string;
  workspaceId?: string | null;
  match?: Record<string, string>;
  exceptWorkflowId?: string;
  event: unknown;
}

function literal(params: Record<string, { kind: string; value?: unknown }>, name: string): string {
  const bound = params[name];
  return bound?.kind === "literal" && typeof bound.value === "string" ? bound.value : "";
}

export async function emitAppEvent(app: AppEvent): Promise<number> {
  try {
    const triggers = await armedTriggersOfKind({
      kinds: [app.kind],
      workspaceId: app.workspaceId ?? undefined,
    });
    const now = new Date();
    let started = 0;
    for (const due of triggers) {
      if (due.definition.id === app.exceptWorkflowId) continue;
      const node = due.graph.nodes.find((n) => n.id === due.trigger.nodeId);
      if (!node) continue;
      const matches = Object.entries(app.match ?? {}).every(([param, value]) => {
        const wanted = literal(node.params, param);
        return !wanted || wanted === value;
      });
      if (!matches) continue;
      // oxlint-disable-next-line eslint/no-await-in-loop -- each matching trigger opens its own event in its own transaction
      const runId = await fireEvent({
        due,
        key: `app:${app.key}`,
        scheduledFor: now,
        event: app.event,
        input: { source: "app" },
        now,
      });
      if (runId) started += 1;
    }
    return started;
  } catch (err) {
    console.error(`[workflow] app event ${app.kind} could not be recorded code=${errorCode(err)}`);
    return 0;
  }
}
