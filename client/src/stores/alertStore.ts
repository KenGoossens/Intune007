import { create } from "zustand";
import type { Alert, AlertCheckConfig } from "@intune-agent/shared";

interface AlertState {
  alerts: Alert[];
  configs: AlertCheckConfig[];
  lastRunTimes: Record<string, string>;
  isLoading: boolean;
  lastFetched: Date | null;

  // Actions
  fetchAlerts: () => Promise<void>;
  refreshAlerts: () => Promise<void>;
  acknowledgeAlert: (id: string) => Promise<void>;
  dismissAlert: (id: string) => Promise<void>;
  updateConfig: (
    type: string,
    updates: { enabled?: boolean; intervalMinutes?: number }
  ) => Promise<void>;
}

export const useAlertStore = create<AlertState>((set, get) => ({
  alerts: [],
  configs: [],
  lastRunTimes: {},
  isLoading: false,
  lastFetched: null,

  fetchAlerts: async () => {
    set({ isLoading: true });
    try {
      const res = await fetch("/api/alerts");
      const data = await res.json();
      set({
        alerts: data.alerts,
        configs: data.configs,
        lastRunTimes: data.lastRunTimes,
        lastFetched: new Date(),
      });
    } catch (err) {
      console.error("Failed to fetch alerts:", err);
    } finally {
      set({ isLoading: false });
    }
  },

  refreshAlerts: async () => {
    set({ isLoading: true });
    try {
      const res = await fetch("/api/alerts/refresh", { method: "POST" });
      const data = await res.json();
      set({
        alerts: data.alerts,
        configs: data.configs,
        lastRunTimes: data.lastRunTimes,
        lastFetched: new Date(),
      });
    } catch (err) {
      console.error("Failed to refresh alerts:", err);
    } finally {
      set({ isLoading: false });
    }
  },

  acknowledgeAlert: async (id: string) => {
    try {
      await fetch(`/api/alerts/${id}/acknowledge`, { method: "POST" });
      set((state) => ({
        alerts: state.alerts.map((a) =>
          a.id === id ? { ...a, acknowledged: true } : a
        ),
      }));
    } catch (err) {
      console.error("Failed to acknowledge alert:", err);
    }
  },

  dismissAlert: async (id: string) => {
    try {
      await fetch(`/api/alerts/${id}`, { method: "DELETE" });
      set((state) => ({
        alerts: state.alerts.filter((a) => a.id !== id),
      }));
    } catch (err) {
      console.error("Failed to dismiss alert:", err);
    }
  },

  updateConfig: async (
    type: string,
    updates: { enabled?: boolean; intervalMinutes?: number }
  ) => {
    try {
      const res = await fetch(`/api/alerts/config/${type}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      set({ configs: data.configs });
    } catch (err) {
      console.error("Failed to update config:", err);
    }
  },
}));
