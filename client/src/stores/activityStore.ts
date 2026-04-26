import { create } from "zustand";

/**
 * Global activity store — tracks whether ANY agentic/AI work is happening.
 * Used by SparkleOverlay to show golden particles during generation.
 *
 * Any component can register activity by calling addActivity/removeActivity
 * with a unique key. Sparkles show whenever at least one activity is active.
 */
interface ActivityState {
  /** Set of currently active operations (keyed by unique label) */
  activities: Set<string>;
  /** True when any AI/agentic work is happening */
  isActive: boolean;
  /** Start an activity */
  addActivity: (key: string) => void;
  /** End an activity */
  removeActivity: (key: string) => void;
}

export const useActivityStore = create<ActivityState>((set) => ({
  activities: new Set(),
  isActive: false,

  addActivity: (key: string) =>
    set((state) => {
      const next = new Set(state.activities);
      next.add(key);
      return { activities: next, isActive: true };
    }),

  removeActivity: (key: string) =>
    set((state) => {
      const next = new Set(state.activities);
      next.delete(key);
      return { activities: next, isActive: next.size > 0 };
    }),
}));
