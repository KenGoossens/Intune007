/**
 * Device Troubleshooter — Automated multi-step diagnostic engine.
 *
 * Takes a device name and problem description, then runs a chain of
 * diagnostic checks, collecting findings at each step. Finally, it
 * uses Azure OpenAI to generate a root cause analysis.
 *
 * Steps:
 *   1. Resolve device by name
 *   2. Compliance check
 *   3. Configuration profile check
 *   4. App install check
 *   5. Group membership check
 *   6. Sync & activity analysis
 *   7. AI root cause analysis
 */

import { AzureOpenAI } from "openai";
import { config } from "../config.js";
import { getGraphClient, fetchWithPagination } from "../graph/client.js";
import { sanitizeOData } from "../security.js";

export type StepStatus = "pending" | "running" | "pass" | "fail" | "warning" | "info" | "error";

export interface DiagnosticFinding {
  status: "pass" | "fail" | "warning" | "info";
  message: string;
  details?: unknown;
}

export interface DiagnosticStep {
  id: string;
  name: string;
  description: string;
  status: StepStatus;
  findings: DiagnosticFinding[];
  durationMs?: number;
  error?: string;
}

export interface DiagnosticResult {
  deviceName: string;
  deviceId: string;
  problem: string;
  startedAt: string;
  completedAt: string;
  totalDurationMs: number;
  steps: DiagnosticStep[];
  diagnosis: string;
  recommendedActions: string[];
}

export type StepCallback = (step: DiagnosticStep) => void;

/**
 * Run a full diagnostic chain on a device.
 * The onStepUpdate callback is called whenever a step starts, progresses, or completes.
 */
