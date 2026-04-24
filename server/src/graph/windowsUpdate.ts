/**
 * Windows Update — Update ring management and compliance via Microsoft Graph API.
 *
 * Provides visibility into Windows Update deployment rings, update compliance
 * status, and the ability to expedite security updates.
 *
 * Graph API Reference:
 *   https://learn.microsoft.com/en-us/graph/api/resources/windowsupdateforbusinessconfiguration
 *
 * Required Permissions:
 *   DeviceManagementConfiguration.Read.All       (read update configs)
 *   DeviceManagementConfiguration.ReadWrite.All   (expedite updates)
 */

import { getGraphClient, fetchWithPagination } from "./client.js";

const BETA_BASE = "https://graph.microsoft.com/beta";

/**
 * List Windows Update for Business configuration profiles (update rings).
 */
export async function getUpdateRings(options?: {
  filter?: string;
  top?: number;
}): Promise<{ items: Record<string, unknown>[]; totalCount: number }> {
  const client = getGraphClient();
  return fetchWithPagination<Record<string, unknown>>(
    client,
    `${BETA_BASE}/deviceManagement/deviceConfigurations`,
    {
      filter: options?.filter
        ? `${options.filter} and isof('microsoft.graph.windowsUpdateForBusinessConfiguration')`
        : "isof('microsoft.graph.windowsUpdateForBusinessConfiguration')",
      select: [
        "id",
        "displayName",
        "description",
        "deliveryOptimizationMode",
        "qualityUpdatesDeferralPeriodInDays",
        "featureUpdatesDeferralPeriodInDays",
        "automaticUpdateMode",
        "createdDateTime",
        "lastModifiedDateTime",
      ].join(","),
      top: options?.top,
    }
  );
}

/**
 * Get the software update status summary across all devices.
 */
export async function getUpdateComplianceSummary(): Promise<Record<string, unknown>> {
  const client = getGraphClient();
  try {
    const result = await client
      .api(`${BETA_BASE}/deviceManagement/softwareUpdateStatusSummary`)
      .get();
    return {
      compliantDeviceCount: result.compliantDeviceCount,
      nonCompliantDeviceCount: result.nonCompliantDeviceCount,
      errorDeviceCount: result.errorDeviceCount,
      conflictDeviceCount: result.conflictDeviceCount,
      unknownDeviceCount: result.unknownDeviceCount,
      notApplicableDeviceCount: result.notApplicableDeviceCount,
      compliantUserCount: result.compliantUserCount,
      nonCompliantUserCount: result.nonCompliantUserCount,
      displayName: result.displayName,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: `Unable to retrieve update compliance summary: ${msg}` };
  }
}

/**
 * Get Windows quality update policies (for expediting updates).
 */
export async function getQualityUpdatePolicies(options?: {
  top?: number;
}): Promise<{ items: Record<string, unknown>[]; totalCount: number }> {
  const client = getGraphClient();
  return fetchWithPagination<Record<string, unknown>>(
    client,
    `${BETA_BASE}/deviceManagement/windowsQualityUpdatePolicies`,
    {
      top: options?.top,
    }
  );
}
