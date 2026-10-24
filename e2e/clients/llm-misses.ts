import { z } from "zod";

import { harness, type LlmMiss } from "./harness";

const missRequestSchema = z.object({
  model: z.string().optional().catch(undefined),
  messages: z
    .array(
      z.object({
        role: z.string(),
        content: z
          .union([z.string(), z.array(z.object({ text: z.string().optional().catch(undefined) }))])
          .catch(""),
      }),
    )
    .optional()
    .catch(undefined),
  state: z
    .object({ subject: z.string().optional().catch(undefined) })
    .optional()
    .catch(undefined),
});

function hint(miss: LlmMiss): string {
  const request = missRequestSchema.safeParse(miss.request).data ?? {};
  const user = request.messages?.findLast((m) => m.role === "user");
  const text =
    typeof user?.content === "string"
      ? user.content
      : user?.content
          .map((part) => part.text ?? "")
          .filter((t) => !t.startsWith("<turn"))
          .join(" ");
  const about = text ?? request.state?.subject ?? "";
  return `${miss.path} ${request.model ?? ""} ${miss.key}: ${about.replace(/\s+/g, " ").slice(0, 120)}`;
}

export async function assertNoLlmMisses(): Promise<void> {
  const misses = await harness.misses();
  if (misses.length === 0) return;
  const distinct = [...new Map(misses.map((m) => [m.key, m])).values()];
  throw new Error(
    `${distinct.length} distinct LLM replay miss(es) during the run (GET http://localhost:8099/llm-misses):\n${distinct.map((m) => `  - ${hint(m)}`).join("\n")}`,
  );
}
