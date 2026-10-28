/**
 * ConfigMgr client push — installing the ConfigMgr agent on a device.
 *
 * The mechanism is a CCR (Client Configuration Request). `CreateCCR` on
 * SMS_Collection targets a single ResourceID; `CreateCCRs` targets a whole
 * collection. This module uses the per-device form, so "install on device X"
 * means exactly one machine.
 *
 * The route was confirmed against a live site: an invented method or class
 * returns 404, while CreateCCR with an impossible ResourceID returns 500 —
 * i.e. it was dispatched and failed on the resource, not on the route.
 *
 * A push CANNOT BE CANCELLED. Microsoft: Configuration Manager "retries any
 * failures for up to seven days". Callers must say so before confirming.
 *
 * `ClientType` and `PushOnlyAssignedClients` are documented as deprecated and
 * are deliberately not sent.
 */

import {
  getConfigMgrDeviceCard,
  postWmiAction,
  isConfigMgrSimulated,
} from "./adminService.js";

export interface ClientPushPreflight {
  deviceName: string;
  found: boolean;
  resourceId?: number;
  /** True when a push would be redundant — a client is already registered. */
  hasClient: boolean;
  clientVersion?: string;
  isActive?: boolean;
  isObsolete?: boolean;
  isDomainController: boolean;
  /** Reasons a push is likely to fail or be unnecessary. Empty means nothing obvious. */
  warnings: string[];
  /** Set when the pre-flight alone is enough to say "don't do this". */
  blocker?: string;
}

const DC_ROLE = /domain controller/i;

/** Inspect a device before pushing. Reads only; changes nothing. */
export async function preflightClientPush(deviceName: string): Promise<ClientPushPreflight> {
  const name = String(deviceName || "").trim();
  if (!name) throw new Error("A device name is required.");

  const card = await getConfigMgrDeviceCard(name);
  if (!card) {
    return {
      deviceName: name,
      found: false,
      hasClient: false,
      isDomainController: false,
      warnings: [],
      blocker:
        `'${name}' is not a resource in Configuration Manager. Client push only targets discovered resources, ` +
        `so the device must be found by a discovery method first.`,
    };
  }

  const isDomainController = card.systemRoles.some((r) => DC_ROLE.test(r));
  const hasClient = card.isClient && Boolean(card.clientVersion);
  const warnings: string[] = [];

  if (card.isObsolete) {
    warnings.push("The record is marked obsolete, which usually means a stale duplicate — the push will probably fail.");
  }
  if (!card.isActive) {
    warnings.push("The record is marked inactive, so the device may be offline or no longer on the network.");
  }
  if (isDomainController) {
    warnings.push("This device is a domain controller. Pushing to a DC is a deliberate act and is not done by default.");
  }

  return {
    deviceName: card.name,
    found: true,
    resourceId: card.resourceId,
    hasClient,
    clientVersion: card.clientVersion || undefined,
    isActive: card.isActive,
    isObsolete: card.isObsolete,
    isDomainController,
    warnings,
    blocker: isDomainController
      ? "Refusing to push to a domain controller automatically. Do this from the console if it is genuinely intended."
      : undefined,
  };
}

export interface ClientPushResult {
  deviceName: string;
  resourceId: number;
  /** The CCR was accepted. This is NOT confirmation that the client installed. */
  ccrCreated: boolean;
  returnValue: number;
  preflight: ClientPushPreflight;
  message: string;
  simulated?: boolean;
}

/**
 * Create a client push request for one device.
 *
 * Returns only that the site accepted the CCR. Installation happens
 * asynchronously and is confirmed in ccmsetup.log on the device.
 */
export async function installConfigMgrClient(input: {
  deviceName: string;
  forceReinstall?: boolean;
}): Promise<ClientPushResult> {
  const preflight = await preflightClientPush(input.deviceName);

  if (!preflight.found || preflight.blocker) {
    throw new Error(preflight.blocker ?? `Device '${input.deviceName}' was not found.`);
  }
  if (preflight.hasClient && input.forceReinstall !== true) {
    throw new Error(
      `'${preflight.deviceName}' already reports a ConfigMgr client (version ${preflight.clientVersion}). ` +
        `Pushing again would reinstall it; pass forceReinstall only if that is intended.`
    );
  }

  const resourceId = preflight.resourceId ?? 0;
  if (!resourceId) throw new Error(`Could not resolve a ResourceID for '${input.deviceName}'.`);

  const response = await postWmiAction("SMS_Collection.CreateCCR", {
    ResourceID: resourceId,
    Forced: false,
    ForceReinstall: input.forceReinstall === true,
    // A domain controller is excluded by the pre-flight above; this is belt and braces.
    PushEvenIfDC: false,
    InformationOnly: false,
    SpecifySiteCode: false,
    PushSiteCode: "",
  });

  const returnValue = Number(response.ReturnValue ?? response.value ?? 0);
  if (!Number.isFinite(returnValue) || returnValue !== 0) {
    throw new Error(`Configuration Manager rejected the client push request (return value ${returnValue}).`);
  }

  const simulated = isConfigMgrSimulated();
  return {
    deviceName: preflight.deviceName,
    resourceId,
    ccrCreated: true,
    returnValue,
    preflight,
    simulated: simulated || undefined,
    message: simulated
      ? "SIMULATED — demo mode is on, so no client push was requested in any Configuration Manager site."
      : "Client push request created. The site will attempt the install asynchronously and retries failures for up to seven days; it cannot be cancelled. Confirm completion in ccmsetup.log on the device.",
  };
}
