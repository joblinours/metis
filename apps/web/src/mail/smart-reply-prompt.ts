import { htmlToText, truncate } from "@/lib/utils";
import { smartRepliesGenerationSchema } from "@/server/schema";
import { structuredOutput } from "@/services/llm";
import type { Email } from "@/types/mail";

export const SMART_REPLY_GENERATE_OPTIONS = {
  instructions: `You write three quick reply suggestions for an email. Each reply must:
- Be 1-3 sentences, no more
- Be plain prose, no markdown, no signature, no "Hi X" greeting
- Cover three distinct stances: e.g. accept, decline, ask for more info
- Use a natural, professional tone matching the sender's tone
- Never include placeholders like [Name] or [Date]
The label is a 2-3 word button shown to the user. The body is what they would send.`,
  structuredOutput: structuredOutput(smartRepliesGenerationSchema),
};

export function smartReplyPrompt(input: {
  sender?: string;
  subject?: string;
  snippet?: string;
  body: Partial<Email>;
}): string {
  const text = input.body.bodyText ?? (input.body.bodyHtml ? htmlToText(input.body.bodyHtml) : "");
  const emailContext = truncate(text || input.snippet || "", 2000);

  return `Email from ${input.sender ?? "sender"}
Subject: ${input.subject ?? "(no subject)"}

Email body:
${emailContext}

Write 3 reply variants.`;
}
