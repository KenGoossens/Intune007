import { getGraphClient, fetchWithPagination } from "./client.js";
import type { MobileAppInfo } from "@intune-agent/shared";

const BETA_BASE = "https://graph.microsoft.com/beta";

/**
 * List mobile apps managed in Intune.
 * Uses beta API for richer app type information.
 */
export async function getMobileApps(options?: {
  filter?: string;
  top?: number;
}): Promise<{ items: MobileAppInfo[]; totalCount: number }> {
  const client = getGraphClient();
  return fetchWithPagination<MobileAppInfo>(
    client,
    `${BETA_BASE}/deviceAppManagement/mobileApps`,
    {
      filter: options?.filter,
      select:
        "id,displayName,description,publisher,createdDateTime,lastModifiedDateTime",
      top: options?.top,
    }
  );
}

/**
 * Get install status for a specific app across devices.
 * Uses beta for richer status details.
 */
export async function getAppInstallStatus(
  appId: string,
  options?: { top?: number }
): Promise<{ items: unknown[]; totalCount: number }> {
  const client = getGraphClient();
  return fetchWithPagination<unknown>(
    client,
    `${BETA_BASE}/deviceAppManagement/mobileApps/${appId}/deviceStatuses`,
    { top: options?.top }
  );
}

/**
 * Get apps detected/installed on a specific managed device.
 * Uses the beta endpoint for the managedDevice's detectedApps relationship.
 */
export async function getDeviceDetectedApps(
  deviceId: string,
  options?: { top?: number }
): Promise<{ items: Record<string, unknown>[]; totalCount: number }> {
  const client = getGraphClient();
  return fetchWithPagination<Record<string, unknown>>(
    client,
    `https://graph.microsoft.com/beta/deviceManagement/managedDevices/${deviceId}/detectedApps`,
    {
      select: "id,displayName,version,sizeInByte,deviceCount",
      top: options?.top,
    }
  );
}

/**
 * Get app install states for a specific managed device.
 * 
 * Strategy:
 * 1. Get the device name from the device ID
 * 2. Iterate all managed apps and query each app's deviceStatuses
 * 3. Match statuses by device name (deviceStatuses uses deviceName, not managedDeviceId)
 *
 * Note: mobileAppIntentAndStates requires delegated auth (user context), 
 * so it doesn't work with app-only (client credentials) auth.
 */
export async function getDeviceManagedAppStatuses(
  deviceId: string
): Promise<{ items: Record<string, unknown>[]; totalCount: number }> {
  const client = getGraphClient();

  // Step 1: Resolve device name from device ID
  let targetDeviceName = "";
  try {
    const device = await client
      .api(`${BETA_BASE}/deviceManagement/managedDevices/${deviceId}`)
      .select("deviceName")
      .get();
    targetDeviceName = String(device.deviceName || "").toLowerCase();
  } catch {
    return { items: [], totalCount: 0 };
  }

  if (!targetDeviceName) {
    return { items: [], totalCount: 0 };
  }

  // Step 2: Get all apps
  const apps = await fetchWithPagination<Record<string, unknown>>(
    client,
    `${BETA_BASE}/deviceAppManagement/mobileApps`,
    {
      select: "id,displayName,publisher",
      maxItems: 50,
    }
  );

  // Step 3: Check each app's deviceStatuses and match by device name
  const deviceApps: Record<string, unknown>[] = [];

  for (const app of apps.items) {
    try {
      const statuses = await fetchWithPagination<Record<string, unknown>>(
        client,
        `${BETA_BASE}/deviceAppManagement/mobileApps/${app.id}/deviceStatuses`,
        { maxItems: 200 }
      );

      for (const status of statuses.items) {
        const statusDeviceName = String(status.deviceName || "").toLowerCase();
        if (statusDeviceName === targetDeviceName) {
          deviceApps.push({
            appName: app.displayName,
            publisher: app.publisher,
            appId: app.id,
            installState: status.installState ?? "unknown",
            lastSyncDateTime: status.lastSyncDateTime,
            errorCode: status.errorCode,
            userName: status.userName,
            deviceName: status.deviceName,
          });
        }
      }
    } catch {
      // Some app types (e.g., managed Google Play, built-in) don't support deviceStatuses
    }
  }

  return { items: deviceApps, totalCount: deviceApps.length };
}
