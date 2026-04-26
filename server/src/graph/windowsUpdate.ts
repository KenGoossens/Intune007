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
 * Get the software update compliance summary.
 * 
 * The softwareUpdateStatusSummary endpoint only returns data when Windows Update
 * for Business policies are actively assigned and devices have reported. 
 * So we also compute compliance from actual device data as a fallback.
 */
export async function getUpdateComplianceSummary(): Promise<Record<string, unknown>> {
  const client = getGraphClient();

  // Try the official summary first
  let officialSummary: Record<string, unknown> = {};
  try {
    const result = await client
      .api(`${BETA_BASE}/deviceManagement/softwareUpdateStatusSummary`)
      .get();
    officialSummary = {
      compliantDeviceCount: result.compliantDeviceCount ?? 0,
      nonCompliantDeviceCount: result.nonCompliantDeviceCount ?? 0,
      errorDeviceCount: result.errorDeviceCount ?? 0,
      conflictDeviceCount: result.conflictDeviceCount ?? 0,
      unknownDeviceCount: result.unknownDeviceCount ?? 0,
      notApplicableDeviceCount: result.notApplicableDeviceCount ?? 0,
    };
  } catch { /* skip */ }

  // Check if official summary has any real data
  const officialTotal = Object.values(officialSummary).reduce<number>(
    (sum, v) => sum + (typeof v === "number" ? v : 0), 0
  );

  if (officialTotal > 0) {
    return { source: "windowsUpdateForBusiness", ...officialSummary };
  }

  // Fallback: compute from actual device OS versions
  const devices = await fetchWithPagination<Record<string, unknown>>(
    client,
    `${BETA_BASE}/deviceManagement/managedDevices`,
    {
      select: "id,deviceName,operatingSystem,osVersion,lastSyncDateTime,complianceState,userPrincipalName",
      maxItems: 500,
      filter: "operatingSystem eq 'Windows'",
    }
  );

  // Group by OS version to find the most current
  const versionCounts = new Map<string, number>();
  for (const d of devices.items) {
    const ver = String(d.osVersion || "unknown");
    versionCounts.set(ver, (versionCounts.get(ver) || 0) + 1);
  }

  // Sort versions to find the latest (highest build number)
  const sortedVersions = Array.from(versionCounts.entries())
    .sort((a, b) => b[0].localeCompare(a[0]));

  const latestVersion = sortedVersions.length > 0 ? sortedVersions[0][0] : "unknown";
  const onLatest = devices.items.filter((d) => String(d.osVersion) === latestVersion).length;
  const notOnLatest = devices.items.length - onLatest;

  // Identify devices with stale OS versions (more than 2 versions behind)
  const staleVersions = sortedVersions.slice(3); // anything beyond 3rd newest
  const staleDevices = devices.items.filter((d) =>
    staleVersions.some(([v]) => String(d.osVersion) === v)
  );

  return {
    source: "computed_from_devices",
    totalWindowsDevices: devices.items.length,
    latestOsVersion: latestVersion,
    devicesOnLatest: onLatest,
    devicesNotOnLatest: notOnLatest,
    devicesOnStaleVersions: staleDevices.length,
    compliantDeviceCount: onLatest,
    nonCompliantDeviceCount: notOnLatest,
    errorDeviceCount: 0,
    conflictDeviceCount: 0,
    unknownDeviceCount: 0,
    notApplicableDeviceCount: 0,
    versionDistribution: sortedVersions.map(([version, count]) => ({
      version,
      count,
      isCurrent: version === latestVersion,
    })),
    devices: devices.items.map((d) => ({
      deviceName: d.deviceName,
      userPrincipalName: d.userPrincipalName,
      osVersion: d.osVersion,
      complianceState: d.complianceState,
      lastSyncDateTime: d.lastSyncDateTime,
      updateStatus: String(d.osVersion) === latestVersion ? "Current" : "Behind",
    })),
  };
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
