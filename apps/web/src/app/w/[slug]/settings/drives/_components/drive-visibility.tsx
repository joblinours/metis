"use client";

import { Button } from "@metis/ui/components/button";
import { Checkbox } from "@metis/ui/components/checkbox";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { useWorkspaceScope } from "@/hooks/use-workspace-path";
import { orpc, rpc } from "@/lib/orpc";
import type { DriveRootFolder } from "@/server/schema";

export function DriveVisibility({
  linkId,
  visibleRootIds,
  onSaved,
}: {
  linkId: string;
  visibleRootIds: string[];
  onSaved: () => void;
}) {
  const scope = useWorkspaceScope();
  const query = useQuery(rpc.workspaceDrives.roots.queryOptions({ input: { ...scope, linkId } }));
  const roots: DriveRootFolder[] | null = query.data?.roots ?? null;
  const [selected, setSelected] = useState<string[]>(visibleRootIds);
  const error = query.isError ? "Could not read the folders on this drive" : null;
  const [saving, setSaving] = useState(false);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      await orpc.workspaceDrives.setVisibility({
        ...scope,
        linkId,
        visibleRootIds: selected,
      });
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save that choice");
    } finally {
      setSaving(false);
    }
  }, [scope, linkId, selected, onSaved]);

  if (error) {
    return <div className="border-border border-t px-3 py-4 text-[12px] text-faint">{error}</div>;
  }

  if (!roots) {
    return (
      <div className="flex justify-center border-border border-t px-3 py-4">
        <Loader2 className="h-4 w-4 animate-spin opacity-50" />
      </div>
    );
  }

  return (
    <div className="border-border border-t px-3 py-3">
      <p className="mb-3 text-[12px] text-faint">
        Pick the top-level folders this workspace can see. Leave everything unticked to show the
        whole drive. This hides folders inside Metis — it does not change anything at the provider.
      </p>

      {roots.length === 0 ? (
        <p className="text-[12px] text-faint">This drive has no top-level folders yet.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {roots.map((root) => (
            <label key={root.id} className="flex items-center gap-2 text-[13px] text-foreground">
              <Checkbox
                checked={selected.includes(root.id)}
                onCheckedChange={(checked) =>
                  setSelected((current) =>
                    checked ? [...current, root.id] : current.filter((id) => id !== root.id),
                  )
                }
              />
              <span className="truncate">{root.name}</span>
            </label>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" onClick={save} disabled={saving}>
          {saving && <Loader2 className="h-3 w-3 animate-spin" />}
          Save
        </Button>
        {selected.length === 0 && (
          <span className="text-[11px] text-faint">Whole drive is visible</span>
        )}
      </div>
    </div>
  );
}