export async function runDiagnostics(
  deviceNameOrId: string,
  problem: string,
  onStepUpdate: StepCallback
): Promise<DiagnosticResult> {
  const startTime = Date.now();
  const client = getGraphClient();
  const steps: DiagnosticStep[] = [];

  let deviceId = "";
  let deviceName = deviceNameOrId;
  let deviceData: Record<string, unknown> = {};

  // ─── Step 1: Resolve Device ──────────────────────────────────

  const step1: DiagnosticStep = {
    id: "resolve",
    name: "Resolve Device",
    description: "Finding device in Intune by name or ID",
    status: "running",
    findings: [],
  };
  steps.push(step1);
  onStepUpdate({ ...step1 });

  const step1Start = Date.now();
  try {
    // Try by name first
    const result = await fetchWithPagination<Record<string, unknown>>(
      client,
      "/deviceManagement/managedDevices",
      {
        filter: `deviceName eq '${sanitizeOData(deviceNameOrId)}'`,
        select: "id,deviceName,operatingSystem,osVersion,complianceState,isEncrypted,managedDeviceOwnerType,enrolledDateTime,lastSyncDateTime,userPrincipalName,model,manufacturer,serialNumber,managementAgent",
        maxItems: 5,
      }
    );

    if (result.items.length === 0) {
      // Try as device ID
      try {
        const device = await client
          .api(`/deviceManagement/managedDevices/${deviceNameOrId}`)
          .select("id,deviceName,operatingSystem,osVersion,complianceState,isEncrypted,managedDeviceOwnerType,enrolledDateTime,lastSyncDateTime,userPrincipalName,model,manufacturer,serialNumber,managementAgent")
          .get();
        deviceData = device;
        deviceId = String(device.id);
        deviceName = String(device.deviceName);
      } catch {
        step1.status = "error";
        step1.error = `Device "${deviceNameOrId}" not found in Intune`;
        step1.durationMs = Date.now() - step1Start;
        onStepUpdate({ ...step1 });
        return buildResult(deviceName, deviceId, problem, startTime, steps, "Device not found. Verify the device name or ID is correct and that the device is enrolled in Intune.", ["Verify the device name is spelled correctly", "Check if the device is enrolled in Intune", "Try searching by device ID instead"]);
      }
    } else {
      deviceData = result.items[0];
      deviceId = String(deviceData.id);
      deviceName = String(deviceData.deviceName);
    }

    step1.status = "pass";
    step1.findings.push({
      status: "pass",
      message: `Found device: ${deviceName}`,
      details: {
        deviceId,
        os: `${deviceData.operatingSystem} ${deviceData.osVersion}`,
        user: deviceData.userPrincipalName,
        model: `${deviceData.manufacturer} ${deviceData.model}`,
        enrolled: deviceData.enrolledDateTime,
      },
    });
    step1.durationMs = Date.now() - step1Start;
    onStepUpdate({ ...step1 });
  } catch (err: unknown) {
    step1.status = "error";
    step1.error = err instanceof Error ? err.message : String(err);
    step1.durationMs = Date.now() - step1Start;
    onStepUpdate({ ...step1 });
    return buildResult(deviceName, deviceId, problem, startTime, steps, `Failed to resolve device: ${step1.error}`, ["Check Graph API permissions", "Verify DeviceManagementManagedDevices.Read.All is granted"]);
  }

  // ─── Step 2: Compliance Check ────────────────────────────────

  const step2: DiagnosticStep = {
    id: "compliance",
    name: "Compliance Check",
    description: "Checking device compliance state and policies",
    status: "running",
    findings: [],
  };
  steps.push(step2);
  onStepUpdate({ ...step2 });

  const step2Start = Date.now();
  try {
    const complianceState = String(deviceData.complianceState || "unknown").toLowerCase();

    if (complianceState === "compliant") {
      step2.status = "pass";
      step2.findings.push({ status: "pass", message: "Device is compliant with all policies" });
    } else if (complianceState === "noncompliant") {
      step2.status = "fail";
      step2.findings.push({ status: "fail", message: "Device is NON-COMPLIANT" });

      // Try to get compliance policy states
      try {
        const policyStates = await fetchWithPagination<Record<string, unknown>>(
          client,
          `/deviceManagement/managedDevices/${deviceId}/deviceCompliancePolicyStates`,
          { maxItems: 50 }
        );
        const failing = policyStates.items.filter(
          (s) => String(s.state || "").toLowerCase() !== "compliant" && String(s.state || "").toLowerCase() !== "notapplicable"
        );
        for (const policy of failing) {
          step2.findings.push({
            status: "fail",
            message: `Policy "${policy.displayName || "Unknown"}" — state: ${policy.state}`,
            details: policy,
          });
        }
      } catch {
        step2.findings.push({ status: "info", message: "Could not retrieve detailed compliance policy states" });
      }
    } else {
      step2.status = "warning";
      step2.findings.push({ status: "warning", message: `Compliance state: ${complianceState}` });
    }

    step2.durationMs = Date.now() - step2Start;
    onStepUpdate({ ...step2 });
  } catch (err: unknown) {
    step2.status = "error";
    step2.error = err instanceof Error ? err.message : String(err);
    step2.durationMs = Date.now() - step2Start;
    onStepUpdate({ ...step2 });
  }

  // ─── Step 3: Configuration Profile Check ─────────────────────

  const step3: DiagnosticStep = {
    id: "config",
    name: "Configuration Profiles",
    description: "Checking for configuration conflicts and errors",
    status: "running",
    findings: [],
  };
  steps.push(step3);
  onStepUpdate({ ...step3 });

  const step3Start = Date.now();
  try {
    const configStates = await fetchWithPagination<Record<string, unknown>>(
      client,
      `/deviceManagement/managedDevices/${deviceId}/deviceConfigurationStates`,
      { maxItems: 100 }
    );

    const conflicts = configStates.items.filter((s) => String(s.state || "").toLowerCase() === "conflict");
    const errors = configStates.items.filter((s) => String(s.state || "").toLowerCase() === "error");
    const compliant = configStates.items.filter((s) => String(s.state || "").toLowerCase() === "compliant");

    if (conflicts.length > 0) {
      step3.status = "fail";
      for (const c of conflicts) {
        step3.findings.push({
          status: "fail",
          message: `CONFLICT: "${c.displayName}" — ${c.settingCount || 0} settings`,
          details: c,
        });
      }
    }
    if (errors.length > 0) {
      step3.status = step3.status === "fail" ? "fail" : "warning";
      for (const e of errors) {
        step3.findings.push({
          status: "fail",
          message: `ERROR: "${e.displayName}" — ${e.settingCount || 0} settings`,
          details: e,
        });
      }
    }
    if (conflicts.length === 0 && errors.length === 0) {
      step3.status = "pass";
    }

    step3.findings.push({
      status: "info",
      message: `${configStates.items.length} profile(s) assigned: ${compliant.length} compliant, ${conflicts.length} conflict(s), ${errors.length} error(s)`,
    });

    step3.durationMs = Date.now() - step3Start;
    onStepUpdate({ ...step3 });
  } catch (err: unknown) {
    step3.status = "error";
    step3.error = err instanceof Error ? err.message : String(err);
    step3.durationMs = Date.now() - step3Start;
    onStepUpdate({ ...step3 });
  }

  // ─── Step 4: App Install Check ───────────────────────────────

  const step4: DiagnosticStep = {
    id: "apps",
    name: "App Installations",
    description: "Checking managed app install states",
    status: "running",
    findings: [],
  };
  steps.push(step4);
  onStepUpdate({ ...step4 });

  const step4Start = Date.now();
  try {
    // Get managed app install states for this device (proper per-device endpoint)
    const appStates = await fetchWithPagination<Record<string, unknown>>(
      client,
      `https://graph.microsoft.com/beta/users/${String(deviceData.userPrincipalName || "unknown")}/mobileAppIntentAndStates`,
      { maxItems: 50 }
    ).catch(() => ({ items: [] as Record<string, unknown>[], totalCount: 0 }));

    // Also try detected apps (what's actually installed on the device)
    const detectedApps = await fetchWithPagination<Record<string, unknown>>(
      client,
      `https://graph.microsoft.com/beta/deviceManagement/managedDevices/${deviceId}/detectedApps`,
      { select: "id,displayName,version", maxItems: 50 }
    ).catch(() => ({ items: [] as Record<string, unknown>[], totalCount: 0 }));

    // Check intent and states for failures
    let failedCount = 0;
    if (appStates.items.length > 0) {
      for (const item of appStates.items) {
        const apps = (item.mobileAppList || []) as Array<Record<string, unknown>>;
        for (const app of apps) {
          const installState = String(app.installState || "").toLowerCase();
          if (installState.includes("fail") || installState.includes("error") || installState === "notInstalled") {
            const intent = String(app.mobileAppIntent || "").toLowerCase();
            if (intent === "requiredinstall" || intent === "required") {
              failedCount++;
              step4.findings.push({
                status: "fail",
                message: `Required app not installed: "${app.displayName || "Unknown"}" — state: ${installState}`,
                details: { displayName: app.displayName, installState, intent },
              });
            }
          }
        }
      }
    }

    if (failedCount > 0) {
      step4.status = "fail";
    } else if (appStates.items.length > 0) {
      step4.status = "pass";
      step4.findings.push({ status: "pass", message: "All required apps are installed or pending" });
    } else {
      step4.status = "info";
      step4.findings.push({ status: "info", message: "No app intent/state data found (may require user context)" });
    }

    step4.findings.push({
      status: "info",
      message: `${detectedApps.totalCount} app(s) detected on device`,
    });

    step4.durationMs = Date.now() - step4Start;
    onStepUpdate({ ...step4 });
  } catch (err: unknown) {
    step4.status = "error";
    step4.error = err instanceof Error ? err.message : String(err);
    step4.durationMs = Date.now() - step4Start;
    onStepUpdate({ ...step4 });
  }

  // ─── Step 5: Group Membership ────────────────────────────────

  const step5: DiagnosticStep = {
    id: "groups",
    name: "Group Membership",
    description: "Checking device group assignments for policy targeting",
    status: "running",
    findings: [],
  };
  steps.push(step5);
  onStepUpdate({ ...step5 });

  const step5Start = Date.now();
  try {
    // Get the Azure AD device object to find group memberships
    const aadDevices = await fetchWithPagination<Record<string, unknown>>(
      client,
      "/devices",
      {
        filter: `displayName eq '${sanitizeOData(deviceName)}'`,
        select: "id,displayName",
        maxItems: 1,
      }
    );

    if (aadDevices.items.length > 0) {
      const aadDeviceId = String(aadDevices.items[0].id);
      const memberships = await fetchWithPagination<Record<string, unknown>>(
        client,
        `/devices/${aadDeviceId}/memberOf`,
        { select: "id,displayName,groupTypes,membershipRule", maxItems: 50 }
      );

      const groups = memberships.items.filter(
        (m) => String(m["@odata.type"] || "").includes("group")
      );

      step5.status = "pass";
      step5.findings.push({
        status: "info",
        message: `Device is a member of ${groups.length} group(s)`,
      });

      for (const group of groups.slice(0, 10)) {
        const isDynamic = Array.isArray(group.groupTypes) && (group.groupTypes as string[]).includes("DynamicMembership");
        step5.findings.push({
          status: "info",
          message: `${group.displayName}${isDynamic ? " (dynamic)" : ""}`,
          details: { id: group.id, membershipRule: group.membershipRule },
        });
      }

      if (groups.length === 0) {
        step5.status = "warning";
        step5.findings[0] = { status: "warning", message: "Device is not in any Azure AD groups — it may not receive group-targeted policies or apps" };
      }
    } else {
      step5.status = "warning";
      step5.findings.push({ status: "warning", message: "Could not find device in Azure AD directory — group membership check skipped" });
    }

    step5.durationMs = Date.now() - step5Start;
    onStepUpdate({ ...step5 });
  } catch (err: unknown) {
    step5.status = "error";
    step5.error = err instanceof Error ? err.message : String(err);
    step5.durationMs = Date.now() - step5Start;
    onStepUpdate({ ...step5 });
  }

  // ─── Step 6: Sync & Activity ─────────────────────────────────

  const step6: DiagnosticStep = {
    id: "sync",
    name: "Sync & Activity",
    description: "Analyzing device sync history and enrollment status",
    status: "running",
    findings: [],
  };
  steps.push(step6);
  onStepUpdate({ ...step6 });

  const step6Start = Date.now();
  try {
    const lastSync = deviceData.lastSyncDateTime ? new Date(String(deviceData.lastSyncDateTime)) : null;
    const enrolled = deviceData.enrolledDateTime ? new Date(String(deviceData.enrolledDateTime)) : null;
    const isEncrypted = deviceData.isEncrypted;
    const ownership = String(deviceData.managedDeviceOwnerType || "unknown");

    if (lastSync) {
      const hoursSinceSync = (Date.now() - lastSync.getTime()) / (1000 * 60 * 60);
      if (hoursSinceSync > 168) { // 7 days
        step6.status = "fail";
        step6.findings.push({ status: "fail", message: `Last sync: ${Math.round(hoursSinceSync / 24)} days ago — device may be offline or disconnected` });
      } else if (hoursSinceSync > 24) {
        step6.status = "warning";
        step6.findings.push({ status: "warning", message: `Last sync: ${Math.round(hoursSinceSync)} hours ago` });
      } else {
        step6.status = "pass";
        step6.findings.push({ status: "pass", message: `Last sync: ${Math.round(hoursSinceSync)} hour(s) ago — device is active` });
      }
    } else {
      step6.status = "warning";
      step6.findings.push({ status: "warning", message: "No last sync date available" });
    }

    if (enrolled) {
      step6.findings.push({ status: "info", message: `Enrolled: ${enrolled.toLocaleDateString()}` });
    }

    step6.findings.push({ status: "info", message: `Encryption: ${isEncrypted === true ? "Encrypted" : isEncrypted === false ? "NOT encrypted" : "Unknown"}` });
    step6.findings.push({ status: "info", message: `Ownership: ${ownership}` });
    step6.findings.push({ status: "info", message: `Management agent: ${deviceData.managementAgent || "Unknown"}` });

    step6.durationMs = Date.now() - step6Start;
    onStepUpdate({ ...step6 });
  } catch (err: unknown) {
    step6.status = "error";
    step6.error = err instanceof Error ? err.message : String(err);
    step6.durationMs = Date.now() - step6Start;
    onStepUpdate({ ...step6 });
  }

  // ─── Step 6b: Diagnostic Log Collection ──────────────────────

  const step6b: DiagnosticStep = {
    id: "diagnosticLogs",
    name: "Diagnostic Logs",
    description: "Checking for existing device diagnostic logs and requesting new collection",
    status: "running",
    findings: [],
  };
  steps.push(step6b);
  onStepUpdate({ ...step6b });

  const step6bStart = Date.now();
  try {
    // Check for existing log collection requests
    const existingLogs = await fetchWithPagination<Record<string, unknown>>(
      client,
      `https://graph.microsoft.com/beta/deviceManagement/managedDevices/${deviceId}/logCollectionRequests`,
      { maxItems: 5 }
    ).catch(() => ({ items: [] as Record<string, unknown>[], totalCount: 0 }));

    if (existingLogs.items.length > 0) {
      const latest = existingLogs.items[0];
      const status = String(latest.status || "unknown").toLowerCase();
      step6b.findings.push({
        status: status === "completed" ? "pass" : status === "pending" ? "info" : "warning",
        message: `Latest log collection: ${status} (${latest.requestedDateTimeUTC ? new Date(String(latest.requestedDateTimeUTC)).toLocaleString() : "unknown date"})`,
        details: { id: latest.id, status: latest.status, size: latest.sizeInKB ? `${latest.sizeInKB} KB` : "unknown" },
      });

      if (status === "completed") {
        step6b.status = "pass";
        step6b.findings.push({ status: "info", message: `Log size: ${latest.sizeInKB || "unknown"} KB — download available from Intune portal` });
      } else if (status === "pending") {
        step6b.status = "info";
        step6b.findings.push({ status: "info", message: "Log collection is in progress — device will upload logs on next check-in" });
      } else {
        step6b.status = "warning";
      }
    } else {
      step6b.status = "info";
      step6b.findings.push({
        status: "info",
        message: "No previous log collections found. You can request device logs from the troubleshooter or via the Intune portal.",
      });
    }

    // Offer to trigger new collection
    step6b.findings.push({
      status: "info",
      message: `To collect fresh logs, use: POST /api/diagnostic-logs/collect with deviceId: ${deviceId}`,
    });

    step6b.durationMs = Date.now() - step6bStart;
    onStepUpdate({ ...step6b });
  } catch (err: unknown) {
    step6b.status = "info";
    step6b.findings.push({
      status: "info",
      message: "Diagnostic log collection API not available — ensure DeviceManagementManagedDevices.ReadWrite.All permission is granted",
    });
    step6b.durationMs = Date.now() - step6bStart;
    onStepUpdate({ ...step6b });
  }

  // ─── Step 7: AI Root Cause Analysis ──────────────────────────

  const step7: DiagnosticStep = {
    id: "diagnosis",
    name: "AI Root Cause Analysis",
    description: "Analyzing findings to determine root cause and recommended actions",
    status: "running",
    findings: [],
  };
  steps.push(step7);
  onStepUpdate({ ...step7 });

  const step7Start = Date.now();
  let diagnosis = "";
  let recommendedActions: string[] = [];

  try {
    const findingsSummary = steps
      .filter((s) => s.id !== "diagnosis")
      .map((s) => {
        const findings = s.findings.map((f) => `  [${f.status.toUpperCase()}] ${f.message}`).join("\n");
        return `${s.name} (${s.status}):\n${findings}`;
      })
      .join("\n\n");

    const openai = new AzureOpenAI({
      apiKey: config.azureOpenAI.apiKey,
      endpoint: config.azureOpenAI.endpoint,
      deployment: config.azureOpenAI.deployment,
      apiVersion: config.azureOpenAI.apiVersion,
    });

    const aiPrompt = `You are an expert Intune troubleshooting analyst. A user reported an issue with a device and an automated diagnostic chain was run.

Device: ${deviceName} (${deviceData.operatingSystem} ${deviceData.osVersion})
User: ${deviceData.userPrincipalName}
Problem reported: "${problem}"

Diagnostic Results:
${findingsSummary}

Provide:
1. A root cause analysis (2-3 paragraphs) explaining the most likely cause of the reported problem based on the diagnostic findings.
2. A numbered list of 3-5 specific, actionable recommended steps to fix the issue.

Format your response as JSON:
{
  "diagnosis": "Your root cause analysis text",
  "recommendedActions": ["Action 1", "Action 2", "Action 3"]
}

Return ONLY the JSON, no markdown fences.`;

    const completion = await openai.chat.completions.create({
      model: config.azureOpenAI.deployment,
      messages: [{ role: "user", content: aiPrompt }],
      max_completion_tokens: 800,
    });

    const content = completion.choices[0]?.message?.content || "";
    const cleaned = content.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim();

    try {
      const parsed = JSON.parse(cleaned);
      diagnosis = parsed.diagnosis || "Unable to determine root cause.";
      recommendedActions = parsed.recommendedActions || [];
    } catch {
      // If JSON parse fails, use the raw text
      diagnosis = content;
      recommendedActions = ["Review the diagnostic findings above", "Contact your Intune administrator"];
    }

    step7.status = "pass";
    step7.findings.push({ status: "info", message: "Root cause analysis complete" });
    step7.durationMs = Date.now() - step7Start;
    onStepUpdate({ ...step7 });
  } catch (err: unknown) {
    step7.status = "error";
    step7.error = err instanceof Error ? err.message : String(err);
    step7.durationMs = Date.now() - step7Start;
    onStepUpdate({ ...step7 });

    // Fallback diagnosis
    diagnosis = buildFallbackDiagnosis(steps, problem);
    recommendedActions = ["Review the diagnostic findings above", "Try syncing the device manually", "Check Intune admin console for more details"];
  }

  return buildResult(deviceName, deviceId, problem, startTime, steps, diagnosis, recommendedActions);
}

