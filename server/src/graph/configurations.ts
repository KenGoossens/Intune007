import { getGraphClient, fetchWithPagination } from "./client.js";
import type { DeviceConfigurationInfo } from "@intune-agent/shared";

/**
 * List device configuration profiles.
 */
export async function getDeviceConfigurations(options?: {
  filter?: string;
  top?: number;
}): Promise<{ items: DeviceConfigurationInfo[]; totalCount: number }> {
  const client = getGraphClient();
  return fetchWithPagination<DeviceConfigurationInfo>(
    client,
    "/deviceManagement/deviceConfigurations",
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
 * Shows which config profiles are assigned/applied to the device.
 */
export async function getDeviceConfigurationStates(
  deviceId: string
): Promise<{ items: Record<string, unknown>[]; totalCount: number }> {
  const client = getGraphClient();
  return fetchWithPagination<Record<string, unknown>>(
    client,
    `/deviceManagement/managedDevices/${deviceId}/deviceConfigurationStates`,
    {}
  );
}
