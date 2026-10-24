import { readFile } from "node:fs/promises";

import { z } from "zod";

import { listMessagesOutputSchema } from "../../../../src/server/schema";
import type { Scenario } from "../catalog";
import type { RecordSession } from "../session";

export type InboxEmail = z.infer<typeof listMessagesOutputSchema>["emails"][number];

const worldSchema = z.object({
  inbox: listMessagesOutputSchema.shape.emails,
});
export type World = z.infer<typeof worldSchema>;

export interface StepContext {
  scenario: Scenario;
  session: RecordSession;
  worldPath: string;
}

export async function loadWorld(ctx: StepContext): Promise<World> {
  return worldSchema.parse(JSON.parse(await readFile(ctx.worldPath, "utf8")));
}

export function findEmail(world: World, subject: string): InboxEmail {
  const email = world.inbox.find((e) => e.subject === subject);
  if (!email) throw new Error(`"${subject}" is not on the first inbox page`);
  return email;
}

export class Failures {
  private readonly messages: string[] = [];

  note(label: string, err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    this.messages.push(`${label}: ${message}`);
    console.error(`[record] ${label} failed: ${message}`);
  }

  async attempt(label: string, run: () => Promise<unknown>): Promise<void> {
    try {
      await run();
    } catch (err) {
      this.note(label, err);
    }
  }

  throwIfAny(): void {
    if (this.messages.length === 0) return;
    throw new Error(`${this.messages.length} part(s) failed:\n${this.messages.join("\n")}`);
  }
}

export async function eachLimited<T>(
  items: readonly T[],
  limit: number,
  run: (item: T) => Promise<void>,
): Promise<void> {
  const queue = items.values();
  const lane = async () => {
    for (const item of queue) await run(item);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
}
