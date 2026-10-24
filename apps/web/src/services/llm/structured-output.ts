import "server-only";
import { getInstanceConfig } from "@/config/runtime";

export function structuredOutput<S>(schema: S): {
  schema: S;
  jsonPromptInjection?: true;
} {
  const llm = getInstanceConfig().llm;
  const injectSchema = llm.driver === "openai-compatible" && !llm.structuredOutputs;
  return injectSchema ? { schema, jsonPromptInjection: true } : { schema };
}
