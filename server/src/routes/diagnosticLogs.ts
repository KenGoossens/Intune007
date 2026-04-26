/**
 * Routes for device diagnostic log collection.
 */

import { Router, type Request, type Response } from "express";
import {
  requestDeviceLogs,
  getLogCollectionRequests,
  getLogDownloadUrl,
} from "../graph/diagnosticLogs.js";

const router = Router();

/**
 * POST /api/diagnostic-logs/collect
 * Trigger log collection on a device.
 * Body: { deviceId: string }
 */
router.post("/collect", async (req: Request, res: Response) => {
  const { deviceId } = req.body;
  if (!deviceId) {
    res.status(400).json({ error: "deviceId is required" });
    return;
  }
  try {
    const result = await requestDeviceLogs(deviceId);
    res.json({
      success: true,
      message: "Log collection request sent. The device will upload logs on its next check-in.",
      request: result,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

/**
 * GET /api/diagnostic-logs/:deviceId
 * List log collection requests for a device with their status.
 */
router.get("/:deviceId", async (req: Request, res: Response) => {
  try {
    const result = await getLogCollectionRequests(String(req.params.deviceId));
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

/**
 * POST /api/diagnostic-logs/download
 * Get the download URL for a completed log collection.
 * Body: { deviceId: string, logCollectionId: string }
 */
router.post("/download", async (req: Request, res: Response) => {
  const { deviceId, logCollectionId } = req.body;
  if (!deviceId || !logCollectionId) {
    res.status(400).json({ error: "deviceId and logCollectionId are required" });
    return;
  }
  try {
    const url = await getLogDownloadUrl(deviceId, logCollectionId);
    res.json({ downloadUrl: url });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

export default router;
