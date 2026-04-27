/**
 * Autopilot Pipeline — Lifecycle tracking for device onboarding and enrollment.
 *
 * Tracks each device through the full Autopilot lifecycle:
 *   1. REGISTERED — Hardware hash imported into Autopilot
 *   2. PROFILE ASSIGNED — Deployment profile assigned (via group membership)
 *   3. AWAITING ENROLLMENT — Device has not contacted Intune yet
 *   4. ENROLLING — Device is going through OOBE/enrollment
 *   5. ENROLLED — Device is fully managed in Intune
 *
 * Also provides a fleet-level pipeline view showing how many devices
 * are in each stage.
 */

import { getGraphClient, fetchWithPagination } from "../graph/client.js";

const BETA = "https://graph.microsoft.com/beta";

export type PipelineStage =
  | "not_registered"
  | "registered"
  | "profile_assigned"
  | "awaiting_enrollment"
  | "enrolling"
  | "enrolled"
  | "failed";

export interface AutopilotDeviceStatus {
  id: string;
  serialNumber: string;
  model: string;
  manufacturer: string;
  groupTag: string;
  enrollmentState: string;
  profileAssignmentStatus: string;
  profileAssignedDate: string | null;
  lastContactedDateTime: string | null;
  purchaseOrderIdentifier: string;
  stage: PipelineStage;
  stageLabel: string;
  stageOrder: number;
  managedDeviceId: string | null;
  userPrincipalName: string | null;
  // Intune enrollment details (if enrolled)
  intuneDeviceName: string | null;
  complianceState: string | null;
  osVersion: string | null;
  lastSyncDateTime: string | null;
}

export interface PipelineSummary {
  totalDevices: number;
  stages: Array<{
    stage: PipelineStage;
    label: string;
    count: number;
    percentage: number;
    color: string;
  }>;
  devices: AutopilotDeviceStatus[];
  profiles: Array<{ id: string; displayName: string; description: string }>;
  generatedAt: string;
}

function resolveStage(device: Record<string, unknown>): { stage: PipelineStage; label: string; order: number } {
  const enrollState = String(device.enrollmentState || "").toLowerCase();
  const profileStatus = String(device.deploymentProfileAssignmentStatus || "").toLowerCase();

  // Check enrollment state
  if (enrollState === "enrolled") {
    return { stage: "enrolled", label: "Enrolled in Intune", order: 5 };
  }
  if (enrollState === "enrollmentfailed" || enrollState === "enrollment_failed") {
    return { stage: "failed", label: "Enrollment Failed", order: 6 };
  }
  if (enrollState === "enrolling" || enrollState === "enrollmentinprogress") {
    return { stage: "enrolling", label: "Enrolling...", order: 4 };
  }

  // Check profile assignment
  if (profileStatus.includes("assigned")) {
    if (enrollState === "notcontacted") {
      return { stage: "awaiting_enrollment", label: "Awaiting First Boot", order: 3 };
    }
    return { stage: "profile_assigned", label: "Profile Assigned", order: 2 };
  }

  // Registered but no profile
  return { stage: "registered", label: "Registered (No Profile)", order: 1 };
}

const STAGE_COLORS: Record<PipelineStage, string> = {
  not_registered: "#6b7280",  // gray
  registered: "#f59e0b",      // amber
  profile_assigned: "#3b82f6", // blue
  awaiting_enrollment: "#8b5cf6", // purple
  enrolling: "#06b6d4",       // cyan
  enrolled: "#22c55e",        // green
  failed: "#ef4444",          // red
};

/**
 * Get the full Autopilot pipeline status for all devices.
 */
