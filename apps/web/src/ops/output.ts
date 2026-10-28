import { z } from "zod";

export const failureOutput = z.object({ error: z.string() });

export function orFailure<T extends z.ZodType>(schema: T) {
  return z.union([schema, failureOutput]);
}

export type Output<T extends z.ZodType> = z.infer<T>;
