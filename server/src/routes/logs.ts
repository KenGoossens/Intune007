/**
 * Routes for log collection — direct access to audit and sign-in logs.
 */

import { Router, type Request, type Response } from "express";
import { getAuditEvents, getSignInLogs, getDirectoryAuditLogs } from "../graph/logs.js";

const router = Router();

/** GET /api/logs/audit — Get Intune audit events. */
router.get("/audit", async (req: Request, res: Response) => {
  try {
    const filter = req.query.filter as string | undefined;
    const top = parseInt(req.query.top as string) || 50;
    const result = await getAuditEvents({ filter, top });
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

/** GET /api/logs/signins — Get Azure AD sign-in logs. */
router.get("/signins", async (req: Request, res: Response) => {
  try {
    const filter = req.query.filter as string | undefined;
    const top = parseInt(req.query.top as string) || 50;
    const result = await getSignInLogs({ filter, top });
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

/** GET /api/logs/directory — Get Azure AD directory audit logs. */
router.get("/directory", async (req: Request, res: Response) => {
  try {
    const filter = req.query.filter as string | undefined;
    const top = parseInt(req.query.top as string) || 50;
    const result = await getDirectoryAuditLogs({ filter, top });
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

export default router;
