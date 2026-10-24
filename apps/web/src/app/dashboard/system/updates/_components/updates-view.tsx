"use client";

import { Button } from "@metis/ui/components/button";
import { cn } from "@metis/ui/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Circle, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Loading } from "@/components/dashboard/system-client";
import {
  Mono,
  Note,
  Row,
  Rows,
  Section,
  Sections,
  ToneBadge,
} from "@/components/dashboard/system-ui";
import { TotpConfirmDialog } from "@/components/totp-confirm-dialog";
import { orpc, rpc } from "@/lib/orpc";
import type { DashboardUpdates, DashboardUpgrade, SystemTone } from "@/server/schema";

const POLL_MS = 2_000;
const RELEASES_SHOWN = 10;

const PROGRESS_STEPS = [
  { step: "pull", label: "Pull the release" },
  { step: "preflight", label: "Run preflight" },
  { step: "switch", label: "Switch the app" },
  { step: "ready", label: "Wait until it is ready" },
] as const;

const STATE_BADGE: Record<DashboardUpgrade["state"], { tone: SystemTone; label: string }> = {
  running: { tone: "warning", label: "Running" },
  succeeded: { tone: "ok", label: "Succeeded" },
  failed: { tone: "danger", label: "Failed" },
  "rollback-failed": { tone: "danger", label: "Needs attention" },
};

type Pending = {
  kind: "upgrade" | "rollback";
  version: string;
  verb: "Upgrade" | "Downgrade" | "Roll back";
};

function when(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "—";
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function Progress({ upgrade }: { upgrade: DashboardUpgrade }) {
  const current = PROGRESS_STEPS.findIndex(({ step }) => step === upgrade.step);
  return (
    <ol className="flex flex-col gap-1.5 py-1.5">
      {PROGRESS_STEPS.map(({ step, label }, index) => {
        const done = current > index;
        const active = current === index;
        return (
          <li
            key={step}
            className={cn(
              "flex items-center gap-2 text-[13px]",
              done || active ? "text-foreground" : "text-faint",
            )}
          >
            {done ? (
              <Check className="h-3.5 w-3.5 text-status-success" />
            ) : active ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Circle className="h-3.5 w-3.5" />
            )}
            {label}
          </li>
        );
      })}
      {upgrade.step === "restore" && (
        <li className="flex items-center gap-2 text-[13px] text-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Switching back to {upgrade.fromVersion ?? "the previous images"}
        </li>
      )}
    </ol>
  );
}

function UpgradeSection({ upgrade, offline }: { upgrade: DashboardUpgrade; offline: boolean }) {
  const badge = STATE_BADGE[upgrade.state];
  const from = upgrade.fromVersion ?? "unpinned images";
  return (
    <Section
      title={upgrade.kind === "rollback" ? "Last rollback" : "Last upgrade"}
      description={`${from} → ${upgrade.toVersion}`}
      badge={<ToneBadge tone={badge.tone}>{badge.label}</ToneBadge>}
    >
      {upgrade.state === "running" && <Progress upgrade={upgrade} />}
      <Rows>
        <Row label="Started">{when(upgrade.startedAt)}</Row>
        {upgrade.state !== "running" && <Row label="Finished">{when(upgrade.finishedAt)}</Row>}
      </Rows>
      {upgrade.state === "running" && offline && (
        <Note>
          The app is restarting. This page reconnects on its own once the new release answers.
        </Note>
      )}
      {upgrade.state === "succeeded" && <Note>Reload the page to use {upgrade.toVersion}.</Note>}
      {upgrade.state === "failed" && (
        <Note>
          {upgrade.restored
            ? `${upgrade.toVersion} did not come up, so the updater switched back to ${from}.`
            : `${upgrade.toVersion} was not installed; ${from} kept running.`}
        </Note>
      )}
      {upgrade.state === "rollback-failed" && (
        <Note>
          Switching back to {from} failed too. Check the stack on the host: which images .env pins,
          and the app&apos;s logs.
        </Note>
      )}
      {upgrade.error && (
        <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-muted p-2 font-mono text-[11px] whitespace-pre-wrap text-muted-foreground">
          {upgrade.error}
        </pre>
      )}
    </Section>
  );
}

