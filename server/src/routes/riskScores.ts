/**
 * Routes for device risk scoring.
 */

import { Router, type Request, type Response } from "express";
import { computeFleetRiskScores } from "../riskScoring/scorer.js";

const router = Router();

// Cache for 3 minutes
let cachedScores: { data: unknown; timestamp: number } | null = null;
const CACHE_TTL_MS = 180_000;

/** GET /api/risk-scores — Compute fleet risk scores. */
router.get("/", async (_req: Request, res: Response) => {
  try {
    if (cachedScores && Date.now() - cachedScores.timestamp < CACHE_TTL_MS) {
      res.json(cachedScores.data);
      return;
    }
    const scores = await computeFleetRiskScores();
    cachedScores = { data: scores, timestamp: Date.now() };
    res.json(scores);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[RiskScoring] Error:", msg);
    res.status(500).json({ error: msg });
  }
});

/** POST /api/risk-scores/refresh — Force recompute. */
router.post("/refresh", async (_req: Request, res: Response) => {
  try {
    const scores = await computeFleetRiskScores();
    cachedScores = { data: scores, timestamp: Date.now() };
    res.json(scores);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

export default router;
