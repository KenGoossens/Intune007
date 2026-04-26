import { getGraphClient, fetchWithPagination } from "./client.js";
import type { DeviceConfigurationInfo } from "@intune-agent/shared";

const BETA_BASE = "https://graph.microsoft.com/beta";

/**
 * List device configuration profiles.
 * Uses beta API for richer profile data including @odata.type for platform detection.
 */
export async function getDeviceConfigurations(options?: {
  filter?: string;
  top?: number;
}): Promise<{ items: DeviceConfigurationInfo[]; totalCount: number }> {
  const client = getGraphClient();
  return fetchWithPagination<DeviceConfigurationInfo>(
    client,
    `${BETA_BASE}/deviceManagement/deviceConfigurations`,
    {
      filter: options?.filter,
      select:
        "id,displayName,description,createdDateTime,lastModifiedDateTime,version",
      top: options?.top,
    }
  );
}

/**
 * Get configuration profile states for a specific device.
 * Uses beta for richer state data including per-setting status.
 */
export async function getDeviceConfigurationStates(
  deviceId: string
): Promise<{ items: Record<string, unknown>[]; totalCount: number }> {
  const client = getGraphClient();
  return fetchWithPagination<Record<string, unknown>>(
    client,
    `${BETA_BASE}/deviceManagement/managedDevices/${deviceId}/deviceConfigurationStates`,
    {}
  );
}
