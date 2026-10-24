import "server-only";
import { eq } from "drizzle-orm";

import { getAuth } from "@/auth/server";
import { db } from "@/db";
import { user } from "@/db/auth-schema";

export async function mintBackendToken(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!row) return null;

  const result = await getAuth().api.signJWT({
    body: { payload: { sub: row.id, email: row.email } },
  });
  return result?.token ?? null;
}