function buildResult(
  deviceName: string,
  deviceId: string,
  problem: string,
  startTime: number,
  steps: DiagnosticStep[],
  diagnosis: string,
  recommendedActions: string[]
): DiagnosticResult {
  return {
    deviceName,
    deviceId,
    problem,
    startedAt: new Date(startTime).toISOString(),
    completedAt: new Date().toISOString(),
    totalDurationMs: Date.now() - startTime,
    steps,
    diagnosis,
    recommendedActions,
  };
}

function buildFallbackDiagnosis(steps: DiagnosticStep[], problem: string): string {
  const failures = steps.filter((s) => s.status === "fail");
  const warnings = steps.filter((s) => s.status === "warning");

  if (failures.length === 0 && warnings.length === 0) {
    return `All diagnostic checks passed for the reported issue: "${problem}". The device appears to be in good health. The issue may be transient or related to factors not covered by automated diagnostics.`;
  }

  const parts = [];
  if (failures.length > 0) {
    parts.push(`${failures.length} check(s) failed: ${failures.map((f) => f.name).join(", ")}.`);
  }
  if (warnings.length > 0) {
    parts.push(`${warnings.length} warning(s) detected: ${warnings.map((w) => w.name).join(", ")}.`);
  }

  return `Regarding "${problem}": ${parts.join(" ")} Review the detailed findings for each step above to identify the root cause.`;
}
