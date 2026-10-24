import "server-only";
import { timestampDate } from "@bufbuild/protobuf/wkt";
import {
  type CallOptions,
  type Client,
  Code,
  ConnectError,
  createClient,
} from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-node";
import {
  UpdaterService,
  type Upgrade,
  UpgradeKind,
  UpgradeState,
  UpgradeStep,
} from "@metis/updater-proto/v1";
import { ORPCError } from "@orpc/server";

import { config } from "@/config";
import type { DashboardUpdates, DashboardUpgrade } from "@/server/schema";

const CALL_OPTIONS: CallOptions = { timeoutMs: 15_000 };

let client: Client<typeof UpdaterService> | null = null;

export function updatesEnabled(): boolean {
  return Boolean(config.updater.socketPath);
}

function updater(): Client<typeof UpdaterService> {
  const { socketPath } = config.updater;
  if (!socketPath) throw new ORPCError("NOT_FOUND");
  client ??= createClient(
    UpdaterService,
    createConnectTransport({
      baseUrl: "http://updater",
      httpVersion: "1.1",
      nodeOptions: { socketPath },
    }),
  );
  return client;
}

function kindOf(kind: UpgradeKind): DashboardUpgrade["kind"] | null {
  switch (kind) {
    case UpgradeKind.UPGRADE:
      return "upgrade";
    case UpgradeKind.ROLLBACK:
      return "rollback";
    default:
      return null;
  }
}

function stateOf(state: UpgradeState): DashboardUpgrade["state"] | null {
  switch (state) {
    case UpgradeState.RUNNING:
      return "running";
    case UpgradeState.SUCCEEDED:
      return "succeeded";
    case UpgradeState.FAILED:
      return "failed";
    case UpgradeState.ROLLBACK_FAILED:
      return "rollback-failed";
    default:
      return null;
  }
}

function stepOf(step: UpgradeStep): DashboardUpgrade["step"] {
  switch (step) {
    case UpgradeStep.PULL:
      return "pull";
    case UpgradeStep.PREFLIGHT:
      return "preflight";
    case UpgradeStep.SWITCH:
      return "switch";
    case UpgradeStep.READY:
      return "ready";
    case UpgradeStep.RESTORE:
      return "restore";
    default:
      return null;
  }
}

function toUpgrade(upgrade: Upgrade | undefined): DashboardUpgrade | null {
  if (!upgrade) return null;
  const kind = kindOf(upgrade.kind);
  const state = stateOf(upgrade.state);
  if (!kind || !state) return null;
  return {
    id: upgrade.id,
    kind,
    fromVersion: upgrade.fromVersion || null,
    toVersion: upgrade.toVersion,
    state,
    step: stepOf(upgrade.step),
    restored: upgrade.restored,
    error: upgrade.error || null,
    startedAt: upgrade.startedAt ? timestampDate(upgrade.startedAt).toISOString() : null,
    finishedAt: upgrade.finishedAt ? timestampDate(upgrade.finishedAt).toISOString() : null,
  };
}

function compareVersions(a: string, b: string): number {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let index = 0; index < 3; index++) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function describe(err: unknown): string {
  return ConnectError.from(err).rawMessage;
}

function toOrpcError(err: unknown): ORPCError<string, unknown> {
  const error = ConnectError.from(err);
  switch (error.code) {
    case Code.InvalidArgument:
    case Code.NotFound:
      return new ORPCError("BAD_REQUEST", { message: error.rawMessage });
    case Code.Aborted:
    case Code.AlreadyExists:
    case Code.FailedPrecondition:
      return new ORPCError("CONFLICT", { message: error.rawMessage });
    case Code.Unavailable:
    case Code.DeadlineExceeded:
    case Code.Unknown:
      console.warn(`[updater] the updater did not answer: ${error.message}`);
      return new ORPCError("SERVICE_UNAVAILABLE", {
        message: `The updater did not answer: ${error.rawMessage}`,
      });
    default:
      console.error(`[updater] ${error.message}`);
      return new ORPCError("INTERNAL_SERVER_ERROR", {
        message: error.rawMessage,
      });
  }
}

async function settle<T>(call: Promise<T>): Promise<PromiseSettledResult<T>> {
  try {
    return { status: "fulfilled", value: await call };
  } catch (reason) {
    return { status: "rejected", reason };
  }
}

export async function updatesStatus(): Promise<DashboardUpdates> {
  const api = updater();
  const last = await settle(api.getUpgrade({}, CALL_OPTIONS));
  const status = await settle(api.getStatus({}, CALL_OPTIONS));
  const error =
    status.status === "rejected"
      ? describe(status.reason)
      : last.status === "rejected"
        ? describe(last.reason)
        : null;
  const currentVersion = status.status === "fulfilled" ? status.value.currentVersion || null : null;
  const releases =
    status.status === "fulfilled"
      ? status.value.releases.map(({ version }) => ({
          version,
          newer: currentVersion !== null && compareVersions(version, currentVersion) > 0,
        }))
      : [];
  return {
    reachable: status.status === "fulfilled" || last.status === "fulfilled",
    error,
    currentVersion,
    releases,
    rollbackVersion: status.status === "fulfilled" ? status.value.rollbackVersion || null : null,
    upgrade: last.status === "fulfilled" ? toUpgrade(last.value.upgrade) : null,
  };
}

function started(upgrade: Upgrade | undefined): DashboardUpgrade {
  const result = toUpgrade(upgrade);
  if (!result) {
    throw new ORPCError("INTERNAL_SERVER_ERROR", {
      message: "The updater accepted the request but returned no upgrade",
    });
  }
  return result;
}

export async function startUpgrade(version: string): Promise<DashboardUpgrade> {
  try {
    const response = await updater().startUpgrade({ version }, CALL_OPTIONS);
    return started(response.upgrade);
  } catch (err) {
    if (err instanceof ORPCError) throw err;
    throw toOrpcError(err);
  }
}

export async function rollbackRelease(): Promise<DashboardUpgrade> {
  try {
    const response = await updater().rollback({}, CALL_OPTIONS);
    return started(response.upgrade);
  } catch (err) {
    if (err instanceof ORPCError) throw err;
    throw toOrpcError(err);
  }
}
