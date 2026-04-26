/**
 * Device Actions — Remote management operations via Microsoft Graph API.
 *
 * These actions let administrators perform remote operations on managed
 * devices such as sync, restart, lock, passcode reset, retire, and wipe.
 *
 * Graph API Reference:
 *   https://learn.microsoft.com/en-us/graph/api/resources/intune-devices-manageddevice
 *
 * Required Permissions:
 *   DeviceManagementManagedDevices.PrivilegedOperations.All  (wipe, retire)
 *   DeviceManagementManagedDevices.ReadWrite.All             (sync, lock, restart, resetPasscode)
 */

import { getGraphClient } from "./client.js";

export interface DeviceActionResult {
  success: boolean;
  action: string;
  deviceId: string;
  message: string;
  timestamp: string;
}

/**
 * Force a device to sync with Intune immediately.
 * POST /deviceManagement/managedDevices/{id}/syncDevice
 */
export async function syncDevice(deviceId: string): Promise<DeviceActionResult> {
  const client = getGraphClient();
  await client
    .api(`/deviceManagement/managedDevices/${deviceId}/syncDevice`)
    .post({});

  return {
    success: true,
    action: "syncDevice",
    deviceId,
    message: "Sync command sent successfully. The device will sync on its next check-in.",
    timestamp: new Date().toISOString(),
  };
}

/**
 * Remotely restart a managed device.
 * Sends a sync first to force the device to check in, then queues the reboot.
 * POST /deviceManagement/managedDevices/{id}/syncDevice
 * POST /deviceManagement/managedDevices/{id}/rebootNow
 */
export async function restartDevice(deviceId: string): Promise<DeviceActionResult> {
  const client = getGraphClient();

  // Step 1: Force sync so the device checks in and receives the reboot command
  try {
    await client
      .api(`/deviceManagement/managedDevices/${deviceId}/syncDevice`)
      .post({});
  } catch {
    // Sync failure is non-fatal — proceed with reboot anyway
  }

  // Step 2: Queue the reboot
  await client
    .api(`/deviceManagement/managedDevices/${deviceId}/rebootNow`)
    .post({});

  return {
    success: true,
    action: "rebootNow",
    deviceId,
    message: "Sync + restart commands sent. A sync was triggered first to force the device to check in, then the reboot was queued. The device should reboot within a few minutes if it's online.",
    timestamp: new Date().toISOString(),
  };
}

/**
 * Remotely lock a managed device.
 * POST /deviceManagement/managedDevices/{id}/remoteLock
 */
export async function lockDevice(deviceId: string): Promise<DeviceActionResult> {
  const client = getGraphClient();
  await client
    .api(`/deviceManagement/managedDevices/${deviceId}/remoteLock`)
    .post({});

  return {
    success: true,
    action: "remoteLock",
    deviceId,
    message: "Remote lock command sent successfully. The device will lock on next check-in.",
    timestamp: new Date().toISOString(),
  };
}

/**
 * Reset the passcode on a managed device.
 * POST /deviceManagement/managedDevices/{id}/resetPasscode
 */
export async function resetPasscode(deviceId: string): Promise<DeviceActionResult> {
  const client = getGraphClient();
  await client
    .api(`/deviceManagement/managedDevices/${deviceId}/resetPasscode`)
    .post({});

  return {
    success: true,
    action: "resetPasscode",
    deviceId,
    message: "Passcode reset command sent successfully.",
    timestamp: new Date().toISOString(),
  };
}

/**
 * Retire a managed device — removes corporate data but keeps personal data.
 * POST /deviceManagement/managedDevices/{id}/retire
 *
 * DESTRUCTIVE: This removes all corporate apps, data, and policies.
 */
export async function retireDevice(deviceId: string): Promise<DeviceActionResult> {
  const client = getGraphClient();
  await client
    .api(`/deviceManagement/managedDevices/${deviceId}/retire`)
    .post({});

  return {
    success: true,
    action: "retire",
    deviceId,
    message: "Retire command sent. Corporate data and policies will be removed from the device.",
    timestamp: new Date().toISOString(),
  };
}

/**
 * Wipe a managed device — factory resets the device, removing ALL data.
 * POST /deviceManagement/managedDevices/{id}/wipe
 *
 * DESTRUCTIVE: This performs a full factory reset. All data will be lost.
 */
export async function wipeDevice(
  deviceId: string,
  options?: {
    keepEnrollmentData?: boolean;
    keepUserData?: boolean;
  }
): Promise<DeviceActionResult> {
  const client = getGraphClient();
  await client
    .api(`/deviceManagement/managedDevices/${deviceId}/wipe`)
    .post({
      keepEnrollmentData: options?.keepEnrollmentData ?? false,
      keepUserData: options?.keepUserData ?? false,
    });

  return {
    success: true,
    action: "wipe",
    deviceId,
    message: "Wipe command sent. The device will be factory reset. ALL data will be removed.",
    timestamp: new Date().toISOString(),
  };
}
