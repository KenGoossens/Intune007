import { getGraphClient, fetchWithPagination } from "./client.js";
import type {
  CompliancePolicyInfo,
  ComplianceStatusInfo,
} from "@intune-agent/shared";

const BETA_BASE = "https://graph.microsoft.com/beta";

/**
 * List device compliance policies.
 * Uses beta API for richer policy data including platform type and assignment info.
 */
export async function getCompliancePolicies(options?: {
  filter?: string;
  top?: number;
}): Promise<{ items: CompliancePolicyInfo[]; totalCount: number }> {
  const client = getGraphClient();
  return fetchWithPagination<CompliancePolicyInfo>(
    client,
    `${BETA_BASE}/deviceManagement/deviceCompliancePolicies`,
    {
      filter: options?.filter,
      select: "id,displayName,description,createdDateTime,lastModifiedDateTime",
      top: options?.top,
    }
  );
}

/**
 * Get the overall device compliance status summary.
 * Uses beta for more detailed breakdown.
 */
export async function getComplianceStatus(): Promise<ComplianceStatusInfo> {
  const client = getGraphClient();
  const summary = await client
    .api(`${BETA_BASE}/deviceManagement/deviceCompliancePolicyDeviceStateSummary`)
    .get();

  return {
    compliantDeviceCount: summary.compliantDeviceCount ?? 0,
    nonCompliantDeviceCount: summary.nonCompliantDeviceCount ?? 0,
    errorDeviceCount: summary.errorDeviceCount ?? 0,
    conflictDeviceCount: summary.conflictDeviceCount ?? 0,
    unknownDeviceCount: summary.unknownDeviceCount ?? 0,
    notApplicableDeviceCount: summary.notApplicableDeviceCount ?? 0,
  };
}
