import { getGraphClient, fetchWithPagination } from "./client.js";
import type { MobileAppInfo } from "@intune-agent/shared";

/**
 * List mobile apps managed in Intune.
 */
export async function getMobileApps(options?: {
  filter?: string;
  top?: number;
}): Promise<{ items: MobileAppInfo[]; totalCount: number }> {
  const client = getGraphClient();
  return fetchWithPagination<MobileAppInfo>(
    client,
    "/deviceAppManagement/mobileApps",
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
 */
export async function getAppInstallStatus(
  appId: string,
  options?: { top?: number }
): Promise<{ items: unknown[]; totalCount: number }> {
  const client = getGraphClient();
  return fetchWithPagination<unknown>(
    client,
    `/deviceAppManagement/mobileApps/${appId}/deviceStatuses`,
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
 * This shows which managed apps (assigned via Intune) are installed/pending/failed on the device.
 */
export async function getDeviceManagedAppStatuses(
  deviceId: string
): Promise<{ items: Record<string, unknown>[]; totalCount: number }> {
  const client = getGraphClient();
  
  // Get all managed apps, then check each for this device's install state
  const apps = await fetchWithPagination<Record<string, unknown>>(
    client,
    "/deviceAppManagement/mobileApps",
    {
      select: "id,displayName,publisher",
      maxItems: 100,
    }
  );

  const deviceApps: Record<string, unknown>[] = [];

  for (const app of apps.items) {
    try {
      const statuses = await fetchWithPagination<Record<string, unknown>>(
        client,
        `/deviceAppManagement/mobileApps/${app.id}/deviceStatuses`,
        { maxItems: 200 }
      );

      // Find statuses for our specific device
      const deviceStatuses = statuses.items.filter(
        (s) => String(s.deviceId) === deviceId
      );

      if (deviceStatuses.length > 0) {
        for (const status of deviceStatuses) {
          deviceApps.push({
            appName: app.displayName,
            publisher: app.publisher,
            appId: app.id,
            installState: status.installState ?? status.installStatus ?? "unknown",
            lastSyncDateTime: status.lastSyncDateTime,
            errorCode: status.errorCode,
          });
        }
      }
    } catch {
      // Some app types don't support deviceStatuses — skip
    }
  }

  return { items: deviceApps, totalCount: deviceApps.length };
}
