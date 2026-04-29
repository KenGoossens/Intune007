import { Router, type Request, type Response } from "express";
import { getGraphClient, fetchWithPagination } from "../graph/client.js";
import { sanitizeOData } from "../security.js";

const router = Router();

/** Standalone function for building device timeline (called by executor + route) */
export async function buildDeviceTimeline(opts: { deviceName?: string; deviceId?: string }) {
  const client = getGraphClient();
  let device: Record<string, unknown>;

  if (opts.deviceId) {
    device = await client.api(`/deviceManagement/managedDevices/${opts.deviceId}`)
      .select("id,deviceName,operatingSystem,osVersion,complianceState,enrolledDateTime,lastSyncDateTime,userPrincipalName,model,manufacturer,isEncrypted,managedDeviceOwnerType")
      .get();
  } else {
    const result = await fetchWithPagination<Record<string, unknown>>(client,
      "/deviceManagement/managedDevices",
      { filter: `deviceName eq '${sanitizeOData(String(opts.deviceName))}'`, maxItems: 1 }
    );
    if (result.items.length === 0) throw new Error("Device not found");
    device = result.items[0];
  }

  const timeline: Array<{ date: string; event: string; category: string; details?: unknown }> = [];

  if (device.enrolledDateTime) {
    timeline.push({ date: String(device.enrolledDateTime), event: "Device enrolled in Intune", category: "enrollment" });
  }

  try {
    const configs = await fetchWithPagination<Record<string, unknown>>(client,
      `/deviceManagement/managedDevices/${device.id}/deviceConfigurationStates`, { maxItems: 50 });
    const seen = new Map<string, Record<string, unknown>>();
    for (const c of configs.items) {
      const key = `${c.displayName}|${c.state}`;
      const existing = seen.get(key);
      if (!existing || String(c.lastModifiedDateTime || "") > String(existing.lastModifiedDateTime || "")) seen.set(key, c);
    }
    for (const c of seen.values()) {
      timeline.push({ date: String(c.lastModifiedDateTime || device.enrolledDateTime || ""), event: `Config profile: ${c.displayName} — ${c.state}`, category: "configuration" });
    }
  } catch { /* skip */ }

  try {
    const comp = await fetchWithPagination<Record<string, unknown>>(client,
      `/deviceManagement/managedDevices/${device.id}/deviceCompliancePolicyStates`, { maxItems: 50 });
    const seen = new Map<string, Record<string, unknown>>();
    for (const c of comp.items) {
      const key = `${c.displayName}|${c.state}`;
      const existing = seen.get(key);
      if (!existing || String(c.lastModifiedDateTime || "") > String(existing.lastModifiedDateTime || "")) seen.set(key, c);
    }
    for (const c of seen.values()) {
      timeline.push({ date: String(c.lastModifiedDateTime || ""), event: `Compliance: ${c.displayName} — ${c.state}`, category: "compliance" });
    }
  } catch { /* skip */ }

  try {
    const audits = await fetchWithPagination<Record<string, unknown>>(client,
      "/deviceManagement/auditEvents", { maxItems: 50 });
    const deviceAudits = audits.items.filter((a) => {
      const json = JSON.stringify(a).toLowerCase();
      return json.includes(String(device.deviceName || "").toLowerCase()) || json.includes(String(device.id || "").toLowerCase());
    });
    for (const a of deviceAudits.slice(0, 10)) {
      timeline.push({ date: String(a.activityDateTime || ""), event: `${a.displayName || a.activity || "Admin action"}`, category: "audit", details: a });
    }
  } catch { /* skip */ }

  if (device.lastSyncDateTime) {
    timeline.push({ date: String(device.lastSyncDateTime), event: "Last sync with Intune", category: "sync" });
  }
  timeline.push({ date: new Date().toISOString(), event: `Current state: ${device.complianceState}, Encrypted: ${device.isEncrypted}`, category: "status" });
  timeline.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return {
    device: { id: device.id, deviceName: device.deviceName, os: `${device.operatingSystem} ${device.osVersion}`, user: device.userPrincipalName, model: `${device.manufacturer} ${device.model}` },
    timeline,
    totalEvents: timeline.length,
  };
}

router.post("/", async (req: Request, res: Response) => {
  const { deviceName, deviceId } = req.body;
  if (!deviceName && !deviceId) { res.status(400).json({ error: "deviceName or deviceId required" }); return; }
  try {
    const result = await buildDeviceTimeline({ deviceName, deviceId });
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "Device not found") { res.status(404).json({ error: msg }); return; }
    res.status(500).json({ error: msg });
  }
});

export default router;
