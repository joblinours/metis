import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";

import type { LlmSeeds } from "@metis/e2e/lib/llm-key";
import { z } from "zod";

import { dumpNewRows, dumpRows } from "../dump";
import { LLM_MANIFEST, LLM_SEEDS, MASTRA_FRAGMENTS, RECORD_FRAGMENTS } from "../harness-files";
import type { ScratchDatabase } from "../scratch-db";
import { fragmentName, type Scenario } from "./catalog";
import type { Journal } from "./journal";
import type { Recorder } from "./recorder";
import type { Outcome } from "./scheduler";

export const manifestSchema = z.record(z.string(), z.array(z.string()));
export type Manifest = z.infer<typeof manifestSchema>;

const UNATTRIBUTED = "(unattributed)";

export async function readJson<T>(url: URL, schema: z.ZodType<T>): Promise<T | null> {
  let raw: string;
  try {
    raw = await readFile(url, "utf8");
  } catch (err) {
    if (isMissing(err)) return null;
    throw err;
  }
  return schema.parse(JSON.parse(raw));
}

export function isMissing(err: unknown): boolean {
  return err instanceof Error && "code" in err && err.code === "ENOENT";
}

async function writeAtomic(url: URL, content: string): Promise<void> {
  const next = new URL(`${url.href}.next`);
  await writeFile(next, content);
  await rename(next, url);
}

function sorted<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).toSorted(([a], [b]) => a.localeCompare(b)));
}

function nextManifest(
  scenarios: Scenario[],
  outcomes: Map<string, Outcome>,
  recorder: Recorder,
  previous: LlmSeeds,
  previousManifest: Manifest | null,
): Manifest {
  const manifest: Manifest = {};
  for (const scenario of scenarios) {
    const before = previousManifest?.[scenario.id] ?? [];
    const outcome = outcomes.get(scenario.id);
    const used = [...recorder.usage(scenario.id).keys];
    if (!outcome) manifest[scenario.id] = before;
    else if (outcome.status === "ok") manifest[scenario.id] = used;
    else manifest[scenario.id] = [...new Set([...before, ...used])];
  }
  const everyOk = scenarios.every((scenario) => outcomes.get(scenario.id)?.status === "ok");
  if (!everyOk) {
    const attributed = new Set(Object.values(manifest).flat());
    const leftover = previousManifest
      ? (previousManifest[UNATTRIBUTED] ?? [])
      : Object.keys(previous).filter((key) => !attributed.has(key));
    if (leftover.length > 0) manifest[UNATTRIBUTED] = leftover;
  }
  return manifest;
}

async function writeFragments(
  scenarios: Scenario[],
  outcomes: Map<string, Outcome>,
  databases: Map<string, ScratchDatabase>,
): Promise<string[]> {
  await mkdir(RECORD_FRAGMENTS, { recursive: true });
  await mkdir(MASTRA_FRAGMENTS, { recursive: true });
  const lines: string[] = [];
  for (const scenario of scenarios) {
    const own = databases.get(scenario.id);
    if (outcomes.get(scenario.id)?.status !== "ok" || !own) continue;
    const name = fragmentName(scenario.id);
    const base = scenario.from ? databases.get(scenario.from) : undefined;
    const app = new URL(name, RECORD_FRAGMENTS);
    if (scenario.tables.length > 0) {
      const { sql, counts } = dumpNewRows(own.app, base?.app ?? null, scenario.tables);
      if (Object.values(counts).some((n) => n > 0)) {
        await writeAtomic(app, sql);
        lines.push(
          `record/${name}: ${Object.entries(counts)
            .map(([table, n]) => `${table} ${n}`)
            .join(", ")}`,
        );
      } else {
        await rm(app, { force: true });
      }
    }
    if (scenario.mastra) {
      const sql = dumpRows(own.mastra, new Set(), {
        schema: true,
        ifNotExists: true,
      });
      await writeAtomic(new URL(name, MASTRA_FRAGMENTS), sql);
      lines.push(`mastra/${name}: ${(sql.length / 1024).toFixed(1)} KB`);
    }
  }
  const known = new Set(scenarios.map((scenario) => fragmentName(scenario.id)));
  for (const [label, dir] of [
    ["record", RECORD_FRAGMENTS],
    ["mastra", MASTRA_FRAGMENTS],
  ] as const) {
    for (const file of await readdir(dir)) {
      if (file.endsWith(".sql") && !known.has(file)) {
        await rm(new URL(file, dir));
        lines.push(`${label}/${file}: removed, no scenario writes it`);
      }
    }
  }
  return lines;
}

export async function mergeOutputs(input: {
  scenarios: Scenario[];
  outcomes: Map<string, Outcome>;
  databases: Map<string, ScratchDatabase>;
  recorder: Recorder;
  journal: Journal;
  previous: LlmSeeds;
  previousManifest: Manifest | null;
}): Promise<void> {
  const manifest = nextManifest(
    input.scenarios,
    input.outcomes,
    input.recorder,
    input.previous,
    input.previousManifest,
  );
  const seeds: LlmSeeds = {};
  for (const key of new Set(Object.values(manifest).flat())) {
    const seed = input.recorder.find(key);
    if (seed) seeds[key] = seed;
  }
  await writeAtomic(LLM_SEEDS, JSON.stringify(sorted(seeds)));
  await writeAtomic(LLM_MANIFEST, `${JSON.stringify(sorted(manifest), null, 2)}\n`);
  const dropped = Object.keys(input.previous).filter((key) => !(key in seeds));
  console.log(
    `[record] e2e/harness/llm-seed.json: ${Object.keys(seeds).length} recordings, ${dropped.length} dropped from the previous file`,
  );

  for (const line of await writeFragments(input.scenarios, input.outcomes, input.databases)) {
    console.log(`[record] e2e/harness/${line}`);
  }

  const leftover = input.journal.read().filter((entry) => !(entry.key in seeds));
  input.journal.replace(leftover);
  console.log(`[record] journal: ${leftover.length} recording(s) kept for a later run`);
}
