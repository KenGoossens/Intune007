import { getGraphClient, fetchWithPagination } from "./client.js";
import type { ManagedDeviceInfo } from "@intune-agent/shared";
import { isCacheWarm, queryDevices, getCachedDevice, refreshDevice } from "../cache/deviceCache.js";

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
 * Reads from local cache when available (zero API calls).
 * Falls back to live Graph API if cache is not warm.
 */
export async function getManagedDevices(options?: {
  filter?: string;
  top?: number;
  select?: string;
}): Promise<{ items: ManagedDeviceInfo[]; totalCount: number }> {
  // Use cache if warm — zero API calls
  if (isCacheWarm()) {
    const cached = queryDevices({
      filter: options?.filter,
      top: options?.top,
    });
    return {
      items: cached.items as unknown as ManagedDeviceInfo[],
      totalCount: cached.totalCount,
    };
  }

  // Fallback to live API (first run before cache is populated)
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
 * Reads from cache first, falls back to live API.
 */
export async function getDeviceDetails(
  deviceId: string
): Promise<ManagedDeviceInfo> {
  // Try cache first
  if (isCacheWarm()) {
    const cached = await getCachedDevice(deviceId);
    if (cached) return cached as unknown as ManagedDeviceInfo;
  }

  const client = getGraphClient();
  const device = await client
    .api(`${BETA_BASE}/deviceManagement/managedDevices/${deviceId}`)
    .select(DEVICE_SELECT_FIELDS)
    .get();
  return device as ManagedDeviceInfo;
}

/**
 * Force-refresh a device from Graph API, updating the local cache.
 * Use after device actions (sync, restart) where fresh data is needed.
 */
export async function forceRefreshDevice(deviceId: string): Promise<ManagedDeviceInfo> {
  const device = await refreshDevice(deviceId);
  return device as unknown as ManagedDeviceInfo;
}
