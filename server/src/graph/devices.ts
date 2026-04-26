import { getGraphClient, fetchWithPagination } from "./client.js";
import type { ManagedDeviceInfo } from "@intune-agent/shared";

const BETA_BASE = "https://graph.microsoft.com/beta";

// Beta API exposes richer device fields than v1.0
const DEVICE_SELECT_FIELDS = [
  "id",
  "deviceName",
  "operatingSystem",
  "osVersion",
  "complianceState",
  "managementAgent",
  "managedDeviceOwnerType",
  "enrolledDateTime",
  "lastSyncDateTime",
  "userPrincipalName",
  "model",
  "manufacturer",
  "serialNumber",
  "isEncrypted",
  "joinType",
  "skuFamily",
  "totalStorageSpaceInBytes",
  "freeStorageSpaceInBytes",
  "autopilotEnrolled",
  "azureADDeviceId",
].join(",");

/**
 * List managed devices with optional OData filtering.
 * Uses beta API for richer device data (encryption, storage, join type, Autopilot).
 */
export async function getManagedDevices(options?: {
  filter?: string;
  top?: number;
  select?: string;
}): Promise<{ items: ManagedDeviceInfo[]; totalCount: number }> {
  const client = getGraphClient();
  return fetchWithPagination<ManagedDeviceInfo>(
    client,
    `${BETA_BASE}/deviceManagement/managedDevices`,
    {
      filter: options?.filter,
      select: DEVICE_SELECT_FIELDS,
      top: options?.top,
    }
  );
}

/**
 * Get a single managed device by ID with full details.
 * Uses beta API for complete device information.
 */
export async function getDeviceDetails(
  deviceId: string
): Promise<ManagedDeviceInfo> {
  const client = getGraphClient();
  const device = await client
    .api(`${BETA_BASE}/deviceManagement/managedDevices/${deviceId}`)
    .select(DEVICE_SELECT_FIELDS)
    .get();
  return device as ManagedDeviceInfo;
}
