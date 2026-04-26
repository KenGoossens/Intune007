/**
 * Autopilot Onboarding Engine — Full automated pipeline to register and
 * prepare a device for Windows Autopilot deployment.
 *
 * Pipeline:
 *   Step 1: Import hardware hash into Autopilot
 *   Step 2: Wait for import processing
 *   Step 3: Set group tag for dynamic group targeting
 *   Step 4: Add device to an Autopilot deployment group
 *   Step 5: Verify profile assignment
 *
 * The hardware hash must be collected from the device first using:
 *   PowerShell: Get-WindowsAutopilotInfo -OutputFile autopilot.csv
 *   Or OEM: provided by the manufacturer
 *
 * Graph API Endpoints:
 *   POST /deviceManagement/importedWindowsAutopilotDeviceIdentities
 *   POST .../windowsAutopilotDeviceIdentities/{id}/updateDeviceProperties
 *   POST /groups/{groupId}/members/$ref
 *
 * Required Permission: DeviceManagementServiceConfig.ReadWrite.All
 */

import { getGraphClient, fetchWithPagination } from "../graph/client.js";
import { sanitizeOData } from "../security.js";

const BETA = "https://graph.microsoft.com/beta";

export interface OnboardingStep {
  step: number;
  name: string;
  status: "success" | "failed" | "skipped" | "pending";
  detail: string;
  data?: unknown;
}

export interface OnboardingResult {
  serialNumber: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  success: boolean;
  steps: OnboardingStep[];
  summary: string;
  autopilotDeviceId?: string;
}

/**
 * Full Autopilot onboarding pipeline.
 *
 * @param serialNumber Device serial number
 * @param hardwareHash Base64-encoded hardware hash (from Get-WindowsAutopilotInfo)
 * @param options.groupTag Group tag for dynamic group targeting
 * @param options.assignedUserUpn UPN of the user to pre-assign
 * @param options.targetGroupId Azure AD group to add the device to (for profile targeting)
 * @param options.orderNumber Purchase order identifier
 */
