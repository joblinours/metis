import "server-only";
import type { ConnectionProvider } from "@/connections/types";
import { latestPreflightRun } from "@/dashboard/preflight";
import {
  dashboardAudit,
  dashboardAutomation,
  dashboardConnections,
  dashboardMcp,
  dashboardOverview,
  dashboardPeople,
  dashboardStats,
  dashboardUsage,
  dashboardWorkspaces,
} from "@/dashboard/stats";
import {
  systemCache,
  systemDatabase,
  systemInstance,
  systemLlm,
  systemMail,
  systemOverview,
  systemPhishing,
  systemProvider,
  systemRunner,
} from "@/dashboard/system";
import { runSystemCheck } from "@/dashboard/system-checks";
import type { DashboardSystemCheckInput, DashboardUsageRange } from "@/server/schema";

export const instanceStats = () => dashboardStats();
export const instanceUsage = (range: DashboardUsageRange) => dashboardUsage(range);
export const instanceOverview = () => dashboardOverview();
export const instanceConnections = () => dashboardConnections();
export const instancePeople = () => dashboardPeople();
export const instanceWorkspaces = () => dashboardWorkspaces();
export const instanceAutomation = () => dashboardAutomation();
export const instanceMcpClients = () => dashboardMcp();
export const instanceAuditLog = async (cursor?: string) => {
  const page = await dashboardAudit(cursor);
  return {
    ...page,
    events: page.events.map(({ ip: _, userAgent: __, ...event }) => event),
  };
};

function isSecretSummary(value: object): value is { set: boolean; hint: string | null } {
  const keys = Object.keys(value);
  return keys.length === 2 && "set" in value && "hint" in value && typeof value.set === "boolean";
}

function withoutSecretHints(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutSecretHints);
  if (value === null || typeof value !== "object" || value instanceof Date) {
    return value;
  }
  if (isSecretSummary(value)) return { set: value.set };
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, withoutSecretHints(item)]),
  );
}

export const systemOverviewView = async () => withoutSecretHints(await systemOverview());
export const systemInstanceView = async () => withoutSecretHints(await systemInstance());
export const systemLlmView = () => withoutSecretHints(systemLlm());
export const systemPhishingView = () => withoutSecretHints(systemPhishing());
export const systemMailView = () => withoutSecretHints(systemMail());
export const systemCacheView = () => withoutSecretHints(systemCache());
export const systemRunnerView = async () => withoutSecretHints(await systemRunner());
export const systemDatabaseView = () => withoutSecretHints(systemDatabase());
export const systemProviderView = async (provider: ConnectionProvider) =>
  withoutSecretHints(await systemProvider(provider));
export const systemCheck = (input: DashboardSystemCheckInput) => runSystemCheck(input);
export const preflightWarningsView = () => latestPreflightRun();
