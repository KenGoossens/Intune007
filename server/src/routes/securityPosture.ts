import { Router, type Request, type Response } from "express";
import { getDailyTrend, getAvailableMetrics, recordMetrics } from "../analytics/history.js";
import { getGraphClient, fetchWithPagination } from "../graph/client.js";
import { getComplianceStatus } from "../graph/compliance.js";

const router = Router();

/** Standalone function for computing security posture (called by executor + route) */
export async function computeSecurityPosture(days: number = 30) {
  const client = getGraphClient();
  const [, devices] = await Promise.all([
    getComplianceStatus(),
    fetchWithPagination<Record<string, unknown>>(client, "/deviceManagement/managedDevices",
      { select: "id,deviceName,userPrincipalName,complianceState,isEncrypted,lastSyncDateTime,operatingSystem,osVersion", maxItems: 500 }),
  ]);

  const total = devices.items.length || 1;
  const compliantDevicesList = devices.items.filter((d) => String(d.complianceState) === "compliant");
  const nonCompliantDevicesList = devices.items.filter((d) => String(d.complianceState) === "noncompliant");
  const encryptedDevicesList = devices.items.filter((d) => d.isEncrypted === true);
  const unencryptedDevicesList = devices.items.filter((d) => d.isEncrypted === false);
  const staleDevicesList = devices.items.filter((d) => d.lastSyncDateTime && (Date.now() - new Date(String(d.lastSyncDateTime)).getTime()) > 7 * 86400000);

  const complianceRate = Math.round((compliantDevicesList.length / total) * 100);
  const encryptionRate = Math.round((encryptedDevicesList.length / total) * 100);
  const staleRate = Math.round((staleDevicesList.length / total) * 100);

  const mapDevice = (d: Record<string, unknown>) => ({
    deviceName: d.deviceName, userPrincipalName: d.userPrincipalName,
    operatingSystem: d.operatingSystem, osVersion: d.osVersion,
    complianceState: d.complianceState, isEncrypted: d.isEncrypted,
    lastSyncDateTime: d.lastSyncDateTime,
  });

  recordMetrics([
    { name: "compliant_devices", value: compliantDevicesList.length },
    { name: "non_compliant_devices", value: nonCompliantDevicesList.length },
    { name: "total_devices", value: total },
    { name: "encrypted_devices", value: encryptedDevicesList.length },
    { name: "stale_devices", value: staleDevicesList.length },
  ]);

  const metrics = getAvailableMetrics();
  const trends: Record<string, Array<{ date: string; avg: number }>> = {};
  for (const m of metrics) { trends[m] = getDailyTrend(m, days); }

  const computeDelta = (metric: string) => {
    const trend = trends[metric] || [];
    const current = trend.length > 0 ? trend[trend.length - 1].avg : 0;
    const weekAgo = trend.length > 7 ? trend[trend.length - 8].avg : trend.length > 0 ? trend[0].avg : 0;
    const delta = current - weekAgo;
    return { current: Math.round(current), previous: Math.round(weekAgo), delta: Math.round(delta), direction: delta > 0 ? "up" : delta < 0 ? "down" : "stable" };
  };

  return {
    generatedAt: new Date().toISOString(),
    period: `${days} days`,
    current: {
      totalDevices: total, complianceRate, encryptionRate, staleRate,
      compliantDevices: compliantDevicesList.length,
      nonCompliantDevices: nonCompliantDevicesList.length,
      encryptedDevices: encryptedDevicesList.length,
      unencryptedDevices: unencryptedDevicesList.length,
      staleDevices: staleDevicesList.length,
    },
    deviceLists: {
      compliant: compliantDevicesList.map(mapDevice),
      nonCompliant: nonCompliantDevicesList.map(mapDevice),
      encrypted: encryptedDevicesList.map(mapDevice),
      unencrypted: unencryptedDevicesList.map(mapDevice),
      stale: staleDevicesList.map(mapDevice),
    },
    deltas: { compliant_devices: computeDelta("compliant_devices"), non_compliant_devices: computeDelta("non_compliant_devices"), total_devices: computeDelta("total_devices"), encrypted_devices: computeDelta("encrypted_devices"), stale_devices: computeDelta("stale_devices") },
    trends,
    availableMetrics: metrics,
  };
}

router.get("/", async (req: Request, res: Response) => {
  const days = Math.min(parseInt(String(req.query.days || "30")), 90);
  try {
    const result = await computeSecurityPosture(days);
    res.json(result);
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