export async function onboardAutopilotDevice(
  serialNumber: string,
  hardwareHash: string,
  options?: {
    groupTag?: string;
    assignedUserUpn?: string;
    targetGroupId?: string;
    orderNumber?: string;
  }
): Promise<OnboardingResult> {
  const start = Date.now();
  const client = getGraphClient();
  const steps: OnboardingStep[] = [];
  let autopilotDeviceId: string | undefined;

  // ─── Step 1: Check if device already exists in Autopilot ────

  let existingDevice: Record<string, unknown> | null = null;
  try {
    const existing = await fetchWithPagination<Record<string, unknown>>(
      client,
      `${BETA}/deviceManagement/windowsAutopilotDeviceIdentities`,
      { filter: `contains(serialNumber,'${sanitizeOData(serialNumber)}')`, maxItems: 5 }
    );
    existingDevice = existing.items.find(
      (d) => String(d.serialNumber) === serialNumber
    ) || null;
  } catch { /* not found */ }

  if (existingDevice) {
    autopilotDeviceId = String(existingDevice.id);
    steps.push({
      step: 1,
      name: "Import Hardware Hash",
      status: "skipped",
      detail: `Device already registered in Autopilot (ID: ${autopilotDeviceId})`,
      data: { existingId: autopilotDeviceId, enrollmentState: existingDevice.enrollmentState },
    });
  } else {
    // ─── Step 1: Import the hardware hash ──────────────────

    try {
      const importResult = await client
        .api(`${BETA}/deviceManagement/importedWindowsAutopilotDeviceIdentities`)
        .post({
          "@odata.type": "#microsoft.graph.importedWindowsAutopilotDeviceIdentity",
          serialNumber,
          hardwareIdentifier: hardwareHash,
          groupTag: options?.groupTag || "",
          assignedUserPrincipalName: options?.assignedUserUpn || "",
          productKey: "",
        });

      const importId = importResult.id;
      steps.push({
        step: 1,
        name: "Import Hardware Hash",
        status: "success",
        detail: `Hardware hash imported successfully. Import ID: ${importId}`,
        data: { importId, status: importResult.state?.deviceImportStatus },
      });

      // ─── Step 2: Wait for import processing ──────────────
      // The import is async — we need to poll for completion
      let importStatus = importResult.state?.deviceImportStatus || "pending";
      let retries = 0;
      const maxRetries = 10;

      while (importStatus === "pending" && retries < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 3000)); // wait 3s
        try {
          const check = await client
            .api(`${BETA}/deviceManagement/importedWindowsAutopilotDeviceIdentities/${importId}`)
            .get();
          importStatus = check.state?.deviceImportStatus || "pending";
          if (importStatus === "complete" || importStatus === "success") {
            break;
          }
          if (check.state?.deviceErrorCode && check.state.deviceErrorCode !== 0) {
            importStatus = "error";
            steps.push({
              step: 2,
              name: "Process Import",
              status: "failed",
              detail: `Import error: ${check.state.deviceErrorName || "Unknown error"} (code: ${check.state.deviceErrorCode})`,
            });
            break;
          }
        } catch { /* keep polling */ }
        retries++;
      }

      if (importStatus === "pending") {
        steps.push({
          step: 2,
          name: "Process Import",
          status: "pending",
          detail: "Import is still processing. The device will appear in Autopilot within a few minutes. Check back later.",
        });
      } else if (importStatus !== "error") {
        steps.push({
          step: 2,
          name: "Process Import",
          status: "success",
          detail: `Import processed successfully. Status: ${importStatus}`,
        });
      }

      // Find the newly created Autopilot device identity
      try {
        const newDevices = await fetchWithPagination<Record<string, unknown>>(
          client,
          `${BETA}/deviceManagement/windowsAutopilotDeviceIdentities`,
          { filter: `contains(serialNumber,'${sanitizeOData(serialNumber)}')`, maxItems: 5 }
        );
        const newDevice = newDevices.items.find(
          (d) => String(d.serialNumber) === serialNumber
        );
        if (newDevice) {
          autopilotDeviceId = String(newDevice.id);
        }
      } catch { /* may not be ready yet */ }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      steps.push({
        step: 1,
        name: "Import Hardware Hash",
        status: "failed",
        detail: `Failed to import hardware hash: ${msg}`,
      });

      return buildResult(serialNumber, start, false, steps, autopilotDeviceId,
        "Onboarding failed at Step 1: Hardware hash import failed. Verify the hash is valid Base64.");
    }
  }

  // ─── Step 3: Set Group Tag ──────────────────────────────────

  if (options?.groupTag && autopilotDeviceId) {
    try {
      await client
        .api(`${BETA}/deviceManagement/windowsAutopilotDeviceIdentities/${autopilotDeviceId}/updateDeviceProperties`)
        .post({ groupTag: options.groupTag });

      steps.push({
        step: 3,
        name: "Set Group Tag",
        status: "success",
        detail: `Group tag set to "${options.groupTag}"`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      steps.push({
        step: 3,
        name: "Set Group Tag",
        status: "failed",
        detail: `Failed to set group tag: ${msg}`,
      });
    }
  } else if (!options?.groupTag) {
    steps.push({
      step: 3,
      name: "Set Group Tag",
      status: "skipped",
      detail: "No group tag specified. Device will use default targeting.",
    });
  }

  // ─── Step 4: Add to Deployment Group ────────────────────────

  if (options?.targetGroupId) {
    // We need the Azure AD device object — Autopilot device may create one
    try {
      // Try to find the Azure AD device by serial number or managed device ID
      let aadDeviceId: string | null = null;

      if (existingDevice?.azureAdDeviceId) {
        aadDeviceId = String(existingDevice.azureAdDeviceId);
      } else if (existingDevice?.managedDeviceId) {
        // Look up the Azure AD device via managed device
        try {
          const managedDevice = await client
            .api(`${BETA}/deviceManagement/managedDevices/${existingDevice.managedDeviceId}`)
            .select("azureADDeviceId")
            .get();
          aadDeviceId = managedDevice.azureADDeviceId;
        } catch { /* skip */ }
      }

      if (!aadDeviceId) {
        // Try finding by display name matching serial
        const aadDevices = await fetchWithPagination<Record<string, unknown>>(
          client,
          "/devices",
          { filter: `displayName eq '${sanitizeOData(serialNumber)}'`, select: "id", maxItems: 1 }
        );
        if (aadDevices.items.length > 0) {
          aadDeviceId = String(aadDevices.items[0].id);
        }
      }

      if (aadDeviceId) {
        try {
          await client.api(`/groups/${options.targetGroupId}/members/$ref`).post({
            "@odata.id": `https://graph.microsoft.com/v1.0/directoryObjects/${aadDeviceId}`,
          });
          steps.push({
            step: 4,
            name: "Add to Deployment Group",
            status: "success",
            detail: `Device added to group ${options.targetGroupId}`,
          });
        } catch (err: unknown) {
          const msg = String((err as Error).message || "");
          if (msg.includes("already exist")) {
            steps.push({
              step: 4,
              name: "Add to Deployment Group",
              status: "skipped",
              detail: "Device is already a member of the target group",
            });
          } else {
            steps.push({
              step: 4,
              name: "Add to Deployment Group",
              status: "failed",
              detail: `Failed to add to group: ${msg.substring(0, 150)}`,
            });
          }
        }
      } else {
        steps.push({
          step: 4,
          name: "Add to Deployment Group",
          status: "pending",
          detail: "Azure AD device object not found yet. For newly imported devices, the Azure AD object is created when the device first connects. The group membership can be set up via dynamic groups using the group tag instead.",
        });
      }
    } catch (err: unknown) {
      steps.push({
        step: 4,
        name: "Add to Deployment Group",
        status: "failed",
        detail: `Error: ${(err as Error).message?.substring(0, 150)}`,
      });
    }
  } else {
    steps.push({
      step: 4,
      name: "Add to Deployment Group",
      status: "skipped",
      detail: "No target group specified. Use a dynamic group with the group tag for automatic targeting.",
    });
  }

  // ─── Step 5: Verify Profile Assignment ──────────────────────

  if (autopilotDeviceId) {
    try {
      const device = await client
        .api(`${BETA}/deviceManagement/windowsAutopilotDeviceIdentities/${autopilotDeviceId}`)
        .get();

      const profileStatus = String(device.deploymentProfileAssignmentStatus || "").toLowerCase();
      if (profileStatus.includes("assigned")) {
        steps.push({
          step: 5,
          name: "Verify Profile Assignment",
          status: "success",
          detail: `Deployment profile assigned (status: ${profileStatus})`,
          data: { profileAssignedDate: device.deploymentProfileAssignedDateTime },
        });
      } else {
        steps.push({
          step: 5,
          name: "Verify Profile Assignment",
          status: "pending",
          detail: `Profile not yet assigned (status: ${profileStatus || "none"}). This typically happens automatically when the device is added to a group that has an Autopilot profile assigned. If using a dynamic group with the group tag, allow a few minutes for group membership to sync.`,
        });
      }
    } catch {
      steps.push({
        step: 5,
        name: "Verify Profile Assignment",
        status: "pending",
        detail: "Could not verify profile assignment. Check Intune portal.",
      });
    }
  }

  // ─── Build Result ───────────────────────────────────────────

  const successCount = steps.filter((s) => s.status === "success").length;
  const failedCount = steps.filter((s) => s.status === "failed").length;
  const pendingCount = steps.filter((s) => s.status === "pending").length;
  const success = failedCount === 0;

  let summary = `Autopilot onboarding for serial ${serialNumber}: `;
  summary += `${successCount} step(s) completed, `;
  if (failedCount > 0) summary += `${failedCount} failed, `;
  if (pendingCount > 0) summary += `${pendingCount} pending, `;
  summary += `${steps.filter((s) => s.status === "skipped").length} skipped.`;

  if (pendingCount > 0 && failedCount === 0) {
    summary += " Some steps are pending — the device may need to sync or connect to complete setup.";
  }

  return buildResult(serialNumber, start, success, steps, autopilotDeviceId, summary);
}

function buildResult(
  serialNumber: string,
  start: number,
  success: boolean,
  steps: OnboardingStep[],
  autopilotDeviceId: string | undefined,
  summary: string
): OnboardingResult {
  return {
    serialNumber,
    startedAt: new Date(start).toISOString(),
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - start,
    success,
    steps,
    summary,
    autopilotDeviceId,
  };
}

/**
 * Generate the PowerShell script to collect the hardware hash from a device.
 * If an ingestUrl is provided, the script will automatically POST the hash.
 * Otherwise it saves to CSV for manual import.
 */
export function getHardwareHashCollectionScript(ingestUrl?: string, apiKey?: string, groupTag?: string): string {
  if (ingestUrl) {
    // Self-posting script — collects hash AND uploads to Azure Function or Intune007 API
    return `#Requires -RunAsAdministrator
$ErrorActionPreference = "Stop"

# ─── Configuration ────────────────────────────────────────────
$IngestUrl = "${ingestUrl}"
$ApiKey    = "${apiKey || ""}"
$GroupTag  = "${groupTag || ""}"
# ──────────────────────────────────────────────────────────────

Write-Host "Intune007 — Autopilot Hardware Hash Collector" -ForegroundColor Cyan

# Collect device info
$serial = (Get-WmiObject -Class Win32_BIOS).SerialNumber
$manufacturer = (Get-WmiObject -Class Win32_ComputerSystem).Manufacturer
$model = (Get-WmiObject -Class Win32_ComputerSystem).Model
Write-Host "Device: $manufacturer $model (Serial: $serial)"

# Collect hardware hash
$hardwareHash = (Get-WmiObject -Namespace root/cimv2/mdm/dmmap -Class MDM_DevDetail_Ext01 -Filter "InstanceID='Ext' AND ParentID='./DevDetail'").DeviceHardwareData
if (-not $hardwareHash -or $hardwareHash.Length -lt 100) {
    Write-Host "ERROR: Failed to collect hardware hash. Ensure TPM is available." -ForegroundColor Red
    exit 1
}
Write-Host "Hardware hash collected ($($hardwareHash.Length) characters)"

# Upload to Intune007
$body = @{ serialNumber = $serial; hardwareHash = $hardwareHash; groupTag = $GroupTag } | ConvertTo-Json
$headers = @{ "Content-Type" = "application/json" }
if ($ApiKey) { $headers["x-api-key"] = $ApiKey }

try {
    $response = Invoke-RestMethod -Uri $IngestUrl -Method POST -Headers $headers -Body $body -TimeoutSec 30
    Write-Host "SUCCESS: $($response.message)" -ForegroundColor Green
} catch {
    Write-Host "Upload failed: $_" -ForegroundColor Red
    $csv = "C:\\AutopilotHWID-$serial.csv"
    @('"Device Serial Number","Windows Product ID","Hardware Hash"', """$serial"","""",""$hardwareHash""") | Out-File $csv -Encoding UTF8
    Write-Host "Saved fallback CSV: $csv" -ForegroundColor Yellow
}`;
  }

  // Basic script — saves to CSV for manual import or paste into Intune007 UI
  return `#Requires -RunAsAdministrator
$ErrorActionPreference = "Stop"

Write-Host "Intune007 — Autopilot Hardware Hash Collector" -ForegroundColor Cyan

# Collect device info
$serial = (Get-WmiObject -Class Win32_BIOS).SerialNumber
$manufacturer = (Get-WmiObject -Class Win32_ComputerSystem).Manufacturer
$model = (Get-WmiObject -Class Win32_ComputerSystem).Model
Write-Host "Device: $manufacturer $model (Serial: $serial)"

# Collect hardware hash via WMI/MDM bridge
$hardwareHash = (Get-WmiObject -Namespace root/cimv2/mdm/dmmap -Class MDM_DevDetail_Ext01 -Filter "InstanceID='Ext' AND ParentID='./DevDetail'").DeviceHardwareData

if (-not $hardwareHash -or $hardwareHash.Length -lt 100) {
    Write-Host "ERROR: Failed to collect hardware hash." -ForegroundColor Red
    Write-Host "Possible causes: No TPM, TPM disabled in BIOS, or VM without vTPM" -ForegroundColor Yellow
    exit 1
}

Write-Host "Hardware hash collected ($($hardwareHash.Length) characters)" -ForegroundColor Green

# Save to CSV (standard Autopilot import format)
$csvPath = "C:\\AutopilotHWID-$serial.csv"
@('"Device Serial Number","Windows Product ID","Hardware Hash"', """$serial"","""",""$hardwareHash""") | Out-File $csvPath -Encoding UTF8
Write-Host "Saved to: $csvPath" -ForegroundColor Green

# Also display for copy/paste into Intune007 UI
Write-Host ""
Write-Host "═══ Serial Number ═══" -ForegroundColor Cyan
Write-Host $serial
Write-Host ""
Write-Host "═══ Hardware Hash (copy this) ═══" -ForegroundColor Cyan
Write-Host $hardwareHash
Write-Host ""
Write-Host "You can:" -ForegroundColor Yellow
Write-Host "  1. Import the CSV in Intune portal (Devices > Windows > Enrollment)" -ForegroundColor Gray
Write-Host "  2. Paste the serial + hash into Intune007 Autopilot panel" -ForegroundColor Gray
Write-Host "  3. Use the Intune007 agent: 'Onboard device with serial $serial'" -ForegroundColor Gray`;
}
