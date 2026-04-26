import { Router, type Request, type Response } from "express";
import { getGraphClient, fetchWithPagination } from "../graph/client.js";
import { remediateAutopilotDevice } from "../autopilot/remediator.js";
import { onboardAutopilotDevice, getHardwareHashCollectionScript } from "../autopilot/onboarding.js";
import { deployHashCollector, pollCollectedHashes, processCollectedHashes } from "../autopilot/hashCollector.js";
import { sanitizeOData, isValidSerialNumber, isValidUUID, sanitizeErrorMessage } from "../security.js";

const router = Router();
const BETA = "https://graph.microsoft.com/beta";

router.post("/check", async (req: Request, res: Response) => {
  const { serialNumber, deviceName } = req.body;
  if (!serialNumber && !deviceName) { res.status(400).json({ error: "serialNumber or deviceName required" }); return; }
  if (serialNumber && !isValidSerialNumber(serialNumber)) { res.status(400).json({ error: "Invalid serial number format" }); return; }
  try {
    const client = getGraphClient();
    const checks: Array<{ step: string; status: "pass" | "fail" | "warning" | "info"; detail: string }> = [];

    // 1. Check Autopilot registration
    const filter = serialNumber ? `contains(serialNumber,'${sanitizeOData(serialNumber)}')` : undefined;
    const apDevices = await fetchWithPagination<Record<string, unknown>>(client,
      `${BETA}/deviceManagement/windowsAutopilotDeviceIdentities`,
      { filter, maxItems: 5 }
    );
    const apDevice = serialNumber
      ? apDevices.items.find((d) => String(d.serialNumber) === serialNumber)
      : apDevices.items[0];

    if (apDevice) {
      checks.push({ step: "Autopilot Registration", status: "pass", detail: `Registered — Serial: ${apDevice.serialNumber}, Model: ${apDevice.model}` });
    } else {
      checks.push({ step: "Autopilot Registration", status: "fail", detail: "Device not found in Autopilot. Import the hardware hash first." });
      res.json({ serialNumber, deviceName, readinessScore: 0, checks });
      return;
    }

    // 2. Check profile assignment
    const profileState = String(apDevice.deploymentProfileAssignmentStatus || "").toLowerCase();
    if (profileState.includes("assigned")) {
      checks.push({ step: "Deployment Profile", status: "pass", detail: `Profile assigned — ${apDevice.deploymentProfileAssignedDateTime || ""}` });
    } else {
      checks.push({ step: "Deployment Profile", status: "fail", detail: `Profile not assigned. Status: ${profileState || "none"}` });
    }

    // 3. Check group tag
    if (apDevice.groupTag) {
      checks.push({ step: "Group Tag", status: "pass", detail: `Group tag: ${apDevice.groupTag}` });
    } else {
      checks.push({ step: "Group Tag", status: "warning", detail: "No group tag assigned — device may not receive group-targeted policies" });
    }

    // 4. Check enrollment state
    const enrollState = String(apDevice.enrollmentState || "").toLowerCase();
    if (enrollState === "enrolled") {
      checks.push({ step: "Enrollment State", status: "pass", detail: "Device is enrolled" });
    } else if (enrollState === "notcontacted") {
      checks.push({ step: "Enrollment State", status: "info", detail: "Device has not contacted Intune yet — waiting for first boot" });
    } else {
      checks.push({ step: "Enrollment State", status: "info", detail: `Enrollment state: ${enrollState || "unknown"}` });
    }

    // 5. Check Autopilot profiles exist
    const profiles = await fetchWithPagination<Record<string, unknown>>(client,
      `${BETA}/deviceManagement/windowsAutopilotDeploymentProfiles`,
      { select: "id,displayName", maxItems: 10 }
    );
    checks.push({ step: "Available Profiles", status: profiles.items.length > 0 ? "pass" : "warning",
      detail: `${profiles.items.length} deployment profile(s) configured` });

    const passCount = checks.filter((c) => c.status === "pass").length;
    const readinessScore = Math.round((passCount / checks.length) * 100);

    res.json({ serialNumber, deviceName, readinessScore, checks });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;

/** POST /api/autopilot-readiness/onboard — Full Autopilot onboarding pipeline */
router.post("/onboard", async (req: Request, res: Response) => {
  const { serialNumber, hardwareHash, groupTag, assignedUserUpn, targetGroupId, orderNumber } = req.body;
  if (!serialNumber || !hardwareHash) {
    res.status(400).json({ error: "serialNumber and hardwareHash are required" });
    return;
  }
  try {
    const result = await onboardAutopilotDevice(serialNumber, hardwareHash, {
      groupTag, assignedUserUpn, targetGroupId, orderNumber,
    });
    res.json(result);
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/** GET /api/autopilot-readiness/collection-script — Get the PowerShell script to collect hardware hash */
router.get("/collection-script", (_req: Request, res: Response) => {
  res.json({ script: getHardwareHashCollectionScript() });
});

/** POST /api/autopilot-readiness/remediate — Auto-remediate Autopilot readiness issues */
router.post("/remediate", async (req: Request, res: Response) => {
  const { serialNumber, groupTag, targetGroupId } = req.body;
  if (!serialNumber) {
    res.status(400).json({ error: "serialNumber is required" });
    return;
  }
  try {
    const result = await remediateAutopilotDevice(serialNumber, { groupTag, targetGroupId });
    res.json(result);
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ════════════════════════════════════════════════════════════════
//  HARDWARE HASH COLLECTION — Enrolled Devices (Proactive Remediation)
// ════════════════════════════════════════════════════════════════

/** POST /api/autopilot-readiness/deploy-collector — Deploy hash collector to a group of enrolled devices */
router.post("/deploy-collector", async (req: Request, res: Response) => {
  const { targetGroupId, displayName, scheduleIntervalMinutes } = req.body;
  if (!targetGroupId) {
    res.status(400).json({ error: "targetGroupId is required (Azure AD group of enrolled devices)" });
    return;
  }
  try {
    const result = await deployHashCollector(targetGroupId, { displayName, scheduleIntervalMinutes });
    res.json(result);
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/** POST /api/autopilot-readiness/poll-hashes — Poll collected hashes from the Proactive Remediation */
router.post("/poll-hashes", async (req: Request, res: Response) => {
  const { scriptId } = req.body;
  if (!scriptId) {
    res.status(400).json({ error: "scriptId is required (from deploy-collector response)" });
    return;
  }
  try {
    const collected = await pollCollectedHashes(scriptId);
    res.json({ collected, count: collected.length });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/** POST /api/autopilot-readiness/process-hashes — Poll + auto-import collected hashes into Autopilot */
router.post("/process-hashes", async (req: Request, res: Response) => {
  const { scriptId, groupTag, targetGroupId, autoImport } = req.body;
  if (!scriptId) {
    res.status(400).json({ error: "scriptId is required" });
    return;
  }
  try {
    const result = await processCollectedHashes(scriptId, { groupTag, targetGroupId, autoImport });
    res.json(result);
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ════════════════════════════════════════════════════════════════
//  HARDWARE HASH COLLECTION — CSV / Manual Ingest
// ════════════════════════════════════════════════════════════════

/** POST /api/autopilot-readiness/ingest-csv — Import hardware hashes from CSV data */
router.post("/ingest-csv", async (req: Request, res: Response) => {
  const { csvData, groupTag, targetGroupId } = req.body;
  if (!csvData) {
    res.status(400).json({ error: "csvData is required (CSV text with headers: Device Serial Number, Hardware Hash)" });
    return;
  }

  try {
    // Parse CSV — expected format from Get-WindowsAutopilotInfo:
    // "Device Serial Number","Windows Product ID","Hardware Hash"
    const lines = String(csvData).split("\n").map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length < 2) {
      res.status(400).json({ error: "CSV must have at least a header row and one data row" });
      return;
    }

    // Parse header to find column indices
    const header = lines[0].replace(/"/g, "").split(",").map(h => h.trim().toLowerCase());
    const serialIdx = header.findIndex(h => h.includes("serial"));
    const hashIdx = header.findIndex(h => h.includes("hash") || h.includes("hardware"));
    // skip "Windows Product ID" — usually empty

    if (serialIdx === -1 || hashIdx === -1) {
      res.status(400).json({ error: "CSV must have columns containing 'serial' and 'hash'" });
      return;
    }

    const results: Array<{ serialNumber: string; success: boolean; detail: string }> = [];

    for (let i = 1; i < lines.length; i++) {
      // Handle quoted CSV fields
      const fields = lines[i].match(/(".*?"|[^",]+)/g)?.map(f => f.replace(/^"|"$/g, "").trim()) || [];
      const serial = fields[serialIdx];
      const hash = fields[hashIdx];

      if (!serial || !hash || hash.length < 100) {
        results.push({ serialNumber: serial || `Row ${i}`, success: false, detail: "Missing or invalid serial/hash" });
        continue;
      }

      try {
        const onboardResult = await onboardAutopilotDevice(serial, hash, { groupTag, targetGroupId });
        results.push({ serialNumber: serial, success: onboardResult.success, detail: onboardResult.summary });
      } catch (err: unknown) {
        results.push({ serialNumber: serial, success: false, detail: err instanceof Error ? err.message : String(err) });
      }
    }

    const successCount = results.filter(r => r.success).length;
    res.json({
      totalDevices: results.length,
      successCount,
      failedCount: results.length - successCount,
      results,
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
