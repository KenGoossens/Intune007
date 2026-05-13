import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useActivityStore } from "./activityStore.ts";

export interface GeneratedScript {
  displayName: string;
  description: string;
  detectionScript: string;
  remediationScript: string;
  runAsAccount: string;
  explanation: string;
}

export interface ValidationPhase {
  name: string;
  status: "passed" | "failed" | "skipped" | "warning" | "pending";
  duration?: number;
  details?: string;
}

export interface ScriptValidation {
  valid: boolean;
  summary: string;
  syntaxErrors: string[];
  pesterResults: { name: string; passed: boolean; message?: string }[];
  phases?: ValidationPhase[];
}

export interface DeployResult {
  scriptId: string;
  displayName: string;
  success: boolean;
  validation?: ScriptValidation;
  error?: string;
}

interface RemediationState {
  // Generated scripts history
  generatedScripts: GeneratedScript[];
  currentScript: GeneratedScript | null;
  currentValidation: ScriptValidation | null;
  currentApprovalId: string | null;
  isGenerating: boolean;
  isDeploying: boolean;
  deployResult: DeployResult | null;

  // Existing scripts from Intune
  existingScripts: Record<string, unknown>[];
  isLoadingExisting: boolean;

  // Actions
  generateScript: (prompt: string, alertType?: string) => Promise<void>;
  generateForAlert: (alertType: string, alertDetails: unknown[]) => Promise<void>;
  deployScript: (script: GeneratedScript) => Promise<void>;
  approveScript: (approvalId: string) => Promise<void>;
  rejectScript: (approvalId: string) => Promise<void>;
  fetchExistingScripts: () => Promise<void>;
  setCurrentScript: (script: GeneratedScript | null) => void;
  clearDeployResult: () => void;
}

export const useRemediationStore = create<RemediationState>()(
  persist(
    (set, get) => ({
  generatedScripts: [],
  currentScript: null,
  currentValidation: null,
  currentApprovalId: null,
  isGenerating: false,
  isDeploying: false,
  deployResult: null,
  existingScripts: [],
  isLoadingExisting: false,

  generateScript: async (prompt: string, alertType?: string) => {
    set({ isGenerating: true, currentScript: null, currentValidation: null, currentApprovalId: null, deployResult: null });
    useActivityStore.getState().addActivity("script-generation");
    try {
      const res = await fetch("/api/remediation/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, context: alertType ? { alertType } : undefined }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      set((state) => ({
        currentScript: data.script,
        currentValidation: data.validation || null,
        currentApprovalId: data.approvalId || null,
        generatedScripts: [data.script, ...state.generatedScripts],
      }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Script generation failed:", msg);
    } finally {
      set({ isGenerating: false });
      useActivityStore.getState().removeActivity("script-generation");
    }
  },

  generateForAlert: async (alertType: string, alertDetails: unknown[]) => {
    set({ isGenerating: true, currentScript: null, deployResult: null });
    useActivityStore.getState().addActivity("alert-remediation");
    try {
      const res = await fetch("/api/remediation/generate-for-alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertType, alertDetails }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      set((state) => ({
        currentScript: data.script,
        generatedScripts: [data.script, ...state.generatedScripts],
      }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Alert remediation generation failed:", msg);
    } finally {
      set({ isGenerating: false });
      useActivityStore.getState().removeActivity("alert-remediation");
    }
  },

  deployScript: async (script: GeneratedScript) => {
    set({ isDeploying: true, deployResult: null });
    try {
      const res = await fetch("/api/remediation/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script }),
      });
      const data = await res.json();
      set({ deployResult: data });
      // Refresh existing scripts list
      if (data.success) {
        get().fetchExistingScripts();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({
        deployResult: {
          scriptId: "",
          displayName: script.displayName,
          success: false,
          error: msg,
        },
      });
    } finally {
      set({ isDeploying: false });
    }
  },

  approveScript: async (approvalId: string) => {
    set({ isDeploying: true, deployResult: null });
    try {
      const res = await fetch(`/api/remediation/approve/${approvalId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (data.error) {
        set({
          deployResult: {
            scriptId: "",
            displayName: get().currentScript?.displayName || "",
            success: false,
            error: data.error,
          },
        });
      } else {
        set({ deployResult: data, currentApprovalId: null });
        if (data.success) {
          get().fetchExistingScripts();
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({
        deployResult: {
          scriptId: "",
          displayName: get().currentScript?.displayName || "",
          success: false,
          error: msg,
        },
      });
    } finally {
      set({ isDeploying: false });
    }
  },

  rejectScript: async (approvalId: string) => {
    try {
      await fetch(`/api/remediation/reject/${approvalId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
    } catch { /* ignore */ }
    set({ currentApprovalId: null, currentScript: null, currentValidation: null });
  },

  fetchExistingScripts: async () => {
    set({ isLoadingExisting: true });
    try {
      const res = await fetch("/api/remediation/scripts");
      const data = await res.json();
      set({ existingScripts: data.items || [] });
    } catch (err) {
      console.error("Failed to fetch existing scripts:", err);
    } finally {
      set({ isLoadingExisting: false });
    }
  },

  setCurrentScript: (script) => set({ currentScript: script, deployResult: null, currentValidation: null, currentApprovalId: null }),
  clearDeployResult: () => set({ deployResult: null }),
    }),
    {
      name: "intune007-remediation",
      partialize: (state) => ({
        generatedScripts: state.generatedScripts,
        currentScript: state.currentScript,
      }),
    }
  )
);
