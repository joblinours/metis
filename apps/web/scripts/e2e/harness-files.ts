const E2E = new URL("./", import.meta.resolve("@metis/e2e/package.json"));
const HARNESS = new URL("harness/", E2E);

export const SEED_SQL = new URL("seed.sql", HARNESS);
export const ENROLLMENT = new URL("enrollment.json", HARNESS);
export const LLM_SEEDS = new URL("llm-seed.json", HARNESS);
export const LLM_MANIFEST = new URL("llm-manifest.json", HARNESS);
export const RECORD_FRAGMENTS = new URL("record/", HARNESS);
export const MASTRA_FRAGMENTS = new URL("mastra/", HARNESS);
export const RECORD_JOURNAL = new URL(".record/journal.jsonl", E2E);
