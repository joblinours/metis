import { create } from "zustand";

interface SearchState {
  open: boolean;
  query: string;
  seeded: boolean;
  openSearch: (query?: string) => void;
  closeSearch: () => void;
  setQuery: (query: string) => void;
}

export const useSearchStore = create<SearchState>((set) => ({
  open: false,
  query: "",
  seeded: false,
  openSearch: (query) =>
    set(query === undefined ? { open: true, seeded: false } : { open: true, query, seeded: true }),
  closeSearch: () => set({ open: false }),
  setQuery: (query) => set({ query }),
}));
