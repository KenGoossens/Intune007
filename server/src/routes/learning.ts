/**
 * Learning API Routes — Feedback, stats, and learning management.
 */

import { Router, type Request, type Response } from "express";
import {
  recordFeedback,
  getLastInteractionId,
  getLearningStats,
  getRecentInteractions,
  searchInteractions,
  recordCorrection,
} from "../agent/learningEngine.js";
import { sanitizeErrorMessage } from "../security.js";

const router = Router();

/** POST /api/learning/feedback — Record thumbs up/down on last response */
router.post("/feedback", (req: Request, res: Response) => {
  const { interactionId, score } = req.body;

  if (score !== 1 && score !== -1 && score !== 0) {
    res.status(400).json({ error: "score must be 1 (thumbs up), -1 (thumbs down), or 0 (neutral)" });
    return;
  }

  try {
    // If no interactionId provided, use the most recent one
    const targetId = interactionId || getLastInteractionId();
    if (!targetId) {
      res.status(404).json({ error: "No recent interaction to rate" });
      return;
    }

    recordFeedback(targetId, score);
    res.json({
      success: true,
      interactionId: targetId,
      score,
      message: score === 1
        ? "Thanks! This interaction has been saved as a learning example."
        : score === -1
        ? "Got it. The agent will learn from this feedback."
        : "Feedback cleared.",
    });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeErrorMessage(err instanceof Error ? err.message : String(err)) });
  }
});

/** POST /api/learning/correction — Record a user correction */
router.post("/correction", (req: Request, res: Response) => {
  const { originalQuery, correctedQuery, lesson } = req.body;

  if (!originalQuery || !correctedQuery || !lesson) {
    res.status(400).json({ error: "originalQuery, correctedQuery, and lesson are required" });
    return;
  }

  try {
    recordCorrection({
      originalQuery,
      correctedQuery,
      lesson,
    });
    res.json({ success: true, message: "Correction recorded. The agent will avoid this mistake in the future." });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeErrorMessage(err instanceof Error ? err.message : String(err)) });
  }
});

/** GET /api/learning/stats — Get learning statistics */
router.get("/stats", (_req: Request, res: Response) => {
  try {
    const stats = getLearningStats();
    res.json(stats);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeErrorMessage(err instanceof Error ? err.message : String(err)) });
  }
});

/** GET /api/learning/interactions — Get recent interactions */
router.get("/interactions", (req: Request, res: Response) => {
  const limit = Math.min(parseInt(String(req.query.limit || "20"), 10), 100);
  const query = req.query.q as string | undefined;

  try {
    const interactions = query
      ? searchInteractions(query, limit)
      : getRecentInteractions(limit);
    res.json({ interactions, count: interactions.length });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeErrorMessage(err instanceof Error ? err.message : String(err)) });
  }
});

export default router;
