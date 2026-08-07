import { getGraphClient, fetchWithPagination } from "../graph/client.js";
import type {
  ComanagedDeviceInfo,
  ComanagementEligibleDeviceInfo,
  ComanagementSummary,
  ComanagementWorkloadSplit,
  ConfigurationManagerClientEnabledFeatures,
} from "@intune-agent/shared";

const BETA_BASE = "https://graph.microsoft.com/beta";

/**
 * managementAgent values that indicate a device is co-managed
 * (reporting through both the ConfigMgr client AND Intune MDM).
 */
const COMANAGED_AGENTS = [
  "configurationManagerClientMdm",
  "configurationManagerClientMdmEas",
];

/** managementAgent value for devices managed by the ConfigMgr client only. */
const CONFIGMGR_ONLY_AGENT = "configurationManagerClient";

/**
 * Fields required to compute the co-management dashboard. The
 * configurationManager* complex types are only returned when explicitly
 * selected, so they are always included here.
 */
const COMANAGED_SELECT = [
  "id",
  "deviceName",
  "operatingSystem",
  "osVersion",
  "managementAgent",
  "complianceState",
  "userPrincipalName",
  "lastSyncDateTime",
  "manufacturer",
  "model",
  "configurationManagerClientEnabledFeatures",
  "configurationManagerClientHealthState",
  "configurationManagerClientInformation",
].join(",");

/**
 * Human-friendly labels for the 8 co-management workloads, in the order
 * they appear on the co-management workload slider in the admin center.
 */
const WORKLOAD_LABELS: {
  key: keyof ConfigurationManagerClientEnabledFeatures;
  label: string;
}[] = [
  { key: "compliancePolicy", label: "Compliance policies" },
  { key: "deviceConfiguration", label: "Device configuration" },
  { key: "endpointProtection", label: "Endpoint Protection" },
  { key: "resourceAccess", label: "Resource access policies" },
  { key: "modernApps", label: "Client apps" },
  { key: "officeApps", label: "Office Click-to-Run apps" },
  { key: "windowsUpdateForBusiness", label: "Windows Update policies" },
  { key: "inventory", label: "Endpoint analytics (inventory)" },
];

interface RawManagedDevice {
  id: string;
  deviceName?: string;
  operatingSystem?: string;
  osVersion?: string;
  managementAgent?: string;
  complianceState?: string;
  userPrincipalName?: string;
  lastSyncDateTime?: string;
  manufacturer?: string;
  model?: string;
  configurationManagerClientEnabledFeatures?: ConfigurationManagerClientEnabledFeatures;
  configurationManagerClientHealthState?: {
    state?: string;
    errorCode?: number;
    lastSyncDateTime?: string;
  };
  configurationManagerClientInformation?: {
    clientIdentifier?: string;
    isBlocked?: boolean;
    clientVersion?: string;
  };
}

function toComanagedDeviceInfo(d: RawManagedDevice): ComanagedDeviceInfo {
  return {
    id: d.id,
    deviceName: d.deviceName ?? "",
    operatingSystem: d.operatingSystem ?? "",
    osVersion: d.osVersion ?? "",
    managementAgent: d.managementAgent ?? "",
    complianceState: d.complianceState ?? "",
    userPrincipalName: d.userPrincipalName ?? "",
    lastSyncDateTime: d.lastSyncDateTime ?? "",
    manufacturer: d.manufacturer ?? "",
    model: d.model ?? "",
    enabledFeatures: d.configurationManagerClientEnabledFeatures,
    clientHealthState: d.configurationManagerClientHealthState,
    clientInformation: d.configurationManagerClientInformation,
  };
}

/**
 * List co-managed devices (managed by both ConfigMgr and Intune).
 * Queries Graph directly because the co-management complex types are not
 * stored in the local device cache.
 */
export async function getComanagedDevices(options?: {
  top?: number;
}): Promise<{ items: ComanagedDeviceInfo[]; totalCount: number }> {
  const client = getGraphClient();
  const filter = COMANAGED_AGENTS.map(
    (a) => `managementAgent eq '${a}'`
  ).join(" or ");

  const result = await fetchWithPagination<RawManagedDevice>(
    client,
    `${BETA_BASE}/deviceManagement/managedDevices`,
    {
      filter,
      select: COMANAGED_SELECT,
      top: options?.top,
      maxItems: options?.top ?? 1000,
    }
  );

  return {
    items: result.items.map(toComanagedDeviceInfo),
    totalCount: result.totalCount,
  };
}

/**
 * List devices from the co-management eligibility endpoint, optionally
 * filtered by eligibility status (comanaged, eligible, needsOsUpdate, etc.).
 */
export async function getComanagementEligibleDevices(options?: {
  status?: string;
  top?: number;
}): Promise<{ items: ComanagementEligibleDeviceInfo[]; totalCount: number }> {
  const client = getGraphClient();
  const filter = options?.status
    ? `status eq '${options.status}'`
    : undefined;

  const result = await fetchWithPagination<ComanagementEligibleDeviceInfo>(
    client,
    `${BETA_BASE}/deviceManagement/comanagementEligibleDevices`,
    {
      filter,
      top: options?.top,
      maxItems: options?.top ?? 1000,
    }
  );

  return { items: result.items, totalCount: result.totalCount };
}

