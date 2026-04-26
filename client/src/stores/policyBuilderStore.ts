import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface PolicySettingSummary {
  setting: string;
  value: string;
  description: string;
}

export interface GeneratedPolicy {
  displayName: string;
  description: string;
  policyType: "compliance" | "configuration";
  platform: string;
  odataType: string;
  settings: Record<string, unknown>;
  fullBody: Record<string, unknown>;
  explanation: string;
  settingsSummary: PolicySettingSummary[];
}

export interface PolicyDeployResult {
  success: boolean;
  policyId?: string;
  displayName?: string;
  policyType?: string;
  assignedGroups?: string[];
  error?: string;
}

interface PolicyBuilderState {
  currentPolicy: GeneratedPolicy | null;
  generatedPolicies: GeneratedPolicy[];
  isGenerating: boolean;
  isDeploying: boolean;
  deployResult: PolicyDeployResult | null;

  generatePolicy: (prompt: string, benchmark?: string) => Promise<void>;
  deployPolicy: (policy: GeneratedPolicy) => Promise<void>;
  deployAndAssign: (policy: GeneratedPolicy, groupIds: string[]) => Promise<void>;
  setCurrentPolicy: (policy: GeneratedPolicy | null) => void;
  clearDeployResult: () => void;
}

export const usePolicyBuilderStore = create<PolicyBuilderState>()(
  persist(
    (set) => ({
      currentPolicy: null,
      generatedPolicies: [],
      isGenerating: false,
      isDeploying: false,
      deployResult: null,

  generatePolicy: async (prompt: string, benchmark?: string) => {
    set({ isGenerating: true, currentPolicy: null, deployResult: null });
    try {
      const res = await fetch("/api/policy-builder/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, benchmark }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      set((state) => ({
        currentPolicy: data.policy,
        generatedPolicies: [data.policy, ...state.generatedPolicies],
      }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Policy generation failed:", msg);
      set({ currentPolicy: null });
    } finally {
      set({ isGenerating: false });
    }
  },

  deployPolicy: async (policy: GeneratedPolicy) => {
    set({ isDeploying: true, deployResult: null });
    try {
      const res = await fetch("/api/policy-builder/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policy }),
      });
      const data = await res.json();
      set({ deployResult: data });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({
        deployResult: { success: false, error: msg },
      });
    } finally {
      set({ isDeploying: false });
    }
  },

  deployAndAssign: async (policy: GeneratedPolicy, groupIds: string[]) => {
    set({ isDeploying: true, deployResult: null });
    try {
      const res = await fetch("/api/policy-builder/deploy-and-assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policy, groupIds }),
      });
      const data = await res.json();
      set({ deployResult: data });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({
        deployResult: { success: false, error: msg },
      });
    } finally {
      set({ isDeploying: false });
    }
  },

  setCurrentPolicy: (policy) => set({ currentPolicy: policy, deployResult: null }),
  clearDeployResult: () => set({ deployResult: null }),
  }),
  {
    name: "intune007-policy-builder",
    partialize: (state) => ({
      generatedPolicies: state.generatedPolicies,
      currentPolicy: state.currentPolicy,
    }),
  }
  )
);
