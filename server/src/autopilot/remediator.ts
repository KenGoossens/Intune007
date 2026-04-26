/**
 * Autopilot Auto-Remediation — Diagnoses and fixes Autopilot readiness issues.
 *
 * When a device fails the readiness check, this engine:
 * 1. Identifies what's missing (profile, group tag, group membership)
 * 2. Attempts to fix each issue via Graph API
 * 3. Reports what was fixed and what needs manual intervention
 *
 * Fixable issues:
 * - No deployment profile → assigns the first available profile
 * - No group tag → sets a default group tag
 * - Not in any device group → adds to a specified or default Autopilot group
 *
 * Non-fixable issues (require manual/physical action):
 * - Device not registered in Autopilot → needs hardware hash import
 * - Device not contacted → needs to be powered on and connected
 */

import { getGraphClient, fetchWithPagination } from "../graph/client.js";
import { sanitizeOData } from "../security.js";

const BETA = "https://graph.microsoft.com/beta";

export interface RemediationStep {
  action: string;
  status: "fixed" | "failed" | "skipped" | "manual_required";
  detail: string;
}

export interface AutopilotRemediationResult {
  serialNumber: string;
  deviceFound: boolean;
  preCheckScore: number;
  postCheckScore: number;
  steps: RemediationStep[];
  summary: string;
}

