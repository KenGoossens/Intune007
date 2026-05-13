/**
 * Tenant Analyzer — pre-fills DO simulator inputs by inspecting the
 * currently-connected Intune tenant.
 *
 * What it can infer from Graph:
 *   - identityModel: from device joinType breakdown
 *   - intuneWorkloadCount: heuristic — count of co-management workloads
 *     enabled (we approximate via presence of Intune CSPs vs. CM agent)
 *   - configMgrDPCount: cannot read from Graph; defaults to 0 with note
 *   - per-site shape: cannot read AD sites/subnets from Graph; instead we
 *     emit ONE aggregated "All managed devices" site as a starting point
 *     so the admin can split it.
 *
 * Whatever can't be inferred is returned as a `notes` array so the UI can
 * prompt the user to fill the gap.
 */

import { randomUUID } from "crypto";
import type {
  DOSimulationInput,
  DOIdentityModel,
  DOSite,
} from "@intune-agent/shared";
import { getManagedDevices } from "../graph/devices.js";

export interface TenantPrefillResult {
  prefill: DOSimulationInput;
  notes: string[];
  totalDevicesAnalysed: number;
}

export async function analyseCurrentTenantForDO(): Promise<TenantPrefillResult> {
  const notes: string[] = [];

  // Pull a representative device sample (cache-backed; cheap).
  const result = await getManagedDevices({ top: 1000 });
  const devices = result.items as Array<{
    operatingSystem?: string;
    joinType?: string;
    managementAgent?: string;
    osVersion?: string;
  }>;
  const total = devices.length;

  if (total === 0) {
    notes.push("No devices found — fill out the simulator manually with planned topology.");
    return {
      prefill: emptyPrefill(),
      notes,
      totalDevicesAnalysed: 0,
    };
  }

  // Identity model (rough heuristic from joinType)
  const joinCounts = countBy(devices, (d) => normaliseJoinType(d.joinType));
  const aadj = joinCounts["azureADJoined"] || 0;
  const hybrid = joinCounts["hybridAzureADJoined"] || 0;
  const domain = joinCounts["domainJoined"] || 0;
  let identityModel: DOIdentityModel = "ad_only";
  if (aadj >= total * 0.7) identityModel = "aadj";
  else if (hybrid + aadj >= total * 0.5) identityModel = "hybrid";
  else if (domain >= total * 0.5) identityModel = "ad_only";

  // Workload heuristic: how many devices are reporting via Intune mgmt agent
  // (mdm or intuneClient) vs CM-only.
  const mdm = devices.filter((d) => /mdm|intune/i.test(d.managementAgent || "")).length;
  const intuneShare = mdm / total;
  // Each 12.5% of MDM-managed devices ≈ 1 of 8 CM workloads moved.
  const intuneWorkloadCount = Math.min(8, Math.round(intuneShare * 8));

  notes.push(
    `Analysed ${total} devices: ${aadj} Entra-joined · ${hybrid} hybrid · ${domain} domain-joined.`
  );
  notes.push(
    `~${Math.round(intuneShare * 100)}% of devices are MDM-managed → estimated ${intuneWorkloadCount}/8 ConfigMgr workloads switched.`
  );
  notes.push(
    "ConfigMgr DP count, AD sites, subnets and per-site WAN bandwidth cannot be read from Graph — please fill those in for accurate per-site recommendations."
  );

  // Build a single "All managed devices" placeholder site the admin can split.
  const placeholderSite: DOSite = {
    id: randomUUID(),
    name: "All managed devices (split me into sites)",
    type: total >= 100 ? "headquarters" : "branch",
    deviceCount: total,
    wanBandwidthMbps: 100,
    hasMCCCandidate: false,
    hasConfigMgrDP: false,
    subnets: [],
  };

  return {
    prefill: {
      name: "Tenant pre-fill",
      sites: [placeholderSite],
      content: {
        windowsUpdatesGBPerDevice: 3,
        m365AppsGBPerDevice: 1.5,
        intuneAppsGBPerDevice: 1,
        driversGBPerDevice: 0.5,
      },
      environment: {
        identityModel,
        intuneWorkloadCount,
        configMgrDPCount: 0,
        coManagementEnabled: intuneWorkloadCount > 0 && intuneWorkloadCount < 8,
      },
      assumptions: {
        wanCostPerGB: 0.05,
        mccHitRate: 0.85,
      },
    },
    notes,
    totalDevicesAnalysed: total,
  };
}

function emptyPrefill(): DOSimulationInput {
  return {
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
}

function countBy<T>(items: T[], keyFn: (t: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items) {
    const key = keyFn(item);
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

function normaliseJoinType(jt: string | undefined): string {
  if (!jt) return "unknown";
  const s = String(jt).toLowerCase();
  if (s.includes("azureadjoined") && s.includes("hybrid")) return "hybridAzureADJoined";
  if (s.includes("azureadjoined")) return "azureADJoined";
  if (s.includes("hybrid")) return "hybridAzureADJoined";
  if (s.includes("domain")) return "domainJoined";
  return "unknown";
}