/**
 * Return co-managed devices whose ConfigMgr client is not healthy
 * (client health state is anything other than "healthy", or is blocked).
 */
export async function getConfigMgrClientHealth(): Promise<{
  items: ComanagedDeviceInfo[];
  totalCount: number;
}> {
  const { items } = await getComanagedDevices({ top: 1000 });
  const unhealthy = items.filter((d) => {
    const state = (d.clientHealthState?.state ?? "").toLowerCase();
    const blocked = d.clientInformation?.isBlocked === true;
    return blocked || (state !== "" && state !== "healthy");
  });
  return { items: unhealthy, totalCount: unhealthy.length };
}

/**
 * Build the aggregated co-management dashboard payload: adoption counts,
 * per-workload Intune-vs-ConfigMgr split, client-health breakdown, and the
 * eligibility funnel.
 */
export async function getComanagementSummary(): Promise<ComanagementSummary> {
  const [comanaged, eligible] = await Promise.all([
    getComanagedDevices({ top: 1000 }),
    getComanagementEligibleDevices({ top: 1000 }).catch(() => ({
      items: [] as ComanagementEligibleDeviceInfo[],
      totalCount: 0,
    })),
  ]);

  const devices = comanaged.items;

  // Per-workload split: for each workload, count Intune (feature=true) vs ConfigMgr.
  const workloadSplit: ComanagementWorkloadSplit[] = WORKLOAD_LABELS.map(
    ({ key, label }) => {
      let intune = 0;
      let configMgr = 0;
      for (const d of devices) {
        if (d.enabledFeatures?.[key]) intune++;
        else configMgr++;
      }
      return { workload: String(key), label, intune, configMgr };
    }
  );

  // Client health breakdown.
  const clientHealth = { healthy: 0, unhealthy: 0, unknown: 0 };
  for (const d of devices) {
    const state = (d.clientHealthState?.state ?? "").toLowerCase();
    if (state === "healthy") clientHealth.healthy++;
    else if (state === "") clientHealth.unknown++;
    else clientHealth.unhealthy++;
  }

  // Eligibility funnel: count eligible devices grouped by status.
  const funnelMap = new Map<string, number>();
  for (const d of eligible.items) {
    const status = d.status || "unknown";
    funnelMap.set(status, (funnelMap.get(status) ?? 0) + 1);
  }
  const eligibilityFunnel = Array.from(funnelMap.entries())
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count);

  // Count of ConfigMgr-only devices (not yet co-managed) via the eligibility feed.
  const totalConfigMgrOnly = eligible.items.filter(
    (d) =>
      (d.managementAgents || "").toLowerCase() ===
      CONFIGMGR_ONLY_AGENT.toLowerCase()
  ).length;

  return {
    totalComanaged: devices.length,
    totalConfigMgrOnly,
    totalEligible: eligible.totalCount,
    workloadSplit,
    clientHealth,
    eligibilityFunnel,
    devices,
    generatedAt: new Date().toISOString(),
  };
}

// ─── Client actions (write — gated by confirmation) ──────────────

/**
 * The ConfigMgr client actions that can be triggered on a co-managed device
 * via Graph (tenant attach / co-management), in the order the admin center
 * lists them.
 */
export const CONFIGMGR_CLIENT_ACTIONS = [
  "refreshMachinePolicy",
  "refreshUserPolicy",
  "wakeUpClient",
  "appEvaluation",
  "quickScan",
  "fullScan",
  "windowsDefenderUpdateSignatures",
] as const;

export type ConfigMgrClientAction = (typeof CONFIGMGR_CLIENT_ACTIONS)[number];

/**
 * Trigger an action on the Configuration Manager client of a co-managed device
 * (e.g. refresh machine policy, evaluate apps, run a Defender scan).
 * Requires the DeviceManagementManagedDevices.PrivilegedOperations.All Graph
 * permission. This is a write operation and is gated by the confirmation flow.
 */
export async function triggerConfigMgrClientAction(
  deviceId: string,
  action: string
): Promise<{ success: boolean; deviceId: string; action: string; message: string }> {
  if (!CONFIGMGR_CLIENT_ACTIONS.includes(action as ConfigMgrClientAction)) {
    throw new Error(
      `Invalid client action "${action}". Valid actions: ${CONFIGMGR_CLIENT_ACTIONS.join(", ")}.`
    );
  }
  const client = getGraphClient();
  await client
    .api(`${BETA_BASE}/deviceManagement/managedDevices/${deviceId}/triggerConfigurationManagerAction`)
    .post({
      configurationManagerAction: {
        "@odata.type": "microsoft.graph.configurationManagerAction",
        action,
      },
    });
  return {
    success: true,
    deviceId,
    action,
    message: `Triggered '${action}' on the ConfigMgr client. It runs on the device at its next check-in.`,
  };
}
