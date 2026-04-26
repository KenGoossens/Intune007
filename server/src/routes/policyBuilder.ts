/**
 * Routes for the Natural Language Policy Builder.
 */

import { Router, type Request, type Response } from "express";
import { generatePolicy } from "../policyBuilder/builder.js";
import {
  createCompliancePolicy,
  createConfigurationProfile,
  assignCompliancePolicy,
  assignConfigurationProfile,
} from "../graph/policyManagement.js";
import { getGroups } from "../graph/groups.js";

const router = Router();

/**
 * POST /api/policy-builder/generate
 * Generate an Intune policy from a natural language description.
 * Body: { prompt: string, benchmark?: string }
 */
router.post("/generate", async (req: Request, res: Response) => {
  const { prompt, benchmark } = req.body;

  if (!prompt || typeof prompt !== "string") {
    res.status(400).json({ error: "Missing or invalid 'prompt' field" });
    return;
  }

  try {
    const policy = await generatePolicy(prompt, benchmark);
    res.json({ policy });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[PolicyBuilder] Generation error:", msg);
    res.status(500).json({ error: msg });
  }
});

/**
 * POST /api/policy-builder/deploy
 * Deploy a generated policy to Intune.
 * Body: { policy: GeneratedPolicy }
 */
router.post("/deploy", async (req: Request, res: Response) => {
  const { policy } = req.body;

  if (!policy || !policy.fullBody) {
    res.status(400).json({ error: "Missing or incomplete 'policy' field" });
    return;
  }

  try {
    let result: Record<string, unknown>;

    // Strip MAA/attestation/Windows 11 properties that require tenant feature flags
    // The "MAA Windows 11 settings Feature not enabled" error is triggered by ANY of these
    const MAA_PROPERTIES = new Set([
      "requireHealthyDeviceReport",
      "configurationManagerComplianceRequired",
      "memoryIntegrityEnabled",
      "kernelDmaProtectionEnabled",
      "virtualizationBasedSecurityEnabled",
      "firmwareProtectionEnabled",
      "secureBootEnabled",
      "codeIntegrityEnabled",
      "earlyLaunchAntiMalwareDriverEnabled",
      "tpmRequired",
      "deviceCompliancePolicyScript",
      "validOperatingSystemBuildRanges",
    ]);
    const body = JSON.parse(JSON.stringify(policy.fullBody)); // deep clone
    // Strip from top-level
    for (const key of Object.keys(body)) {
      if (MAA_PROPERTIES.has(key)) delete body[key];
    }
    // Also strip from nested "settings" if present
    if (body.settings && typeof body.settings === "object") {
      for (const key of Object.keys(body.settings)) {
        if (MAA_PROPERTIES.has(key)) delete body.settings[key];
      }
    }

    console.log("[PolicyBuilder] Deploy body (MAA-stripped):", JSON.stringify(body).substring(0, 500));

    if (policy.policyType === "configuration") {
      result = await createConfigurationProfile(body);
    } else {
      result = await createCompliancePolicy(body);
    }

    res.json({
      success: true,
      policyId: result.id,
      displayName: result.displayName || policy.displayName,
      policyType: policy.policyType,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[PolicyBuilder] Deploy error:", msg);
    res.status(500).json({
      success: false,
      error: msg,
    });
  }
});

/**
 * POST /api/policy-builder/deploy-and-assign
 * Deploy a policy and assign it to groups.
 * Body: { policy: GeneratedPolicy, groupIds: string[] }
 */
router.post("/deploy-and-assign", async (req: Request, res: Response) => {
  const { policy, groupIds } = req.body;

  if (!policy || !policy.fullBody || !groupIds?.length) {
    res.status(400).json({ error: "Missing policy or groupIds" });
    return;
  }

  try {
    let result: Record<string, unknown>;

    if (policy.policyType === "configuration") {
      result = await createConfigurationProfile(policy.fullBody);
      await assignConfigurationProfile(result.id as string, groupIds);
    } else {
      result = await createCompliancePolicy(policy.fullBody);
      await assignCompliancePolicy(result.id as string, groupIds);
    }

    res.json({
      success: true,
      policyId: result.id,
      displayName: result.displayName || policy.displayName,
      policyType: policy.policyType,
      assignedGroups: groupIds,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});

/**
 * GET /api/policy-builder/groups
 * Quick group search for the assignment picker.
 */
router.get("/groups", async (req: Request, res: Response) => {
  try {
    const search = req.query.search as string | undefined;
    const result = await getGroups({ search, top: 20 });
    res.json({ groups: result.items });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

export default router;
