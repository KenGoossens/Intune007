/**
 * Routes for the Device Troubleshooter.
 * Uses Server-Sent Events (SSE) to stream diagnostic steps in real-time.
 */

import { Router, type Request, type Response } from "express";
import { runDiagnostics, type DiagnosticStep } from "../troubleshooter/engine.js";

const router = Router();

/**
 * POST /api/troubleshooter/diagnose
 * Run a diagnostic chain on a device. Returns results via SSE stream.
 * Body: { deviceName: string, problem: string }
 */
router.post("/diagnose", async (req: Request, res: Response) => {
  const { deviceName, problem } = req.body;

  if (!deviceName || typeof deviceName !== "string") {
    res.status(400).json({ error: "Missing 'deviceName' field" });
    return;
  }

  // Set up SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const sendEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const result = await runDiagnostics(
      deviceName.trim(),
      problem?.trim() || "General health check",
      (step: DiagnosticStep) => {
        sendEvent("step", step);
      }
    );

    // Send the final complete result
    sendEvent("done", result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    sendEvent("error", { message: msg });
  } finally {
    res.end();
  }
});

/**
 * POST /api/troubleshooter/quick
 * Non-streaming version — returns full result as JSON.
 * Body: { deviceName: string, problem: string }
 */
router.post("/quick", async (req: Request, res: Response) => {
  const { deviceName, problem } = req.body;

  if (!deviceName || typeof deviceName !== "string") {
    res.status(400).json({ error: "Missing 'deviceName' field" });
    return;
  }

  try {
    const result = await runDiagnostics(
      deviceName.trim(),
      problem?.trim() || "General health check",
      () => {} // No-op callback for non-streaming mode
    );
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

export default router;
