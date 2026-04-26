import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface GeneratedScript {
  displayName: string;
  description: string;
  detectionScript: string;
  remediationScript: string;
  runAsAccount: string;
  explanation: string;
}

export interface DeployResult {
  scriptId: string;
  displayName: string;
  success: boolean;
  error?: string;
}

interface RemediationState {
  // Generated scripts history
  generatedScripts: GeneratedScript[];
  currentScript: GeneratedScript | null;
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
  fetchExistingScripts: () => Promise<void>;
  setCurrentScript: (script: GeneratedScript | null) => void;
  clearDeployResult: () => void;
}

export const useRemediationStore = create<RemediationState>()(
  persist(
    (set, get) => ({
  generatedScripts: [],
  currentScript: null,
  isGenerating: false,
  isDeploying: false,
  deployResult: null,
  existingScripts: [],
  isLoadingExisting: false,

  generateScript: async (prompt: string, alertType?: string) => {
    set({ isGenerating: true, currentScript: null, deployResult: null });
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
        generatedScripts: [data.script, ...state.generatedScripts],
      }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Script generation failed:", msg);
    } finally {
      set({ isGenerating: false });
    }
  },

  generateForAlert: async (alertType: string, alertDetails: unknown[]) => {
    set({ isGenerating: true, currentScript: null, deployResult: null });
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

  setCurrentScript: (script) => set({ currentScript: script, deployResult: null }),
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
