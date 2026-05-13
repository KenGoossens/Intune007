import { Router, type Request, type Response } from "express";
import {
  generateRemediationScript,
  generateAlertRemediation,
} from "../remediation/scriptGenerator.js";
import { deployToIntune, deployAndAssign } from "../remediation/deployer.js";
import { validateScript } from "../remediation/scriptValidator.js";
import {
  listRemediationScripts,
  getRemediationScript,
  getRemediationScriptDeviceStates,
  deleteRemediationScript,
  updateRemediationScript,
} from "../graph/remediation.js";
import { sanitizeErrorMessage, scanPowerShellScript } from "../security.js";
import crypto from "crypto";

const router = Router();

// ─── User Approval Gate ──────────────────────────────────────────
// Stores pending script deployments awaiting user approval.
// Approvals expire after 30 minutes.

interface PendingApproval {
  id: string;
  script: {
    displayName: string;
    description: string;
    detectionScript: string;
    remediationScript: string;
    runAsAccount: "system" | "user";
    explanation: string;
  };
  validation: {
    valid: boolean;
    summary: string;
    syntaxErrors: string[];
    pesterResults: { name: string; passed: boolean; message?: string }[];
  };
  createdAt: number;
  groupId?: string;
  scheduleMinutes?: number;
}

const pendingApprovals = new Map<string, PendingApproval>();
const APPROVAL_TTL_MS = 30 * 60 * 1000; // 30 minutes

/** Clean up expired approvals */
function cleanupApprovals(): void {
  const now = Date.now();
  for (const [id, approval] of pendingApprovals) {
    if (now - approval.createdAt > APPROVAL_TTL_MS) {
      pendingApprovals.delete(id);
    }
  }
}

/**
 * Create a pending approval for a script deployment.
 * Returns the approval ID that the UI uses to approve/reject.
 */
export function createScriptApproval(
  script: PendingApproval["script"],
  validation: PendingApproval["validation"],
  options?: { groupId?: string; scheduleMinutes?: number }
): string {
  cleanupApprovals();
  const id = crypto.randomBytes(16).toString("hex");
  pendingApprovals.set(id, {
    id,
    script,
    validation,
    createdAt: Date.now(),
    groupId: options?.groupId,
    scheduleMinutes: options?.scheduleMinutes,
  });
  return id;
}

/**
 * GET /api/remediation/pending-approvals
 * List scripts waiting for user approval.
 */
router.get("/pending-approvals", (_req: Request, res: Response) => {
  cleanupApprovals();
  const approvals = Array.from(pendingApprovals.values()).map((a) => ({
    id: a.id,
    displayName: a.script.displayName,
    description: a.script.description,
    detectionScript: a.script.detectionScript,
    remediationScript: a.script.remediationScript,
    runAsAccount: a.script.runAsAccount,
    validation: a.validation,
    createdAt: a.createdAt,
    groupId: a.groupId,
  }));
  res.json({ approvals });
});

/**
 * POST /api/remediation/approve/:id
 * User approves a pending script for deployment.
 */
router.post("/approve/:id", async (req: Request, res: Response) => {
  cleanupApprovals();
  const approval = pendingApprovals.get(req.params.id as string);
  if (!approval) {
    res.status(404).json({ error: "Approval not found or expired" });
    return;
  }

  // Final security scan before deploy
  const detIssues = scanPowerShellScript(approval.script.detectionScript);
  const remIssues = scanPowerShellScript(approval.script.remediationScript);
  if (detIssues.length > 0 || remIssues.length > 0) {
    pendingApprovals.delete(approval.id);
    res.status(403).json({ error: `Script blocked: ${[...detIssues, ...remIssues].join("; ")}` });
    return;
  }

  try {
    let result;
    if (approval.groupId) {
      result = await deployAndAssign(
        approval.script,
        approval.groupId,
        approval.scheduleMinutes
      );
    } else {
      result = await deployToIntune(approval.script);
    }
    pendingApprovals.delete(approval.id);
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: sanitizeErrorMessage(msg) });
  }
});

/**
 * POST /api/remediation/reject/:id
 * User rejects a pending script — removes it without deploying.
 */
router.post("/reject/:id", (req: Request, res: Response) => {
  const existed = pendingApprovals.delete(req.params.id as string);
  res.json({ success: true, existed });
});

/**
 * POST /api/remediation/generate
 * Generate a remediation script from a natural language description.
 * Body: { prompt: string, context?: { alertType?, alertDetails?, deviceInfo? } }
 *
 * Runs the quality validation pipeline and creates a pending approval.
 * The script is NOT deployed until the user explicitly approves it via
 * POST /api/remediation/approve/:id.
 */
router.post("/generate", async (req: Request, res: Response) => {
  const { prompt, context, groupId, scheduleMinutes } = req.body;

  if (!prompt || typeof prompt !== "string") {
    res.status(400).json({ error: "Missing or invalid 'prompt' field" });
    return;
  }

  try {
    const script = await generateRemediationScript(prompt, context);

    // Run quality validation
    const validation = await validateScript(
      script.detectionScript,
      script.remediationScript,
      script.displayName
    );

    // Create pending approval
    const approvalId = createScriptApproval(script, validation, {
      groupId,
      scheduleMinutes,
    });

    res.json({
      script,
      validation,
      approvalId,
      requiresApproval: true,
    });
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
