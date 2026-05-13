/**
 * Policy Management — Create, update, and assign policies via Microsoft Graph API.
 *
 * Enables the agent to take write actions on Intune compliance policies,
 * configuration profiles, and Conditional Access policies.
 *
 * Graph API Reference:
 *   https://learn.microsoft.com/en-us/graph/api/resources/intune-deviceconfig-devicecompliancepolicy
 *   https://learn.microsoft.com/en-us/graph/api/resources/conditionalaccesspolicy
 *
 * Required Permissions:
 *   DeviceManagementConfiguration.ReadWrite.All   (compliance/config policies)
 *   Policy.ReadWrite.ConditionalAccess            (CA policies)
 */

import { getGraphClient, fetchWithPagination } from "./client.js";

/**
 * Create a compliance policy.
 *
 * The body must include the @odata.type for the platform-specific policy type.
 * Example types:
 *   #microsoft.graph.windows10CompliancePolicy
 *   #microsoft.graph.iosCompliancePolicy
 *   #microsoft.graph.androidCompliancePolicy
 */
export async function createCompliancePolicy(
  body: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const client = getGraphClient();
  return client
    .api("/deviceManagement/deviceCompliancePolicies")
    .post(body);
}

/**
 * Assign a compliance policy to one or more groups.
 */
export async function assignCompliancePolicy(
  policyId: string,
  groupIds: string[]
): Promise<void> {
  const client = getGraphClient();
  const assignments = groupIds.map((gid) => ({
    target: {
      "@odata.type": "#microsoft.graph.groupAssignmentTarget",
      groupId: gid,
    },
  }));

  await client
    .api(`/deviceManagement/deviceCompliancePolicies/${policyId}/assign`)
    .post({ assignments });
}

/**
 * Create a device configuration profile.
 *
 * The body must include the @odata.type for the platform-specific config type.
 */
export async function createConfigurationProfile(
  body: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const client = getGraphClient();
  return client
    .api("/deviceManagement/deviceConfigurations")
    .post(body);
}

/**
 * Assign a configuration profile to one or more groups.
 */
export async function assignConfigurationProfile(
  profileId: string,
  groupIds: string[]
): Promise<void> {
  const client = getGraphClient();
  const assignments = groupIds.map((gid) => ({
    target: {
      "@odata.type": "#microsoft.graph.groupAssignmentTarget",
      groupId: gid,
    },
  }));

  await client
    .api(`/deviceManagement/deviceConfigurations/${profileId}/assign`)
    .post({ deviceConfigurationGroupAssignments: assignments });
}

/**
 * Update a Conditional Access policy (e.g., enable/disable).
 */
export async function updateConditionalAccessPolicy(
  policyId: string,
  updates: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const client = getGraphClient();
  await client
    .api(`/identity/conditionalAccess/policies/${policyId}`)
    .patch(updates);
  return {
    success: true,
    policyId,
    message: "Conditional Access policy updated successfully.",
    updates,
  };
}

const BETA_BASE = "https://graph.microsoft.com/beta";

/**
 * Get all policies (compliance, configuration, app, remediation) assigned to a group.
 * Queries each policy type's assignments and filters by the target groupId.
 */
