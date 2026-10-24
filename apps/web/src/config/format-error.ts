import type { z } from "zod";

export function formatConfigError(error: z.ZodError): string {
  const lines = error.issues.map(
    (issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`,
  );
  return `Invalid configuration:\n${lines.join("\n")}`;
}
