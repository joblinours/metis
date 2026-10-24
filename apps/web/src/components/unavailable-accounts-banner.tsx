"use client";

import { Button } from "@metis/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, X } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { useStoredItem, writeStoredItem } from "@/hooks/use-stored-item";
import { rpc } from "@/lib/orpc";

const DISMISS_KEY = "metis:unavailable-accounts-dismissed";

function fingerprint(connectionIds: string[]): string {
  return connectionIds.toSorted().join(",");
}

export function UnavailableAccountsBanner() {
  const connectionIds = useQuery(rpc.connections.unavailable.queryOptions()).data?.connectionIds;
  const count = connectionIds?.length ?? 0;
  const current = connectionIds ? fingerprint(connectionIds) : "";
  const dismissed = useStoredItem(DISMISS_KEY);

  useEffect(() => {
    if (connectionIds?.length === 0) writeStoredItem(DISMISS_KEY, null);
  }, [connectionIds]);

  if (count === 0 || current === dismissed) return null;

  function dismiss() {
    writeStoredItem(DISMISS_KEY, current);
  }

  return (
    <div className="mb-4 flex items-start gap-2 rounded-xl border border-brand/30 bg-brand-soft p-3">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-brand-text" />
      <p className="flex-1 text-[13px] text-foreground">
        {count} unavailable {count === 1 ? "account" : "accounts"}.{" "}
        <Link className="underline underline-offset-2" href="/settings/connections">
          Review
        </Link>
      </p>
      <Button aria-label="Dismiss" onClick={dismiss} size="icon-sm" variant="ghost">
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
