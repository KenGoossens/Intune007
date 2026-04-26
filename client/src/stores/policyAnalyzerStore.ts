import { create } from "zustand";
import type { PolicyAnalysisResult } from "@intune-agent/shared";
import { useActivityStore } from "./activityStore.ts";

interface PolicyAnalyzerState {
  result: PolicyAnalysisResult | null;
  loading: boolean;
  error: string | null;
  fetch: () => Promise<void>;
  refresh: () => Promise<void>;
}

export const usePolicyAnalyzerStore = create<PolicyAnalyzerState>((set) => ({
  result: null,
  loading: false,
  error: null,

  fetch: async () => {
    set({ loading: true, error: null });
    useActivityStore.getState().addActivity("policy-analyzer");
    try {
      const res = await fetch("/api/policy-analyzer");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data: PolicyAnalysisResult = await res.json();
      set({ result: data, loading: false });
      useActivityStore.getState().removeActivity("policy-analyzer");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg, loading: false });
      useActivityStore.getState().removeActivity("policy-analyzer");
    }
  },

  refresh: async () => {
    set({ loading: true, error: null });
    useActivityStore.getState().addActivity("policy-analyzer-refresh");
    try {
      const res = await fetch("/api/policy-analyzer/refresh", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data: PolicyAnalysisResult = await res.json();
      set({ result: data, loading: false });
      useActivityStore.getState().removeActivity("policy-analyzer-refresh");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg, loading: false });
      useActivityStore.getState().removeActivity("policy-analyzer-refresh");
    }
  },
}));
