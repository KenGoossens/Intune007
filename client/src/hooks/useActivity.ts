import { useCallback } from "react";
import { useActivityStore } from "../stores/activityStore.ts";

/**
 * Hook to easily signal agentic activity for sparkle effects.
 * Returns wrap() — wraps an async function with activity start/end.
 */
export function useActivity(key: string) {
  const add = useActivityStore((s) => s.addActivity);
  const remove = useActivityStore((s) => s.removeActivity);

  const wrap = useCallback(
    <T,>(fn: () => Promise<T>): Promise<T> => {
      add(key);
      return fn().finally(() => remove(key));
    },
    [key, add, remove]
  );

  return { wrap };
}
