import { Router, type Request, type Response } from "express";
import { generateReport } from "../reportGenerator/engine.js";

const router = Router();

/** POST /api/report-generator/generate — Generate a report from natural language. */
router.post("/generate", async (req: Request, res: Response) => {
  const { prompt } = req.body;
  if (!prompt || typeof prompt !== "string") {
    res.status(400).json({ error: "prompt is required" });
    return;
  }
  try {
    const report = await generateReport(prompt);
    res.json(report);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ReportGenerator] Error:", msg);
    res.status(500).json({ error: msg });
  }
});

export default router;