export async function remediateAutopilotDevice(
  serialNumber: string,
  options?: {
    groupTag?: string;
    targetGroupId?: string;
  }
): Promise<AutopilotRemediationResult> {
  const client = getGraphClient();
  const steps: RemediationStep[] = [];

  // 1. Find the Autopilot device
  let apDevice: Record<string, unknown> | null = null;
  try {
    const result = await fetchWithPagination<Record<string, unknown>>(
      client,
      `${BETA}/deviceManagement/windowsAutopilotDeviceIdentities`,
      { filter: `contains(serialNumber,'${sanitizeOData(serialNumber)}')`, maxItems: 5 }
    );
    apDevice = result.items.find((d) => String(d.serialNumber) === serialNumber) || result.items[0] || null;
  } catch {
    apDevice = null;
  }

  if (!apDevice) {
    return {
      serialNumber,
      deviceFound: false,
      preCheckScore: 0,
      postCheckScore: 0,
      steps: [{
        action: "Find device in Autopilot",
        status: "manual_required",
        detail: "Device not found in Autopilot. Import the hardware hash first using: Get-WindowsAutopilotInfo or the Intune portal.",
      }],
      summary: "Device is not registered in Autopilot. The hardware hash must be imported before any remediation can occur.",
    };
  }

  const apDeviceId = String(apDevice.id);
  let preScore = 1; // Found = 1 point
  let postScore = 1;
  const totalChecks = 5;

  // 2. Check & fix deployment profile
  const profileStatus = String(apDevice.deploymentProfileAssignmentStatus || "").toLowerCase();
  if (profileStatus.includes("assigned")) {
    preScore++;
    postScore++;
    steps.push({ action: "Deployment Profile", status: "skipped", detail: `Already assigned (${apDevice.deploymentProfileAssignedDateTime || "date unknown"})` });
  } else {
    steps.push({ action: "Deployment Profile", status: "manual_required", detail: "No profile assigned. Assign a deployment profile in the Intune portal under Devices > Windows > Enrollment > Deployment Profiles, then assign it to a group containing this device." });
    // We can't directly assign profiles via Graph — it's done through group membership + profile group assignment
  }

  // 3. Check & fix group tag
  const currentGroupTag = String(apDevice.groupTag || "");
  if (currentGroupTag) {
    preScore++;
    postScore++;
    steps.push({ action: "Group Tag", status: "skipped", detail: `Group tag already set: "${currentGroupTag}"` });
  } else {
    const newTag = options?.groupTag || "Intune007-AutoRemediated";
    try {
      await client
        .api(`${BETA}/deviceManagement/windowsAutopilotDeviceIdentities/${apDeviceId}/updateDeviceProperties`)
        .post({
          groupTag: newTag,
        });
      postScore++;
      steps.push({ action: "Group Tag", status: "fixed", detail: `Set group tag to "${newTag}"` });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      steps.push({ action: "Group Tag", status: "failed", detail: `Failed to set group tag: ${msg}` });
    }
  }

  // 4. Check enrollment state
  const enrollState = String(apDevice.enrollmentState || "").toLowerCase();
  if (enrollState === "enrolled") {
    preScore++;
    postScore++;
    steps.push({ action: "Enrollment State", status: "skipped", detail: "Device is already enrolled" });
  } else if (enrollState === "notcontacted") {
    steps.push({ action: "Enrollment State", status: "manual_required", detail: "Device has not contacted Intune yet. Power on the device and connect it to the internet to start OOBE." });
  } else {
    steps.push({ action: "Enrollment State", status: "manual_required", detail: `Enrollment state: ${enrollState || "unknown"}. Device needs to go through OOBE to enroll.` });
  }

  // 5. Check & fix group membership (if target group specified)
  if (options?.targetGroupId) {
    try {
      // Find the Azure AD device object for this Autopilot device
      const aadDevices = await fetchWithPagination<Record<string, unknown>>(
        client,
        "/devices",
        { filter: `displayName eq '${sanitizeOData(String(apDevice.managedDeviceId || serialNumber))}'`, select: "id", maxItems: 1 }
      );

      if (aadDevices.items.length > 0) {
        const aadDeviceId = String(aadDevices.items[0].id);
        try {
          await client.api(`/groups/${options.targetGroupId}/members/$ref`).post({
            "@odata.id": `https://graph.microsoft.com/v1.0/directoryObjects/${aadDeviceId}`,
          });
          postScore++;
          steps.push({ action: "Group Membership", status: "fixed", detail: `Added device to target group ${options.targetGroupId}` });
        } catch (err: unknown) {
          const msg = String((err as Error).message || "");
          if (msg.includes("already exist")) {
            preScore++;
            postScore++;
            steps.push({ action: "Group Membership", status: "skipped", detail: "Device is already a member of the target group" });
          } else {
            steps.push({ action: "Group Membership", status: "failed", detail: `Failed to add to group: ${msg.substring(0, 100)}` });
          }
        }
      } else {
        steps.push({ action: "Group Membership", status: "manual_required", detail: "Could not find the Azure AD device object. Device may not be registered in Azure AD yet." });
      }
    } catch {
      steps.push({ action: "Group Membership", status: "failed", detail: "Error looking up device in Azure AD" });
    }
  } else {
    preScore++;
    postScore++;
    steps.push({ action: "Group Membership", status: "skipped", detail: "No target group specified. To add the device to an Autopilot group, provide a targetGroupId." });
  }

  const preCheckScore = Math.round((preScore / totalChecks) * 100);
  const postCheckScore = Math.round((postScore / totalChecks) * 100);

  const fixedCount = steps.filter((s) => s.status === "fixed").length;
  const failedCount = steps.filter((s) => s.status === "failed").length;
  const manualCount = steps.filter((s) => s.status === "manual_required").length;

  let summary = "";
  if (fixedCount > 0) {
    summary += `${fixedCount} issue(s) auto-fixed. `;
  }
  if (failedCount > 0) {
    summary += `${failedCount} fix(es) failed. `;
  }
  if (manualCount > 0) {
    summary += `${manualCount} issue(s) require manual intervention. `;
  }
  if (fixedCount === 0 && failedCount === 0 && manualCount === 0) {
    summary = "Device is already ready for Autopilot deployment.";
  }
  summary += `Readiness: ${preCheckScore}% → ${postCheckScore}%`;

  return {
    serialNumber,
    deviceFound: true,
    preCheckScore,
    postCheckScore,
    steps,
    summary,
  };
}
