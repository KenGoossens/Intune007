import {
  createRemediationScript,
  assignRemediationScript,
  listRemediationScripts,
} from "../graph/remediation.js";
import type { GeneratedScript } from "./scriptGenerator.js";

/**
 * Deploy a generated script to Intune as a Proactive Remediation.
 * Returns the created script ID and details.
 */
export async function deployToIntune(
  script: GeneratedScript
): Promise<{
  scriptId: string;
  displayName: string;
  success: boolean;
  error?: string;
}> {
  try {
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
      enforceSignatureCheck: false,
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
