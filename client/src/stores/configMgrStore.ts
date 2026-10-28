import { create } from "zustand";
import type {
  ComanagementSummary,
  ConfigMgrConnectionStatus,
  ConfigMgrCollectionInfo,
  ConfigMgrDeploymentInfo,
  ConfigMgrApplicationInfo,
  ConfigMgrApplicationDetail,
  ConfigMgrCollectionMember,
  ConfigMgrDeploymentStatusRow,
  ConfigMgrDeviceCard,
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

  // Drill-down detail (lazily fetched when a row is expanded)
  detailKey: string | null;
  detailLoading: boolean;
  detailError: string | null;
  collectionMembers: ConfigMgrCollectionMember[];
  deploymentStatus: ConfigMgrDeploymentStatusRow[];
  applicationDetail: ConfigMgrApplicationDetail | null;
  fetchCollectionMembers: (collectionId: string) => Promise<void>;
  fetchDeploymentStatus: (deploymentId: string) => Promise<void>;
  fetchApplicationDetail: (ciId: string) => Promise<void>;
  clearDetail: () => void;

  // ConfigMgr context for one device (ConfigMgr devices are only in Intune when co-managed)
  deviceDetailName: string | null;
  deviceDetailLoading: boolean;
  deviceDetailError: string | null;
  deviceCard: ConfigMgrDeviceCard | null;
  toggleDeviceDetail: (deviceName: string) => Promise<void>;

  // Demo mode (simulated site data; a real connection always takes precedence)
  demoMode: boolean;
  demoSimulating: boolean;
  fetchDemoMode: () => Promise<void>;
  setDemoMode: (enabled: boolean) => Promise<void>;

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

export const useConfigMgrStore = create<ConfigMgrState>((set, get) => ({
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

  detailKey: null,
  detailLoading: false,
  detailError: null,
  collectionMembers: [],
  deploymentStatus: [],
  applicationDetail: null,

  deviceDetailName: null,
  deviceDetailLoading: false,
  deviceDetailError: null,
  deviceCard: null,

  toggleDeviceDetail: async (deviceName) => {
    if (get().deviceDetailName === deviceName) {
      set({ deviceDetailName: null, deviceDetailError: null, deviceCard: null });
      return;
    }
    set({
      deviceDetailName: deviceName,
      deviceDetailLoading: true,
      deviceDetailError: null,
      deviceCard: null,
    });
    try {
      const res = await fetch(`/api/configmgr/devices/${encodeURIComponent(deviceName)}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      set({ deviceCard: data.items?.[0] ?? null });
    } catch (err) {
      set({
        deviceDetailError:
          err instanceof Error ? err.message : "Failed to load the ConfigMgr device record",
      });
    } finally {
      set({ deviceDetailLoading: false });
    }
  },

  clearDetail: () =>
    set({
      detailKey: null,
      detailError: null,
      collectionMembers: [],
      deploymentStatus: [],
      applicationDetail: null,
      deviceDetailName: null,
      deviceCard: null,
      deviceDetailError: null,
    }),

  fetchCollectionMembers: async (collectionId) => {
    set({ detailKey: `collection:${collectionId}`, detailLoading: true, detailError: null, collectionMembers: [] });
    try {
      const res = await fetch(`/api/configmgr/collections/${encodeURIComponent(collectionId)}/members`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      set({ collectionMembers: data.items ?? [] });
    } catch (err) {
      set({ detailError: err instanceof Error ? err.message : "Failed to load members" });
    } finally {
      set({ detailLoading: false });
    }
  },

  fetchDeploymentStatus: async (deploymentId) => {
    set({ detailKey: `deployment:${deploymentId}`, detailLoading: true, detailError: null, deploymentStatus: [] });
    try {
      const res = await fetch(`/api/configmgr/deployments/${encodeURIComponent(deploymentId)}/status?all=1`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      set({ deploymentStatus: data.items ?? [] });
    } catch (err) {
      set({ detailError: err instanceof Error ? err.message : "Failed to load deployment status" });
    } finally {
      set({ detailLoading: false });
    }
  },

  fetchApplicationDetail: async (ciId) => {
    set({ detailKey: `application:${ciId}`, detailLoading: true, detailError: null, applicationDetail: null });
    try {
      const res = await fetch(`/api/configmgr/applications/${encodeURIComponent(ciId)}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      set({ applicationDetail: data.items?.[0] ?? null });
    } catch (err) {
      set({ detailError: err instanceof Error ? err.message : "Failed to load application detail" });
    } finally {
      set({ detailLoading: false });
    }
  },

  demoMode: false,
  demoSimulating: false,

  fetchDemoMode: async () => {
    try {
      const res = await fetch("/api/configmgr/demo-mode");
      const data = (await res.json()) as { enabled: boolean; simulating: boolean };
      set({ demoMode: data.enabled, demoSimulating: data.simulating });
    } catch {
      /* ignore — the toggle just shows its last known state */
    }
  },

  setDemoMode: async (enabled) => {
    const res = await fetch("/api/configmgr/demo-mode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    const data = (await res.json()) as { enabled: boolean; simulating: boolean };
    set({ demoMode: data.enabled, demoSimulating: data.simulating });
    // Site data comes from a different source now, so refresh what's shown.
    await get().fetchConnection();
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

