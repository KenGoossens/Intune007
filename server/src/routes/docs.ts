/**
 * Documentation RAG Routes — Index and search Intune docs.
 */

import { Router, type Request, type Response } from "express";
import { indexDocs, getIndexStatus, searchDocs } from "../rag/engine.js";
import { sanitizeErrorMessage } from "../security.js";

const router = Router();

/** GET /api/docs/status — Check indexing status */
router.get("/status", (_req: Request, res: Response) => {
  res.json(getIndexStatus());
});

/** POST /api/docs/index — Trigger documentation indexing (SSE progress) */
router.post("/index", async (_req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  try {
    const result = await indexDocs((progress) => {
      res.write(`data: ${JSON.stringify(progress)}\n\n`);
    });
    res.write(`data: ${JSON.stringify({ status: "done", ...result })}\n\n`);
  } catch (err: unknown) {
    res.write(`data: ${JSON.stringify({ status: "error", error: sanitizeErrorMessage(err instanceof Error ? err.message : String(err)) })}\n\n`);
  }
  res.end();
});

/** POST /api/docs/search — Search indexed docs */
router.post("/search", async (req: Request, res: Response) => {
  const { query, topK } = req.body;
  if (!query) { res.status(400).json({ error: "query required" }); return; }
  try {
    const results = await searchDocs(String(query), topK || 5);
    res.json({ results, count: results.length });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeErrorMessage(err instanceof Error ? err.message : String(err)) });
  }
});

export default router;
