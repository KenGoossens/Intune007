import { AzureOpenAI } from "openai";
import { config } from "../config.js";

export interface GeneratedScript {
  displayName: string;
  description: string;
  detectionScript: string;
  remediationScript: string;
  runAsAccount: "system" | "user";
  explanation: string;
}

const SCRIPT_GENERATION_PROMPT = `You are an expert Intune remediation script engineer. You generate PowerShell scripts for Intune Proactive Remediations (deviceHealthScripts).

Each Proactive Remediation has TWO scripts:
1. **Detection Script** — Runs first to detect if the issue exists. Exit code 0 = compliant (no issue), Exit code 1 = non-compliant (issue found, remediation needed).
2. **Remediation Script** — Runs only if detection returns exit code 1. Should fix the issue. Exit code 0 = success.

Rules:
- Scripts must be valid PowerShell 5.1+ (Windows PowerShell) compatible.
- Detection scripts must use "exit 0" for compliant and "exit 1" for non-compliant.
- Remediation scripts must use "exit 0" on success and "exit 1" on failure.
- Include clear Write-Output or Write-Host messages for logging in Intune.
- Use try/catch blocks for error handling.
- Prefer $ErrorActionPreference = "Stop" at the top.
- Do NOT require external modules unless absolutely necessary.
- Scripts should be idempotent (safe to run multiple times).
- Include comments explaining what the script does.

Return your response as a JSON object with these fields:
{
  "displayName": "Short name for the remediation (max 64 chars)",
  "description": "Description of what this remediation does",
  "detectionScript": "The full PowerShell detection script",
  "remediationScript": "The full PowerShell remediation script", 
  "runAsAccount": "system" or "user" (system for device-level, user for user-level),
  "explanation": "Brief explanation of how the scripts work and what they fix"
}

Return ONLY the JSON object, no markdown code fences.`;

/**
 * Generate a detection + remediation script pair using Azure OpenAI.
 */
export async function generateRemediationScript(
  prompt: string,
  context?: {
    alertType?: string;
    alertDetails?: unknown[];
    deviceInfo?: Record<string, unknown>;
  }
): Promise<GeneratedScript> {
  const client = new AzureOpenAI({
    apiKey: config.azureOpenAI.apiKey,
    endpoint: config.azureOpenAI.endpoint,
    deployment: config.azureOpenAI.deployment,
    apiVersion: config.azureOpenAI.apiVersion,
  });

  let userMessage = prompt;

  // Add context if available
  if (context) {
    const contextParts: string[] = [];
    if (context.alertType) {
      contextParts.push(`Alert type: ${context.alertType}`);
    }
    if (context.alertDetails && context.alertDetails.length > 0) {
      contextParts.push(
        `Alert details:\n${JSON.stringify(context.alertDetails.slice(0, 5), null, 2)}`
      );
    }
    if (context.deviceInfo) {
      contextParts.push(
        `Device info:\n${JSON.stringify(context.deviceInfo, null, 2)}`
      );
    }
    if (contextParts.length > 0) {
      userMessage += `\n\nContext:\n${contextParts.join("\n\n")}`;
    }
  }

  console.log(`[ScriptGen] Generating script for: "${prompt.slice(0, 100)}..."`);
  const startTime = Date.now();

  const completion = await client.chat.completions.create({
    model: config.azureOpenAI.deployment,
    messages: [
      { role: "system", content: SCRIPT_GENERATION_PROMPT },
      { role: "user", content: userMessage },
    ],
  });

  const elapsed = Date.now() - startTime;
  const content = completion.choices[0]?.message?.content || "";
  console.log(`[ScriptGen] Generated in ${elapsed}ms (${content.length} chars)`);

  // Parse the JSON response
  try {
    // Remove any markdown code fences if the model included them
    const cleaned = content
      .replace(/^```json?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const parsed = JSON.parse(cleaned) as GeneratedScript;

    // Validate required fields
    if (!parsed.detectionScript || !parsed.remediationScript) {
      throw new Error("Missing detection or remediation script in response");
    }

    return {
      displayName: parsed.displayName || "Intune007 Remediation",
      description: parsed.description || prompt,
      detectionScript: parsed.detectionScript,
      remediationScript: parsed.remediationScript,
      runAsAccount: parsed.runAsAccount || "system",
      explanation: parsed.explanation || "",
    };
  } catch (parseErr) {
    console.error("[ScriptGen] Failed to parse response:", content.slice(0, 200));
    throw new Error(
      `Failed to parse generated script. Model response was not valid JSON.`
    );
  }
}

/**
 * Generate a remediation script specifically for an alert.
 */
export async function generateAlertRemediation(
  alertType: string,
  alertDetails: unknown[]
): Promise<GeneratedScript> {
  const ALERT_PROMPTS: Record<string, string> = {
    non_compliant_devices:
      "Generate a Proactive Remediation script to detect and fix common Windows compliance issues: ensure BitLocker is enabled, Windows Defender is active, firewall is on, and OS is up to date. The detection script should check all of these and exit 1 if any are non-compliant. The remediation script should attempt to enable each one.",
    policy_conflicts:
      "Generate a Proactive Remediation script that detects conflicting MDM policy settings on the device. The detection script should check the Windows event log for MDM PolicyManager conflicts (Event ID 400-499 in Microsoft-Windows-DeviceManagement-Enterprise-Diagnostics-Provider/Admin). The remediation script should trigger a device sync with Intune to re-apply policies and clear conflicting state.",
    stale_devices:
      "Generate a Proactive Remediation script that detects if the Intune Management Extension service is running and the device can reach Intune endpoints. The detection script should check the IntuneManagementExtension service status and test connectivity to manage.microsoft.com. The remediation script should restart the service and trigger a sync.",
    failed_app_installs:
      "Generate a Proactive Remediation script that detects failed Win32 app installations via the Intune Management Extension logs. The detection script should check C:\\ProgramData\\Microsoft\\IntuneManagementExtension\\Logs for recent installation failures. The remediation script should clear the Intune app cache and trigger a re-evaluation of app assignments.",
  };

  const prompt =
    ALERT_PROMPTS[alertType] ||
    `Generate a Proactive Remediation script for the following alert: ${alertType}`;

  return generateRemediationScript(prompt, {
    alertType,
    alertDetails,
  });
}
