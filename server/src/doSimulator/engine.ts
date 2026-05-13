/**
 * Delivery Optimization Simulator — engine.
 *
 * Produces per-site DO recommendations, MCC placement, bandwidth-savings
 * projections, a cloud-native readiness score, a migration plan, and a
 * Mermaid architecture diagram for moving from ConfigMgr DPs to Intune
 * App Distribution + Microsoft Connected Cache.
 *
 * Heuristics & assumptions
 * ------------------------
 * Peer hit rate by site size (sources: MS Tech Community DO benchmarks,
 *   "Plan for Delivery Optimization" docs):
 *     <5 devices       → 5 %     (no peer pool)
 *     5-19 devices     → 30 %
 *     20-99 devices    → 45 %
 *     100-499 devices  → 55 %
 *     >=500 devices    → 60 %
 *
 * MCC hit rate: 0.85 (default, override-able).
 *   Microsoft published baselines for MCC on enterprise-cache scenarios
 *   are 80-90 % for Windows Update + Intune Win32 content.
 *
 * MCC sizing: max(50 GB, monthly content GB * 1.5) — 1.5x buffer because
 *   the cache holds new content across release waves.
 *
 * MCC server is recommended when:
 *   - site has a server-class device available, AND
 *   - site has >= 50 devices, AND
 *   - WAN link is <= 200 Mbps OR site currently has a CM DP.
 *   (These thresholds match MS field guidance for "DP retirement" projects.)
 */

import { randomUUID, createHash } from "crypto";
import type {
  DOSimulationInput,
  DOSimulationResult,
  DOSiteRecommendation,
  DOSavingsSummary,
  DOReadinessScore,
  DOSite,
  DOContentProfile,
  DODownloadMode,
  DOMigrationPhase,
  DOAssumptions,
} from "@intune-agent/shared";

// ─── Heuristic constants ────────────────────────────────────────

const DEFAULT_ASSUMPTIONS: DOAssumptions = {
  wanCostPerGB: 0.05,
  mccHitRate: 0.85,
};

const DOWNLOAD_MODE_NAMES: Record<DODownloadMode, string> = {
  0: "HTTP only (no peering)",
  1: "LAN (HTTP + LAN peers)",
  2: "Group (HTTP + Group peers)",
  3: "Internet (HTTP + Internet peers)",
  99: "Simple (HTTP only, no DO cloud service)",
  100: "Bypass (no DO at all)",
};

// DOGroupIdSource values (MDM CSP)
const DO_GROUP_SOURCE_AD_SITE = 1;
const DO_GROUP_SOURCE_AUTH_DOMAIN_SID = 2;
const DO_GROUP_SOURCE_DHCP_USER_OPTION = 3;
const DO_GROUP_SOURCE_DNS_SUFFIX = 4;
const DO_GROUP_SOURCE_GROUP_ID = 5; // Use the explicit DOGroupId GUID

// ─── Public API ─────────────────────────────────────────────────

export function runSimulation(rawInput: DOSimulationInput): DOSimulationResult {
  const input = normaliseInput(rawInput);
  const perSite = input.sites.map((site) => recommendForSite(site, input.content, input.assumptions));
  const savings = computeSavings(perSite, input.assumptions);
  const readiness = computeReadiness(input, perSite);
  const totalMCCServers = perSite.filter((r) => r.deployMCC).length;
  const migrationPlan = buildMigrationPlan(input, perSite, totalMCCServers);
  const architectureMermaid = buildMermaid(input, perSite);

  return {
    simulationId: randomUUID(),
    name: input.name || "Untitled simulation",
    generatedAt: new Date().toISOString(),
    input,
    perSite,
    savings,
    readiness,
    migrationPlan,
    architectureMermaid,
    totalMCCServers,
    intuneProfiles: [],
  };
}

// ─── Per-site recommendation ────────────────────────────────────

