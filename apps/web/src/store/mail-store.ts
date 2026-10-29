import { create } from "zustand";

import {
  dropCachedEmails,
  holdRemoved,
  patchCachedEmail,
  refreshMessageRowsAfter,
} from "@/mail/mail-cache";
import type { RemoteImages } from "@/mail/render/types";
import type { Email, MailFolder } from "@/types/mail";

export interface ComposeInitial {
  to?: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  bodyHtml?: string;
  draftId?: string;
  quotedHtml?: string;
  quoteImages?: RemoteImages;
  inReplyTo?: string;
  references?: string;
  replyToMessageId?: string;
}

export type MailListView = "folder" | "read-later";

export type ProviderMenu = "move" | "tags" | null;

interface MailState {
  selectedEmail: Email | null;
  selectedFolder: MailFolder;
  selectedView: MailListView;
  isFetchingBody: boolean;
  searchQuery: string;
  submittedSearch: string;
  composeOpen: boolean;
  composeInitial: ComposeInitial | null;
  agentOpen: boolean;
  selectedIds: Set<string>;
  listTabs: Record<string, string>;
  setListTab: (key: string, tab: string) => void;
  visibleEmailIds: string[];
  providerMenu: ProviderMenu;
  setProviderMenu: (menu: ProviderMenu) => void;

  setVisibleEmailIds: (ids: string[]) => void;
  setSelectedEmail: (email: Email | null) => void;
  setSelectedFolder: (folder: MailFolder, view?: MailListView) => void;
  setFetchingBody: (v: boolean) => void;
  setSearchQuery: (q: string) => void;
  submitSearch: (q: string) => void;
  setComposeOpen: (v: boolean) => void;
  setComposeInitial: (v: ComposeInitial | null) => void;
  setAgentOpen: (v: boolean) => void;
  toggleSelected: (id: string) => void;
  clearSelected: () => void;
  updateEmail: (id: string, patch: Partial<Email>) => void;
  removeEmail: (id: string, request?: Promise<unknown>) => void;
  removeEmails: (ids: string[], request?: Promise<unknown>) => void;
}

export const useMailStore = create<MailState>((set) => ({
  selectedEmail: null,
  selectedFolder: "inbox",
  selectedView: "folder",
  isFetchingBody: false,
  searchQuery: "",
  submittedSearch: "",
  composeOpen: false,
  composeInitial: null,
  agentOpen: false,
  selectedIds: new Set<string>(),
  listTabs: {},
  setListTab: (key, tab) => set((s) => ({ listTabs: { ...s.listTabs, [key]: tab } })),
  visibleEmailIds: [],
  providerMenu: null,
  setProviderMenu: (menu) => set({ providerMenu: menu }),

  setVisibleEmailIds: (ids) => set({ visibleEmailIds: ids }),
  setSelectedEmail: (email) => set({ selectedEmail: email, providerMenu: null }),
  setSelectedFolder: (folder, view = "folder") =>
    set({
      selectedFolder: folder,
      selectedView: view,
      selectedEmail: null,
      submittedSearch: "",
    }),
  setFetchingBody: (v) => set({ isFetchingBody: v }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  submitSearch: (q) => set({ submittedSearch: q.trim() }),
  setComposeOpen: (v) => set({ composeOpen: v }),
  setComposeInitial: (v) => set({ composeInitial: v }),
  setAgentOpen: (v) => set({ agentOpen: v }),
  toggleSelected: (id) =>
    set((s) => {
      const next = new Set(s.selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selectedIds: next };
    }),
  clearSelected: () => set({ selectedIds: new Set() }),
  updateEmail: (id, patch) => {
    patchCachedEmail(id, patch);
    set((s) => ({
      selectedEmail:
        s.selectedEmail?.id === id ? { ...s.selectedEmail, ...patch } : s.selectedEmail,
    }));
  },
  removeEmail: (id, request) => {
    holdRemoved([id], request);
    dropCachedEmails([id]);
    refreshMessageRowsAfter(request);
    set((s) => ({ selectedEmail: s.selectedEmail?.id === id ? null : s.selectedEmail }));
  },
  removeEmails: (ids, request) => {
    holdRemoved(ids, request);
    dropCachedEmails(ids);
    refreshMessageRowsAfter(request);
    const idSet = new Set(ids);
    set((s) => ({
      selectedEmail: idSet.has(s.selectedEmail?.id ?? "") ? null : s.selectedEmail,
    }));
  },
}));
