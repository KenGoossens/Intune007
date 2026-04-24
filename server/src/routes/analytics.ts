import { Router, type Request, type Response } from "express";
import { analyticsTracker } from "../analytics/tracker.js";

const router = Router();

/**
 * GET /api/analytics
 * Returns aggregated analytics summary plus individual entries.
 */
router.get("/", (_req: Request, res: Response) => {
  res.json(analyticsTracker.getSummary());
});

/**
 * DELETE /api/analytics
 * Clears all analytics data.
 */
router.delete("/", (_req: Request, res: Response) => {
  analyticsTracker.clear();
  res.json({ status: "cleared" });
});

export default router;
