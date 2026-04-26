/**
 * Device Diagnostic Logs — Collect Intune diagnostic logs from managed devices.
 *
 * Uses the beta Graph API to trigger log collection on a device,
 * poll for completion, and retrieve the download URL.
 *
 * Flow:
 *   1. POST .../createDeviceLogCollectionRequest → triggers log collection
 *   2. GET  .../logCollectionRequests → poll status (pending → completed)
 *   3. POST .../logCollectionRequests/{id}/createDownloadUrl → get ZIP URL
 *
 * Logs collected: Intune Management Extension logs, event logs, registry data.
 * The device must be online and syncing for collection to succeed.
 *
 * Required Permission: DeviceManagementManagedDevices.ReadWrite.All
 *
 * Graph API Reference:
 *   https://learn.microsoft.com/en-us/graph/api/intune-devices-manageddevice-createdevicelogcollectionrequest
 */

import { getGraphClient, fetchWithPagination } from "./client.js";

const BETA_BASE = "https://graph.microsoft.com/beta";

export interface LogCollectionRequest {
  id: string;
  status: "pending" | "completed" | "failed" | "unknownFutureValue";
  managedDeviceId: string;
  errorCode: number;
  requestedDateTimeUTC: string;
  receivedDateTimeUTC: string | null;
  initiatedByUserPrincipalName: string;
  expirationDateTimeUTC: string | null;
  size: number;
  sizeInKB: number;
}

/**
 * Trigger diagnostic log collection on a managed device.
 * The device must be online — logs are collected on next check-in.
 */
export async function requestDeviceLogs(
  deviceId: string
): Promise<LogCollectionRequest> {
  const client = getGraphClient();

  const result = await client
    .api(`${BETA_BASE}/deviceManagement/managedDevices/${deviceId}/createDeviceLogCollectionRequest`)
    .post({
      templateType: {
        "@odata.type": "microsoft.graph.deviceLogCollectionRequest",
      },
    });

  return result as LogCollectionRequest;
}

/**
 * List all log collection requests for a device.
 */
export async function getLogCollectionRequests(
  deviceId: string
): Promise<{ items: LogCollectionRequest[]; totalCount: number }> {
  const client = getGraphClient();
  return fetchWithPagination<LogCollectionRequest>(
    client,
    `${BETA_BASE}/deviceManagement/managedDevices/${deviceId}/logCollectionRequests`,
    { maxItems: 20 }
  );
}

/**
 * Get the download URL for a completed log collection.
 */
export async function getLogDownloadUrl(
  deviceId: string,
  logCollectionId: string
): Promise<string> {
  const client = getGraphClient();

  const result = await client
    .api(
      `${BETA_BASE}/deviceManagement/managedDevices/${deviceId}/logCollectionRequests/${logCollectionId}/createDownloadUrl`
    )
    .post({});

  return result.value as string;
}
