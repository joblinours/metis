"use client";

import { Button } from "@metis/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@metis/ui/components/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@metis/ui/components/tooltip";
import { Loader2, Unlink } from "lucide-react";
import { type ReactElement, useState } from "react";

import { overrideLabel, PolicyBadge } from "./policy-badge";
import { AiToggle, PhishingToggle } from "./policy-icons";
import { TotpConfirmDialog } from "./totp-confirm-dialog";

interface PolicyConfirm {
  linkId?: string;
  scope: string;
  patch: { aiEnabled?: boolean; phishingDetectionEnabled?: boolean };
  axis: "ai" | "phishing";
}

export interface ResourceWorkspaceRow {
  linkId: string;
  name: string;
  aiEnabled: boolean;
  phishingDetectionEnabled?: boolean;
  policy: { ai: boolean; phishingDetection?: boolean };
}

interface ResourceWorkspacesDialogProps {
  children: ReactElement;
  title: string;
  resourceLabel: string;
  workspaces: ResourceWorkspaceRow[];
  platform: { ai: boolean; phishingDetection: boolean };
  showPhishing: boolean;
  busy: string | null;
  onSetPolicy: (
    linkId: string,
    patch: { aiEnabled?: boolean; phishingDetectionEnabled?: boolean },
    code?: string,
  ) => Promise<void>;
  onSetEverywhere: (
    patch: { aiEnabled?: boolean; phishingDetectionEnabled?: boolean },
    code?: string,
  ) => Promise<void>;
  onRemove: (row: ResourceWorkspaceRow) => void;
}

export function ResourceWorkspacesDialog({
  children,
  title,
  resourceLabel,
  workspaces,
  platform,
  showPhishing,
  busy,
  onSetPolicy,
  onSetEverywhere,
  onRemove,
}: ResourceWorkspacesDialogProps) {
  const [open, setOpen] = useState(false);
  const [confirmOn, setConfirmOn] = useState<PolicyConfirm | null>(null);
  const anyAi = workspaces.some((w) => w.aiEnabled);
  const anyPhishing = workspaces.some((w) => w.phishingDetectionEnabled);

  function apply(
    target: { linkId?: string; scope: string },
    patch: { aiEnabled?: boolean; phishingDetectionEnabled?: boolean },
  ) {
    if (patch.aiEnabled === true) {
      setConfirmOn({ ...target, patch, axis: "ai" });
      return;
    }
    if (patch.phishingDetectionEnabled === true) {
      setConfirmOn({ ...target, patch, axis: "phishing" });
      return;
    }
    if (target.linkId) void onSetPolicy(target.linkId, patch);
    else void onSetEverywhere(patch);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={children} />
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {resourceLabel} is set up separately in each workspace. A workspace can turn these off,
            or require phishing detection, regardless of what you pick here.
          </DialogDescription>
        </DialogHeader>

        <TooltipProvider delay={200}>
          <div className="flex flex-col gap-2">
            {workspaces.length === 0 ? (
              <p className="rounded-xl border border-border bg-surface p-6 text-center text-[13px] text-faint">
                Not in any workspace yet.
              </p>
            ) : (
              workspaces.map((w) => {
                const aiOverride = overrideLabel(w.aiEnabled, w.policy.ai);
                const phishingOverride =
                  showPhishing &&
                  w.phishingDetectionEnabled !== undefined &&
                  w.policy.phishingDetection !== undefined
                    ? overrideLabel(w.phishingDetectionEnabled, w.policy.phishingDetection)
                    : null;

                return (
                  <div
                    key={w.linkId}
                    className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-foreground">
                        {w.name}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {aiOverride && (
                          <PolicyBadge label={`AI ${aiOverride.toLowerCase()}`} on={w.policy.ai} />
                        )}
                        {phishingOverride && (
                          <PolicyBadge
                            label={`Detection ${phishingOverride.toLowerCase()}`}
                            on={w.policy.phishingDetection === true}
                          />
                        )}
                      </div>
                    </div>

                    {platform.ai && (
                      <AiToggle
                        disabled={busy === w.linkId}
                        label={w.aiEnabled ? `AI is on in ${w.name}` : `AI is off in ${w.name}`}
                        on={w.aiEnabled}
                        onToggle={(next) =>
                          apply({ linkId: w.linkId, scope: w.name }, { aiEnabled: next })
                        }
                      />
                    )}

                    {showPhishing &&
                      platform.phishingDetection &&
                      w.phishingDetectionEnabled !== undefined && (
                        <PhishingToggle
                          disabled={busy === w.linkId}
                          label={
                            w.phishingDetectionEnabled
                              ? `Phishing detection is on in ${w.name}`
                              : `Phishing detection is off in ${w.name}`
                          }
                          on={w.phishingDetectionEnabled}
                          onToggle={(next) =>
                            apply(
                              { linkId: w.linkId, scope: w.name },
                              { phishingDetectionEnabled: next },
                            )
                          }
                        />
                      )}

                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            aria-label={`Remove from ${w.name}`}
                            className="text-destructive-text hover:text-destructive-text"
                            disabled={busy === w.linkId}
                            onClick={() => onRemove(w)}
                            size="sm"
                            variant="outline"
                          >
                            {busy === w.linkId ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Unlink className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        }
                      />
                      <TooltipContent>Remove from {w.name}</TooltipContent>
                    </Tooltip>
                  </div>
                );
              })
            )}
          </div>
        </TooltipProvider>

        {workspaces.length > 0 && (
          <div className="flex flex-wrap gap-2 border-border-soft border-t pt-4">
            {platform.ai && (
              <Button
                onClick={() => apply({ scope: "every workspace" }, { aiEnabled: !anyAi })}
                size="sm"
                variant="outline"
              >
                {anyAi ? "Turn AI off everywhere" : "Turn AI on everywhere"}
              </Button>
            )}
            {showPhishing && platform.phishingDetection && (
              <Button
                onClick={() =>
                  apply({ scope: "every workspace" }, { phishingDetectionEnabled: !anyPhishing })
                }
                size="sm"
                variant="outline"
              >
                {anyPhishing ? "Turn detection off everywhere" : "Turn detection on everywhere"}
              </Button>
            )}
          </div>
        )}
      </DialogContent>

      <TotpConfirmDialog
        body={
          confirmOn?.axis === "phishing"
            ? `Every message in ${resourceLabel.toLowerCase()} will be sent to the phishing-detection service to be scanned while it is in ${confirmOn.scope}.`
            : `AI will be able to read ${resourceLabel.toLowerCase()} in ${confirmOn?.scope ?? "this workspace"} — the assistants and any enabled MCP client there.`
        }
        confirmLabel={confirmOn?.axis === "phishing" ? "Turn detection on" : "Turn AI on"}
        onConfirm={async (code) => {
          if (!confirmOn) return;
          if (confirmOn.linkId) {
            await onSetPolicy(confirmOn.linkId, confirmOn.patch, code);
          } else {
            await onSetEverywhere(confirmOn.patch, code);
          }
        }}
        onOpenChange={(next) => {
          if (!next) setConfirmOn(null);
        }}
        open={confirmOn !== null}
        title={confirmOn?.axis === "phishing" ? "Turn phishing detection on?" : "Turn AI on?"}
      />
    </Dialog>
  );
}
