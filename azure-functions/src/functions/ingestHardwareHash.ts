/**
 * Azure Function: IngestHardwareHash
 *
 * HTTP-triggered function that accepts hardware hash submissions from
 * devices during OOBE or provisioning. This is the public endpoint that
 * bare-metal (not yet Intune-enrolled) devices POST their hardware hash to.
 *
 * Flow:
 *   1. Tech boots device → runs PowerShell from USB/network
 *   2. Script collects hardware hash + serial number
 *   3. Script POSTs to this Azure Function
 *   4. Function validates the request (API key auth)
 *   5. Function imports the hash into Autopilot via Graph API
 *   6. Function optionally sets group tag and returns result
 *
 * Security:
 *   - API key in x-api-key header (set via INGEST_API_KEY app setting)
 *   - Rate limited by Azure Functions platform
 *   - No sensitive data stored in function — only forwards to Graph API
 *
 * Deployment:
 *   func azure functionapp publish <your-function-app-name>
 */

import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { Client } from "@microsoft/microsoft-graph-client";
import { ClientSecretCredential } from "@azure/identity";
import { TokenCredentialAuthenticationProvider } from "@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js";

const BETA = "https://graph.microsoft.com/beta";

function getGraphClient(): Client {
  const credential = new ClientSecretCredential(
    process.env.AZURE_TENANT_ID!,
    process.env.AZURE_CLIENT_ID!,
    process.env.AZURE_CLIENT_SECRET!
  );

  const authProvider = new TokenCredentialAuthenticationProvider(credential, {
    scopes: ["https://graph.microsoft.com/.default"],
  });

  return Client.initWithMiddleware({ authProvider });
}

function validateApiKey(req: HttpRequest): boolean {
  const expectedKey = process.env.INGEST_API_KEY;
  if (!expectedKey || expectedKey === "CHANGE-ME-generate-a-strong-random-key") {
    return false; // Not configured — reject all requests
  }
  const providedKey = req.headers.get("x-api-key");
  if (!providedKey) return false;

  // Constant-time comparison to prevent timing attacks
  if (providedKey.length !== expectedKey.length) return false;
  let result = 0;
  for (let i = 0; i < providedKey.length; i++) {
    result |= providedKey.charCodeAt(i) ^ expectedKey.charCodeAt(i);
  }
  return result === 0;
}

interface IngestRequest {
  serialNumber: string;
  hardwareHash: string;
  groupTag?: string;
  assignedUserUpn?: string;
  productKey?: string;
  deviceHostName?: string;
}

