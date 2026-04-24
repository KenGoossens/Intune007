import { getGraphClient, fetchWithPagination } from "../graph/client.js";
import { getComplianceStatus } from "../graph/compliance.js";
import type {
  PolicyFinding,
  PolicyFindingCategory,
  PolicyFindingSeverity,
  PolicyAnalysisResult,
} from "@intune-agent/shared";

let findingIdCounter = 0;

function finding(
  severity: PolicyFindingSeverity,
  category: PolicyFindingCategory,
  title: string,
  description: string,
  recommendation: string,
  affectedItems: string[] = [],
  details: Record<string, unknown> = {}
): PolicyFinding {
  return {
    id: `finding-${++findingIdCounter}`,
    severity,
    category,
    title,
    description,
    recommendation,
    affectedItems,
    details,
  };
}

/**
 * Run all policy analysis checks against the tenant.
 */
export async function analyzePolicies(): Promise<PolicyAnalysisResult> {
  const start = Date.now();
  const client = getGraphClient();
  const findings: PolicyFinding[] = [];

  // ── Fetch all data in parallel ─────────────────────────────────

  const [
    devicesResult,
    compliancePoliciesResult,
    complianceStatus,
    configProfilesResult,
    caPoliciesResult,
    appsResult,
  ] = await Promise.all([
    fetchWithPagination<Record<string, unknown>>(client, "/deviceManagement/managedDevices", {
      select: "id,deviceName,operatingSystem,osVersion,complianceState,lastSyncDateTime,userPrincipalName,managedDeviceOwnerType",
      maxItems: 200,
    }),
    fetchWithPagination<Record<string, unknown>>(client, "/deviceManagement/deviceCompliancePolicies", {
      select: "id,displayName,description,createdDateTime,lastModifiedDateTime",
      maxItems: 100,
    }),
    getComplianceStatus(),
    fetchWithPagination<Record<string, unknown>>(client, "/deviceManagement/deviceConfigurations", {
      select: "id,displayName,description,createdDateTime,lastModifiedDateTime,version",
      maxItems: 100,
    }),
    fetchWithPagination<Record<string, unknown>>(client, "/identity/conditionalAccess/policies", {
      maxItems: 100,
    }),
    fetchWithPagination<Record<string, unknown>>(client, "/deviceAppManagement/mobileApps", {
      select: "id,displayName,publisher,createdDateTime,lastModifiedDateTime",
      maxItems: 100,
    }),
  ]);

  const devices = devicesResult.items;
  const compliancePolicies = compliancePoliciesResult.items;
  const configProfiles = configProfilesResult.items;
  const caPolicies = caPoliciesResult.items;
  const apps = appsResult.items;

  // ── Stale devices ──────────────────────────────────────────────
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const staleDevices = devices.filter(
    (d) => d.lastSyncDateTime && new Date(d.lastSyncDateTime as string) < sevenDaysAgo
  );

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const veryStaleDevices = devices.filter(
    (d) => d.lastSyncDateTime && new Date(d.lastSyncDateTime as string) < thirtyDaysAgo
  );

  // ── 1. Compliance Checks ──────────────────────────────────────

  if (compliancePolicies.length === 0) {
    findings.push(finding(
      "critical", "compliance",
      "No Compliance Policies Defined",
      "There are no device compliance policies configured. All devices will report as compliant by default, providing no security assurance.",
      "Create compliance policies for each platform (Windows, iOS, Android) defining minimum security requirements.",
    ));
  }

  const nonCompliantCount = complianceStatus.nonCompliantDeviceCount;
  const totalDeviceCount =
    complianceStatus.compliantDeviceCount +
    nonCompliantCount +
    complianceStatus.errorDeviceCount +
    complianceStatus.conflictDeviceCount +
    complianceStatus.unknownDeviceCount;

  if (totalDeviceCount > 0 && nonCompliantCount / totalDeviceCount > 0.2) {
    findings.push(finding(
      "critical", "compliance",
      "High Non-Compliance Rate",
      `${nonCompliantCount} of ${totalDeviceCount} devices (${Math.round((nonCompliantCount / totalDeviceCount) * 100)}%) are non-compliant. This exceeds the recommended 20% threshold.`,
      "Investigate non-compliant devices. Check if compliance policies are too strict or if devices need remediation.",
      [], { nonCompliantCount, totalDeviceCount, rate: nonCompliantCount / totalDeviceCount },
    ));
  } else if (totalDeviceCount > 0 && nonCompliantCount === 0) {
    findings.push(finding(
      "good", "compliance",
      "100% Device Compliance",
      "All managed devices are compliant with configured policies.",
      "Maintain current compliance posture.",
    ));
  }

  if (complianceStatus.conflictDeviceCount > 0) {
    findings.push(finding(
      "warning", "compliance",
      `${complianceStatus.conflictDeviceCount} Devices with Policy Conflicts`,
      `${complianceStatus.conflictDeviceCount} device(s) have conflicting compliance policy settings, which may prevent proper evaluation.`,
      "Review compliance policies targeting the same devices for overlapping or contradictory settings.",
      [], { conflictCount: complianceStatus.conflictDeviceCount },
    ));
  }

  if (complianceStatus.errorDeviceCount > 0) {
    findings.push(finding(
      "warning", "compliance",
      `${complianceStatus.errorDeviceCount} Devices with Compliance Errors`,
      `${complianceStatus.errorDeviceCount} device(s) have errors evaluating compliance policies.`,
      "Check device connectivity and policy compatibility for errored devices.",
      [], { errorCount: complianceStatus.errorDeviceCount },
    ));
  }

  // ── 2. Configuration Profile Checks ───────────────────────────

  if (configProfiles.length === 0) {
    findings.push(finding(
      "warning", "configuration",
      "No Configuration Profiles",
      "No device configuration profiles are defined. Devices may not have consistent security baselines.",
      "Create configuration profiles to enforce security settings like BitLocker, firewall, and password requirements.",
    ));
  } else {
    // Check for stale profiles (not modified in 6+ months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const staleProfiles = configProfiles.filter(
      (p) => p.lastModifiedDateTime && new Date(p.lastModifiedDateTime as string) < sixMonthsAgo
    );
    if (staleProfiles.length > 0) {
      findings.push(finding(
        "info", "configuration",
        `${staleProfiles.length} Stale Configuration Profile${staleProfiles.length > 1 ? "s" : ""}`,
        `${staleProfiles.length} configuration profile(s) haven't been updated in over 6 months. They may need review for current security best practices.`,
        "Review and update configuration profiles to ensure they reflect current security baselines.",
        staleProfiles.map((p) => p.displayName as string),
        { profiles: staleProfiles.map((p) => ({ name: p.displayName, lastModified: p.lastModifiedDateTime })) },
      ));
    }
  }

  // ── 3. Conditional Access Checks ──────────────────────────────

  if (caPolicies.length === 0) {
    findings.push(finding(
      "critical", "conditional_access",
      "No Conditional Access Policies",
      "No Conditional Access policies are configured. There are no access controls enforcing device compliance, MFA, or location-based restrictions.",
      "Implement Conditional Access policies requiring compliant devices, MFA for risky sign-ins, and block legacy authentication.",
    ));
  } else {
    const disabledPolicies = caPolicies.filter((p) => p.state === "disabled");
    const reportOnlyPolicies = caPolicies.filter((p) => p.state === "enabledForReportingButNotEnforced");
    const enabledPolicies = caPolicies.filter((p) => p.state === "enabled");

    if (enabledPolicies.length === 0) {
      findings.push(finding(
        "critical", "conditional_access",
        "No Active Conditional Access Policies",
        `All ${caPolicies.length} Conditional Access policies are either disabled or in report-only mode. None are actively enforcing access controls.`,
        "Enable at least your critical Conditional Access policies (e.g., require MFA, require compliant device).",
        caPolicies.map((p) => p.displayName as string),
      ));
    }

    if (disabledPolicies.length > 0) {
      findings.push(finding(
        "warning", "conditional_access",
        `${disabledPolicies.length} Disabled Conditional Access Policies`,
        `${disabledPolicies.length} Conditional Access policies are disabled and not providing any protection.`,
        "Review disabled policies — enable those that should be active, or remove obsolete ones to reduce clutter.",
        disabledPolicies.map((p) => p.displayName as string),
      ));
    }

    if (reportOnlyPolicies.length > 0) {
      findings.push(finding(
        "info", "conditional_access",
        `${reportOnlyPolicies.length} Report-Only Conditional Access Policies`,
        `${reportOnlyPolicies.length} policies are in report-only mode. They log policy results but don't enforce restrictions.`,
        "Review report-only policies. If they've been tested sufficiently, consider moving to enforced mode.",
        reportOnlyPolicies.map((p) => p.displayName as string),
      ));
    }

    if (enabledPolicies.length > 0) {
      findings.push(finding(
        "good", "conditional_access",
        `${enabledPolicies.length} Active CA Policies Enforcing Access`,
        `${enabledPolicies.length} Conditional Access policies are actively enforcing access controls.`,
        "Continue monitoring CA policy effectiveness via sign-in logs.",
      ));
    }
  }

  // ── 4. Device Health Checks ───────────────────────────────────

  if (veryStaleDevices.length > 0) {
    findings.push(finding(
      "critical", "device_health",
      `${veryStaleDevices.length} Device${veryStaleDevices.length > 1 ? "s" : ""} Not Synced in 30+ Days`,
      `${veryStaleDevices.length} device(s) haven't communicated with Intune in over 30 days. These may be lost, retired, or have agent issues.`,
      "Investigate these devices. Consider retiring or wiping devices that are no longer in use.",
      veryStaleDevices.map((d) => d.deviceName as string),
      { devices: veryStaleDevices.map((d) => ({ name: d.deviceName, lastSync: d.lastSyncDateTime, user: d.userPrincipalName })) },
    ));
  } else if (staleDevices.length > 0) {
    findings.push(finding(
      "warning", "device_health",
      `${staleDevices.length} Device${staleDevices.length > 1 ? "s" : ""} Not Synced in 7+ Days`,
      `${staleDevices.length} device(s) haven't synced in over 7 days.`,
      "Check network connectivity and Intune agent status on these devices.",
      staleDevices.map((d) => d.deviceName as string),
    ));
  } else if (devices.length > 0) {
    findings.push(finding(
      "good", "device_health",
      "All Devices Actively Syncing",
      "All managed devices have synced within the last 7 days.",
      "Maintain current monitoring.",
    ));
  }

  // Check OS diversity
  const osCounts: Record<string, number> = {};
  for (const d of devices) {
    const os = (d.operatingSystem as string) || "Unknown";
    osCounts[os] = (osCounts[os] || 0) + 1;
  }
  const osEntries = Object.entries(osCounts);
  if (osEntries.length > 1) {
    findings.push(finding(
      "info", "device_health",
      `${osEntries.length} Operating Systems in Fleet`,
      `Device fleet spans ${osEntries.map(([os, count]) => `${os} (${count})`).join(", ")}. Ensure policies cover all platforms.`,
      "Verify compliance and configuration policies exist for each OS platform in your environment.",
      [], { osCounts },
    ));
  }

  // ── 5. App Management Checks ──────────────────────────────────

  if (apps.length === 0) {
    findings.push(finding(
      "info", "app_management",
      "No Managed Apps",
      "No mobile apps are configured in Intune. App deployment and management is not being used.",
      "Consider deploying required apps through Intune for consistent software management.",
    ));
  } else {
    findings.push(finding(
      "good", "app_management",
      `${apps.length} Apps Under Management`,
      `${apps.length} mobile apps are configured in Intune for deployment and management.`,
      "Monitor app installation status for failures.",
    ));
  }

  // ── 6. Security Posture Checks ────────────────────────────────

  // Check for devices with no user (potentially unassigned)
  const noUserDevices = devices.filter(
    (d) => !d.userPrincipalName || (d.userPrincipalName as string).trim() === ""
  );
  if (noUserDevices.length > 0) {
    findings.push(finding(
      "info", "security",
      `${noUserDevices.length} Device${noUserDevices.length > 1 ? "s" : ""} Without Assigned User`,
      `${noUserDevices.length} device(s) have no assigned user principal name. These may be shared devices or kiosks.`,
      "Ensure unassigned devices are intentional (e.g., shared/kiosk devices). Assign users where appropriate for targeted policy delivery.",
      noUserDevices.map((d) => d.deviceName as string),
    ));
  }

  // Check for personal vs corporate ownership balance
  const personalDevices = devices.filter((d) => d.managedDeviceOwnerType === "personal");
  if (personalDevices.length > 0 && personalDevices.length > devices.length * 0.5) {
    findings.push(finding(
      "warning", "security",
      `${Math.round((personalDevices.length / devices.length) * 100)}% Personal Devices (BYOD)`,
      `${personalDevices.length} of ${devices.length} devices are personal/BYOD. High BYOD rates require strong MAM and conditional access policies.`,
      "Ensure Mobile Application Management (MAM) policies are configured for personal devices. Consider stricter CA policies for unmanaged devices.",
      [], { personalCount: personalDevices.length, corporateCount: devices.length - personalDevices.length },
    ));
  }

  // ── Compute Score ─────────────────────────────────────────────

  let score = 100;
  for (const f of findings) {
    if (f.severity === "critical") score -= 15;
    else if (f.severity === "warning") score -= 5;
    // info and good don't reduce score
  }
  score = Math.max(0, Math.min(100, score));

  const summary = {
    critical: findings.filter((f) => f.severity === "critical").length,
    warning: findings.filter((f) => f.severity === "warning").length,
    info: findings.filter((f) => f.severity === "info").length,
    good: findings.filter((f) => f.severity === "good").length,
  };

  return {
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - start,
    score,
    findings,
    summary,
    stats: {
      totalDevices: devices.length,
      compliantDevices: complianceStatus.compliantDeviceCount,
      nonCompliantDevices: complianceStatus.nonCompliantDeviceCount,
      compliancePolicies: compliancePolicies.length,
      configurationProfiles: configProfiles.length,
      conditionalAccessPolicies: caPolicies.length,
      managedApps: apps.length,
      staleDevices: staleDevices.length,
    },
  };
}
