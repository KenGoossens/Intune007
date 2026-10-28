/**
 * Configuration Manager deployment error codes.
 *
 * Every entry here was confirmed against Microsoft documentation and carries
 * the page it came from. Codes that could not be verified are deliberately
 * absent: for deployment failures, confidently wrong remediation advice is
 * worse than none, so an unrecognised code is reported as unrecognised.
 *
 * ConfigMgr reports these as signed 32-bit decimals over WMI while the docs
 * use hex, so lookups normalise both forms.
 */

export interface ConfigMgrErrorInfo {
  /** Canonical hex form used as the lookup key, e.g. "0x87D00324". */
  code: string;
  /** How Microsoft documents it — MSI and Windows codes are published as decimals. */
  documentedAs: string;
  meaning: string;
  remediation: string;
  /** Which product surface raised it. */
  category: "ConfigMgr" | "MSI" | "Windows" | "WMI" | "Windows Update";
  /** True for codes that indicate success rather than failure. */
  success?: boolean;
}

/** Every entry below was verified against this page. */
const SOURCE =
  "https://learn.microsoft.com/en-us/intune/configmgr/tenant-attach/app-install-error-reference";

/**
 * Normalise an error code to canonical uppercase hex with an 0x prefix.
 * Accepts "0x87D00324", "87d00324", -2016410844 and 2278556324.
 */
export function normaliseErrorCode(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === "") return null;

  if (typeof raw === "number" && Number.isFinite(raw)) {
    // Signed 32-bit values wrap to their unsigned equivalent.
    const unsigned = raw < 0 ? raw >>> 0 : raw;
    return `0x${unsigned.toString(16).toUpperCase().padStart(8, "0")}`;
  }

  const text = String(raw).trim();
  if (!text) return null;

  if (/^0x[0-9a-f]+$/i.test(text)) {
    const value = Number.parseInt(text.slice(2), 16);
    if (!Number.isFinite(value)) return null;
    return `0x${value.toString(16).toUpperCase().padStart(8, "0")}`;
  }

  if (/^-?\d+$/.test(text)) {
    return normaliseErrorCode(Number(text));
  }

  if (/^[0-9a-f]{6,8}$/i.test(text)) {
    return `0x${text.toUpperCase().padStart(8, "0")}`;
  }

  return null;
}

function entry(
  documentedAs: string,
  category: ConfigMgrErrorInfo["category"],
  meaning: string,
  remediation: string,
  success = false
): [string, ConfigMgrErrorInfo] {
  const code = normaliseErrorCode(documentedAs);
  if (!code) throw new Error(`Unparseable error code in table: ${documentedAs}`);
  return [code, { code, documentedAs, meaning, remediation, category, success }];
}

/**
 * Verified error codes, keyed by canonical hex.
 *
 * Deliberately absent because they could not be verified on the source page:
 * 0x80070005, 0x87D00664, 0x87D0029E, and 0x80070002 (Microsoft documents the
 * Windows "file not found" case as decimal 2, not as that HRESULT).
 */
