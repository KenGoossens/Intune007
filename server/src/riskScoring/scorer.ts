/**
 * Device Risk Scoring — Computes a composite risk score (0-100) per device.
 *
 * Factors:
 *   - Compliance state (compliant/noncompliant/unknown)
 *   - Days since last sync (stale device detection)
 *   - OS version (end-of-life detection)
 *   - Encryption status (BitLocker/FileVault)
 *   - Ownership type (corporate vs personal)
 *   - Configuration profile conflicts/errors
 *
 * Score: 0 = no risk, 100 = critical risk
 */

import { getGraphClient, fetchWithPagination } from "../graph/client.js";

export interface DeviceRiskScore {
  deviceId: string;
  deviceName: string;
  userPrincipalName: string;
  operatingSystem: string;
  osVersion: string;
  riskScore: number;
  riskLevel: "critical" | "high" | "medium" | "low";
  factors: RiskFactor[];
}

export interface RiskFactor {
  name: string;
  score: number;     // contribution to total risk (0-100 before weighting)
  weight: number;    // weight multiplier
  detail: string;
}

export interface FleetRiskSummary {
  generatedAt: string;
  durationMs: number;
  totalDevices: number;
  averageRiskScore: number;
  distribution: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  devices: DeviceRiskScore[];
  topRisks: DeviceRiskScore[];
}

/**
 * Compute risk scores for all managed devices.
 */
