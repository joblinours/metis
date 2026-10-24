import { z } from "zod";

export const consoleMailSchema = z.object({
  to: z.string(),
  from: z.string(),
  subject: z.string(),
  html: z.string(),
  text: z.string(),
});

export const consoleMailHitsSchema = z.array(consoleMailSchema.extend({ at: z.string() }));
export type ConsoleMailHit = z.infer<typeof consoleMailHitsSchema>[number];
