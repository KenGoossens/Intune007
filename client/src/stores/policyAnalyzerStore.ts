import { create } from "zustand";
import type { PolicyAnalysisResult } from "@intune-agent/shared";

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
    try {
      const res = await fetch("/api/policy-analyzer");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data: PolicyAnalysisResult = await res.json();
      set({ result: data, loading: false });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg, loading: false });
    }
  },

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const res = await fetch("/api/policy-analyzer/refresh", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data: PolicyAnalysisResult = await res.json();
      set({ result: data, loading: false });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg, loading: false });
    }
  },
}));