function recommendForSite(
  site: DOSite,
  content: DOContentProfile,
  assumptions: DOAssumptions
): DOSiteRecommendation {
  const reasoning: string[] = [];
  const monthlyContentPerDeviceGB =
    content.windowsUpdatesGBPerDevice +
    content.m365AppsGBPerDevice +
    content.intuneAppsGBPerDevice +
    content.driversGBPerDevice;
  const monthlyContentGB = round(site.deviceCount * monthlyContentPerDeviceGB);

  // Decide download mode
  let mode: DODownloadMode;
  let groupSource = DO_GROUP_SOURCE_AD_SITE;
  if (site.type === "guest") {
    mode = 100;
    reasoning.push("Guest network — DO disabled to avoid bleed-over to corporate peers.");
  } else if (site.type === "roaming" || site.deviceCount <= 1) {
    mode = 3;
    reasoning.push("Roaming / single-device location — Internet peering only.");
  } else if (site.deviceCount < 20) {
    mode = 2;
    groupSource = DO_GROUP_SOURCE_DNS_SUFFIX;
    reasoning.push(
      `Small site (${site.deviceCount} devices) — Group mode keeps peering tight via DNS suffix.`
    );
  } else if (site.hasMCCCandidate && site.deviceCount >= 50) {
    mode = 1;
    groupSource = DO_GROUP_SOURCE_AD_SITE;
    reasoning.push(
      "Site has a MCC-capable server and ≥50 devices — LAN mode + MCC delivers the highest hit rate."
    );
  } else {
    mode = 2;
    groupSource = site.adSiteName ? DO_GROUP_SOURCE_AD_SITE : DO_GROUP_SOURCE_DNS_SUFFIX;
    reasoning.push(
      `Medium site (${site.deviceCount} devices) without MCC candidate — Group mode covers peering.`
    );
  }

  // MCC decision
  const wanIsConstrained = site.wanBandwidthMbps > 0 && site.wanBandwidthMbps <= 200;
  const deployMCC =
    site.hasMCCCandidate &&
    site.deviceCount >= 50 &&
    (wanIsConstrained || site.hasConfigMgrDP);
  if (deployMCC) {
    reasoning.push(
      site.hasConfigMgrDP
        ? "Currently hosts a ConfigMgr DP — MCC is the natural replacement for cached content."
        : `WAN link is ${site.wanBandwidthMbps} Mbps — MCC offsets external download pressure.`
    );
  } else if (site.hasMCCCandidate && site.deviceCount < 50) {
    reasoning.push("Has a server but <50 devices — peer-to-peer alone gives sufficient savings; skip MCC.");
  } else if (!site.hasMCCCandidate && site.deviceCount >= 100) {
    reasoning.push(
      "Large site without an MCC-capable server — flag as candidate to add a small Linux/Windows host for MCC."
    );
  }

  // Hit rates
  const peerHitRate =
    assumptions.peerHitRateOverride ?? peerHitRateForSize(site.deviceCount, mode);
  const mccHitRate = deployMCC ? assumptions.mccHitRate : 0;

  // Effective external GB per month after DO + MCC
  const afterPeer = monthlyContentGB * (1 - peerHitRate);
  const effectiveExternalGB = round(afterPeer * (1 - mccHitRate));
  const monthlySavingsGB = round(monthlyContentGB - effectiveExternalGB);

  // MCC sizing
  const mccCacheSizeGB = deployMCC ? Math.max(50, Math.round(monthlyContentGB * 1.5)) : undefined;

  // Stable DO Group ID (deterministic UUID per site)
  const doGroupId = stableGuidForSite(site);

  return {
    siteId: site.id,
    siteName: site.name,
    downloadMode: mode,
    downloadModeName: DOWNLOAD_MODE_NAMES[mode],
    deployMCC,
    mccCacheSizeGB,
    doGroupId,
    doGroupIdSource: groupSource,
    peerHitRate: round(peerHitRate, 3),
    mccHitRate: round(mccHitRate, 3),
    monthlyContentGB,
    effectiveExternalGB,
    monthlySavingsGB,
    reasoning,
  };
}

function peerHitRateForSize(deviceCount: number, mode: DODownloadMode): number {
  // Bypass and Simple modes do no peering.
  if (mode === 100 || mode === 99 || mode === 0) return 0;
  if (deviceCount < 5) return 0.05;
  if (deviceCount < 20) return 0.30;
  if (deviceCount < 100) return 0.45;
  if (deviceCount < 500) return 0.55;
  return 0.60;
}

// ─── Savings ────────────────────────────────────────────────────

function computeSavings(
  perSite: DOSiteRecommendation[],
  assumptions: DOAssumptions
): DOSavingsSummary {
  let baseline = 0;
  let doOnly = 0;
  let doPlusMCC = 0;
  for (const r of perSite) {
    baseline += r.monthlyContentGB;
    doOnly += r.monthlyContentGB * (1 - r.peerHitRate);
    doPlusMCC += r.effectiveExternalGB;
  }
  const monthlyCostSavingsUSD = round((baseline - doPlusMCC) * assumptions.wanCostPerGB, 2);
  return {
    baselineMonthlyGB: round(baseline),
    doOnlyMonthlyGB: round(doOnly),
    doPlusMCCMonthlyGB: round(doPlusMCC),
    monthlyCostSavingsUSD,
    annualCostSavingsUSD: round(monthlyCostSavingsUSD * 12, 2),
  };
}

// ─── Cloud-native readiness ─────────────────────────────────────

