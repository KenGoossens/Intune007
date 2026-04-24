/**
 * Routes for AI insights and environment reports.
 */

import { Router, type Request, type Response } from "express";
import { generateInsightsReport } from "../insights/engine.js";
import { getDailyTrend, getAvailableMetrics } from "../analytics/history.js";

const router = Router();

// Cache the report for 2 minutes to avoid hammering Graph API
let cachedReport: { data: unknown; timestamp: number } | null = null;
const CACHE_TTL_MS = 120_000;

/** GET /api/insights — Generate full environment report with AI insights. */
router.get("/", async (_req: Request, res: Response) => {
  try {
    if (cachedReport && Date.now() - cachedReport.timestamp < CACHE_TTL_MS) {
      res.json(cachedReport.data);
      return;
    }

    const report = await generateInsightsReport();
    cachedReport = { data: report, timestamp: Date.now() };
    res.json(report);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Insights] Error generating report:", msg);
    res.status(500).json({ error: msg });
  }
});

/** POST /api/insights/refresh — Force regenerate (bypass cache). */
router.post("/refresh", async (_req: Request, res: Response) => {
  try {
    const report = await generateInsightsReport();
    cachedReport = { data: report, timestamp: Date.now() };
    res.json(report);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

/** GET /api/insights/trends — Get all available trends with recent data. */
router.get("/trends", (_req: Request, res: Response) => {
  const metrics = getAvailableMetrics();
  const days = 30;
  const trends: Record<string, unknown> = {};

  for (const metric of metrics) {
    trends[metric] = getDailyTrend(metric, days);
  }

  res.json({ days, metrics, trends });
});

export default router;