export function UpdatesView() {
  const queryClient = useQueryClient();
  const updates = rpc.dashboard.system.updates;
  const query = useQuery(
    updates.queryOptions({
      refetchInterval: (q) => (q.state.data?.upgrade?.state === "running" ? POLL_MS : false),
      refetchIntervalInBackground: true,
    }),
  );
  const data: DashboardUpdates | null = query.data ?? null;
  const offline = query.isError && query.data !== undefined;
  const loadError = query.isError && query.data === undefined ? query.error : null;
  const [pending, setPending] = useState<Pending | null>(null);
  const lastState = useRef<DashboardUpgrade["state"] | null>(null);

  useEffect(() => {
    if (loadError) toast.error(errorMessage(loadError, "Could not load updates"));
  }, [loadError]);

  const upgrade = data?.upgrade ?? null;
  const running = upgrade?.state === "running";

  useEffect(() => {
    const state = upgrade?.state ?? null;
    if (lastState.current === "running" && upgrade && state !== "running") {
      if (state === "succeeded") {
        toast.success(`Now running ${upgrade.toVersion}`);
      } else {
        toast.error(upgrade.kind === "rollback" ? "The rollback failed" : "The upgrade failed");
      }
    }
    lastState.current = state;
  }, [upgrade]);

  const confirm = useCallback(
    async (code: string) => {
      if (!pending) return;
      const started =
        pending.kind === "upgrade"
          ? await orpc.dashboard.system.upgrade({
              version: pending.version,
              code,
            })
          : await orpc.dashboard.system.rollback({ code });
      queryClient.setQueryData(updates.queryKey(), (current) =>
        current ? { ...current, upgrade: started } : current,
      );
    },
    [pending, queryClient, updates],
  );

  if (!data) return <Loading />;

  if (!data.reachable) {
    return (
      <Section
        title="The updater is not answering"
        description="The app reaches it over its Unix socket; check that the updater service is running."
        badge={<ToneBadge tone="danger">Unreachable</ToneBadge>}
      >
        {data.error && <Mono>{data.error}</Mono>}
      </Section>
    );
  }

  const latest = data.releases[0]?.version ?? null;
  const { rollbackVersion } = data;

  return (
    <Sections>
      <Section
        title="Running release"
        description="The release every service of this instance runs."
        badge={
          data.currentVersion && data.currentVersion === latest ? (
            <ToneBadge tone="ok">Up to date</ToneBadge>
          ) : data.releases.some((release) => release.newer) ? (
            <ToneBadge tone="warning">Update available</ToneBadge>
          ) : undefined
        }
      >
        <Rows>
          <Row label="Version">
            {data.currentVersion ? (
              <Mono>{data.currentVersion}</Mono>
            ) : (
              <ToneBadge tone="warning">Not a pinned release</ToneBadge>
            )}
          </Row>
          <Row label="Previous release">
            {rollbackVersion ? (
              <Button
                variant="outline"
                size="sm"
                disabled={running}
                onClick={() =>
                  setPending({
                    kind: "rollback",
                    version: rollbackVersion,
                    verb: "Roll back",
                  })
                }
              >
                Roll back to {rollbackVersion}
              </Button>
            ) : (
              <span className="text-faint">None</span>
            )}
          </Row>
        </Rows>
        {!data.currentVersion && (
          <Note>
            The images are not pinned to a release, so the version is unknown. Upgrading pins them.
          </Note>
        )}
      </Section>

      <Section
        title="Releases"
        description="Upgrading pulls the release, runs preflight, switches the app and waits until it is ready. If a step fails, the updater switches back on its own."
      >
        {data.error && <Note>{data.error}</Note>}
        {data.releases.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">No releases are listed.</p>
        ) : (
          <Rows>
            {data.releases.slice(0, RELEASES_SHOWN).map((release) => (
              <Row key={release.version} label={release.version}>
                <span className="inline-flex items-center gap-2">
                  {release.version === latest && <ToneBadge tone="neutral">Latest</ToneBadge>}
                  {release.version === data.currentVersion && (
                    <ToneBadge tone="ok">Running</ToneBadge>
                  )}
                  {release.version !== data.currentVersion && (
                    <Button
                      size="sm"
                      variant={release.newer || !data.currentVersion ? "default" : "outline"}
                      disabled={running}
                      onClick={() =>
                        setPending({
                          kind: "upgrade",
                          version: release.version,
                          verb: release.newer || !data.currentVersion ? "Upgrade" : "Downgrade",
                        })
                      }
                    >
                      {release.newer || !data.currentVersion ? "Upgrade" : "Downgrade"}
                    </Button>
                  )}
                </span>
              </Row>
            ))}
          </Rows>
        )}
      </Section>

      {upgrade && <UpgradeSection upgrade={upgrade} offline={offline} />}

      <TotpConfirmDialog
        open={pending !== null}
        title={pending ? `${pending.verb} to ${pending.version}` : ""}
        body="The app restarts on that release. Open pages reconnect once it is ready."
        confirmLabel={pending?.verb ?? "Confirm"}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        onConfirm={confirm}
      />
    </Sections>
  );
}
