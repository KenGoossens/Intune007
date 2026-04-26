/**
 * Device Details — Rich device information card using ALL available beta fields.
 */

import { Router, type Request, type Response } from "express";
import { getGraphClient, fetchWithPagination } from "../graph/client.js";
import { sanitizeOData, sanitizeErrorMessage } from "../security.js";

const router = Router();
const BETA = "https://graph.microsoft.com/beta";

// All the fields we want for a rich device card
const RICH_SELECT = [
  "id","deviceName","managedDeviceName","serialNumber","imei","meid",
  "userPrincipalName","userDisplayName","emailAddress",
  "manufacturer","model","chassisType","processorArchitecture","physicalMemoryInBytes",
  "totalStorageSpaceInBytes","freeStorageSpaceInBytes","skuFamily","skuNumber",
  "operatingSystem","osVersion","securityPatchLevel","androidSecurityPatchLevel",
  "wiFiMacAddress","ethernetMacAddress","phoneNumber","subscriberCarrier","iccid",
  "isEncrypted","jailBroken","isSupervised","windowsActiveMalwareCount","windowsRemediatedMalwareCount",
  "partnerReportedThreatState",
  "enrolledDateTime","lastSyncDateTime","deviceEnrollmentType","enrollmentProfileName",
  "autopilotEnrolled","joinType","managementAgent","deviceType",
  "complianceState","complianceGracePeriodExpirationDateTime",
  "managedDeviceOwnerType","deviceRegistrationState","deviceCategoryDisplayName",
  "azureADDeviceId","aadRegistered",
  "notes","managementCertificateExpirationDate",
  "deviceFirmwareConfigurationInterfaceManaged",
].join(",");