function computeReadiness(
  input: DOSimulationInput,
  perSite: DOSiteRecommendation[]
): DOReadinessScore {
  const blockers: string[] = [];

  // Identity (max 30)
  let identityScore = 0;
  switch (input.environment.identityModel) {
    case "aadj":
      identityScore = 30;
      break;
    case "hybrid":
      identityScore = 20;
      blockers.push("Devices are still hybrid-joined — plan for full Entra-only join to retire AD dependencies.");
      break;
    case "ad_only":
      identityScore = 0;
      blockers.push("Domain-joined only — Entra join (or hybrid as a stepping stone) is required for cloud-native management.");
      break;
  }

  // Workload migration (max 32 — 4 pts per workload, capped)
  const workloadScore = Math.min(32, input.environment.intuneWorkloadCount * 4);
  if (input.environment.intuneWorkloadCount < 4) {
    blockers.push(
      `Only ${input.environment.intuneWorkloadCount}/8 ConfigMgr workloads switched to Intune — move client apps and Office Click-to-Run next.`
    );
  }

  // ConfigMgr footprint (max 18 — fewer remaining DPs = better)
  const remainingDPs = input.environment.configMgrDPCount;
  const dpFactor = Math.max(0, 1 - remainingDPs / 25); // 0 DPs = 1.0; 25+ DPs = 0
  const configMgrScore = Math.round(18 * dpFactor);
  if (remainingDPs > 5) {
    blockers.push(
      `${remainingDPs} ConfigMgr DPs still in service — each retired DP simplifies routing and lowers TCO.`
    );
  }

  // Network (max 20)
  const totalDevices = perSite.reduce((acc, s) => acc + (s.monthlyContentGB > 0 ? 1 : 0), 0) || 1;
  const sitesWithDoOrMCC = perSite.filter((s) => s.downloadMode !== 100 && s.downloadMode !== 0).length;
  const networkScore = Math.round(20 * (sitesWithDoOrMCC / Math.max(1, totalDevices)));
  if (networkScore < 12) {
    blockers.push(
      "Several sites are on bypass/HTTP-only — enable Group or LAN mode broadly to unlock peer savings."
    );
  }

  const total = clamp(identityScore + workloadScore + configMgrScore + networkScore, 0, 100);
  return {
    total,
    identityScore,
    workloadScore,
    configMgrScore,
    networkScore,
    blockers: blockers.slice(0, 3),
  };
}

// ─── Migration plan ─────────────────────────────────────────────

function buildMigrationPlan(
  input: DOSimulationInput,
  perSite: DOSiteRecommendation[],
  totalMCC: number
): DOMigrationPhase[] {
  const dpCount = input.environment.configMgrDPCount;
  const phases: DOMigrationPhase[] = [];
  let order = 1;

  phases.push({
    order: order++,
    title: "Baseline & enablement",
    description: "Roll out Intune-managed Delivery Optimization settings to every Windows device so peer-to-peer caching starts working immediately.",
    estimatedDurationWeeks: 2,
    prerequisites: ["Intune licenses for all Windows devices", "Pilot ring of 50–100 devices"],
    actions: [
      "Deploy the generated Intune Configuration Profile (DO settings) to a pilot ring.",
      "Validate peer activity in Endpoint Analytics → Delivery Optimization.",
      "Promote to all Windows devices.",
    ],
  });

  if (totalMCC > 0) {
    phases.push({
      order: order++,
      title: `Stand up Microsoft Connected Cache (${totalMCC} server${totalMCC === 1 ? "" : "s"})`,
      description: "Provision MCC nodes at recommended sites to absorb internet traffic for Windows Update and Intune Win32 content.",
      estimatedDurationWeeks: 3,
      prerequisites: ["Intune-enrolled Windows Server / Linux host per site", "Outbound HTTPS to Microsoft endpoints"],
      actions: perSite
        .filter((s) => s.deployMCC)
        .map((s) => `Provision MCC at ${s.siteName} — ~${s.mccCacheSizeGB} GB cache.`),
    });
  }

  phases.push({
    order: order++,
    title: "Mirror priority apps to Intune Win32",
    description: "Repackage the top 80% of ConfigMgr applications by usage as Intune Win32 apps and deploy to the same target groups.",
    estimatedDurationWeeks: 6,
    prerequisites: ["Win32 Content Prep Tool", "Inventory of CM apps by usage"],
    actions: [
      "Export CM application list and rank by deployment count.",
      "Repackage top apps as .intunewin and create Intune Win32 deployments.",
      "Co-deploy to the same Azure AD groups as the existing CM collections.",
      "Monitor side-by-side install success in App Health.",
    ],
  });

  if (dpCount > 0) {
    phases.push({
      order: order++,
      title: "Cutover & retire ConfigMgr DPs",
      description: "Once Intune deployments hit ≥95% success and MCC hit-rate stabilises, move the deployment authority to Intune and decommission the DPs.",
      estimatedDurationWeeks: 4,
      prerequisites: ["Intune deployments at ≥95% success", "MCC hit rate ≥70%"],
      actions: [
        `Decommission ${dpCount} ConfigMgr distribution point${dpCount === 1 ? "" : "s"} in waves.`,
        "Remove boundary groups and content from CM site server.",
        "Close out CM client agent on devices once parity is verified.",
      ],
    });
  }

  phases.push({
    order: order++,
    title: "Optimise & report",
    description: "Track WAN savings, peer hit rate and MCC hit rate as KPIs in Intune007 and tune assumptions monthly.",
    estimatedDurationWeeks: 1,
    prerequisites: [],
    actions: [
      "Re-run the DO simulation quarterly to compare modeled vs. actual savings.",
      "Adjust DO upload limits per site based on WAN telemetry.",
    ],
  });

  return phases;
}

