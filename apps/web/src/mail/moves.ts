import "server-only";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { mailLabel, mailReadLater } from "@/db/schema";

import type { MailAdapter } from "./adapter";

const MESSAGE_ROWS = [mailLabel, mailReadLater] as const;

export async function carryMessageRows(mailboxId: string, from: string, to: string): Promise<void> {
  if (from === to) return;
  await Promise.all(
    MESSAGE_ROWS.map(async (table) => {
      await db.delete(table).where(and(eq(table.mailboxId, mailboxId), eq(table.messageId, to)));
      await db
        .update(table)
        .set({ messageId: to })
        .where(and(eq(table.mailboxId, mailboxId), eq(table.messageId, from)));
    }),
  );
}

export function followMoves(adapter: MailAdapter, mailboxId: string): MailAdapter {
  const follow =
    <T extends string | null>(move: (id: string) => Promise<T>) =>
    async (id: string): Promise<T> => {
      const moved = await move(id);
      if (moved !== null && moved !== id) {
        try {
          await carryMessageRows(mailboxId, id, moved);
        } catch (err) {
          console.error("[mail] could not carry message rows to", moved, err);
        }
      }
      return moved;
    };
  return {
    ...adapter,
    deleteMessage: follow((id) => adapter.deleteMessage(id)),
    archiveMessage: follow((id) => adapter.archiveMessage(id)),
    restoreMessage: follow((id) => adapter.restoreMessage(id)),
    batchDelete: async (ids) => {
      const moved = await adapter.batchDelete(ids);
      await Promise.all(
        Array.from(moved, async ([from, to]) => {
          try {
            await carryMessageRows(mailboxId, from, to);
          } catch (err) {
            console.error("[mail] could not carry message rows to", to, err);
          }
        }),
      );
      return moved;
    },
  };
}