export const DEPLOYMENT_ERRORS: Record<string, ConfigMgrErrorInfo> = Object.fromEntries([
  // ─── Configuration Manager ───
  entry("0x87D00202", "ConfigMgr", "Service is shutting down.",
    "Check the ConfigMgr client is running: review CCMExec.log and the SMS Agent Host service on the device."),
  entry("0x87D00207", "ConfigMgr", "Parsing error.",
    "A generic invalid-data error. Follow the application deployment troubleshooting guide."),
  entry("0x87D00213", "ConfigMgr", "Timeout occurred.",
    "Increase 'Maximum allowed run time (minutes)' on the deployment type, and make sure the device's maintenance window is long enough to contain it."),
  entry("0x87D00215", "ConfigMgr", "Item not found.",
    "Verify the deployment still exists, that the client has received policy, and that content is available."),
  entry("0x87D00235", "ConfigMgr", "Syntax error occurred while parsing.",
    "A generic invalid-data error. Follow the application deployment troubleshooting guide."),
  entry("0x87D00244", "ConfigMgr", "The object or subsystem has not been initialized.",
    "A generic invalid-data error. Follow the application deployment troubleshooting guide."),
  entry("0x87D0027C", "ConfigMgr", "CI documents download timed out.",
    "Review CIAgent.log, CIDownloader.log and DataTransferService.log on the device."),
  entry("0x87D00289", "ConfigMgr", "Failed to decompress CI documents.",
    "Review CIAgent.log, CIDownloader.log and DataTransferService.log on the device."),
  entry("0x87D00314", "ConfigMgr", "CI Version Info timed out.",
    "Usually means the application changed and the client does not yet have the new revision. Verify policy and content revision have reached the client."),
  entry("0x87D00321", "ConfigMgr", "The script execution has timed out.",
    "Review the detection or requirement script's run time and raise the deployment type's maximum allowed run time."),
  entry("0x87D00324", "ConfigMgr", "The application was not detected after installation completed.",
    "The installer reported success but the detection method then failed. Review AppDiscovery.log and CIAgent.log, and check the detection rule matches what the installer actually produces (version, path, registry key)."),
  entry("0x87D00325", "ConfigMgr", "Application was still detected after uninstall completed.",
    "Verify the uninstall command actually removes what the detection rule looks for; check AppEnforce.log."),
  entry("0x87D00327", "ConfigMgr", "Script is not signed.",
    "The PowerShell execution policy client setting defaults to AllSigned. Either sign the script or change that client setting."),
  entry("0x87D00329", "ConfigMgr", "Application requirement evaluation or detection failed.",
    "Review AppIntentEval.log — commonly a dependency or supersedence relationship that cannot be satisfied."),
  entry("0x87D00607", "ConfigMgr", "Content not found.",
    "Verify the content is distributed to a distribution point and that the DP is in a boundary group the client can reach."),
  entry("0x87D00667", "ConfigMgr", "No current or future service window exists to install software updates.",
    "The maintenance window is shorter than the deployment's maximum allowed run time, or none exists. Widen or add a window."),
  entry("0x87D01106", "ConfigMgr", "Failed to verify the executable file is valid or to construct the associated command line.",
    "Verify the installer runs on its own, then verify it runs with the exact command line configured on the deployment type."),
  entry("0x87D01107", "ConfigMgr", "Failed to access all the provided program locations. May retry if the maximum retry count has not been reached.",
    "Review LocationServices.log, ContentTransferManager.log and DataTransferService.log."),
  entry("0x87D01201", "ConfigMgr", "Content download cannot be performed because there is not enough space in cache, or the disk is full.",
    "Compare the size of ccmcache on the device with the client cache setting, and free space or raise the cache size."),
  entry("0x87D01202", "ConfigMgr", "The total size of the client cache is smaller than the size of the requested content.",
    "Increase the client cache size so it can hold the content."),
  entry("0x87D01281", "ConfigMgr", "A supported App-V client is not installed.",
    "Verify a supported App-V client version is installed on the device."),
  entry("0x87D103E8", "ConfigMgr", "Error unknown.",
    "No specific cause is reported. Follow the application deployment troubleshooting guide."),
  entry("0x87D1076C", "ConfigMgr", "Application was successfully installed.",
    "No action needed — this code indicates success, not a failure.", true),

  // ─── Windows Installer (documented as decimals) ───
  entry("1602", "MSI", "User cancelled the installation.",
    "Usually a user-driven cancellation of an Available deployment. Re-run if the install is still wanted."),
  entry("1603", "MSI", "Fatal error during installation.",
    "The most common MSI failure and a catch-all. Enable Windows Installer logging and re-run; an entry reading 'Return value 3' near the failure usually names the real cause."),
  entry("1605", "MSI", "This action is only valid for products that are currently installed.",
    "Typically an uninstall or repair aimed at a product that is not present. Check the detection rule and the product code."),
  entry("1618", "MSI", "Another program is being installed. Complete that installation before proceeding.",
    "Another MSI transaction holds the installer mutex. Retry later, or stagger deployments so they do not overlap."),
  entry("1633", "MSI", "This installation package is not supported by this processor type.",
    "Wrong architecture for the device. Check the deployment type requirements (x86/x64/ARM64)."),
  entry("1638", "MSI", "Another version of this product is already installed.",
    "Uninstall the existing version first, or configure supersedence so ConfigMgr removes it."),
  entry("1642", "MSI", "The upgrade patch cannot be installed — the program to be upgraded may be missing, or a different version may be installed.",
    "Verify the base product and version the patch targets is actually present."),

  // ─── Windows ───
  entry("2", "Windows", "The system cannot find the file specified.",
    "Run SFC if a system file is missing; repair or reinstall if an application file is missing. Process Monitor will identify which file is being looked for."),
  entry("0x80000009", "Windows", "General access denied error.",
    "Check the context the install runs in and permissions on the content and target paths."),
  entry("0x80004005", "Windows", "Unspecified error.",
    "A catch-all. Use AppEnforce.log and the installer's own log to find the underlying failure."),
  entry("0x8000FFFF", "Windows", "Catastrophic failure.",
    "A catch-all. Use AppEnforce.log and the installer's own log to find the underlying failure."),
  entry("0x80040154", "Windows", "Class not registered.",
    "A required COM component is missing or unregistered on the device."),
  entry("0x80091007", "Windows", "The hash value is not correct.",
    "The downloaded content does not match its expected hash. Review CAS.log; a sharing violation during distribution is a common cause, and redistributing the content usually clears it."),
  entry("0xC0000142", "Windows", "The application failed to initialize properly.",
    "Often a dependency or session/context issue. Check whether the installer requires a user session."),

  // ─── WMI ───
  entry("0x80041001", "WMI", "WBEM_E_FAILED — a general WMI failure.",
    "Check WMI health on the device; a WMI repository problem often requires repair."),
  entry("0x80041009", "WMI", "WBEM_E_NOT_AVAILABLE — the resource is not available.",
    "Check WMI health and that the queried provider is present."),
  entry("0x8004100E", "WMI", "WBEM_E_INVALID_NAMESPACE — the namespace does not exist.",
    "Usually a damaged WMI repository or a missing client component."),

  // ─── Windows Update Agent ───
  entry("0x00240006", "Windows Update", "The update to be installed is already installed on the system.",
    "No action needed — the device already has the update.", true),
  entry("0x80240017", "Windows Update", "The operation was not performed because there are no applicable updates.",
    "The update does not apply to this device. Check applicability rules and the device's current build."),
]);

export interface ErrorExplanation {
  /** Canonical hex, or null when the input could not be parsed as a code. */
  code: string | null;
  /** How Microsoft documents it, when recognised. */
  documentedAs?: string;
  recognised: boolean;
  meaning?: string;
  remediation?: string;
  category?: ConfigMgrErrorInfo["category"];
  success?: boolean;
  source?: string;
}

/**
 * Explain a deployment error code.
 *
 * An unrecognised code returns `recognised: false` with no meaning, so callers
 * (and the agent) report it as unknown rather than inventing an explanation.
 */
export function explainDeploymentError(raw: unknown): ErrorExplanation {
  const code = normaliseErrorCode(raw);
  if (!code) return { code: null, recognised: false };

  const found = DEPLOYMENT_ERRORS[code];
  if (!found) return { code, recognised: false };

  return {
    code,
    documentedAs: found.documentedAs,
    recognised: true,
    meaning: found.meaning,
    remediation: found.remediation,
    category: found.category,
    success: found.success,
    source: SOURCE,
  };
}
