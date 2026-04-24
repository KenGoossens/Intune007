import { getGraphClient, fetchWithPagination } from "../graph/client.js";
import type { Alert, AlertCheckType } from "@intune-agent/shared";

let alertIdCounter = 0;

function createAlert(
  checkType: AlertCheckType,
  severity: Alert["severity"],
  title: string,
  message: string,
  details: unknown[],
  count: number
): Alert {
  return {
    id: `alert-${++alertIdCounter}-${Date.now()}`,
    checkType,
    severity,
    title,
    message,
    details,
    count,
    timestamp: new Date(),
    acknowledged: false,
  };
}

// ─── 1. Non-Compliant Devices ────────────────────────────────────

export async function checkNonCompliantDevices(): Promise<Alert[]> {
  const client = getGraphClient();
  const result = await fetchWithPagination<Record<string, unknown>>(
    client,
    "/deviceManagement/managedDevices",
    {
      filter: "complianceState eq 'noncompliant'",
      select: "id,deviceName,operatingSystem,complianceState,userPrincipalName,lastSyncDateTime",
      maxItems: 100,
    }
  );

  if (result.items.length === 0) return [];

  return [
    createAlert(
      "non_compliant_devices",
      result.items.length >= 5 ? "critical" : "warning",
      `${result.items.length} Non-Compliant Device${result.items.length > 1 ? "s" : ""}`,
      `${result.items.length} device(s) are currently not compliant with Intune policies.`,
      result.items,
      result.items.length
    ),
  ];
}

// ─── 2. Policy Conflicts ────────────────────────────────────────

export async function checkPolicyConflicts(): Promise<Alert[]> {
  const client = getGraphClient();

  // Get all devices, then check each for configuration states with conflicts
  const devices = await fetchWithPagination<Record<string, unknown>>(
    client,
    "/deviceManagement/managedDevices",
    {
      select: "id,deviceName,userPrincipalName",
      maxItems: 50,
    }
  );

  const conflictingDevices: Record<string, unknown>[] = [];

  for (const device of devices.items) {
    try {
      const states = await fetchWithPagination<Record<string, unknown>>(
        client,
        `/deviceManagement/managedDevices/${device.id}/deviceConfigurationStates`,
        { maxItems: 100 }
      );

      const conflicts = states.items.filter(
        (s) =>
          String(s.state).toLowerCase() === "conflict" ||
          String(s.state).toLowerCase() === "error"
      );

      if (conflicts.length > 0) {
        conflictingDevices.push({
          ...device,
          conflictCount: conflicts.length,
          conflictingProfiles: conflicts.map((c) => ({
            displayName: c.displayName,
            state: c.state,
          })),
        });
      }
    } catch {
      // Skip devices where config states can't be read
    }
  }

  if (conflictingDevices.length === 0) return [];

  return [
    createAlert(
      "policy_conflicts",
      "critical",
      `Policy Conflicts on ${conflictingDevices.length} Device${conflictingDevices.length > 1 ? "s" : ""}`,
      `${conflictingDevices.length} device(s) have conflicting or errored configuration profile states.`,
      conflictingDevices,
      conflictingDevices.length
    ),
  ];
}

// ─── 3. Stale Devices ───────────────────────────────────────────

export async function checkStaleDevices(): Promise<Alert[]> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const isoDate = sevenDaysAgo.toISOString();

  const client = getGraphClient();
  const result = await fetchWithPagination<Record<string, unknown>>(
    client,
    "/deviceManagement/managedDevices",
    {
      filter: `lastSyncDateTime lt ${isoDate}`,
      select: "id,deviceName,operatingSystem,lastSyncDateTime,userPrincipalName,complianceState",
      maxItems: 100,
    }
  );

  if (result.items.length === 0) return [];

  return [
    createAlert(
      "stale_devices",
      result.items.length >= 10 ? "warning" : "info",
      `${result.items.length} Stale Device${result.items.length > 1 ? "s" : ""}`,
      `${result.items.length} device(s) haven't synced with Intune in over 7 days.`,
      result.items,
      result.items.length
    ),
  ];
}

// ─── 4. Failed App Installs ─────────────────────────────────────

