import "server-only";
import { randomBytes } from "node:crypto";

import { config } from "@/config";
import { getInstanceConfig } from "@/config/runtime";

import { listTriggers, upsertEndpoint } from "../store";

export function inboundBase(): string {
  const configured = getInstanceConfig().workflowRunner.publicUrl;
  return (configured ?? config.auth.url).replace(/\/+$/, "");
}

export function endpointUrl(endpointId: string): string {
  return `${inboundBase()}/api/inbound/${endpointId}`;
}

export function newSecret(): string {
  return randomBytes(24).toString("base64url");
}

export async function ensureWebhookEndpoints(workflowId: string): Promise<void> {
  const triggers = await listTriggers(workflowId);
  await Promise.all(
    triggers
      .filter((trigger) => trigger.kind === "trigger.webhook" && trigger.armed)
      .map((trigger) =>
        upsertEndpoint({ workflowId, triggerId: trigger.id, kind: "webhook", secret: newSecret() }),
      ),
  );
}
