/**
 * Compliance Forecast — "What-If" analysis for policy changes.
 * Predicts how many devices would fail if a new policy requirement is applied.
 */

import { getGraphClient, fetchWithPagination } from "../graph/client.js";

export interface ForecastResult {
  requirement: string;
  totalDevices: number;
  wouldPass: number;
  wouldFail: number;
  wouldFailPercent: number;
  devices: Array<{ deviceName: string; userPrincipalName: string; currentValue: unknown; result: "pass" | "fail" | "unknown" }>;
}

const REQUIREMENT_CHECKS: Record<string, (device: Record<string, unknown>) => "pass" | "fail" | "unknown"> = {
  bitlocker: (d) => d.isEncrypted === true ? "pass" : d.isEncrypted === false ? "fail" : "unknown",
  encryption: (d) => d.isEncrypted === true ? "pass" : d.isEncrypted === false ? "fail" : "unknown",
  encrypted: (d) => d.isEncrypted === true ? "pass" : d.isEncrypted === false ? "fail" : "unknown",
  filevault: (d) => d.isEncrypted === true ? "pass" : d.isEncrypted === false ? "fail" : "unknown",
  compliant: (d) => String(d.complianceState) === "compliant" ? "pass" : "fail",
  compliance: (d) => String(d.complianceState) === "compliant" ? "pass" : "fail",
  synced_7days: (d) => {
    if (!d.lastSyncDateTime) return "unknown";
    const days = (Date.now() - new Date(String(d.lastSyncDateTime)).getTime()) / 86400000;
    return days <= 7 ? "pass" : "fail";
  },
  synced_14days: (d) => {
    if (!d.lastSyncDateTime) return "unknown";
    const days = (Date.now() - new Date(String(d.lastSyncDateTime)).getTime()) / 86400000;
    return days <= 14 ? "pass" : "fail";
  },
  synced: (d) => {
    if (!d.lastSyncDateTime) return "unknown";
    const days = (Date.now() - new Date(String(d.lastSyncDateTime)).getTime()) / 86400000;
    return days <= 7 ? "pass" : "fail";
  },
  corporate: (d) => String(d.managedDeviceOwnerType) === "company" ? "pass" : "fail",
  company: (d) => String(d.managedDeviceOwnerType) === "company" ? "pass" : "fail",
  windows: (d) => String(d.operatingSystem || "").toLowerCase().includes("windows") ? "pass" : "fail",
  macos: (d) => String(d.operatingSystem || "").toLowerCase().includes("macos") ? "pass" : "fail",
  ios: (d) => String(d.operatingSystem || "").toLowerCase().includes("ios") ? "pass" : "fail",
  android: (d) => String(d.operatingSystem || "").toLowerCase().includes("android") ? "pass" : "fail",
};

export async function runForecast(requirement: string): Promise<ForecastResult> {
  const client = getGraphClient();
  const devices = await fetchWithPagination<Record<string, unknown>>(client,
    "/deviceManagement/managedDevices",
    { select: "id,deviceName,operatingSystem,osVersion,complianceState,isEncrypted,managedDeviceOwnerType,lastSyncDateTime,userPrincipalName", maxItems: 500 }
  );

  const key = requirement.toLowerCase().replace(/[^a-z0-9_]/g, "_");
  const checkFn: ((device: Record<string, unknown>) => "pass" | "fail" | "unknown") | undefined =
    REQUIREMENT_CHECKS[key]
    || Object.entries(REQUIREMENT_CHECKS).find(([k]) => requirement.toLowerCase().includes(k))?.[1]
    || undefined;

  const results = devices.items.map((d) => ({
    deviceName: String(d.deviceName || ""),
    userPrincipalName: String(d.userPrincipalName || ""),
    currentValue: checkFn !== undefined ? (key.includes("encrypt") || key.includes("bitlocker") ? d.isEncrypted
      : key.includes("sync") ? d.lastSyncDateTime : key.includes("compli") ? d.complianceState
      : d.managedDeviceOwnerType) : d.complianceState,
    result: checkFn !== undefined ? checkFn(d) : "unknown" as const,
  }));

  const wouldFail = results.filter((r) => r.result === "fail").length;
  return {
    requirement,
    totalDevices: devices.items.length,
    wouldPass: results.filter((r) => r.result === "pass").length,
    wouldFail,
    wouldFailPercent: devices.items.length > 0 ? Math.round((wouldFail / devices.items.length) * 100) : 0,
    devices: results.sort((a, b) => (a.result === "fail" ? 0 : 1) - (b.result === "fail" ? 0 : 1)),
  };
}