/** GET /api/device-details/:deviceId — Full device card data */
router.get("/:deviceId", async (req: Request, res: Response) => {
  try {
    const client = getGraphClient();
    const deviceId = String(req.params.deviceId);

    // Fetch the device with all rich fields
    const device = await client
      .api(`${BETA}/deviceManagement/managedDevices/${deviceId}`)
      .select(RICH_SELECT)
      .get();

    // Fetch hardware info separately (nested object needs explicit GET)
    let hardwareInfo: Record<string, unknown> = {};
    try {
      const full = await client
        .api(`${BETA}/deviceManagement/managedDevices/${deviceId}`)
        .select("hardwareInformation")
        .get();
      hardwareInfo = full.hardwareInformation || {};
    } catch { /* may not be available */ }

    // Fetch detected apps count
    let detectedAppsCount = 0;
    try {
      const apps = await fetchWithPagination<Record<string, unknown>>(client,
        `${BETA}/deviceManagement/managedDevices/${deviceId}/detectedApps`,
        { select: "id", maxItems: 500 }
      );
      detectedAppsCount = apps.totalCount;
    } catch { /* skip */ }

    // Fetch config profile states
    let configStates: { compliant: number; conflict: number; error: number; total: number } = { compliant: 0, conflict: 0, error: 0, total: 0 };
    try {
      const states = await fetchWithPagination<Record<string, unknown>>(client,
        `${BETA}/deviceManagement/managedDevices/${deviceId}/deviceConfigurationStates`,
        { maxItems: 100 }
      );
      configStates.total = states.items.length;
      configStates.compliant = states.items.filter(s => String(s.state || "").toLowerCase() === "compliant").length;
      configStates.conflict = states.items.filter(s => String(s.state || "").toLowerCase() === "conflict").length;
      configStates.error = states.items.filter(s => String(s.state || "").toLowerCase() === "error").length;
    } catch { /* skip */ }

    // Compute storage
    const totalGB = device.totalStorageSpaceInBytes ? Math.round(device.totalStorageSpaceInBytes / 1073741824) : null;
    const freeGB = device.freeStorageSpaceInBytes ? Math.round(device.freeStorageSpaceInBytes / 1073741824) : null;
    const usedGB = totalGB && freeGB ? totalGB - freeGB : null;
    const storagePercent = totalGB && freeGB ? Math.round((freeGB / totalGB) * 100) : null;

    // Compute RAM
    const ramGB = device.physicalMemoryInBytes ? Math.round(device.physicalMemoryInBytes / 1073741824 * 10) / 10 : null;

    // Compute sync age
    const lastSync = device.lastSyncDateTime ? new Date(device.lastSyncDateTime) : null;
    const syncAgeHours = lastSync ? Math.round((Date.now() - lastSync.getTime()) / 3600000) : null;

    // Build the card
    const card = {
      deviceId,
      // Identity
      identity: {
        deviceName: device.deviceName,
        managedDeviceName: device.managedDeviceName,
        serialNumber: device.serialNumber,
        imei: device.imei,
        meid: device.meid,
        azureADDeviceId: device.azureADDeviceId,
        deviceCategory: device.deviceCategoryDisplayName,
        notes: device.notes,
      },

      // User
      user: {
        userPrincipalName: device.userPrincipalName,
        displayName: device.userDisplayName,
        emailAddress: device.emailAddress,
      },

      // Hardware
      hardware: {
        manufacturer: device.manufacturer,
        model: device.model,
        chassisType: device.chassisType,
        deviceType: device.deviceType,
        processorArchitecture: device.processorArchitecture,
        ramGB,
        storage: { totalGB, freeGB, usedGB, freePercent: storagePercent },
        productName: hardwareInfo.productName,
        osEdition: hardwareInfo.operatingSystemEdition,
      },

      // OS
      os: {
        operatingSystem: device.operatingSystem,
        osVersion: device.osVersion,
        skuFamily: device.skuFamily,
        securityPatchLevel: device.securityPatchLevel || device.androidSecurityPatchLevel,
        osBuildNumber: hardwareInfo.osBuildNumber,
      },

      // Network
      network: {
        wiFiMacAddress: device.wiFiMacAddress,
        ethernetMacAddress: device.ethernetMacAddress,
        phoneNumber: device.phoneNumber,
        subscriberCarrier: device.subscriberCarrier,
        ipAddress: hardwareInfo.ipAddressV4,
        subnetAddress: hardwareInfo.subnetAddress,
      },

      // Security
      security: {
        isEncrypted: device.isEncrypted,
        jailBroken: device.jailBroken,
        isSupervised: device.isSupervised,
        activeMalware: device.windowsActiveMalwareCount,
        remediatedMalware: device.windowsRemediatedMalwareCount,
        threatState: device.partnerReportedThreatState,
        dfciManaged: device.deviceFirmwareConfigurationInterfaceManaged,
        tpmVersion: hardwareInfo.tpmVersion,
        tpmManufacturer: hardwareInfo.tpmManufacturer,
        secureBoot: hardwareInfo.secureBoot,
        securedCorePC: hardwareInfo.securedCorePC,
        bitLockerStatus: hardwareInfo.bitLockerStatus,
      },

      // Battery (if available)
      battery: {
        levelPercent: hardwareInfo.batteryLevelPercentage,
        healthPercent: hardwareInfo.batteryHealthPercentage,
        chargeCycles: hardwareInfo.batteryChargeCycles,
      },

      // Enrollment & Management
      enrollment: {
        enrolledDateTime: device.enrolledDateTime,
        lastSyncDateTime: device.lastSyncDateTime,
        syncAgeHours,
        enrollmentType: device.deviceEnrollmentType,
        enrollmentProfileName: device.enrollmentProfileName,
        autopilotEnrolled: device.autopilotEnrolled,
        joinType: device.joinType,
        managementAgent: device.managementAgent,
        ownership: device.managedDeviceOwnerType,
        registrationState: device.deviceRegistrationState,
        certExpiration: device.managementCertificateExpirationDate,
      },

      // Compliance
      compliance: {
        state: device.complianceState,
        gracePeriodExpiration: device.complianceGracePeriodExpirationDateTime,
      },

      // Stats
      stats: {
        detectedApps: detectedAppsCount,
        configProfiles: configStates,
      },
    };

    res.json(card);
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/** GET /api/device-card/:deviceId/apps — Get all detected apps on the device */
router.get("/:deviceId/apps", async (req: Request, res: Response) => {
  try {
    const client = getGraphClient();
    const apps = await fetchWithPagination<Record<string, unknown>>(client,
      `${BETA}/deviceManagement/managedDevices/${req.params.deviceId}/detectedApps`,
      { select: "displayName,version,sizeInByte", maxItems: 500 }
    );
    res.json({ items: apps.items, totalCount: apps.totalCount });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/** GET /api/device-card/:deviceId/profiles — Get config profile states */
router.get("/:deviceId/profiles", async (req: Request, res: Response) => {
  try {
    const client = getGraphClient();
    const states = await fetchWithPagination<Record<string, unknown>>(client,
      `${BETA}/deviceManagement/managedDevices/${req.params.deviceId}/deviceConfigurationStates`,
      { maxItems: 100 }
    );
    res.json({ items: states.items, totalCount: states.totalCount });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/** GET /api/device-card/:deviceId/compliance — Get compliance policy states */
router.get("/:deviceId/compliance", async (req: Request, res: Response) => {
  try {
    const client = getGraphClient();
    const states = await fetchWithPagination<Record<string, unknown>>(client,
      `${BETA}/deviceManagement/managedDevices/${req.params.deviceId}/deviceCompliancePolicyStates`,
      { maxItems: 100 }
    );
    res.json({ items: states.items, totalCount: states.totalCount });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/** GET /api/device-card/search/:name — Find device by name and return card */
router.get("/search/:name", async (req: Request, res: Response) => {
  try {
    const client = getGraphClient();
    const name = sanitizeOData(String(req.params.name));
    const result = await fetchWithPagination<Record<string, unknown>>(client,
      `${BETA}/deviceManagement/managedDevices`,
      { filter: `deviceName eq '${name}'`, select: "id,deviceName", maxItems: 1 }
    );
    if (result.items.length === 0) {
      res.status(404).json({ error: "Device not found" });
      return;
    }
    // Redirect to the full card endpoint
    res.redirect(`/api/device-card/${result.items[0].id}`);
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
