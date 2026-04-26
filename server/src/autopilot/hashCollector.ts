/**
 * Autopilot Hash Collector via Proactive Remediation
 *
 * For devices that ARE already enrolled in Intune but NOT registered
 * in Autopilot. This deploys a Proactive Remediation (deviceHealthScript)
 * that:
 *   Detection:  Checks if the device is already in Autopilot
 *   Remediation: Collects the hardware hash and writes it to registry
 *                where we can read it back via Graph API (deviceManagementScripts
 *                output or custom compliance)
 *
 * Flow:
 *   1. Deploy Proactive Remediation to target group
 *   2. Detection runs → checks registry for existing hash submission
 *   3. If not submitted → Remediation runs → collects hash → writes to registry
 *   4. We poll the deviceRunStates to get the output (hash is in pre/post output)
 *   5. Once we have the hash → import into Autopilot via Graph API
 *
 * This is for the "convert existing enrolled device to Autopilot" scenario.
 */

import { getGraphClient, fetchWithPagination } from "../graph/client.js";
import {
  createRemediationScript,
  assignRemediationScript,
  getRemediationScriptDeviceStates,
  listRemediationScripts,
} from "../graph/remediation.js";
import { onboardAutopilotDevice } from "./onboarding.js";
import { sanitizeOData } from "../security.js";

const BETA = "https://graph.microsoft.com/beta";

// ─── PowerShell Scripts ──────────────────────────────────────

const DETECTION_SCRIPT = `
# Intune007 Autopilot Hash Collector — Detection Script
# Checks if this device has already submitted its hardware hash
$ErrorActionPreference = "Stop"

$regPath = "HKLM:\\SOFTWARE\\Intune007\\AutopilotHash"

try {
    # Check if hash was already collected and submitted
    if (Test-Path $regPath) {
        $submitted = (Get-ItemProperty -Path $regPath -Name "Submitted" -ErrorAction SilentlyContinue).Submitted
        if ($submitted -eq "True") {
            Write-Output "Hardware hash already submitted to Autopilot."
            exit 0  # Compliant — no action needed
        }
    }
    
    # Also check if device is already an Autopilot device
    $serial = (Get-WmiObject -Class Win32_BIOS).SerialNumber
    $autopilotInfo = Get-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Provisioning\\AutopilotPolicy" -ErrorAction SilentlyContinue
    if ($autopilotInfo -and $autopilotInfo.CloudAssignedTenantId) {
        Write-Output "Device is already Autopilot-registered (tenant: $($autopilotInfo.CloudAssignedTenantId))."
        # Mark as submitted so we don't re-run
        if (-not (Test-Path $regPath)) { New-Item -Path $regPath -Force | Out-Null }
        Set-ItemProperty -Path $regPath -Name "Submitted" -Value "True"
        exit 0  # Compliant
    }
    
    # Hash not yet collected — remediation needed
    Write-Output "Hardware hash not yet collected for serial: $serial"
    exit 1  # Non-compliant — trigger remediation
} catch {
    Write-Output "Error during detection: $_"
    exit 1  # Trigger remediation on error
}
`;

const REMEDIATION_SCRIPT = `
# Intune007 Autopilot Hash Collector — Remediation Script
# Collects the hardware hash and stores it in registry for Intune007 to read
$ErrorActionPreference = "Stop"

$regPath = "HKLM:\\SOFTWARE\\Intune007\\AutopilotHash"

try {
    # Collect device info
    $serial = (Get-WmiObject -Class Win32_BIOS).SerialNumber
    $manufacturer = (Get-WmiObject -Class Win32_ComputerSystem).Manufacturer
    $model = (Get-WmiObject -Class Win32_ComputerSystem).Model
    
    Write-Output "Collecting hardware hash for $manufacturer $model (Serial: $serial)..."
    
    # Collect the hardware hash via WMI
    $devDetail = Get-WmiObject -Namespace root/cimv2/mdm/dmmap -Class MDM_DevDetail_Ext01 -Filter "InstanceID='Ext' AND ParentID='./DevDetail'"
    $hardwareHash = $devDetail.DeviceHardwareData
    
    if (-not $hardwareHash -or $hardwareHash.Length -lt 100) {
        Write-Output "ERROR: Hardware hash is empty or too short ($($hardwareHash.Length) chars). TPM may not be available."
        exit 1
    }
    
    Write-Output "Hardware hash collected ($($hardwareHash.Length) characters)."
    
    # Store in registry so Intune007 can read it via script output
    if (-not (Test-Path $regPath)) {
        New-Item -Path $regPath -Force | Out-Null
    }
    Set-ItemProperty -Path $regPath -Name "SerialNumber" -Value $serial
    Set-ItemProperty -Path $regPath -Name "HardwareHash" -Value $hardwareHash
    Set-ItemProperty -Path $regPath -Name "Manufacturer" -Value $manufacturer
    Set-ItemProperty -Path $regPath -Name "Model" -Value $model
    Set-ItemProperty -Path $regPath -Name "CollectedAt" -Value (Get-Date -Format "o")
    Set-ItemProperty -Path $regPath -Name "Submitted" -Value "False"
    
    # IMPORTANT: Write the hash to stdout (pre-remediation output)
    # Intune007 reads this from the deviceRunStates API
    Write-Output "INTUNE007_HASH_START"
    Write-Output "SerialNumber=$serial"
    Write-Output "HardwareHash=$hardwareHash"
    Write-Output "Manufacturer=$manufacturer"
    Write-Output "Model=$model"
    Write-Output "INTUNE007_HASH_END"
    
    exit 0  # Success
} catch {
    Write-Output "ERROR: Failed to collect hardware hash: $_"
    exit 1
}
`;