export async function getAutopilotPipeline(): Promise<PipelineSummary> {
  const client = getGraphClient();

  // Get all Autopilot device identities
  const apDevices = await fetchWithPagination<Record<string, unknown>>(
    client,
    `${BETA}/deviceManagement/windowsAutopilotDeviceIdentities`,
    {
      select: "id,serialNumber,model,manufacturer,groupTag,purchaseOrderIdentifier,enrollmentState,deploymentProfileAssignmentStatus,deploymentProfileAssignedDateTime,lastContactedDateTime,managedDeviceId",
      maxItems: 500,
    }
  );

  // Get deployment profiles
  const profiles = await fetchWithPagination<Record<string, unknown>>(
    client,
    `${BETA}/deviceManagement/windowsAutopilotDeploymentProfiles`,
    { select: "id,displayName,description", maxItems: 50 }
  );

  // For enrolled devices, try to get Intune device details
  const managedDeviceIds = apDevices.items
    .map((d) => String(d.managedDeviceId || ""))
    .filter((id) => id && id !== "00000000-0000-0000-0000-000000000000");

  const managedDeviceMap = new Map<string, Record<string, unknown>>();

  // Fetch managed device details in batches of 5
  for (let i = 0; i < managedDeviceIds.length; i += 5) {
    const batch = managedDeviceIds.slice(i, i + 5);
    const results = await Promise.all(
      batch.map(async (id) => {
        try {
          return await client
            .api(`${BETA}/deviceManagement/managedDevices/${id}`)
            .select("id,deviceName,userPrincipalName,complianceState,osVersion,lastSyncDateTime")
            .get();
        } catch {
          return null;
        }
      })
    );
    for (const r of results) {
      if (r) managedDeviceMap.set(String(r.id), r);
    }
  }

  // Build device status list
  const devices: AutopilotDeviceStatus[] = apDevices.items.map((d) => {
    const { stage, label, order } = resolveStage(d);
    const managedDeviceId = String(d.managedDeviceId || "");
    const managedDevice = managedDeviceMap.get(managedDeviceId);

    return {
      id: String(d.id),
      serialNumber: String(d.serialNumber || ""),
      model: String(d.model || ""),
      manufacturer: String(d.manufacturer || ""),
      groupTag: String(d.groupTag || ""),
      enrollmentState: String(d.enrollmentState || ""),
      profileAssignmentStatus: String(d.deploymentProfileAssignmentStatus || ""),
      profileAssignedDate: d.deploymentProfileAssignedDateTime ? String(d.deploymentProfileAssignedDateTime) : null,
      lastContactedDateTime: d.lastContactedDateTime ? String(d.lastContactedDateTime) : null,
      purchaseOrderIdentifier: String(d.purchaseOrderIdentifier || ""),
      stage,
      stageLabel: label,
      stageOrder: order,
      managedDeviceId: managedDeviceId || null,
      userPrincipalName: managedDevice ? String(managedDevice.userPrincipalName || "") : null,
      intuneDeviceName: managedDevice ? String(managedDevice.deviceName || "") : null,
      complianceState: managedDevice ? String(managedDevice.complianceState || "") : null,
      osVersion: managedDevice ? String(managedDevice.osVersion || "") : null,
      lastSyncDateTime: managedDevice ? String(managedDevice.lastSyncDateTime || "") : null,
    };
  });

  // Sort by pipeline stage
  devices.sort((a, b) => a.stageOrder - b.stageOrder);

  // Build stage summary
  const stageCounts = new Map<PipelineStage, number>();
  for (const d of devices) {
    stageCounts.set(d.stage, (stageCounts.get(d.stage) || 0) + 1);
  }

  const stageOrder: Array<{ stage: PipelineStage; label: string }> = [
    { stage: "registered", label: "Registered" },
    { stage: "profile_assigned", label: "Profile Assigned" },
    { stage: "awaiting_enrollment", label: "Awaiting Enrollment" },
    { stage: "enrolling", label: "Enrolling" },
    { stage: "enrolled", label: "Enrolled" },
    { stage: "failed", label: "Failed" },
  ];

  const stages = stageOrder
    .map(({ stage, label }) => ({
      stage,
      label,
      count: stageCounts.get(stage) || 0,
      percentage: devices.length > 0 ? Math.round(((stageCounts.get(stage) || 0) / devices.length) * 100) : 0,
      color: STAGE_COLORS[stage],
    }))
    .filter((s) => s.count > 0);

  return {
    totalDevices: devices.length,
    stages,
    devices,
    profiles: profiles.items.map((p) => ({
      id: String(p.id),
      displayName: String(p.displayName || ""),
      description: String(p.description || ""),
    })),
    generatedAt: new Date().toISOString(),
  };
}
