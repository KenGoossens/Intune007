import { getGraphClient, fetchWithPagination } from "./client.js";

// Beta endpoints require the full URL since the SDK defaults to v1.0
const BETA_BASE = "https://graph.microsoft.com/beta";

/**
 * List existing Proactive Remediation scripts (deviceHealthScripts).
 * Beta-only endpoint.
 */
export async function listRemediationScripts(options?: {
  filter?: string;
  top?: number;
}): Promise<{ items: Record<string, unknown>[]; totalCount: number }> {
  const client = getGraphClient();
  return fetchWithPagination<Record<string, unknown>>(
    client,
    `${BETA_BASE}/deviceManagement/deviceHealthScripts`,
    {
      filter: options?.filter,
      select:
        "id,displayName,description,publisher,runAsAccount,enforceSignatureCheck,runAs32Bit,createdDateTime,lastModifiedDateTime",
      top: options?.top,
    }
  );
}

/**
 * Get a single Proactive Remediation script by ID.
 */
export async function getRemediationScript(
  scriptId: string
): Promise<Record<string, unknown>> {
  const client = getGraphClient();
  return client
    .api(`${BETA_BASE}/deviceManagement/deviceHealthScripts/${scriptId}`)
    .get();
}

/**
 * Get the device run states for a Proactive Remediation script.
 */
export async function getRemediationScriptDeviceStates(
  scriptId: string,
  options?: { top?: number }
): Promise<{ items: Record<string, unknown>[]; totalCount: number }> {
  const client = getGraphClient();
  return fetchWithPagination<Record<string, unknown>>(
    client,
    `${BETA_BASE}/deviceManagement/deviceHealthScripts/${scriptId}/deviceRunStates`,
    { top: options?.top }
  );
}

/**
 * Create a new Proactive Remediation script (deviceHealthScript).
 * 
 * Both detectionScriptContent and remediationScriptContent must be
 * Base64-encoded PowerShell scripts.
 */
export async function createRemediationScript(params: {
  displayName: string;
  description: string;
  detectionScriptContent: string;  // Base64-encoded
  remediationScriptContent: string; // Base64-encoded
  runAsAccount: "system" | "user";
  enforceSignatureCheck: boolean;
  runAs32Bit: boolean;
  roleScopeTagIds?: string[];
}): Promise<Record<string, unknown>> {
  const client = getGraphClient();

  const body = {
    displayName: params.displayName,
    description: params.description,
    publisher: "Intune007 Agent",
    detectionScriptContent: params.detectionScriptContent,
    remediationScriptContent: params.remediationScriptContent,
    runAsAccount: params.runAsAccount,
    enforceSignatureCheck: params.enforceSignatureCheck,
    runAs32Bit: params.runAs32Bit,
    roleScopeTagIds: params.roleScopeTagIds || ["0"],
  };

  return client
    .api(`${BETA_BASE}/deviceManagement/deviceHealthScripts`)
    .post(body);
}

/**
 * Assign a Proactive Remediation script to a group.
 */
export async function assignRemediationScript(
  scriptId: string,
  groupId: string,
  schedule?: {
    intervalInMinutes?: number;
  }
): Promise<void> {
  const client = getGraphClient();

  const body = {
    deviceHealthScriptAssignments: [
      {
        target: {
          "@odata.type": "#microsoft.graph.groupAssignmentTarget",
          groupId: groupId,
        },
        runRemediationScript: true,
        runSchedule: schedule?.intervalInMinutes
          ? {
              "@odata.type": "#microsoft.graph.deviceHealthScriptRunSchedule",
              interval: schedule.intervalInMinutes,
            }
          : {
              "@odata.type":
                "#microsoft.graph.deviceHealthScriptDailySchedule",
              interval: 1,
              time: "01:00:00",
              useUtc: true,
            },
      },
    ],
  };

  await client
    .api(
      `${BETA_BASE}/deviceManagement/deviceHealthScripts/${scriptId}/assign`
    )
    .post(body);
}

/**
 * Delete a Proactive Remediation script.
 * DELETE /deviceManagement/deviceHealthScripts/{id}
 */
export async function deleteRemediationScript(scriptId: string): Promise<void> {
  const client = getGraphClient();
  await client
    .api(`${BETA_BASE}/deviceManagement/deviceHealthScripts/${scriptId}`)
    .delete();
}

/**
 * Update a Proactive Remediation script's detection and/or remediation scripts.
 * PATCH /deviceManagement/deviceHealthScripts/{id}
 * Scripts must be Base64-encoded.
 */
export async function updateRemediationScript(
  scriptId: string,
  params: {
    displayName?: string;
    description?: string;
    detectionScriptContent?: string;
    remediationScriptContent?: string;
    runAsAccount?: "system" | "user";
  }
): Promise<Record<string, unknown>> {
  const client = getGraphClient();

  const body: Record<string, unknown> = {};
  if (params.displayName) body.displayName = params.displayName;
  if (params.description !== undefined) body.description = params.description;
  if (params.detectionScriptContent) body.detectionScriptContent = params.detectionScriptContent;
  if (params.remediationScriptContent) body.remediationScriptContent = params.remediationScriptContent;
  if (params.runAsAccount) body.runAsAccount = params.runAsAccount;

  return client
    .api(`${BETA_BASE}/deviceManagement/deviceHealthScripts/${scriptId}`)
    .patch(body);
}
