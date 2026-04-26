/**
 * CVE Monitor Routes — View, scan, and manage CVE vulnerabilities.
 */

import { Router, type Request, type Response } from "express";
import { runCVEScan, getCVEs, getCVEStats, updateCVEStatus } from "../cve/monitor.js";
import { sanitizeErrorMessage } from "../security.js";

const router = Router();

/** GET /api/cve/stats — Get CVE monitoring statistics */
router.get("/stats", (_req: Request, res: Response) => {
  try {
    res.json(getCVEStats());
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeErrorMessage(err instanceof Error ? err.message : String(err)) });
  }
});

/** GET /api/cve — Get tracked CVEs */
router.get("/", (req: Request, res: Response) => {
  try {
    const status = req.query.status as string | undefined;
    const severity = req.query.severity as string | undefined;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
    const cves = getCVEs({ status, severity, limit });
    res.json({ cves, count: cves.length });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeErrorMessage(err instanceof Error ? err.message : String(err)) });
  }
});

/** POST /api/cve/scan — Trigger a manual CVE scan */
router.post("/scan", async (req: Request, res: Response) => {
  const daysBack = req.body.daysBack || 7;
  try {
    const result = await runCVEScan(daysBack);
    res.json(result);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeErrorMessage(err instanceof Error ? err.message : String(err)) });
  }
});

/** PATCH /api/cve/:cveId/status — Update CVE status */
router.patch("/:cveId/status", (req: Request, res: Response) => {
  const cveId = String(req.params.cveId);
  const { status } = req.body;
  if (!["new", "reviewed", "remediated", "dismissed"].includes(status)) {
    res.status(400).json({ error: "Invalid status. Use: new, reviewed, remediated, dismissed" });
    return;
  }
  try {
    updateCVEStatus(cveId, status);
    res.json({ success: true, cveId, status });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeErrorMessage(err instanceof Error ? err.message : String(err)) });
  }
});

export default router;