// ─── Architecture diagram (Mermaid) ─────────────────────────────

function buildMermaid(input: DOSimulationInput, perSite: DOSiteRecommendation[]): string {
  const lines: string[] = [];
  lines.push("graph TD");
  lines.push('  CDN["Microsoft CDN<br/>(Windows Update, Intune)"]:::cdn');

  for (let i = 0; i < perSite.length; i++) {
    const rec = perSite[i];
    const site = input.sites.find((s) => s.id === rec.siteId)!;
    const mccId = `MCC${i}`;
    const siteId = `S${i}`;
    const cls =
      rec.downloadMode === 100 ? "guest"
      : rec.downloadMode === 3 ? "roaming"
      : "site";

    if (rec.deployMCC) {
      lines.push(
        `  ${mccId}["MCC @ ${escape(site.name)}<br/>~${rec.mccCacheSizeGB} GB cache"]:::mcc`
      );
      lines.push(`  CDN --> ${mccId}`);
      lines.push(
        `  ${mccId} --> ${siteId}["${escape(site.name)}<br/>${site.deviceCount} devices · ${rec.downloadModeName}"]:::${cls}`
      );
    } else {
      lines.push(
        `  CDN --> ${siteId}["${escape(site.name)}<br/>${site.deviceCount} devices · ${rec.downloadModeName}"]:::${cls}`
      );
    }
  }

  lines.push("");
  lines.push("  classDef cdn fill:#1e3a8a,stroke:#3b82f6,color:#dbeafe");
  lines.push("  classDef mcc fill:#854d0e,stroke:#facc15,color:#fef3c7");
  lines.push("  classDef site fill:#064e3b,stroke:#10b981,color:#d1fae5");
  lines.push("  classDef roaming fill:#3f3f46,stroke:#a1a1aa,color:#fafafa");
  lines.push("  classDef guest fill:#7f1d1d,stroke:#f87171,color:#fee2e2");

  return lines.join("\n");
}

function escape(s: string): string {
  return s.replace(/"/g, "'").replace(/\|/g, "/");
}

// ─── Helpers ────────────────────────────────────────────────────

function normaliseInput(raw: DOSimulationInput): DOSimulationInput {
  const assumptions: DOAssumptions = {
    wanCostPerGB: raw.assumptions?.wanCostPerGB ?? DEFAULT_ASSUMPTIONS.wanCostPerGB,
    mccHitRate: clamp(raw.assumptions?.mccHitRate ?? DEFAULT_ASSUMPTIONS.mccHitRate, 0, 1),
    peerHitRateOverride:
      typeof raw.assumptions?.peerHitRateOverride === "number"
        ? clamp(raw.assumptions.peerHitRateOverride, 0, 1)
        : undefined,
  };
  const sites = (raw.sites || []).map((s) => ({
    ...s,
    id: s.id || randomUUID(),
    deviceCount: Math.max(0, Math.floor(s.deviceCount || 0)),
    wanBandwidthMbps: Math.max(0, Math.floor(s.wanBandwidthMbps || 0)),
    subnets: Array.isArray(s.subnets) ? s.subnets : [],
  }));
  return { ...raw, sites, assumptions };
}

function stableGuidForSite(site: DOSite): string {
  const seed = `intune007:${site.name}:${site.adSiteName || ""}:${(site.subnets || []).map((s) => s.cidr).sort().join(",")}`;
  const h = createHash("sha1").update(seed).digest("hex");
  // Format as a UUID v4-ish string (deterministic)
  return `${h.substring(0, 8)}-${h.substring(8, 12)}-4${h.substring(13, 16)}-8${h.substring(17, 20)}-${h.substring(20, 32)}`;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function round(n: number, decimals = 1): number {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}
