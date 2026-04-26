import { Router, type Request, type Response } from "express";
import { getGraphClient, fetchWithPagination } from "../graph/client.js";

const router = Router();

type IssueType = "noncompliant" | "stale" | "unencrypted" | "outdated_os";

/** GET /api/bulk-remediation/preview — Preview affected devices for a given issue type. */
router.get("/preview", async (req: Request, res: Response) => {
  const issueType = (req.query.issueType as IssueType) || "noncompliant";
  try {
    const client = getGraphClient();
    let filter = "";
    let description = "";

    switch (issueType) {
      case "noncompliant":
        filter = "complianceState eq 'noncompliant'";
        description = "Non-compliant devices";
        break;
      case "stale": {
        const d = new Date(); d.setDate(d.getDate() - 14);
        filter = `lastSyncDateTime lt ${d.toISOString()}`;
        description = "Devices not synced in 14+ days";
        break;
      }
      case "unencrypted":
        filter = "isEncrypted eq false";
        description = "Unencrypted devices";
        break;
      case "outdated_os":
        filter = "operatingSystem eq 'Windows'";
        description = "Windows devices (check OS version manually)";
        break;
    }

    const result = await fetchWithPagination<Record<string, unknown>>(client,
      "/deviceManagement/managedDevices",
      { filter, select: "id,deviceName,operatingSystem,osVersion,complianceState,isEncrypted,lastSyncDateTime,userPrincipalName,managedDeviceOwnerType", maxItems: 200 }
    );

    // For outdated_os, filter client-side
    let devices = result.items;
    if (issueType === "outdated_os") {
      devices = devices.filter((d) => {
        const ver = String(d.osVersion || "");
        return ver.startsWith("10.0.19041") || ver.startsWith("10.0.19042") || ver.startsWith("10.0.19043") || ver.startsWith("10.0.19044");
      });
      description = "Windows devices running end-of-service OS versions";
    }

    res.json({ issueType, description, totalAffected: devices.length, devices });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/** POST /api/bulk-remediation/execute — Execute bulk action on devices. */
router.post("/execute", async (req: Request, res: Response) => {
  const { deviceIds, action } = req.body;
  if (!deviceIds?.length || !action) { res.status(400).json({ error: "deviceIds and action required" }); return; }
  if (deviceIds.length > 50) { res.status(400).json({ error: "Maximum 50 devices per batch" }); return; }

  const validActions = ["syncDevice", "rebootNow", "retire"];
  if (!validActions.includes(action)) { res.status(400).json({ error: `Invalid action. Allowed: ${validActions.join(", ")}` }); return; }

  const client = getGraphClient();
  const results: Array<{ deviceId: string; success: boolean; error?: string }> = [];

  for (const deviceId of deviceIds) {
    try {
      await client.api(`/deviceManagement/managedDevices/${deviceId}/${action}`).post({});
      results.push({ deviceId, success: true });
    } catch (err: unknown) {
      results.push({ deviceId, success: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  res.json({ action, totalDevices: deviceIds.length, succeeded, failed, results });
});

export default router;
