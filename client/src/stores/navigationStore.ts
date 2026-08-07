import { create } from "zustand";

/**
 * Navigation store — allows any component to navigate to a panel
 * and pass context (like a device name, policy name, query, etc.).
 */

export type TargetPanel =
  | "deviceCard"
  | "data"
  | "alerts"
  | "policies"
  | "policyBuilder"
  | "remediation"
  | "troubleshooter"
  | "securityPosture"
  | "appHealth"
  | "autopilotReadiness"
  | "timeline"
  | "riskScores"
  | "queryBuilder"
  | "logs"
  | "forecast"
  | "analytics"
  | "insights"
  | "cveMonitor"
  | "doSimulator"
  | "configMgr";

export interface NavigationContext {
  /** Which panel to navigate to */
  panel: TargetPanel;
  /** Optional device name to load */
  deviceName?: string;
  /** Optional query to pre-fill */
  query?: string;
  /** Optional filter or category to pre-select */
  filter?: string;
  /** Unique timestamp to force re-navigation to same panel */
  ts: number;
}

interface NavigationState {
  // Device Card context (legacy — still used by DeviceLink)
  deviceCardTarget: string | null;

  // Generic cross-panel navigation
  pendingNavigation: NavigationContext | null;

  // Actions
  navigateToDeviceCard: (deviceNameOrId: string) => void;
  clearDeviceCardTarget: () => void;
  navigateTo: (panel: TargetPanel, context?: Partial<Omit<NavigationContext, "panel" | "ts">>) => void;
  clearNavigation: () => void;
}

export const useNavigationStore = create<NavigationState>((set) => ({
  deviceCardTarget: null,
  pendingNavigation: null,

  navigateToDeviceCard: (deviceNameOrId: string) => {
    set({
      deviceCardTarget: deviceNameOrId,
      pendingNavigation: { panel: "deviceCard", deviceName: deviceNameOrId, ts: Date.now() },
    });
  },

  clearDeviceCardTarget: () => {
    set({ deviceCardTarget: null });
  },

  navigateTo: (panel, context) => {
    set({
      pendingNavigation: { panel, ...context, ts: Date.now() },
      // If navigating to deviceCard, also set the legacy target
      ...(panel === "deviceCard" && context?.deviceName
        ? { deviceCardTarget: context.deviceName }
        : {}),
    });
  },

  clearNavigation: () => {
    set({ pendingNavigation: null });
  },
}));
