import {
  createRemediationScript,
  assignRemediationScript,
  listRemediationScripts,
} from "../graph/remediation.js";
import type { GeneratedScript } from "./scriptGenerator.js";
import { validateScript, type ScriptValidationResult } from "./scriptValidator.js";

/**
 * Whether to require script signing for deployed remediations.
 * Controlled by ENFORCE_SCRIPT_SIGNING env var (default: false).
 * When true, Intune will only run scripts signed by a trusted publisher.
 */
const ENFORCE_SIGNATURE_CHECK = process.env.ENFORCE_SCRIPT_SIGNING === "true";

/**
 * Whether to run the full quality validation pipeline before deployment.
 * Controlled by SKIP_SCRIPT_VALIDATION env var (default: validation ON).
 */
const SKIP_VALIDATION = process.env.SKIP_SCRIPT_VALIDATION === "true";

/**
 * Deploy a generated script to Intune as a Proactive Remediation.
 * Runs the quality validation pipeline (AST + Pester) before deployment
 * unless SKIP_SCRIPT_VALIDATION=true.
 *
 * Returns the created script ID, validation results, and details.
 */
export async function deployToIntune(
  script: GeneratedScript
): Promise<{
  scriptId: string;
  displayName: string;
  success: boolean;
  validation?: ScriptValidationResult;
  error?: string;
}> {
  try {
    // ─── Quality Validation Pipeline ───────────────────────────
    if (!SKIP_VALIDATION) {
      const validation = await validateScript(
        script.detectionScript,
        script.remediationScript,
        script.displayName
      );

      if (!validation.valid) {
        console.warn(`[Deploy] Script blocked by validation: ${validation.summary}`);
        return {
          scriptId: "",
          displayName: script.displayName,
          success: false,
          validation,
          error: `Script failed quality validation: ${validation.summary}. ` +
            validation.syntaxErrors.join("; ") +
            validation.pesterResults
              .filter((r) => !r.passed)
              .map((r) => `${r.name}: ${r.message}`)
              .join("; "),
        };
      }

      console.log(`[Deploy] Validation passed: ${validation.summary}`);
    }

    console.log(`[Deploy] Creating Proactive Remediation: "${script.displayName}"`);

    // Base64-encode the scripts (Graph API requires this)
    const detectionBase64 = Buffer.from(script.detectionScript, "utf-8").toString("base64");
    const remediationBase64 = Buffer.from(script.remediationScript, "utf-8").toString("base64");

    const result = await createRemediationScript({
      displayName: script.displayName,
      description: script.description,
      detectionScriptContent: detectionBase64,
      remediationScriptContent: remediationBase64,
      runAsAccount: script.runAsAccount,
      enforceSignatureCheck: ENFORCE_SIGNATURE_CHECK,
      runAs32Bit: false,
    });

    const scriptId = result.id as string;
    console.log(`[Deploy] Created Proactive Remediation: ${scriptId}`);

    return {
      scriptId,
      displayName: script.displayName,
      success: true,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Deploy] Failed to create Proactive Remediation:`, message);
    return {
      scriptId: "",
      displayName: script.displayName,
      success: false,
      error: message,
    };
  }
}

/**
 * Deploy a script and assign it to a group.
 */
export async function deployAndAssign(
  script: GeneratedScript,
  groupId: string,
  scheduleMinutes?: number
): Promise<{
  scriptId: string;
  displayName: string;
  assigned: boolean;
  success: boolean;
  error?: string;
}> {
  const deployResult = await deployToIntune(script);
  if (!deployResult.success) {
    return { ...deployResult, assigned: false };
  }

  try {
    console.log(`[Deploy] Assigning script ${deployResult.scriptId} to group ${groupId}`);
    await assignRemediationScript(deployResult.scriptId, groupId, {
      intervalInMinutes: scheduleMinutes,
    });
    console.log(`[Deploy] Assignment successful`);

    return {
      ...deployResult,
      assigned: true,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Deploy] Assignment failed:`, message);
    return {
      ...deployResult,
      assigned: false,
      error: `Script created (ID: ${deployResult.scriptId}) but assignment failed: ${message}`,
    };
  }
}
