import { Router, type Request, type Response } from "express";
import { alertScheduler } from "../alerts/scheduler.js";
import type { AlertCheckType, AlertsResponse } from "@intune-agent/shared";

const router = Router();

/**
 * GET /api/alerts
 * Returns all current alerts, configs, and last run times.
 */
router.get("/", (_req: Request, res: Response) => {
  const response: AlertsResponse = {
    alerts: alertScheduler.getAlerts(),
    configs: alertScheduler.getConfigs(),
    lastRunTimes: alertScheduler.getLastRunTimes(),
  };
  res.json(response);
});

/**
 * POST /api/alerts/refresh
 * Manually trigger all alert checks immediately.
 */
router.post("/refresh", async (_req: Request, res: Response) => {
  await alertScheduler.runAllChecks();
  res.json({
    alerts: alertScheduler.getAlerts(),
    configs: alertScheduler.getConfigs(),
    lastRunTimes: alertScheduler.getLastRunTimes(),
  });
});

/**
 * POST /api/alerts/refresh/:type
 * Manually trigger a specific alert check.
 */
router.post("/refresh/:type", async (req: Request, res: Response) => {
  const type = req.params.type as AlertCheckType;
  await alertScheduler.runCheck(type);
  res.json({
    alerts: alertScheduler.getAlerts(),
    lastRunTimes: alertScheduler.getLastRunTimes(),
  });
});

/**
 * PATCH /api/alerts/config/:type
 * Update a check's enabled state or interval.
 * Body: { enabled?: boolean, intervalMinutes?: number }
 */
router.patch("/config/:type", (req: Request, res: Response) => {
  const type = req.params.type as AlertCheckType;
  const { enabled, intervalMinutes } = req.body;
  alertScheduler.updateConfig(type, { enabled, intervalMinutes });
  res.json({ configs: alertScheduler.getConfigs() });
});

/**
 * POST /api/alerts/:id/acknowledge
 * Mark an alert as acknowledged.
 */
router.post("/:id/acknowledge", (req: Request, res: Response) => {
  const success = alertScheduler.acknowledgeAlert(req.params.id as string);
  res.json({ success });
});

/**
 * DELETE /api/alerts/:id
 * Dismiss (remove) an alert.
 */
router.delete("/:id", (req: Request, res: Response) => {
  const success = alertScheduler.dismissAlert(req.params.id as string);
  res.json({ success });
});

export default router;
