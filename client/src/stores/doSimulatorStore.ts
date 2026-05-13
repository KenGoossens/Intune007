import { create } from "zustand";
import type {
  DOSimulationInput,
  DOSimulationResult,
  DOSite,
  DOIntuneProfile,
} from "@intune-agent/shared";

export interface SimulationListEntry {
  id: string;
  name: string;
  createdAt: string;
  totalSavingsGB: number;
  readinessScore: number;
}

interface PrefillResponse {
  prefill: DOSimulationInput;
  notes: string[];
  totalDevicesAnalysed: number;
}

interface DOSimulatorState {
  input: DOSimulationInput;
  result: DOSimulationResult | null;
  list: SimulationListEntry[];
  profiles: DOIntuneProfile[] | null;
  loading: boolean;
  error: string | null;
  prefillNotes: string[];

  setInput: (patch: Partial<DOSimulationInput>) => void;
  updateContent: (patch: Partial<DOSimulationInput["content"]>) => void;
  updateEnvironment: (patch: Partial<DOSimulationInput["environment"]>) => void;
  updateAssumptions: (patch: Partial<DOSimulationInput["assumptions"]>) => void;
  addSite: () => void;
  updateSite: (id: string, patch: Partial<DOSite>) => void;
  removeSite: (id: string) => void;
  importSitesCsv: (csv: string) => Promise<void>;

  prefillFromTenant: () => Promise<void>;
  runSimulation: (save?: boolean) => Promise<void>;
  fetchList: () => Promise<void>;
  loadSimulation: (id: string) => Promise<void>;
  deleteSimulation: (id: string) => Promise<void>;
  generateProfiles: () => Promise<void>;
}

const defaultInput: DOSimulationInput = {
  name: "New simulation",
  sites: [],
  content: {
    windowsUpdatesGBPerDevice: 3,
    m365AppsGBPerDevice: 1.5,
    intuneAppsGBPerDevice: 1,
    driversGBPerDevice: 0.5,
  },
  environment: {
    identityModel: "hybrid",
    intuneWorkloadCount: 0,
    configMgrDPCount: 0,
    coManagementEnabled: false,
  },
  assumptions: {
    wanCostPerGB: 0.05,
    mccHitRate: 0.85,
  },
};

function newId(): string {
  // crypto.randomUUID is widely available in modern browsers
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `s_${Math.random().toString(36).slice(2, 10)}`;
}

export const useDOSimulatorStore = create<DOSimulatorState>((set, get) => ({
  input: defaultInput,
  result: null,
  list: [],
  profiles: null,
  loading: false,
  error: null,
  prefillNotes: [],

  setInput(patch) {
    set((s) => ({ input: { ...s.input, ...patch } }));
  },
  updateContent(patch) {
    set((s) => ({ input: { ...s.input, content: { ...s.input.content, ...patch } } }));
  },
  updateEnvironment(patch) {
    set((s) => ({ input: { ...s.input, environment: { ...s.input.environment, ...patch } } }));
  },
  updateAssumptions(patch) {
    set((s) => ({ input: { ...s.input, assumptions: { ...s.input.assumptions, ...patch } } }));
  },
  addSite() {
    const id = newId();
    set((s) => ({
      input: {
        ...s.input,
        sites: [
          ...s.input.sites,
          {
            id,
            name: `Site ${s.input.sites.length + 1}`,
            type: "branch",
            deviceCount: 25,
            wanBandwidthMbps: 100,
            hasMCCCandidate: false,
            hasConfigMgrDP: false,
            subnets: [],
          },
        ],
      },
    }));
  },
  updateSite(id, patch) {
    set((s) => ({
      input: {
        ...s.input,
        sites: s.input.sites.map((site) => (site.id === id ? { ...site, ...patch } : site)),
      },
    }));
  },
  removeSite(id) {
    set((s) => ({ input: { ...s.input, sites: s.input.sites.filter((site) => site.id !== id) } }));
  },

  async importSitesCsv(csv) {
    set({ loading: true, error: null });
    try {
      const res = await fetch("/api/do-simulator/csv/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const json = (await res.json()) as { sites: DOSite[] };
      set((s) => ({ input: { ...s.input, sites: [...s.input.sites, ...json.sites] }, loading: false }));
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : "CSV import failed" });
    }
  },

  async prefillFromTenant() {
    set({ loading: true, error: null });
    try {
      const res = await fetch("/api/do-simulator/prefill", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const json = (await res.json()) as PrefillResponse;
      set({ input: json.prefill, prefillNotes: json.notes, loading: false });
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : "Prefill failed" });
    }
  },

  async runSimulation(save = false) {
    set({ loading: true, error: null, profiles: null });
    try {
      const url = `/api/do-simulator/run${save ? "?save=1" : ""}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(get().input),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const json = (await res.json()) as DOSimulationResult;
      set({ result: json, profiles: json.intuneProfiles ?? null, loading: false });
      if (save) {
        get().fetchList();
      }
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : "Simulation failed" });
    }
  },

  async fetchList() {
    try {
      const res = await fetch("/api/do-simulator");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { simulations: SimulationListEntry[] };
      set({ list: json.simulations });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to load simulations" });
    }
  },

  async loadSimulation(id) {
    set({ loading: true, error: null });
    try {
      const res = await fetch(`/api/do-simulator/${id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as DOSimulationResult;
      set({ result: json, input: json.input, profiles: json.intuneProfiles ?? null, loading: false });
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : "Load failed" });
    }
  },

  async deleteSimulation(id) {
    await fetch(`/api/do-simulator/${id}`, { method: "DELETE" });
    await get().fetchList();
  },

  async generateProfiles() {
    const result = get().result;
    if (!result) {
      set({ error: "Run a simulation first." });
      return;
    }
    set({ loading: true, error: null });
    try {
      const res = await fetch(`/api/do-simulator/${result.simulationId}/profiles`, {
        method: "POST",
      });
      if (!res.ok) {
        // If the simulation wasn't saved yet, save it first then retry.
        if (res.status === 404) {
          await get().runSimulation(true);
          const result2 = get().result!;
          const retry = await fetch(`/api/do-simulator/${result2.simulationId}/profiles`, {
            method: "POST",
          });
          if (!retry.ok) throw new Error(`HTTP ${retry.status}`);
          const json = (await retry.json()) as { profiles: DOIntuneProfile[] };
          set({ profiles: json.profiles, loading: false });
          return;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      const json = (await res.json()) as { profiles: DOIntuneProfile[] };
      set({ profiles: json.profiles, loading: false });
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : "Profile generation failed" });
    }
  },
}));
