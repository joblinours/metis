"use client";

import { Badge } from "@metis/ui/components/badge";
import { formatDistanceToNowStrict } from "date-fns";
import { useEffect, useState } from "react";

import { parseWhen } from "./format";

const TICK_MS = 15_000;

export interface Expiry {
  expiresAt: number | null;
  expired: boolean;
}

export function useExpiry(issuedAt: string | null, validForMinutes: number | null): Expiry {
  const issued = parseWhen(issuedAt);
  const expiresAt = issued && validForMinutes ? issued.getTime() + validForMinutes * 60_000 : null;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (expiresAt === null) return;
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [expiresAt]);

  return { expiresAt, expired: expiresAt !== null && now >= expiresAt };
}

export function ExpiryBadge({ expiry }: { expiry: Expiry }) {
  if (expiry.expiresAt === null) return null;
  return (
    <Badge variant={expiry.expired ? "destructive" : "outline"}>
      {expiry.expired ? "Expired" : `Expires in ${formatDistanceToNowStrict(expiry.expiresAt)}`}
    </Badge>
  );
}
