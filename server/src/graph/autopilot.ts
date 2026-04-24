import { getGraphClient, fetchWithPagination } from "./client.js";
import type {
  AutopilotDeviceInfo,
  AutopilotProfileInfo,
} from "@intune-agent/shared";

// Beta endpoints require the full URL since the SDK defaults to v1.0
const BETA_BASE = "https://graph.microsoft.com/beta";

/**
 * List Windows Autopilot device identities.
 * Uses the beta endpoint since Autopilot is not in v1.0.
 */
export async function getAutopilotDevices(options?: {
  filter?: string;
  top?: number;
}): Promise<{ items: AutopilotDeviceInfo[]; totalCount: number }> {
  const client = getGraphClient();
  return fetchWithPagination<AutopilotDeviceInfo>(
    client,
    `${BETA_BASE}/deviceManagement/windowsAutopilotDeviceIdentities`,
    {
      filter: options?.filter,
      select:
        "id,serialNumber,model,manufacturer,groupTag,purchaseOrderIdentifier,enrollmentState,lastContactedDateTime",
      top: options?.top,
    }
  );
}

/**
 * List Windows Autopilot deployment profiles.
 * Uses the beta endpoint.
 */
export async function getAutopilotProfiles(options?: {
  filter?: string;
  top?: number;
}): Promise<{ items: AutopilotProfileInfo[]; totalCount: number }> {
  const client = getGraphClient();
  return fetchWithPagination<AutopilotProfileInfo>(
    client,
    `${BETA_BASE}/deviceManagement/windowsAutopilotDeploymentProfiles`,
    {
      filter: options?.filter,
      select:
        "id,displayName,description,language,createdDateTime,lastModifiedDateTime",
      top: options?.top,
    }
  );
}
