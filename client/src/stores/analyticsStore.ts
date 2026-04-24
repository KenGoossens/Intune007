import { create } from "zustand";
import type { AnalyticsSummary } from "@intune-agent/shared";

interface AnalyticsState {
  summary: AnalyticsSummary | null;
  loading: boolean;
  error: string | null;
  fetch: () => Promise<void>;
  clear: () => Promise<void>;
}

export const useAnalyticsStore = create<AnalyticsState>((set) => ({
  summary: null,
  loading: false,
  error: null,

  fetch: async () => {
    set({ loading: true, error: null });
    try {
      const res = await fetch("/api/analytics");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: AnalyticsSummary = await res.json();
      set({ summary: data, loading: false });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg, loading: false });
    }
  },

  clear: async () => {
    try {
      await fetch("/api/analytics", { method: "DELETE" });
      set({ summary: null });
    } catch {
      // ignore
    }
  },
}));
