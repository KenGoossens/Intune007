import { Router, type Request, type Response } from "express";
import {
  generateRemediationScript,
  generateAlertRemediation,
} from "../remediation/scriptGenerator.js";
import { deployToIntune, deployAndAssign } from "../remediation/deployer.js";
import {
  listRemediationScripts,
  getRemediationScript,
  getRemediationScriptDeviceStates,
  deleteRemediationScript,
  updateRemediationScript,
} from "../graph/remediation.js";
import { sanitizeErrorMessage } from "../security.js";

const router = Router();

/**
 * POST /api/remediation/generate
 * Generate a remediation script from a natural language description.
 * Body: { prompt: string, context?: { alertType?, alertDetails?, deviceInfo? } }
 */
router.post("/generate", async (req: Request, res: Response) => {
  const { prompt, context } = req.body;

  if (!prompt || typeof prompt !== "string") {
    res.status(400).json({ error: "Missing or invalid 'prompt' field" });
    return;
  }

  try {
    const script = await generateRemediationScript(prompt, context);
    res.json({ script });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

/**
 * POST /api/remediation/generate-for-alert
 * Generate a remediation script for a specific alert type.
 * Body: { alertType: string, alertDetails: unknown[] }
 */
router.post("/generate-for-alert", async (req: Request, res: Response) => {
  const { alertType, alertDetails } = req.body;

  if (!alertType) {
    res.status(400).json({ error: "Missing 'alertType' field" });
    return;
  }

  try {
    const script = await generateAlertRemediation(
      alertType,
      alertDetails || []
    );
    res.json({ script });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

/**
 * POST /api/remediation/deploy
 * Deploy a generated script to Intune as a Proactive Remediation.
 * Body: { script: GeneratedScript }
 */
router.post("/deploy", async (req: Request, res: Response) => {
  const { script } = req.body;

  if (!script || !script.detectionScript || !script.remediationScript) {
    res.status(400).json({ error: "Missing or incomplete 'script' field" });
    return;
  }

  try {
    const result = await deployToIntune(script);
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

/**
 * POST /api/remediation/deploy-and-assign
 * Deploy a script and assign it to a group.
 * Body: { script: GeneratedScript, groupId: string, scheduleMinutes?: number }
 */
router.post("/deploy-and-assign", async (req: Request, res: Response) => {
  const { script, groupId, scheduleMinutes } = req.body;

  if (!script || !groupId) {
    res
      .status(400)
      .json({ error: "Missing 'script' or 'groupId' field" });
    return;
  }

  try {
    const result = await deployAndAssign(script, groupId, scheduleMinutes);
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

/**
 * GET /api/remediation/scripts
 * List existing Proactive Remediations in Intune.
 */
router.get("/scripts", async (_req: Request, res: Response) => {
  try {
    const result = await listRemediationScripts({ top: 50 });
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

/**
 * GET /api/remediation/scripts/:id
 * Get a specific Proactive Remediation script.
 */
router.get("/scripts/:id", async (req: Request, res: Response) => {
  try {
    const script = await getRemediationScript(req.params.id as string);
    res.json(script);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

/**
 * GET /api/remediation/scripts/:id/states
 * Get device run states for a Proactive Remediation.
 */
router.get("/scripts/:id/states", async (req: Request, res: Response) => {
  try {
    const result = await getRemediationScriptDeviceStates(
      req.params.id as string,
      { top: 50 }
    );
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

/**
 * DELETE /api/remediation/scripts/:id
 * Delete a Proactive Remediation script from Intune.
 */
router.delete("/scripts/:id", async (req: Request, res: Response) => {
  try {
    await deleteRemediationScript(req.params.id as string);
    res.json({ success: true, message: "Remediation script deleted." });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeErrorMessage(err instanceof Error ? err.message : String(err)) });
  }
});

/**
 * PATCH /api/remediation/scripts/:id
 * Update a Proactive Remediation script (name, description, detection/remediation scripts).
 * Scripts in body should be plain text — they'll be Base64-encoded here.
 */
router.patch("/scripts/:id", async (req: Request, res: Response) => {
  const { displayName, description, detectionScript, remediationScript, runAsAccount } = req.body;
  try {
    const params: Parameters<typeof updateRemediationScript>[1] = {};
    if (displayName) params.displayName = displayName;
    if (description !== undefined) params.description = description;
    if (detectionScript) params.detectionScriptContent = Buffer.from(detectionScript, "utf-8").toString("base64");
    if (remediationScript) params.remediationScriptContent = Buffer.from(remediationScript, "utf-8").toString("base64");
    if (runAsAccount) params.runAsAccount = runAsAccount;

    const result = await updateRemediationScript(req.params.id as string, params);
    res.json({ success: true, script: result });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeErrorMessage(err instanceof Error ? err.message : String(err)) });
  }
});

export default router;