export async function checkFailedAppInstalls(): Promise<Alert[]> {
  const client = getGraphClient();

  // Get all mobile apps
  const apps = await fetchWithPagination<Record<string, unknown>>(
    client,
    "/deviceAppManagement/mobileApps",
    {
      select: "id,displayName,publisher",
      maxItems: 50,
    }
  );

  const failedApps: Record<string, unknown>[] = [];

  for (const app of apps.items) {
    // Skip system/built-in apps without a proper type
    try {
      const statuses = await fetchWithPagination<Record<string, unknown>>(
        client,
        `/deviceAppManagement/mobileApps/${app.id}/deviceStatuses`,
        { maxItems: 50 }
      );

      const failures = statuses.items.filter((s) => {
        const status = String(s.installState || s.installStatus || "").toLowerCase();
        return status.includes("fail") || status.includes("error");
      });

      if (failures.length > 0) {
        failedApps.push({
          appName: app.displayName,
          appId: app.id,
          failureCount: failures.length,
          failures: failures.slice(0, 5), // Limit detail
        });
      }
    } catch {
      // Some app types don't support deviceStatuses — skip
    }
  }

  if (failedApps.length === 0) return [];

  const totalFailures = failedApps.reduce(
    (sum, a) => sum + (a.failureCount as number),
    0
  );

  return [
    createAlert(
      "failed_app_installs",
      totalFailures >= 10 ? "critical" : "warning",
      `${totalFailures} Failed App Install${totalFailures > 1 ? "s" : ""} across ${failedApps.length} App${failedApps.length > 1 ? "s" : ""}`,
      `${failedApps.length} app(s) have installation failures on one or more devices.`,
      failedApps,
      totalFailures
    ),
  ];
}

// ─── 5. CA Policy Issues ────────────────────────────────────────

export async function checkCAPolicyIssues(): Promise<Alert[]> {
  const client = getGraphClient();

  try {
    const result = await fetchWithPagination<Record<string, unknown>>(
      client,
      "/identity/conditionalAccess/policies",
      {
        select: "id,displayName,state,createdDateTime,modifiedDateTime",
        maxItems: 100,
      }
    );

    const issues: Record<string, unknown>[] = [];

    for (const policy of result.items) {
      const state = String(policy.state || "").toLowerCase();
      if (state === "enabledforreportingbutnotenforced" || state === "reportonly") {
        issues.push({ ...policy, issue: "Report-only mode — not enforcing" });
      } else if (state === "disabled") {
        issues.push({ ...policy, issue: "Disabled" });
      }
    }

    if (issues.length === 0) return [];

    return [
      createAlert(
        "ca_policy_issues",
        "info",
        `${issues.length} CA Polic${issues.length > 1 ? "ies" : "y"} Not Enforcing`,
        `${issues.length} Conditional Access polic(ies) are disabled or in report-only mode.`,
        issues,
        issues.length
      ),
    ];
  } catch {
    // If Policy.Read.All permission is missing, return a single info alert
    return [
      createAlert(
        "ca_policy_issues",
        "info",
        "CA Policy Check Unavailable",
        "Cannot read Conditional Access policies — ensure Policy.Read.All permission is granted.",
        [],
        0
      ),
    ];
  }
}

// ─── 6. New Enrollments ─────────────────────────────────────────

export async function checkNewEnrollments(): Promise<Alert[]> {
  const oneDayAgo = new Date();
  oneDayAgo.setDate(oneDayAgo.getDate() - 1);
  const isoDate = oneDayAgo.toISOString();

  const client = getGraphClient();
  const result = await fetchWithPagination<Record<string, unknown>>(
    client,
    "/deviceManagement/managedDevices",
    {
      filter: `enrolledDateTime gt ${isoDate}`,
      select: "id,deviceName,operatingSystem,enrolledDateTime,userPrincipalName,managedDeviceOwnerType",
      maxItems: 100,
    }
  );

  if (result.items.length === 0) return [];

  return [
    createAlert(
      "new_enrollments",
      "info",
      `${result.items.length} New Device${result.items.length > 1 ? "s" : ""} Enrolled`,
      `${result.items.length} device(s) were enrolled in Intune in the last 24 hours.`,
      result.items,
      result.items.length
    ),
  ];
}
