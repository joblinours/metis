import { and, type SQL } from "drizzle-orm";

export function allOf(...conditions: (SQL | undefined)[]): SQL {
  const combined = and(...conditions);
  if (!combined) throw new Error("[sql] allOf needs at least one condition");
  return combined;
}