export async function getPoliciesAssignedToGroup(
  groupId: string
): Promise<{ items: Record<string, unknown>[]; totalCount: number }> {
  const client = getGraphClient();
  const assigned: Record<string, unknown>[] = [];

  // 1. Compliance policies
  const compliance = await fetchWithPagination<Record<string, unknown>>(
    client,
    `${BETA_BASE}/deviceManagement/deviceCompliancePolicies`,
    { select: "id,displayName", maxItems: 200 }
  );
  for (const policy of compliance.items) {
    try {
      const resp = await client
        .api(`${BETA_BASE}/deviceManagement/deviceCompliancePolicies/${policy.id}/assignments`)
        .get();
      const assignments = resp.value || [];
      if (assignments.some((a: Record<string, unknown>) =>
        (a.target as Record<string, unknown>)?.groupId === groupId
      )) {
        assigned.push({ ...policy, policyType: "compliance" });
      }
    } catch { /* permission or 404 — skip */ }
  }

  // 2. Device configuration profiles
  const configs = await fetchWithPagination<Record<string, unknown>>(
    client,
    `${BETA_BASE}/deviceManagement/deviceConfigurations`,
    { select: "id,displayName", maxItems: 200 }
  );
  for (const profile of configs.items) {
    try {
      const resp = await client
        .api(`${BETA_BASE}/deviceManagement/deviceConfigurations/${profile.id}/assignments`)
        .get();
      const assignments = resp.value || [];
      if (assignments.some((a: Record<string, unknown>) =>
        (a.target as Record<string, unknown>)?.groupId === groupId
      )) {
        assigned.push({ ...profile, policyType: "configuration" });
      }
    } catch { /* skip */ }
  }

  // 3. Device health scripts (Proactive Remediations)
  const healthScripts = await fetchWithPagination<Record<string, unknown>>(
    client,
    `${BETA_BASE}/deviceManagement/deviceHealthScripts`,
    { select: "id,displayName", maxItems: 200 }
  );
  for (const script of healthScripts.items) {
    try {
      const resp = await client
        .api(`${BETA_BASE}/deviceManagement/deviceHealthScripts/${script.id}/assignments`)
        .get();
      const assignments = resp.value || [];
      if (assignments.some((a: Record<string, unknown>) =>
        (a.target as Record<string, unknown>)?.groupId === groupId
      )) {
        assigned.push({ ...script, policyType: "remediation" });
      }
    } catch { /* skip */ }
  }

  // 4. App protection policies (MAM)
  try {
    const appProtection = await fetchWithPagination<Record<string, unknown>>(
      client,
      `${BETA_BASE}/deviceAppManagement/managedAppPolicies`,
      { select: "id,displayName", maxItems: 200 }
    );
    for (const policy of appProtection.items) {
      try {
        const resp = await client
          .api(`${BETA_BASE}/deviceAppManagement/managedAppPolicies/${policy.id}/assignments`)
          .get();
        const assignments = resp.value || [];
        if (assignments.some((a: Record<string, unknown>) =>
          (a.target as Record<string, unknown>)?.groupId === groupId
        )) {
          assigned.push({ ...policy, policyType: "appProtection" });
        }
      } catch { /* skip */ }
    }
  } catch { /* skip if MAM not available */ }

  // 5. Conditional Access policies (check conditions.users.includeGroups)
  try {
    const caPolicies = await fetchWithPagination<Record<string, unknown>>(
      client,
      "/identity/conditionalAccess/policies",
      { maxItems: 200 }
    );
    for (const ca of caPolicies.items) {
      const conditions = ca.conditions as Record<string, unknown> | undefined;
      const users = conditions?.users as Record<string, unknown> | undefined;
      const includeGroups = (users?.includeGroups as string[]) || [];
      const excludeGroups = (users?.excludeGroups as string[]) || [];
      if (includeGroups.includes(groupId) || excludeGroups.includes(groupId)) {
        assigned.push({
          id: ca.id,
          displayName: ca.displayName,
          state: ca.state,
          policyType: "conditionalAccess",
          targetType: includeGroups.includes(groupId) ? "include" : "exclude",
        });
      }
    }
  } catch { /* skip */ }

  return { items: assigned, totalCount: assigned.length };
}

/**
 * Get all policies assigned to a specific device.
 * Uses the device's configuration states and compliance policy states.
 * Deduplicates by policy display name and enriches with version/state info.
 */
export async function getPoliciesAssignedToDevice(
  deviceId: string
): Promise<{ items: Record<string, unknown>[]; totalCount: number }> {
  const client = getGraphClient();
  const policyMap = new Map<string, Record<string, unknown>>();

  // 1. Configuration profile states — shows which configs are applied to the device
  try {
    const configStates = await fetchWithPagination<Record<string, unknown>>(
      client,
      `${BETA_BASE}/deviceManagement/managedDevices/${deviceId}/deviceConfigurationStates`,
      { maxItems: 200 }
    );
    for (const state of configStates.items) {
      const name = String(state.displayName || "Unknown");
      const key = `config:${name}`;
      if (!policyMap.has(key)) {
        policyMap.set(key, {
          displayName: name,
          policyType: "Configuration Profile",
          state: state.state || "unknown",
          version: state.version || null,
          platformType: state.platformType || null,
          settingCount: state.settingCount || 0,
          lastReportedDateTime: state.lastReportedDateTime || null,
          id: state.id || null,
        });
      }
    }
  } catch { /* skip */ }

  // 2. Compliance policy states
  try {
    const complianceStates = await fetchWithPagination<Record<string, unknown>>(
      client,
      `${BETA_BASE}/deviceManagement/managedDevices/${deviceId}/deviceCompliancePolicyStates`,
      { maxItems: 200 }
    );
    for (const state of complianceStates.items) {
      const name = String(state.displayName || "Unknown");
      const key = `compliance:${name}`;
      if (!policyMap.has(key)) {
        policyMap.set(key, {
          displayName: name,
          policyType: "Compliance Policy",
          state: state.state || "unknown",
          version: state.version || null,
          platformType: state.platformType || null,
          settingCount: state.settingCount || 0,
          lastReportedDateTime: state.lastReportedDateTime || null,
          id: state.id || null,
        });
      }
    }
  } catch { /* skip */ }

  const policies = Array.from(policyMap.values());
  return { items: policies, totalCount: policies.length };
}
