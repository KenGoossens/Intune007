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

import { getGraphClient } from "./client.js";

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
