import "server-only";
import { and, asc, count, eq } from "drizzle-orm";

import { db } from "@/db";
import { savedSearch } from "@/db/schema";

export const MAX_SAVED_SEARCHES = 50;

export interface SavedSearchRow {
  id: string;
  name: string;
  query: string;
  createdAt: Date;
}

interface Owner {
  userId: string;
  workspaceId: string;
}

function owned(owner: Owner) {
  return and(eq(savedSearch.userId, owner.userId), eq(savedSearch.workspaceId, owner.workspaceId));
}

export async function listSavedSearches(owner: Owner): Promise<SavedSearchRow[]> {
  return db
    .select({
      id: savedSearch.id,
      name: savedSearch.name,
      query: savedSearch.query,
      createdAt: savedSearch.createdAt,
    })
    .from(savedSearch)
    .where(owned(owner))
    .orderBy(asc(savedSearch.createdAt));
}

export async function createSavedSearch(
  owner: Owner,
  entry: { name: string; query: string },
): Promise<SavedSearchRow | "full"> {
  const [existing] = await db.select({ total: count() }).from(savedSearch).where(owned(owner));
  if ((existing?.total ?? 0) >= MAX_SAVED_SEARCHES) return "full";
  const row = {
    id: crypto.randomUUID(),
    userId: owner.userId,
    workspaceId: owner.workspaceId,
    name: entry.name,
    query: entry.query,
    createdAt: new Date(),
  };
  await db.insert(savedSearch).values(row);
  return {
    id: row.id,
    name: row.name,
    query: row.query,
    createdAt: row.createdAt,
  };
}

export async function deleteSavedSearch(owner: Owner, id: string): Promise<boolean> {
  const removed = await db
    .delete(savedSearch)
    .where(and(eq(savedSearch.id, id), owned(owner)))
    .returning({ id: savedSearch.id });
  return removed.length > 0;
}
