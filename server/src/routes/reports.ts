/**
 * Routes for historical trend reports.
 */

import { Router, type Request, type Response } from "express";
import { getDailyTrend, getAvailableMetrics, getSnapshots } from "../analytics/history.js";

const router = Router();

/** GET /api/reports/trend/:metricName — Get daily trend for a metric. */
router.get("/trend/:metricName", (req: Request, res: Response) => {
  const metricName = String(req.params.metricName);
  const days = Math.min(parseInt(String(req.query.days || "30")), 90);
  const trend = getDailyTrend(metricName, days);
  res.json({ metricName, days, data: trend });
});

/** GET /api/reports/metrics — List available metric names. */
router.get("/metrics", (_req: Request, res: Response) => {
  res.json({ metrics: getAvailableMetrics() });
});

/** GET /api/reports/snapshots — Get recent snapshots. */
router.get("/snapshots", (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 50;
  res.json({ snapshots: getSnapshots(limit) });
});

export default router;
