import { create } from "zustand";
import type { TenantInfo } from "@intune-agent/shared";

interface TenantState {
  tenants: TenantInfo[];
  loading: boolean;
  error: string | null;
  fetchTenants: () => Promise<void>;
  switchTenant: (tenantId: string) => Promise<void>;
  disconnectTenant: (tenantId: string) => Promise<void>;
  beginConsent: (tenantId: string) => Promise<{ url: string }>;
}

export const useTenantStore = create<TenantState>((set, get) => ({
  tenants: [],
  loading: false,
  error: null,

  async fetchTenants() {
    set({ loading: true, error: null });
    try {
      const res = await fetch("/api/tenants");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { tenants: TenantInfo[] };
      set({ tenants: json.tenants, loading: false });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : "Failed to load tenants",
      });
    }
  },

  async switchTenant(tenantId) {
    const res = await fetch("/api/tenants/active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || body.error || `HTTP ${res.status}`);
    }
    // Optimistic update — flip isActive flags
    set((s) => ({
      tenants: s.tenants.map((t) => ({ ...t, isActive: t.tenantId === tenantId })),
    }));
  },

  async disconnectTenant(tenantId) {
    const res = await fetch(`/api/tenants/${tenantId}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || body.error || `HTTP ${res.status}`);
    }
    await get().fetchTenants();
  },

  async beginConsent(tenantId) {
    const qs = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : "";
    const res = await fetch(`/api/tenants/consent-url${qs}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    return (await res.json()) as { url: string };
  },
}));
