import { BUILT_IN_LABELS, type ClassifyItemInput, classifyResultSchema } from "@/server/schema";
import { structuredOutput } from "@/services/llm";

import { LABEL_DESCRIPTIONS } from "./label-meta";

export const CLASSIFY_GENERATE_OPTIONS = {
  structuredOutput: structuredOutput(classifyResultSchema),
};

export function classifyPrompt(
  emails: ClassifyItemInput[],
  customLabels: { key: string; name: string }[],
): string {
  const customLabelLines =
    customLabels.length > 0
      ? `\nUser-defined custom labels (also available):\n${customLabels
          .map((l) => `- ${l.key}: ${l.name}`)
          .join("\n")}`
      : "";

  return `Classify each email below into exactly one of these categories:
${BUILT_IN_LABELS.map((key) => `- ${key}: ${LABEL_DESCRIPTIONS[key]}`).join("\n")}${customLabelLines}

Return one classification per email with confidence 0-100. Echo back the exact "ref" token (e.g. e1, e2) for each email.

Emails:
${emails
  .map(
    (e, i) =>
      `ref=e${i + 1} from="${e.sender ?? ""}" subject="${e.subject ?? ""}" snippet="${(e.snippet ?? "").slice(0, 160)}"`,
  )
  .join("\n")}`;
}
