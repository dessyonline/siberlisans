import { create } from "zustand";
import { persist } from "zustand/middleware";

export const COMPARE_MAX = 3;

type CompareState = {
  ids: string[];
  toggle: (id: string) => "added" | "removed" | "full";
  remove: (id: string) => void;
  clear: () => void;
};

export const useCompare = create<CompareState>()(
  persist(
    (set, get) => ({
      ids: [],
      toggle: (id) => {
        const ids = get().ids;
        if (ids.includes(id)) {
          set({ ids: ids.filter((x) => x !== id) });
          return "removed";
        }
        if (ids.length >= COMPARE_MAX) return "full";
        set({ ids: [...ids, id] });
        return "added";
      },
      remove: (id) => set((s) => ({ ids: s.ids.filter((x) => x !== id) })),
      clear: () => set({ ids: [] }),
    }),
    { name: "siber-compare" },
  ),
);
