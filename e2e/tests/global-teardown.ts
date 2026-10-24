import { assertNoLlmMisses } from "../clients/llm-misses";

export default async function globalTeardown() {
  await assertNoLlmMisses();
}
