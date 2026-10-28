import "server-only";
import { getCursors, putCursor } from "../store";
import { pollCalendar } from "./calendar";
import { pollDrive } from "./drive";
import { pollMail } from "./mail";
import type { FeedContext, FeedEvent } from "./shared";

export type { FeedEvent };

export async function pollFeed(opts: Omit<FeedContext, "cursors"> & { token: string }): Promise<{
  events: FeedEvent[];
  baseline: boolean;
  nextDueAt?: Date;
  error?: string;
  commit(): Promise<void>;
}> {
  const cursors = await getCursors(opts.trigger.id);
  const ctx: FeedContext = { ...opts, cursors };
  const kind = opts.trigger.kind;
  const polled = kind.startsWith("trigger.mail.")
    ? await pollMail(ctx)
    : kind.startsWith("trigger.calendar.")
      ? await pollCalendar(ctx)
      : await pollDrive(ctx);
  return {
    events: polled.events,
    baseline: polled.baseline,
    nextDueAt: polled.nextDueAt,
    error: polled.error,
    async commit() {
      await putCursor(opts.trigger.id, opts.token, polled.cursor);
    },
  };
}
