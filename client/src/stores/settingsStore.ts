import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Settings store — persists panel visibility preferences in localStorage.
 */

interface SettingsState {
  /** Map of panelId → enabled (true/false) */
  panelVisibility: Record<string, boolean>;
  /** Toggle a specific panel */
  togglePanel: (panelId: string) => void;
  /** Set a panel's visibility */
  setPanel: (panelId: string, visible: boolean) => void;
  /** Check if a panel is visible */
  isPanelVisible: (panelId: string) => boolean;
  /** Enable all panels */
  enableAll: () => void;
  /** Disable all panels */
  disableAll: () => void;
}

// All panels enabled by default
const DEFAULT_VISIBILITY: Record<string, boolean> = {
  alerts: true,
  data: true,
  deviceCard: true,
  queryBuilder: true,
  reportGenerator: true,
  policies: true,
  policyBuilder: true,
  policyDiff: true,
  remediation: true,
  troubleshooter: true,
  logs: true,
  insights: true,
  riskScores: true,
  forecast: true,
  securityPosture: true,
  cveMonitor: true,
  appHealth: true,
  autopilotReadiness: true,
  baselines: true,
  timeline: true,
  tasks: true,
  analytics: true,
  doSimulator: true,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      panelVisibility: { ...DEFAULT_VISIBILITY },

      togglePanel: (panelId: string) =>
        set((state) => ({
          panelVisibility: {
            ...state.panelVisibility,
            [panelId]: !state.panelVisibility[panelId],
          },
        })),

      setPanel: (panelId: string, visible: boolean) =>
        set((state) => ({
          panelVisibility: {
            ...state.panelVisibility,
            [panelId]: visible,
          },
        })),

      isPanelVisible: (panelId: string) => {
        return get().panelVisibility[panelId] !== false;
      },

      enableAll: () => set({ panelVisibility: { ...DEFAULT_VISIBILITY } }),

      disableAll: () => {
        const all: Record<string, boolean> = {};
        for (const key of Object.keys(DEFAULT_VISIBILITY)) {
          all[key] = false;
        }
        set({ panelVisibility: all });
      },
    }),
    {
      name: "intune007-settings",
    }
  )
);