export interface HashCollectionDeployment {
  scriptId: string;
  displayName: string;
  assigned: boolean;
  groupId: string;
}

export interface CollectedHash {
  deviceName: string;
  serialNumber: string;
  hardwareHash: string;
  manufacturer?: string;
  model?: string;
  collectedAt?: string;
  runState: string;
}

/**
 * Deploy the hardware hash collector as a Proactive Remediation
 * to a target group of enrolled devices.
 */
export async function deployHashCollector(
  targetGroupId: string,
  options?: {
    displayName?: string;
    scheduleIntervalMinutes?: number;
  }
): Promise<HashCollectionDeployment> {
  const displayName =
    options?.displayName || "Intune007 — Autopilot Hash Collector";

  // Check if already deployed
  const existing = await listRemediationScripts({
    filter: `displayName eq '${sanitizeOData(displayName)}'`,
  });

  if (existing.items.length > 0) {
    const existingId = String(existing.items[0].id);
    console.log(
      `[HashCollector] Script already exists: ${existingId}. Re-assigning to group.`
    );

    // Re-assign to the target group
    await assignRemediationScript(
      existingId,
      targetGroupId,
      { intervalInMinutes: options?.scheduleIntervalMinutes }
    );

    return {
      scriptId: existingId,
      displayName,
      assigned: true,
      groupId: targetGroupId,
    };
  }

  // Create the Proactive Remediation
  const detectionBase64 = Buffer.from(DETECTION_SCRIPT, "utf-8").toString(
    "base64"
  );
  const remediationBase64 = Buffer.from(REMEDIATION_SCRIPT, "utf-8").toString(
    "base64"
  );

  const result = await createRemediationScript({
    displayName,
    description:
      "Intune007 automated hardware hash collector for Autopilot registration. Collects the device hardware hash and outputs it for automatic import.",
    detectionScriptContent: detectionBase64,
    remediationScriptContent: remediationBase64,
    runAsAccount: "system",
    enforceSignatureCheck: false,
    runAs32Bit: false,
  });

  const scriptId = String(result.id);
  console.log(`[HashCollector] Created Proactive Remediation: ${scriptId}`);

  // Assign to the target group
  await assignRemediationScript(scriptId, targetGroupId, {
    intervalInMinutes: options?.scheduleIntervalMinutes,
  });
  console.log(
    `[HashCollector] Assigned to group: ${targetGroupId}`
  );

  return {
    scriptId,
    displayName,
    assigned: true,
    groupId: targetGroupId,
  };
}

/**
 * Poll the Proactive Remediation run states to find devices that have
 * reported their hardware hash. Parses the script output for the
 * INTUNE007_HASH_START/END markers.
 */
export async function pollCollectedHashes(
  scriptId: string
): Promise<CollectedHash[]> {
  const states = await getRemediationScriptDeviceStates(scriptId, {
    top: 100,
  });

  const collected: CollectedHash[] = [];

  for (const state of states.items) {
    const preOutput = String(state.preRemediationDetectionScriptOutput || "");
    const postOutput = String(
      state.postRemediationDetectionScriptOutput || ""
    );
    const remediationOutput = String(
      state.remediationScriptOutput || ""
    );

    // Look for our markers in any of the output fields
    const allOutput = `${preOutput}\n${postOutput}\n${remediationOutput}`;
    const hashMatch = allOutput.match(
      /INTUNE007_HASH_START\s*([\s\S]*?)\s*INTUNE007_HASH_END/
    );

    if (hashMatch) {
      const lines = hashMatch[1].split("\n").map((l) => l.trim());
      const data: Record<string, string> = {};
      for (const line of lines) {
        const [key, ...valueParts] = line.split("=");
        if (key && valueParts.length > 0) {
          data[key] = valueParts.join("=");
        }
      }

      if (data.SerialNumber && data.HardwareHash) {
        collected.push({
          deviceName: String(state.managedDeviceName || state.deviceName || "Unknown"),
          serialNumber: data.SerialNumber,
          hardwareHash: data.HardwareHash,
          manufacturer: data.Manufacturer,
          model: data.Model,
          collectedAt: String(state.lastStateUpdateDateTime || ""),
          runState: String(state.remediationState || state.detectionState || "unknown"),
        });
      }
    }
  }

  return collected;
}

/**
 * Full automated pipeline:
 * 1. Poll collected hashes from the Proactive Remediation
 * 2. Import each one into Autopilot
 * 3. Return results
 */
export async function processCollectedHashes(
  scriptId: string,
  options?: {
    groupTag?: string;
    targetGroupId?: string;
    autoImport?: boolean;
  }
): Promise<{
  collected: CollectedHash[];
  imported: Array<{
    serialNumber: string;
    success: boolean;
    detail: string;
  }>;
}> {
  const collected = await pollCollectedHashes(scriptId);
  console.log(
    `[HashCollector] Found ${collected.length} device(s) with collected hashes`
  );

  const imported: Array<{
    serialNumber: string;
    success: boolean;
    detail: string;
  }> = [];

  if (options?.autoImport !== false) {
    for (const hash of collected) {
      try {
        const result = await onboardAutopilotDevice(
          hash.serialNumber,
          hash.hardwareHash,
          {
            groupTag: options?.groupTag,
            targetGroupId: options?.targetGroupId,
          }
        );
        imported.push({
          serialNumber: hash.serialNumber,
          success: result.success,
          detail: result.summary,
        });

        // Mark as submitted in the registry on next run
        // (The detection script will see it's already imported)
      } catch (err: unknown) {
        imported.push({
          serialNumber: hash.serialNumber,
          success: false,
          detail:
            err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return { collected, imported };
}
