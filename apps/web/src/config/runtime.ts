import "server-only";
import { config, instanceSeed } from ".";
import { type InstanceConfigRow, rowToInstanceConfig } from "./row";
import {
  DEFAULT_DECISION_CLASSIFIER_BATCH,
  type DecisionFeature,
  type InstanceConfig,
  type InstanceSection,
} from "./schema";
import { formatIssues, hashSections, INSTANCE_SECTIONS, validateInstanceConfig } from "./sections";
import { currentConfigVersion, readCurrentConfigRow } from "./store";

const POLL_INTERVAL_MS = 30_000;

export interface InstanceConfigChange {
  sections: InstanceSection[];
  version: number;
  config: InstanceConfig;
  previous: InstanceConfig;
}

type Listener = (change: InstanceConfigChange) => void | Promise<void>;

interface Snapshot {
  version: number;
  config: InstanceConfig;
  hashes: Record<InstanceSection, string>;
}

interface State {
  snapshot: Snapshot;
  listeners: Set<Listener>;
  poll: ReturnType<typeof setInterval> | null;
  refreshing: boolean;
  refreshRequested: boolean;
  lastError: string | null;
  missingLogged: boolean;
}

declare global {
  var $metisInstanceConfig: State | undefined;
}

function initialState(): State {
  return {
    snapshot: {
      version: 0,
      config: Object.freeze({ ...instanceSeed }),
      hashes: hashSections(instanceSeed),
    },
    listeners: new Set(),
    poll: null,
    refreshing: false,
    refreshRequested: false,
    lastError: null,
    missingLogged: false,
  };
}

function state(): State {
  globalThis.$metisInstanceConfig ??= initialState();
  return globalThis.$metisInstanceConfig;
}

export function getInstanceConfig(): InstanceConfig {
  return state().snapshot.config;
}

export function aiEnabled(): boolean {
  return getInstanceConfig().llm.enabled;
}

export function phishingDetectionEnabled(): boolean {
  return getInstanceConfig().phishingDetection.enabled;
}

export function decisionEnabled(feature: DecisionFeature): boolean {
  const { decision } = getInstanceConfig();
  return decision.driver !== "disabled" && decision.features[feature];
}

export function decisionClassifierBatch(): number {
  const { decision } = getInstanceConfig();
  return decision.driver !== "disabled"
    ? decision.classifierBatch
    : DEFAULT_DECISION_CLASSIFIER_BATCH;
}

export function getConfigVersion(): number {
  return state().snapshot.version;
}

export function sectionCached<T>(
  sections: readonly InstanceSection[],
  build: (instance: InstanceConfig) => T,
  dispose?: (previous: T) => void | Promise<void>,
): () => T {
  let cached: { key: string; value: T } | null = null;
  return () => {
    const { snapshot } = state();
    const key = sections.map((section) => snapshot.hashes[section]).join("|");
    if (cached && cached.key === key) return cached.value;
    const previous = cached;
    const value = build(snapshot.config);
    cached = { key, value };
    if (previous && dispose) {
      Promise.resolve()
        .then(() => dispose(previous.value))
        .catch((err) => {
          console.error("[config] disposing a replaced driver failed", err);
        });
    }
    return value;
  };
}

export function onInstanceConfigChange(listener: Listener): () => void {
  const { listeners } = state();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function install(row: InstanceConfigRow): void {
  const current = state();
  const instance = rowToInstanceConfig(row);
  const issues = validateInstanceConfig(config, instance);
  if (issues.length > 0) {
    console.warn(`[config] version ${row.version} has problems: ${formatIssues(issues)}`);
  }
  const previous = current.snapshot;
  const next: Snapshot = {
    version: row.version,
    config: Object.freeze(instance),
    hashes: hashSections(instance),
  };
  current.snapshot = next;

  const sections = INSTANCE_SECTIONS.filter(
    (section) => previous.hashes[section] !== next.hashes[section],
  );
  if (previous.version !== next.version) {
    console.log(
      `[config] installed version ${next.version}${sections.length > 0 ? ` changed=${sections.join(",")}` : ""}`,
    );
  }
  if (sections.length === 0) return;

  const change: InstanceConfigChange = {
    sections,
    version: next.version,
    config: next.config,
    previous: previous.config,
  };
  for (const listener of current.listeners) {
    Promise.resolve()
      .then(() => listener(change))
      .catch((err) => {
        console.error("[config] a change listener failed", err);
      });
  }
}

export async function loadInstanceConfig(): Promise<InstanceConfig> {
  const current = state();
  try {
    const row = await readCurrentConfigRow();
    current.lastError = null;
    if (!row) {
      if (!current.missingLogged) {
        current.missingLogged = true;
        console.warn(
          "[config] instance_config has no current row — running on the environment and defaults until preflight seeds one",
        );
      }
      return current.snapshot.config;
    }
    install(row);
  } catch (err) {
    const text = errorText(err);
    if (current.lastError !== text) {
      current.lastError = text;
      console.error(
        `[config] loading instance_config failed — keeping version ${current.snapshot.version}: ${text}`,
      );
    }
  }
  return current.snapshot.config;
}

async function refreshIfChanged(): Promise<void> {
  const current = state();
  try {
    const version = await currentConfigVersion();
    current.lastError = null;
    if (version === null || version === current.snapshot.version) return;
  } catch (err) {
    const text = errorText(err);
    if (current.lastError !== text) {
      current.lastError = text;
      console.error(
        `[config] polling instance_config failed — keeping version ${current.snapshot.version}: ${text}`,
      );
    }
    return;
  }
  await loadInstanceConfig();
}

export function refreshInstanceConfig(): void {
  const current = state();
  if (current.refreshing) {
    current.refreshRequested = true;
    return;
  }
  current.refreshing = true;
  void (async () => {
    try {
      do {
        current.refreshRequested = false;
        // oxlint-disable-next-line eslint/no-await-in-loop -- coalesces refresh requests: rerun only after the current refresh finishes
        await refreshIfChanged();
      } while (current.refreshRequested);
    } finally {
      current.refreshing = false;
    }
  })();
}

export function startInstanceConfigPoll(opts: { keepAlive?: boolean } = {}): void {
  const current = state();
  if (current.poll) return;
  current.poll = setInterval(refreshInstanceConfig, POLL_INTERVAL_MS);
  if (!opts.keepAlive) current.poll.unref();
}

export function stopInstanceConfigPoll(): void {
  const current = state();
  if (!current.poll) return;
  clearInterval(current.poll);
  current.poll = null;
}
