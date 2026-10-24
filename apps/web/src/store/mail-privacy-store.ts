import { create } from "zustand";

import { orpc, rpc } from "@/lib/orpc";
import { getQueryClient } from "@/lib/query-client";
import { compileTrackers, type TrackerRules } from "@/mail/render/detect";
import { compileLinkRules, type LinkRules } from "@/mail/render/links";
import type { RemoteAllowEntry, RemoteAllowInput } from "@/server/schema";

export interface PrivacyRules {
  trackers: TrackerRules;
  links: LinkRules;
}

interface MailPrivacyState {
  rules: PrivacyRules | null;
  loadedOnce: ReadonlySet<string>;
  ensureLoaded: () => void;
  allowRemote: (input: RemoteAllowInput) => Promise<void>;
  revokeRemote: (id: string) => Promise<void>;
  loadOnce: (messageId: string) => void;
}

export const remoteAllowQuery = rpc.user.listRemoteAllow.queryOptions({ staleTime: Infinity });

let rulesRequested = false;

export const useMailPrivacyStore = create<MailPrivacyState>((set) => ({
  rules: null,
  loadedOnce: new Set(),

  ensureLoaded: () => {
    if (!rulesRequested) {
      rulesRequested = true;
      Promise.all([import("@/mail/render/trackers"), import("@/mail/render/clearurls")])
        .then(([t, c]) =>
          set({
            rules: {
              trackers: compileTrackers(t.TRACKER_VENDORS),
              links: compileLinkRules(c.CLEARURLS_PROVIDERS),
            },
          }),
        )
        .catch((err) => {
          console.error("[mail-privacy] rules failed to load", err);
          set({
            rules: {
              trackers: compileTrackers([]),
              links: compileLinkRules([]),
            },
          });
        });
    }
  },

  allowRemote: async (input) => {
    const entry = await orpc.user.allowRemote(input);
    getQueryClient().setQueryData(remoteAllowQuery.queryKey, (old) =>
      old
        ? {
            ...old,
            entries: [
              ...old.entries.filter((e) => !(e.kind === entry.kind && e.value === entry.value)),
              entry,
            ],
          }
        : old,
    );
  },

  revokeRemote: async (id) => {
    await orpc.user.revokeRemote({ id });
    getQueryClient().setQueryData(remoteAllowQuery.queryKey, (old) =>
      old ? { ...old, entries: old.entries.filter((e) => e.id !== id) } : old,
    );
  },

  loadOnce: (messageId) => set((s) => ({ loadedOnce: new Set(s.loadedOnce).add(messageId) })),
}));

export function senderDomain(address: string): string | null {
  const at = address.lastIndexOf("@");
  return at > 0
    ? address
        .slice(at + 1)
        .trim()
        .toLowerCase() || null
    : null;
}

export function isSenderAllowed(
  sender: string,
  allow: readonly RemoteAllowEntry[] | null,
): boolean {
  if (!allow?.length) return false;
  const address = sender.trim().toLowerCase();
  const domain = senderDomain(address);
  return allow.some((entry) =>
    entry.kind === "address"
      ? entry.value === address
      : domain !== null && (domain === entry.value || domain.endsWith(`.${entry.value}`)),
  );
}