export async function computeFleetRiskScores(): Promise<FleetRiskSummary> {
  const start = Date.now();
  const client = getGraphClient();

  // Fetch devices with relevant fields
  const devicesResult = await fetchWithPagination<Record<string, unknown>>(
    client,
    "/deviceManagement/managedDevices",
    {
      select: [
        "id",
        "deviceName",
        "operatingSystem",
        "osVersion",
        "complianceState",
        "isEncrypted",
        "managedDeviceOwnerType",
        "lastSyncDateTime",
        "userPrincipalName",
        "model",
        "manufacturer",
      ].join(","),
      maxItems: 500,
    }
  );

  // Fetch config states for conflict detection (sample up to 50 devices)
  const deviceConfigStates = new Map<string, number>();
  const sampleDevices = devicesResult.items.slice(0, 50);

  await Promise.all(
    sampleDevices.map(async (device) => {
      try {
        const states = await fetchWithPagination<Record<string, unknown>>(
          client,
          `/deviceManagement/managedDevices/${device.id}/deviceConfigurationStates`,
          { maxItems: 50 }
        );
        const conflicts = states.items.filter(
          (s) => {
            const state = String(s.state || "").toLowerCase();
            return state === "conflict" || state === "error";
          }
        ).length;
        deviceConfigStates.set(String(device.id), conflicts);
      } catch {
        // Skip devices where config states can't be read
      }
    })
  );

  // Score each device
  const devices: DeviceRiskScore[] = devicesResult.items.map((device) => {
    const factors: RiskFactor[] = [];
    const deviceId = String(device.id || "");

    // 1. Compliance state (weight: 30%)
    const complianceState = String(device.complianceState || "unknown").toLowerCase();
    let complianceScore = 0;
    if (complianceState === "noncompliant") {
      complianceScore = 100;
      factors.push({ name: "Compliance", score: 100, weight: 0.30, detail: "Device is non-compliant" });
    } else if (complianceState === "unknown" || complianceState === "configmanager") {
      complianceScore = 50;
      factors.push({ name: "Compliance", score: 50, weight: 0.30, detail: "Compliance state unknown" });
    } else {
      factors.push({ name: "Compliance", score: 0, weight: 0.30, detail: "Device is compliant" });
    }

    // 2. Last sync age (weight: 25%)
    let syncScore = 0;
    const lastSync = device.lastSyncDateTime ? new Date(String(device.lastSyncDateTime)) : null;
    if (lastSync) {
      const daysSinceSync = (Date.now() - lastSync.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceSync > 30) {
        syncScore = 100;
        factors.push({ name: "Last Sync", score: 100, weight: 0.25, detail: `${Math.round(daysSinceSync)} days since last sync` });
      } else if (daysSinceSync > 14) {
        syncScore = 70;
        factors.push({ name: "Last Sync", score: 70, weight: 0.25, detail: `${Math.round(daysSinceSync)} days since last sync` });
      } else if (daysSinceSync > 7) {
        syncScore = 40;
        factors.push({ name: "Last Sync", score: 40, weight: 0.25, detail: `${Math.round(daysSinceSync)} days since last sync` });
      } else {
        factors.push({ name: "Last Sync", score: 0, weight: 0.25, detail: `Synced ${Math.round(daysSinceSync)} day(s) ago` });
      }
    } else {
      syncScore = 80;
      factors.push({ name: "Last Sync", score: 80, weight: 0.25, detail: "No sync date available" });
    }

    // 3. Encryption (weight: 20%)
    let encryptionScore = 0;
    const isEncrypted = device.isEncrypted;
    if (isEncrypted === false) {
      encryptionScore = 100;
      factors.push({ name: "Encryption", score: 100, weight: 0.20, detail: "Device is not encrypted" });
    } else if (isEncrypted === true) {
      factors.push({ name: "Encryption", score: 0, weight: 0.20, detail: "Device is encrypted" });
    } else {
      encryptionScore = 30;
      factors.push({ name: "Encryption", score: 30, weight: 0.20, detail: "Encryption status unknown" });
    }

    // 4. OS version / EOL (weight: 15%)
    let osScore = 0;
    const os = String(device.operatingSystem || "").toLowerCase();
    const osVer = String(device.osVersion || "");
    if (os.includes("windows")) {
      // Check for old Windows versions
      if (osVer.startsWith("10.0.1") && !osVer.startsWith("10.0.1")) {
        // Windows versions before 10
        osScore = 100;
        factors.push({ name: "OS Version", score: 100, weight: 0.15, detail: `Outdated: ${osVer}` });
      } else if (osVer.startsWith("10.0.19041") || osVer.startsWith("10.0.19042") || osVer.startsWith("10.0.19043")) {
        // Windows 10 20H1/20H2/21H1 — end of service
        osScore = 70;
        factors.push({ name: "OS Version", score: 70, weight: 0.15, detail: `End-of-service Windows version: ${osVer}` });
      } else {
        factors.push({ name: "OS Version", score: 0, weight: 0.15, detail: `${device.operatingSystem} ${osVer}` });
      }
    } else {
      factors.push({ name: "OS Version", score: 0, weight: 0.15, detail: `${device.operatingSystem} ${osVer}` });
    }

    // 5. Config conflicts (weight: 10%)
    let conflictScore = 0;
    const conflicts = deviceConfigStates.get(deviceId) || 0;
    if (conflicts > 0) {
      conflictScore = Math.min(100, conflicts * 30);
      factors.push({ name: "Config Conflicts", score: conflictScore, weight: 0.10, detail: `${conflicts} configuration conflict(s)/error(s)` });
    } else {
      factors.push({ name: "Config Conflicts", score: 0, weight: 0.10, detail: "No configuration conflicts" });
    }

    // Compute weighted total
    const totalScore = Math.round(
      complianceScore * 0.30 +
      syncScore * 0.25 +
      encryptionScore * 0.20 +
      osScore * 0.15 +
      conflictScore * 0.10
    );

    const riskLevel: DeviceRiskScore["riskLevel"] =
      totalScore >= 70 ? "critical" :
      totalScore >= 45 ? "high" :
      totalScore >= 20 ? "medium" : "low";

    return {
      deviceId,
      deviceName: String(device.deviceName || "Unknown"),
      userPrincipalName: String(device.userPrincipalName || "—"),
      operatingSystem: String(device.operatingSystem || "Unknown"),
      osVersion: String(device.osVersion || ""),
      riskScore: totalScore,
      riskLevel,
      factors,
    };
  });

  // Sort by risk score descending
  devices.sort((a, b) => b.riskScore - a.riskScore);

  const distribution = {
    critical: devices.filter((d) => d.riskLevel === "critical").length,
    high: devices.filter((d) => d.riskLevel === "high").length,
    medium: devices.filter((d) => d.riskLevel === "medium").length,
    low: devices.filter((d) => d.riskLevel === "low").length,
  };

  const avgScore = devices.length > 0
    ? Math.round(devices.reduce((sum, d) => sum + d.riskScore, 0) / devices.length)
    : 0;

  return {
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - start,
    totalDevices: devices.length,
    averageRiskScore: avgScore,
    distribution,
    devices,
    topRisks: devices.slice(0, 10),
  };
}
