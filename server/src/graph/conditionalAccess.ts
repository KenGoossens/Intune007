import { getGraphClient, fetchWithPagination } from "./client.js";
import type { ConditionalAccessPolicyInfo } from "@intune-agent/shared";

/**
 * List Conditional Access policies.
 */
export async function getConditionalAccessPolicies(options?: {
  filter?: string;
  top?: number;
}): Promise<{ items: ConditionalAccessPolicyInfo[]; totalCount: number }> {
  const client = getGraphClient();
  return fetchWithPagination<ConditionalAccessPolicyInfo>(
    client,
    "/identity/conditionalAccess/policies",
    {
      filter: options?.filter,
      select: "id,displayName,state,createdDateTime,modifiedDateTime",
      top: options?.top,
    }
  );
}