async function ingestHardwareHash(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  // ── Auth ──────────────────────────────────────────────
  if (!validateApiKey(req)) {
    return {
      status: 401,
      jsonBody: { error: "Invalid or missing API key. Set x-api-key header." },
    };
  }

  // ── Parse body ────────────────────────────────────────
  let body: IngestRequest;
  try {
    body = (await req.json()) as IngestRequest;
  } catch {
    return {
      status: 400,
      jsonBody: { error: "Invalid JSON body" },
    };
  }

  if (!body.serialNumber || !body.hardwareHash) {
    return {
      status: 400,
      jsonBody: { error: "serialNumber and hardwareHash are required" },
    };
  }

  // Validate serial number format (alphanumeric, reasonable length)
  if (!/^[A-Za-z0-9\-_]{1,64}$/.test(body.serialNumber)) {
    return {
      status: 400,
      jsonBody: { error: "Invalid serial number format" },
    };
  }

  // Validate hardware hash is valid Base64 (4K+ chars typically)
  if (!/^[A-Za-z0-9+/=]{100,}$/.test(body.hardwareHash)) {
    return {
      status: 400,
      jsonBody: {
        error:
          "Invalid hardware hash. Must be Base64-encoded (typically 4000+ characters).",
      },
    };
  }

  context.log(
    `[IngestHash] Received hash for serial: ${body.serialNumber} (${body.hardwareHash.length} chars)`
  );

  // ── Import into Autopilot ─────────────────────────────
  try {
    const client = getGraphClient();

    // Check if device already exists
    const existing = await client
      .api(`${BETA}/deviceManagement/windowsAutopilotDeviceIdentities`)
      .filter(`contains(serialNumber,'${body.serialNumber}')`)
      .top(1)
      .get();

    if (existing.value && existing.value.length > 0) {
      const existingDevice = existing.value[0];
      context.log(
        `[IngestHash] Device ${body.serialNumber} already registered (ID: ${existingDevice.id})`
      );

      // Update group tag if provided and different
      if (
        body.groupTag &&
        existingDevice.groupTag !== body.groupTag
      ) {
        await client
          .api(
            `${BETA}/deviceManagement/windowsAutopilotDeviceIdentities/${existingDevice.id}/updateDeviceProperties`
          )
          .post({ groupTag: body.groupTag });
        context.log(
          `[IngestHash] Updated group tag to "${body.groupTag}"`
        );
      }

      return {
        status: 200,
        jsonBody: {
          status: "already_registered",
          autopilotDeviceId: existingDevice.id,
          serialNumber: body.serialNumber,
          groupTag: body.groupTag || existingDevice.groupTag,
          message:
            "Device is already registered in Autopilot. Group tag updated if changed.",
        },
      };
    }

    // Import new device
    const importResult = await client
      .api(
        `${BETA}/deviceManagement/importedWindowsAutopilotDeviceIdentities`
      )
      .post({
        "@odata.type":
          "#microsoft.graph.importedWindowsAutopilotDeviceIdentity",
        serialNumber: body.serialNumber,
        hardwareIdentifier: body.hardwareHash,
        groupTag: body.groupTag || "",
        assignedUserPrincipalName: body.assignedUserUpn || "",
        productKey: body.productKey || "",
      });

    context.log(
      `[IngestHash] Import submitted — ID: ${importResult.id}, Status: ${importResult.state?.deviceImportStatus}`
    );

    return {
      status: 202,
      jsonBody: {
        status: "import_submitted",
        importId: importResult.id,
        serialNumber: body.serialNumber,
        groupTag: body.groupTag || "",
        importStatus: importResult.state?.deviceImportStatus || "pending",
        message:
          "Hardware hash submitted for import. Device will appear in Autopilot within a few minutes.",
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    context.error(`[IngestHash] Failed to import: ${message}`);
    return {
      status: 500,
      jsonBody: {
        error: "Failed to import hardware hash",
        detail: message.substring(0, 200),
      },
    };
  }
}

// Register the function
app.http("IngestHardwareHash", {
  methods: ["POST"],
  authLevel: "anonymous", // We handle auth via API key
  route: "autopilot/ingest",
  handler: ingestHardwareHash,
});

/**
 * Health check / status endpoint.
 * Also returns the PowerShell collection script for convenience.
 */
async function healthCheck(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  return {
    status: 200,
    jsonBody: {
      status: "healthy",
      service: "Intune007 Autopilot Hash Ingestion",
      timestamp: new Date().toISOString(),
      endpoints: {
        ingest: "POST /api/autopilot/ingest",
        health: "GET /api/autopilot/health",
        script: "GET /api/autopilot/collection-script",
      },
    },
  };
}

app.http("HealthCheck", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "autopilot/health",
  handler: healthCheck,
});

/**
 * Returns the PowerShell script that devices should run to collect
 * their hardware hash AND POST it to this Azure Function.
 *
 * The script is dynamically generated with the correct Function URL.
 */
async function getCollectionScript(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  // Build the Function URL from the request
  const functionUrl = req.url.replace(
    /\/api\/autopilot\/collection-script.*/,
    "/api/autopilot/ingest"
  );

  const apiKey = req.query.get("apiKey") || "<YOUR-API-KEY>";
  const groupTag = req.query.get("groupTag") || "";

  const script = generateCollectionScript(functionUrl, apiKey, groupTag);

  return {
    status: 200,
    headers: {
      "Content-Type": "text/plain",
      "Content-Disposition":
        'attachment; filename="Collect-AutopilotHash.ps1"',
    },
    body: script,
  };
}

app.http("GetCollectionScript", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "autopilot/collection-script",
  handler: getCollectionScript,
});

