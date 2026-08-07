import { create } from "zustand";
import type {
  ComanagementSummary,
  ConfigMgrConnectionStatus,
  ConfigMgrCollectionInfo,
  ConfigMgrDeploymentInfo,
  ConfigMgrApplicationInfo,
} from "@intune-agent/shared";

type SiteResource = "collections" | "deployments" | "applications";

/** Masked connection config returned by GET /api/configmgr/connection. */
export interface ConfigMgrConnectionConfig {
  configured: boolean;
  source: "store" | "env" | "none";
  adminServiceUrl: string;
  authMode: string;
  resource: string;
  tenantId: string;
  clientId: string;
  hasClientSecret: boolean;
  hasBearerToken: boolean;
  allowInsecureTls: boolean;
  updatedAt: string | null;
}

/** Editable form values posted to save/test a connection. */
export interface ConfigMgrConnectionForm {
  adminServiceUrl: string;
  authMode: string;
  resource: string;
  tenantId: string;
  clientId: string;
  clientSecret: string;
  bearerToken: string;
  allowInsecureTls: boolean;
}

interface ConfigMgrState {
  // Cloud co-management
  summary: ComanagementSummary | null;
  isLoading: boolean;
  error: string | null;
  lastFetched: Date | null;
  fetchSummary: () => Promise<void>;

  // On-prem AdminService (site data)
  connection: ConfigMgrConnectionStatus | null;
  connectionLoading: boolean;
  collections: ConfigMgrCollectionInfo[];
  deployments: ConfigMgrDeploymentInfo[];
  applications: ConfigMgrApplicationInfo[];
  siteLoading: Record<SiteResource, boolean>;
  siteError: string | null;
  fetchConnection: () => Promise<void>;
  fetchSite: (resource: SiteResource) => Promise<void>;

  // Connection wizard
  connectionConfig: ConfigMgrConnectionConfig | null;
  fetchConnectionConfig: () => Promise<void>;
  testConnection: (form: ConfigMgrConnectionForm) => Promise<ConfigMgrConnectionStatus>;
  saveConnection: (form: ConfigMgrConnectionForm) => Promise<{ ok: boolean; error?: string }>;
  disconnect: () => Promise<void>;

  // CMPivot (real-time query)
  cmpivotRows: Record<string, unknown>[];
  cmpivotStatus: string | null;
  cmpivotLoading: boolean;
  cmpivotError: string | null;
  runCmpivot: (params: { deviceName?: string; resourceId?: number; query: string }) => Promise<void>;

  // Client action (write)
  runClientAction: (
    deviceId: string,
    action: string
  ) => Promise<{ ok: boolean; error?: string; message?: string }>;
}

export const useConfigMgrStore = create<ConfigMgrState>((set) => ({
  summary: null,
  isLoading: false,
  error: null,
  lastFetched: null,

  fetchSummary: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch("/api/configmgr/summary");
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `Request failed (${res.status})`);
      }
      const data = (await res.json()) as ComanagementSummary;
      set({ summary: data, lastFetched: new Date() });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to load co-management data" });
    } finally {
      set({ isLoading: false });
    }
  },

  connection: null,
  connectionLoading: false,
  collections: [],
  deployments: [],
  applications: [],
  siteLoading: { collections: false, deployments: false, applications: false },
  siteError: null,

  fetchConnection: async () => {
    set({ connectionLoading: true });
    try {
      const res = await fetch("/api/configmgr/adminservice-status");
      const data = (await res.json()) as ConfigMgrConnectionStatus;
      set({ connection: data });
    } catch (err) {
      set({
        connection: {
          configured: false,
          connected: false,
          authMode: "unknown",
          error: err instanceof Error ? err.message : "Failed to reach server",
        },
      });
    } finally {
      set({ connectionLoading: false });
    }
  },

  fetchSite: async (resource) => {
    set((s) => ({
      siteLoading: { ...s.siteLoading, [resource]: true },
      siteError: null,
    }));
    try {
      const res = await fetch(`/api/configmgr/${resource}`);
      const data = (await res.json()) as {
        configured?: boolean;
        items?: unknown[];
        message?: string;
        error?: string;
      };
      if (data.error) throw new Error(data.error);
      const items = (Array.isArray(data.items) ? data.items : []) as never[];
      if (resource === "collections") set({ collections: items });
      else if (resource === "deployments") set({ deployments: items });
      else set({ applications: items });
    } catch (err) {
      set({ siteError: err instanceof Error ? err.message : `Failed to load ${resource}` });
    } finally {
      set((s) => ({ siteLoading: { ...s.siteLoading, [resource]: false } }));
    }
  },

  connectionConfig: null,

  fetchConnectionConfig: async () => {
    try {
      const res = await fetch("/api/configmgr/connection");
      const data = (await res.json()) as ConfigMgrConnectionConfig;
      set({ connectionConfig: data });
    } catch {
      /* ignore — wizard will still open with defaults */
    }
  },

  testConnection: async (form) => {
    const res = await fetch("/api/configmgr/connection/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    return (await res.json()) as ConfigMgrConnectionStatus;
  },

  saveConnection: async (form) => {
    const res = await fetch("/api/configmgr/connection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: body.error || `Save failed (${res.status})` };
    }
    // Refresh derived state after a successful save.
    await Promise.all([
      (async () => {
        const c = await fetch("/api/configmgr/connection");
        set({ connectionConfig: (await c.json()) as ConfigMgrConnectionConfig });
      })(),
      (async () => {
        const s = await fetch("/api/configmgr/adminservice-status");
        set({ connection: (await s.json()) as ConfigMgrConnectionStatus });
      })(),
    ]);
    return { ok: true };
  },

  disconnect: async () => {
    await fetch("/api/configmgr/connection", { method: "DELETE" });
    set({
      connectionConfig: null,
      connection: { configured: false, connected: false, authMode: "azuread" },
      collections: [],
      deployments: [],
      applications: [],
    });
  },

  cmpivotRows: [],
  cmpivotStatus: null,
  cmpivotLoading: false,
  cmpivotError: null,

  runCmpivot: async ({ deviceName, resourceId, query }) => {
    set({ cmpivotLoading: true, cmpivotError: null, cmpivotStatus: null });
    try {
      const res = await fetch("/api/configmgr/cmpivot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceName, resourceId, query }),
      });
      const data = (await res.json()) as {
        rows?: Record<string, unknown>[];
        status?: string;
        configured?: boolean;
        message?: string;
        error?: string;
      };
      if (data.error) throw new Error(data.error);
      if (data.configured === false) throw new Error(data.message || "AdminService not connected.");
      set({
        cmpivotRows: Array.isArray(data.rows) ? data.rows : [],
        cmpivotStatus: data.status ?? null,
      });
    } catch (err) {
      set({
        cmpivotError: err instanceof Error ? err.message : "CMPivot failed",
        cmpivotRows: [],
      });
    } finally {
      set({ cmpivotLoading: false });
    }
  },

  runClientAction: async (deviceId, action) => {
    try {
      const res = await fetch("/api/configmgr/client-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, action }),
      });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok || data.error) return { ok: false, error: data.error || `Failed (${res.status})` };
      return { ok: true, message: data.message };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Action failed" };
    }
  },
}));

