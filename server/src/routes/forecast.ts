import { Router, type Request, type Response } from "express";
import { runForecast } from "../forecast/engine.js";

const router = Router();

router.post("/", async (req: Request, res: Response) => {
  const { requirement } = req.body;
  if (!requirement) { res.status(400).json({ error: "requirement is required" }); return; }
  try {
    const result = await runForecast(requirement);
    res.json(result);
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
