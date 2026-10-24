import { create } from "zustand";

interface UnsavedChangesState {
  dirty: boolean;
  nudges: number;
  setDirty: (dirty: boolean) => void;
  nudge: () => void;
}

export const useUnsavedChangesStore = create<UnsavedChangesState>((set) => ({
  dirty: false,
  nudges: 0,
  setDirty: (dirty) => set({ dirty }),
  nudge: () => set((state) => ({ nudges: state.nudges + 1 })),
}));
