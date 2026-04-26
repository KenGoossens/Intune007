import { Router, type Request, type Response } from "express";
import { takeSnapshot, listSnapshots, deleteSnapshot, compareWithSnapshot } from "../baselines/manager.js";

const router = Router();

router.get("/", (_req: Request, res: Response) => { res.json({ snapshots: listSnapshots() }); });

router.post("/", async (req: Request, res: Response) => {
  const { name, description } = req.body;
  if (!name) { res.status(400).json({ error: "name is required" }); return; }
  try { res.json(await takeSnapshot(name, description)); }
  catch (err: unknown) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

router.delete("/:id", (req: Request, res: Response) => {
  deleteSnapshot(Number(req.params.id)) ? res.json({ success: true }) : res.status(404).json({ error: "Not found" });
});

router.get("/:id/drift", async (req: Request, res: Response) => {
  try { res.json(await compareWithSnapshot(Number(req.params.id))); }
  catch (err: unknown) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

export default router;