function generateCollectionScript(
  ingestUrl: string,
  apiKey: string,
  groupTag: string
): string {
  return `<#
.SYNOPSIS
    Intune007 Autopilot Hardware Hash Collector & Uploader
    
.DESCRIPTION
    Collects the hardware hash from a Windows device and uploads it
    to the Intune007 Azure Function for automatic Autopilot registration.
    
    Run this script on bare-metal devices during OOBE or from a USB/WinPE
    environment. The device does NOT need to be enrolled in Intune.

.NOTES
    Requirements:
    - Windows 10/11 device
    - Administrator privileges
    - Internet connectivity (to reach the Azure Function)
    - The device must have a TPM chip (required for Autopilot)
    
    Generated by Intune007 — License to Manage!
#>

#Requires -RunAsAdministrator
$ErrorActionPreference = "Stop"

# ─── Configuration ────────────────────────────────────────────
$IngestUrl = "${ingestUrl}"
$ApiKey    = "${apiKey}"
$GroupTag  = "${groupTag}"
# ──────────────────────────────────────────────────────────────

Write-Host "╔══════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  Intune007 — Autopilot Hardware Hash Collector   ║" -ForegroundColor Cyan
Write-Host "║  License to Manage!                              ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ─── Step 1: Collect device info ──────────────────────────────
Write-Host "[Step 1/4] Collecting device information..." -ForegroundColor Yellow

$bios = Get-WmiObject -Class Win32_BIOS
$serial = $bios.SerialNumber
$manufacturer = (Get-WmiObject -Class Win32_ComputerSystem).Manufacturer
$model = (Get-WmiObject -Class Win32_ComputerSystem).Model
$hostname = $env:COMPUTERNAME

Write-Host "  Serial Number : $serial" -ForegroundColor Gray
Write-Host "  Manufacturer  : $manufacturer" -ForegroundColor Gray
Write-Host "  Model         : $model" -ForegroundColor Gray
Write-Host "  Hostname      : $hostname" -ForegroundColor Gray
Write-Host ""

# ─── Step 2: Collect hardware hash ───────────────────────────
Write-Host "[Step 2/4] Collecting hardware hash (this may take a moment)..." -ForegroundColor Yellow

try {
    $hardwareHash = (Get-WmiObject -Namespace root/cimv2/mdm/dmmap ` + "`" + `
        -Class MDM_DevDetail_Ext01 ` + "`" + `
        -Filter "InstanceID='Ext' AND ParentID='./DevDetail'" ` + "`" + `
    ).DeviceHardwareData
    
    if (-not $hardwareHash -or $hardwareHash.Length -lt 100) {
        throw "Hardware hash is empty or too short. Ensure the device has a TPM chip."
    }
    
    Write-Host "  Hardware hash collected ($($hardwareHash.Length) characters)" -ForegroundColor Green
} catch {
    Write-Host "  ERROR: Failed to collect hardware hash!" -ForegroundColor Red
    Write-Host "  $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "  Possible causes:" -ForegroundColor Yellow
    Write-Host "    - No TPM chip present" -ForegroundColor Yellow
    Write-Host "    - TPM not enabled in BIOS" -ForegroundColor Yellow
    Write-Host "    - Running in a VM without virtual TPM" -ForegroundColor Yellow
    exit 1
}
Write-Host ""

# ─── Step 3: Upload to Intune007 ─────────────────────────────
Write-Host "[Step 3/4] Uploading hardware hash to Intune007..." -ForegroundColor Yellow

$body = @{
    serialNumber    = $serial
    hardwareHash    = $hardwareHash
    groupTag        = $GroupTag
    deviceHostName  = $hostname
} | ConvertTo-Json -Depth 3

$headers = @{
    "Content-Type" = "application/json"
    "x-api-key"    = $ApiKey
}

try {
    $response = Invoke-RestMethod -Uri $IngestUrl -Method POST ` + "`" + `
        -Headers $headers -Body $body -TimeoutSec 30
    
    Write-Host "  Upload successful!" -ForegroundColor Green
    Write-Host "  Status     : $($response.status)" -ForegroundColor Gray
    Write-Host "  Import ID  : $($response.importId)" -ForegroundColor Gray
    Write-Host "  Message    : $($response.message)" -ForegroundColor Gray
} catch {
    Write-Host "  ERROR: Failed to upload hardware hash!" -ForegroundColor Red
    Write-Host "  $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "  Saving hash locally as fallback..." -ForegroundColor Yellow
    
    # Save to CSV as fallback (can be imported manually)
    $csvPath = "C:\\AutopilotHWID-$serial.csv"
    $csvContent = @"
"Device Serial Number","Windows Product ID","Hardware Hash"
"$serial","","$hardwareHash"
"@
    $csvContent | Out-File -FilePath $csvPath -Encoding UTF8
    Write-Host "  Saved to: $csvPath" -ForegroundColor Yellow
    Write-Host "  You can import this CSV manually in Intune portal." -ForegroundColor Yellow
    exit 1
}
Write-Host ""

# ─── Step 4: Done ────────────────────────────────────────────
Write-Host "[Step 4/4] Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "╔══════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║  Device registered for Autopilot successfully!   ║" -ForegroundColor Green
Write-Host "║                                                  ║" -ForegroundColor Green
Write-Host "║  The device will appear in Intune within a few   ║" -ForegroundColor Green
Write-Host "║  minutes. You can now restart and go through     ║" -ForegroundColor Green
Write-Host "║  the Autopilot OOBE experience.                  ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""

# Also save locally as backup
$csvPath = "C:\\AutopilotHWID-$serial.csv"
$csvContent = @"
"Device Serial Number","Windows Product ID","Hardware Hash"
"$serial","","$hardwareHash"
"@
$csvContent | Out-File -FilePath $csvPath -Encoding UTF8
Write-Host "Backup saved to: $csvPath" -ForegroundColor Gray
`;
}
