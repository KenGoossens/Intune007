/**
 * Security — Defender for Endpoint, security alerts, and threat intelligence
 * via Microsoft Graph API.
 *
 * Surfaces security posture data alongside Intune device management for
 * a unified view of device health and risk.
 *
 * Graph API Reference:
 *   https://learn.microsoft.com/en-us/graph/api/resources/security-api-overview
 *
 * Required Permissions:
 *   SecurityEvents.Read.All                    (security alerts)
 *   BitlockerKey.Read.All                      (BitLocker recovery keys)
 *   DeviceManagementManagedDevices.Read.All     (device info)
 */

import { getGraphClient, fetchWithPagination } from "./client.js";
import { sanitizeOData } from "../security.js";

const BETA_BASE = "https://graph.microsoft.com/beta";

const ALERT_SELECT_FIELDS = [
  "id",
  "title",
  "severity",
  "status",
  "category",
  "description",
  "createdDateTime",
  "lastUpdateDateTime",
].join(",");

export interface SecurityAlertInfo {
  id: string;
  title: string;
  severity: string;
  status: string;
  category: string;
  description: string;
  createdDateTime: string;
  lastUpdateDateTime: string;
}

export interface BitLockerKeyInfo {
  id: string;
  createdDateTime: string;
  deviceId: string;
  volumeType: string;
  key?: string;
}

/**
 * Get security alerts from Microsoft 365 Defender / Security Center.
 * Uses the unified /security/alerts_v2 endpoint.
 */
export async function getSecurityAlerts(options?: {
  filter?: string;
  top?: number;
}): Promise<{ items: SecurityAlertInfo[]; totalCount: number }> {
  const client = getGraphClient();
  return fetchWithPagination<SecurityAlertInfo>(
    client,
    "/security/alerts_v2",
    {
      filter: options?.filter,
      select: ALERT_SELECT_FIELDS,
      top: options?.top,
      orderby: "createdDateTime desc",
    }
  );
}

/**
 * Get BitLocker recovery keys for a specific device or all devices.
 * Note: The actual key value requires BitlockerKey.ReadBasic.All + specific call.
 */
export async function getBitLockerKeys(options?: {
  deviceId?: string;
  top?: number;
}): Promise<{ items: BitLockerKeyInfo[]; totalCount: number }> {
  const client = getGraphClient();
  const filter = options?.deviceId
    ? `deviceId eq '${sanitizeOData(options.deviceId)}'`
    : undefined;

  return fetchWithPagination<BitLockerKeyInfo>(
    client,
    "/informationProtection/bitlocker/recoveryKeys",
    {
      filter,
      select: "id,createdDateTime,deviceId,volumeType",
      top: options?.top,
    }
  );
}

/**
 * Get the full BitLocker recovery key value by key ID.
 * Requires BitlockerKey.Read.All permission.
 */
export async function getBitLockerKeyValue(
  keyId: string
): Promise<BitLockerKeyInfo> {
  const client = getGraphClient();
  const result = await client
    .api(`/informationProtection/bitlocker/recoveryKeys/${keyId}`)
    .query({ "$select": "id,createdDateTime,deviceId,volumeType,key" })
    .get();
  return result as BitLockerKeyInfo;
}

/**
 * Get device threat summary using Defender's managed device overview.
 * Uses beta endpoint for richer threat data.
 */
export async function getDeviceThreatSummary(): Promise<Record<string, unknown>> {
  const client = getGraphClient();
  try {
    const result = await client
      .api(`${BETA_BASE}/deviceManagement/managedDeviceOverview`)
      .get();
    return {
      totalDevices: result.enrolledDeviceCount,
      mdmEnrolled: result.mdmEnrolledCount,
      dualEnrolled: result.dualEnrolledDeviceCount,
      deviceOperatingSystemSummary: result.deviceOperatingSystemSummary,
      deviceExchangeAccessStateSummary: result.deviceExchangeAccessStateSummary,
      lastModifiedDateTime: result.lastModifiedDateTime,
    };
  } catch {
    return { error: "Unable to retrieve device threat summary" };
  }
}
