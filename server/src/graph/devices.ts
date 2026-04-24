import { getGraphClient, fetchWithPagination } from "./client.js";
import type { ManagedDeviceInfo } from "@intune-agent/shared";

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
].join(",");

/**
 * List managed devices with optional OData filtering.
 * Always returns all display-relevant fields regardless of LLM select parameter.
 */
export async function getManagedDevices(options?: {
  filter?: string;
  top?: number;
  select?: string;
}): Promise<{ items: ManagedDeviceInfo[]; totalCount: number }> {
  const client = getGraphClient();
  return fetchWithPagination<ManagedDeviceInfo>(
    client,
    "/deviceManagement/managedDevices",
    {
      filter: options?.filter,
      select: DEVICE_SELECT_FIELDS, // Always use full fields for data panel display
      top: options?.top,
    }
  );
}

/**
 * Get a single managed device by ID.
 */
export async function getDeviceDetails(
  deviceId: string
): Promise<ManagedDeviceInfo> {
  const client = getGraphClient();
  const device = await client
    .api(`/deviceManagement/managedDevices/${deviceId}`)
    .select(DEVICE_SELECT_FIELDS)
    .get();
  return device as ManagedDeviceInfo;
}
