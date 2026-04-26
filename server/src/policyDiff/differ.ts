/**
 * Policy Diff — Compare two Intune policies side-by-side and clone with modifications.
 *
 * Fetches full policy bodies from Graph API, diffs their settings,
 * and can clone a policy with user-specified modifications.
 */

import { getGraphClient } from "../graph/client.js";

export interface PolicyDiffItem {
  property: string;
  policyA: unknown;
  policyB: unknown;
  status: "same" | "different" | "only_a" | "only_b";
}

export interface PolicyDiffResult {
  policyA: { id: string; displayName: string; odataType: string };
  policyB: { id: string; displayName: string; odataType: string };
  totalProperties: number;
  sameCount: number;
  differentCount: number;
  onlyACount: number;
  onlyBCount: number;
  diffs: PolicyDiffItem[];
}

const SKIP_KEYS = new Set([
  "id", "createdDateTime", "lastModifiedDateTime", "version",
  "@odata.type", "@odata.context", "roleScopeTagIds",
  "scheduledActionsForRule", "assignments",
]);

/**
 * Compare two compliance policies or configuration profiles.
 */
export async function diffPolicies(
  policyIdA: string,
  policyIdB: string,
  policyType: "compliance" | "configuration" = "compliance"
): Promise<PolicyDiffResult> {
  const client = getGraphClient();
  const endpoint = policyType === "compliance"
    ? "/deviceManagement/deviceCompliancePolicies"
    : "/deviceManagement/deviceConfigurations";

  const [policyA, policyB] = await Promise.all([
    client.api(`${endpoint}/${policyIdA}`).get(),
    client.api(`${endpoint}/${policyIdB}`).get(),
  ]);

  const allKeys = new Set([
    ...Object.keys(policyA),
    ...Object.keys(policyB),
  ]);

  const diffs: PolicyDiffItem[] = [];

  for (const key of allKeys) {
    if (SKIP_KEYS.has(key)) continue;

    const valA = policyA[key];
    const valB = policyB[key];
    const hasA = key in policyA;
    const hasB = key in policyB;

    if (hasA && hasB) {
      const same = JSON.stringify(valA) === JSON.stringify(valB);
      diffs.push({ property: key, policyA: valA, policyB: valB, status: same ? "same" : "different" });
    } else if (hasA) {
      diffs.push({ property: key, policyA: valA, policyB: undefined, status: "only_a" });
    } else {
      diffs.push({ property: key, policyA: undefined, policyB: valB, status: "only_b" });
    }
  }

  // Sort: different first, then only_a/only_b, then same
  const order = { different: 0, only_a: 1, only_b: 2, same: 3 };
  diffs.sort((a, b) => order[a.status] - order[b.status]);

  return {
    policyA: { id: policyIdA, displayName: policyA.displayName, odataType: policyA["@odata.type"] },
    policyB: { id: policyIdB, displayName: policyB.displayName, odataType: policyB["@odata.type"] },
    totalProperties: diffs.length,
    sameCount: diffs.filter((d) => d.status === "same").length,
    differentCount: diffs.filter((d) => d.status === "different").length,
    onlyACount: diffs.filter((d) => d.status === "only_a").length,
    onlyBCount: diffs.filter((d) => d.status === "only_b").length,
    diffs,
  };
}

/**
 * Clone a policy with a new name and optional setting overrides.
 */
export async function clonePolicy(
  sourcePolicyId: string,
  newDisplayName: string,
  policyType: "compliance" | "configuration" = "compliance",
  overrides?: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const client = getGraphClient();
  const endpoint = policyType === "compliance"
    ? "/deviceManagement/deviceCompliancePolicies"
    : "/deviceManagement/deviceConfigurations";

  const source = await client.api(`${endpoint}/${sourcePolicyId}`).get();

  // Remove read-only / server-generated fields
  const removeKeys = ["id", "createdDateTime", "lastModifiedDateTime", "version", "@odata.context", "assignments"];
  for (const k of removeKeys) delete source[k];

  source.displayName = newDisplayName;

  // Apply overrides
  if (overrides) {
    for (const [k, v] of Object.entries(overrides)) {
      source[k] = v;
    }
  }

  // Compliance policies need scheduledActionsForRule
  if (policyType === "compliance" && !source.scheduledActionsForRule) {
    source.scheduledActionsForRule = [{
      ruleName: "PasswordRequired",
      scheduledActionConfigurations: [{
        actionType: "block",
        gracePeriodHours: 24,
        notificationTemplateId: "",
        notificationMessageCCList: [],
      }],
    }];
  }

  const result = await client.api(endpoint).post(source);
  return result;
}
