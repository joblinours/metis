"use client";

import { Switch } from "@metis/ui/components/switch";
import { useState } from "react";

import { orpc } from "@/lib/orpc";
import type { McpAccess } from "@/server/schema";

export function ClientWorkspaces({
  clientId,
  workspaces,
  hiddenWorkspaceIds,
  onSaved,
}: {
  clientId: string;
  workspaces: McpAccess["workspaces"];
  hiddenWorkspaceIds: string[];
  onSaved: () => void;
}) {
  const [hidden, setHidden] = useState(() => new Set(hiddenWorkspaceIds));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle(workspaceId: string, visible: boolean) {
    const previous = hidden;
    const next = new Set(hidden);
    if (visible) next.delete(workspaceId);
    else next.add(workspaceId);
    setHidden(next);
    setSaving(true);
    setError(null);
    try {
      const saved = await orpc.mcp.setHiddenWorkspaces({
        clientId,
        workspaceIds: [...next],
      });
      setHidden(new Set(saved.hiddenWorkspaceIds));
      onSaved();
    } catch (err) {
      setHidden(previous);
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-4 py-4">
      <p className="text-[12px] text-faint">
        The workspaces this client can reach. A workspace you join later is reachable too until you
        hide it here. Hiding one is a convenience, not a security boundary — remove the client to
        cut off access.
      </p>

      {error && <p className="mt-2 text-[13px] text-destructive-text">{error}</p>}

      <ul className="mt-3 space-y-1">
        {workspaces.map((w) => (
          <li key={w.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-foreground">
                {w.name}
              </span>
              <span className="block text-[12px] text-faint">
                {w.aiAvailable ? w.role : "Unavailable — AI is turned off for this workspace"}
              </span>
            </span>
            <Switch
              checked={w.aiAvailable && !hidden.has(w.id)}
              disabled={saving || !w.aiAvailable}
              onCheckedChange={(v) => toggle(w.id, v)}
              aria-label={`Let this client reach ${w.name}`}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
