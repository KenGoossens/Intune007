import https from "node:https";
import { ClientSecretCredential } from "@azure/identity";
import { config } from "../config.js";
import { sanitizeErrorMessage } from "../security.js";
import { getStoredConnection, getDemoMode } from "./connectionStore.js";
import { DEMO_ADMIN_SERVICE_URL, isDemoHost, demoResponse } from "./demoFixtures.js";
import type {
  ConfigMgrApplicationInfo,
  ConfigMgrApplicationDetail,
  ConfigMgrCollectionInfo,
  ConfigMgrCollectionMember,
  ConfigMgrConnectionStatus,
  ConfigMgrDeploymentInfo,
  ConfigMgrDeploymentStatusRow,
} from "@intune-agent/shared";
import { explainDeploymentError } from "./configmgrErrors.js";

/**
 * Connector for the Configuration Manager AdminService REST API.
 *
 * Auth is pluggable via CONFIGMGR_AUTH_MODE:
 *   - "azuread" (default): request an Entra ID token for the CMG server app and
 *     send it as a bearer token. Works over the internet via a Cloud Management
 *     Gateway and reuses the @azure/identity library.
 *   - "bearer": send a static CONFIGMGR_BEARER_TOKEN (testing / manual).
 *   - "none": no Authorization header (rare — anonymous intranet endpoints).
 *   - "windows": not supported in this build (NTLM/Kerberos from Node).
 *
 * Reads use the OData routes. Writes invoke WMI methods over the `wmi` route
 * and are gated behind the agent's destructive-action confirmation flow.
 */

const DEFAULT_TOP = 100;
const MAX_TOP = 1000;
const REQUEST_TIMEOUT_MS = 30_000;

export interface EffectiveConfigMgrConfig {
  adminServiceUrl: string;
  authMode: string;
  resource: string;
  tenantId: string;
  clientId: string;
  clientSecret: string;
  bearerToken: string;
  allowInsecureTls: boolean;
}

function withCredFallback(
  c: Partial<EffectiveConfigMgrConfig>
): EffectiveConfigMgrConfig {
  return {
    adminServiceUrl: c.adminServiceUrl || "",
    authMode: c.authMode || "azuread",
    resource: c.resource || "",
    tenantId: c.tenantId || config.azureAd.tenantId,
    clientId: c.clientId || config.azureAd.clientId,
    clientSecret: c.clientSecret || config.azureAd.clientSecret,
    bearerToken: c.bearerToken || "",
    allowInsecureTls: Boolean(c.allowInsecureTls),
  };
}

/**
 * Resolve the effective AdminService connection. Priority:
 *   1. an explicit override (used by the "test connection" flow before saving)
 *   2. the UI-saved connection in configmgr.db
 *   3. environment variables (developer fallback)
 * Missing Entra credentials fall back to the app's main Azure AD registration.
 */
export function resolveConfig(
  override?: Partial<EffectiveConfigMgrConfig>
): EffectiveConfigMgrConfig {
  if (override && override.adminServiceUrl) return withCredFallback(override);
  const stored = getStoredConnection();
  if (stored) return withCredFallback(stored);
  if (config.configMgr.adminServiceUrl) return withCredFallback(config.configMgr);

  // Demo mode is the LAST fallback, so a real connection always wins by
  // construction rather than by a condition that could be got wrong later.
  if (getDemoMode()) {
    return {
      adminServiceUrl: DEMO_ADMIN_SERVICE_URL,
      authMode: "none",
      resource: "",
      tenantId: "",
      clientId: "",
      clientSecret: "",
      bearerToken: "",
      allowInsecureTls: false,
    };
  }
  return withCredFallback(config.configMgr);
}

/** True when ConfigMgr data is being simulated rather than read from a site. */
export function isConfigMgrSimulated(): boolean {
  return resolveConfig().adminServiceUrl === DEMO_ADMIN_SERVICE_URL;
}

/** True when an AdminService base URL is configured (via UI store or env). */
export function isConfigMgrConfigured(): boolean {
  return Boolean(resolveConfig().adminServiceUrl);
}

// Token cache keyed by a config signature so changing the connection (or
// switching accounts) transparently invalidates a stale token.
let cachedToken: { key: string; token: string; expiresOnTimestamp: number } | null = null;

/** Clear the cached Entra token (call after the connection config changes). */
export function resetConfigMgrAuthCache(): void {
  cachedToken = null;
}

async function getAuthHeaders(
  cm: EffectiveConfigMgrConfig
): Promise<Record<string, string>> {
  switch (cm.authMode) {
    case "none":
      return {};
    case "bearer":
      if (!cm.bearerToken) {
        throw new Error("Bearer auth is selected but no bearer token was provided.");
      }
      return { Authorization: `Bearer ${cm.bearerToken}` };
    case "windows":
      throw new Error(
        "Windows/NTLM auth is not supported in this build. Use Azure AD (via a " +
          "Cloud Management Gateway) or a bearer token."
      );
    case "azuread":
    default: {
      if (!cm.resource) {
        throw new Error(
          "Azure AD auth requires a resource (the CMG server app's App ID URI or client ID)."
        );
      }
      if (!cm.tenantId || !cm.clientId || !cm.clientSecret) {
        throw new Error("Azure AD auth requires tenant, client ID and client secret.");
      }
      const key = `${cm.authMode}|${cm.tenantId}|${cm.clientId}|${cm.resource}`;
      const now = Date.now();
      if (
        !cachedToken ||
        cachedToken.key !== key ||
        cachedToken.expiresOnTimestamp - now < 60_000
      ) {
        const credential = new ClientSecretCredential(
          cm.tenantId,
          cm.clientId,
          cm.clientSecret
        );
        const scope = cm.resource.endsWith("/.default")
          ? cm.resource
          : `${cm.resource}/.default`;
        const token = await credential.getToken(scope);
        if (!token) {
          throw new Error(
            "Failed to acquire an Azure AD token for the ConfigMgr AdminService."
          );
        }
        cachedToken = {
          key,
          token: token.token,
          expiresOnTimestamp: token.expiresOnTimestamp,
        };
      }
      return { Authorization: `Bearer ${cachedToken.token}` };
    }
  }
}

function httpsJsonRequest(
  method: string,
  fullUrl: string,
  headers: Record<string, string>,
  allowInsecure: boolean,
  body?: unknown
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let u: URL;
    try {
      u = new URL(fullUrl);
    } catch {
      return reject(new Error("Invalid AdminService URL."));
    }
    if (u.protocol !== "https:") {
      return reject(new Error("The AdminService URL must use HTTPS."));
    }

    // Demo mode: answer from fixtures instead of opening a socket. Everything
    // above this line — URL building, method paths, bodies — already ran.
    if (isDemoHost(fullUrl)) {
      try {
        return resolve(demoResponse(method, fullUrl, body));
      } catch (err) {
        return reject(err instanceof Error ? err : new Error(String(err)));
      }
    }

    const payload = body !== undefined ? Buffer.from(JSON.stringify(body)) : undefined;

    const req = https.request(
      {
        method,
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        headers: {
          Accept: "application/json",
          ...(payload
            ? { "Content-Type": "application/json", "Content-Length": payload.length }
            : {}),
          ...headers,
        },
        rejectUnauthorized: !allowInsecure,
        timeout: REQUEST_TIMEOUT_MS,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          const status = res.statusCode ?? 0;
          if (status < 200 || status >= 300) {
            return reject(
              new Error(`AdminService responded ${status}: ${text.substring(0, 300)}`)
            );
          }
          try {
            resolve(text ? (JSON.parse(text) as Record<string, unknown>) : {});
          } catch {
            reject(new Error("AdminService returned a non-JSON response."));
          }
        });
      }
    );

    req.on("timeout", () => req.destroy(new Error("AdminService request timed out.")));
    req.on("error", (err) => reject(err));
    if (payload) req.write(payload);
    req.end();
  });
}

function httpsGetJson(
  fullUrl: string,
  headers: Record<string, string>,
  allowInsecure: boolean
): Promise<Record<string, unknown>> {
  return httpsJsonRequest("GET", fullUrl, headers, allowInsecure);
}

function buildUrl(
  base: string,
  path: string,
  params: { top?: number; filter?: string; select?: string; orderby?: string }
): string {
  const cleanBase = base.replace(/\/+$/, "");
  const qs: string[] = [];
  if (params.filter) qs.push(`$filter=${encodeURIComponent(params.filter)}`);
  if (params.select) qs.push(`$select=${encodeURIComponent(params.select)}`);
  if (params.top) {
    const capped = Math.min(Math.max(1, params.top), MAX_TOP);
    qs.push(`$top=${capped}`);
  }
  if (params.orderby) qs.push(`$orderby=${encodeURIComponent(params.orderby)}`);
  return `${cleanBase}/${path}${qs.length ? `?${qs.join("&")}` : ""}`;
}

async function adminGet<T>(
  cm: EffectiveConfigMgrConfig,
  path: string,
  params: { top?: number; filter?: string; select?: string; orderby?: string } = {}
): Promise<T[]> {
  const headers = await getAuthHeaders(cm);
  const url = buildUrl(cm.adminServiceUrl, path, params);
  const json = await httpsGetJson(url, headers, cm.allowInsecureTls);
  const value = json.value;
  if (Array.isArray(value)) return value as T[];
  if (Array.isArray(json)) return json as unknown as T[];
  return [json as unknown as T];
}

// ─── Field mappers ───────────────────────────────────────────────

function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : 0;
}

function collectionTypeLabel(v: unknown): string {
  switch (num(v)) {
    case 1:
      return "User";
    case 2:
      return "Device";
    default:
      return "Other";
  }
}

function intentLabel(v: unknown): string {
  switch (num(v)) {
    case 1:
      return "Required";
    case 2:
      return "Available";
    default:
      return "Unknown";
  }
}

function featureTypeLabel(v: unknown): string {
  const map: Record<number, string> = {
    1: "Application",
    2: "Program",
    3: "Mobile Program",
    4: "Script",
    5: "Software Update",
    6: "Baseline",
    7: "Task Sequence",
    8: "Content Distribution",
    11: "Configuration Policy",
  };
  return map[num(v)] ?? "Other";
}

// ─── Public read functions ───────────────────────────────────────

export async function getCollections(options?: {
  top?: number;
  filter?: string;
}): Promise<ConfigMgrCollectionInfo[]> {
  const cm = resolveConfig();
  const rows = await adminGet<Record<string, unknown>>(cm, "wmi/SMS_Collection", {
    top: options?.top ?? DEFAULT_TOP,
    filter: options?.filter,
    select: "CollectionID,Name,MemberCount,CollectionType,Comment,LimitToCollectionName",
    orderby: "Name",
  });
  return rows.map((r) => ({
    collectionId: String(r.CollectionID ?? ""),
    name: String(r.Name ?? ""),
    memberCount: num(r.MemberCount),
    collectionType: collectionTypeLabel(r.CollectionType),
    comment: String(r.Comment ?? ""),
    limitToCollectionName: String(r.LimitToCollectionName ?? ""),
  }));
}

export async function getDeployments(options?: {
  top?: number;
  filter?: string;
}): Promise<ConfigMgrDeploymentInfo[]> {
  const cm = resolveConfig();
  const rows = await adminGet<Record<string, unknown>>(cm, "wmi/SMS_DeploymentSummary", {
    top: options?.top ?? DEFAULT_TOP,
    filter: options?.filter,
    orderby: "SoftwareName",
  });
  return rows.map((r) => ({
    deploymentId: String(r.DeploymentID ?? ""),
    assignmentId: num(r.AssignmentID),
    softwareName: String(r.SoftwareName ?? ""),
    collectionName: String(r.CollectionName ?? ""),
    intent: intentLabel(r.DeploymentIntent),
    featureType: featureTypeLabel(r.FeatureType),
    targeted: num(r.NumberTargeted),
    success: num(r.NumberSuccess),
    errors: num(r.NumberErrors),
    inProgress: num(r.NumberInProgress),
    unknown: num(r.NumberUnknown),
  }));
}

export async function getApplications(options?: {
  top?: number;
  nameContains?: string;
}): Promise<ConfigMgrApplicationInfo[]> {
  const cm = resolveConfig();
  // Only the latest revision of each application to avoid duplicate rows.
  let filter = "IsLatest eq true";
  if (options?.nameContains) {
    const safe = options.nameContains.replace(/'/g, "''");
    filter += ` and contains(LocalizedDisplayName,'${safe}')`;
  }
  const rows = await adminGet<Record<string, unknown>>(cm, "wmi/SMS_Application", {
    top: options?.top ?? DEFAULT_TOP,
    filter,
    select:
      "CI_ID,LocalizedDisplayName,Manufacturer,SoftwareVersion,NumberOfDeployments,NumberOfDevicesWithApp,IsDeployed,DateCreated",
    orderby: "LocalizedDisplayName",
  });
  return rows.map((r) => ({
    ciId: String(r.CI_ID ?? ""),
    name: String(r.LocalizedDisplayName ?? ""),
    manufacturer: String(r.Manufacturer ?? ""),
    version: String(r.SoftwareVersion ?? ""),
    numberOfDeployments: num(r.NumberOfDeployments),
    numberOfDevicesWithApp: num(r.NumberOfDevicesWithApp),
    isDeployed: r.IsDeployed === true || r.IsDeployed === 1,
    dateCreated: String(r.DateCreated ?? ""),
  }));
}

/**
 * Probe the AdminService and report connectivity. Always safe to call — when
 * the connector is not configured it returns { configured: false } instead of
 * throwing, so the UI can show setup guidance.
 */
export async function getConfigMgrConnectionStatus(
  override?: Partial<EffectiveConfigMgrConfig>
): Promise<ConfigMgrConnectionStatus> {
  const cm = resolveConfig(override);
  if (!cm.adminServiceUrl) {
    return { configured: false, connected: false, authMode: cm.authMode };
  }
  try {
    const sites = await adminGet<Record<string, unknown>>(cm, "wmi/SMS_Site", { top: 1 });
    const site = sites[0] ?? {};
    return {
      configured: true,
      connected: true,
      authMode: cm.authMode,
      url: cm.adminServiceUrl,
      siteCode: site.SiteCode ? String(site.SiteCode) : undefined,
      siteName: site.SiteName ? String(site.SiteName) : undefined,
      version: site.Version ? String(site.Version) : undefined,
      simulated: isConfigMgrSimulated() || undefined,
    };
  } catch (err) {
    return {
      configured: true,
      connected: false,
      authMode: cm.authMode,
      url: cm.adminServiceUrl,
      error: sanitizeErrorMessage(String(err)),
    };
  }
}

// ─── CMPivot (real-time device query — gated by confirmation) ────

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function extractCmPivotRows(r: Record<string, unknown>): Record<string, unknown>[] {
  const value = r.value;
  if (Array.isArray(value)) {
    // Device-scoped results wrap the data rows in a per-device "Result" array.
    if (
      value.length > 0 &&
      value[0] &&
      typeof value[0] === "object" &&
      "Result" in (value[0] as Record<string, unknown>)
    ) {
      const rows: Record<string, unknown>[] = [];
      for (const item of value as Record<string, unknown>[]) {
        const res = item.Result;
        if (Array.isArray(res)) rows.push(...(res as Record<string, unknown>[]));
      }
      return rows;
    }
    return value as Record<string, unknown>[];
  }
  return [];
}

export interface CmPivotRunResult {
  operationId: number;
  status: "completed" | "timeout";
  rows: Record<string, unknown>[];
  resourceId: number;
}

/**
 * Run a CMPivot query against a single device via the AdminService and poll for
 * the result. It queries live device state (read-effect) but initiates a
 * device-side operation, so callers gate it behind the confirmation flow.
 */
export async function runCmPivot(
  target: { resourceId?: number; deviceName?: string },
  query: string
): Promise<CmPivotRunResult> {
  const cm = resolveConfig();
  if (!cm.adminServiceUrl) throw new Error("The ConfigMgr AdminService is not connected.");
  const q = String(query || "").trim();
  if (!q) throw new Error("A CMPivot query is required.");
  if (q.length > 2000) throw new Error("CMPivot query is too long (max 2000 characters).");

  const base = cm.adminServiceUrl.replace(/\/+$/, "");

  // Resolve the ConfigMgr ResourceID from a device name when needed.
  let resourceId = target.resourceId;
  if (!resourceId && target.deviceName) {
    const safe = target.deviceName.replace(/'/g, "''");
    const found = await adminGet<Record<string, unknown>>(cm, "wmi/SMS_R_System", {
      filter: `Name eq '${safe}'`,
      select: "ResourceID,Name",
      top: 1,
    });
    if (found.length === 0) {
      throw new Error(`Device '${target.deviceName}' was not found in Configuration Manager.`);
    }
    resourceId = num(found[0].ResourceID);
  }
  if (!resourceId) throw new Error("A resourceId or deviceName is required.");

  // Start the CMPivot job.
  const startUrl = `${base}/v1.0/Device(${resourceId})/AdminService.RunCMPivot`;
  const started = await httpsJsonRequest(
    "POST",
    startUrl,
    await getAuthHeaders(cm),
    cm.allowInsecureTls,
    { InputQuery: q }
  );
  const operationId = num(started.OperationId ?? started.value);
  if (!operationId) throw new Error("CMPivot did not return an operation id.");

  // Poll for the result — the job runs asynchronously on the device.
  const resultUrl = `${base}/v1.0/Device(${resourceId})/AdminService.CMPivotResult(OperationId=${operationId})`;
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    await sleep(3000);
    try {
      const r = await httpsJsonRequest(
        "GET",
        resultUrl,
        await getAuthHeaders(cm),
        cm.allowInsecureTls
      );
      return { operationId, status: "completed", rows: extractCmPivotRows(r), resourceId };
    } catch {
      // A 404 while the job is still pending is expected — keep polling.
    }
  }
  return { operationId, status: "timeout", rows: [], resourceId };
}

// ─── WMI method invocation ───────────────────────────────────────
//
// The AdminService wmi route accepts POST to over 700 classes. A static
// method is addressed as `wmi/<Class>.<Method>`; an instance method as
// `wmi/<Class>('<Key>')/AdminService.<Method>`. These two builders are the
// only place those shapes are expressed, so a site that disagrees can be
// accommodated without touching the callers.

export function wmiStaticMethodPath(className: string, method: string): string {
  return `wmi/${className}.${method}`;
}

export function wmiInstanceMethodPath(
  className: string,
  key: string,
  method: string
): string {
  return `wmi/${className}('${String(key).replace(/'/g, "''")}')/AdminService.${method}`;
}

/** OData discriminator for the derived direct-membership rule type. */
export const SMS_COLLECTION_RULE_DIRECT_TYPE = "#AdminService.SMS_CollectionRuleDirect";

async function adminPost<T = Record<string, unknown>>(
  cm: EffectiveConfigMgrConfig,
  path: string,
  body: unknown
): Promise<T> {
  const url = `${cm.adminServiceUrl.replace(/\/+$/, "")}/${path}`;
  const json = await httpsJsonRequest(
    "POST",
    url,
    await getAuthHeaders(cm),
    cm.allowInsecureTls,
    body
  );
  return json as unknown as T;
}

/** Resolve a ConfigMgr device name to its ResourceID. */
async function resolveResourceId(
  cm: EffectiveConfigMgrConfig,
  deviceName: string
): Promise<number | null> {
  const safe = deviceName.replace(/'/g, "''");
  const found = await adminGet<Record<string, unknown>>(cm, "wmi/SMS_R_System", {
    filter: `Name eq '${safe}'`,
    select: "ResourceID,Name",
    top: 1,
  });
  if (found.length === 0) return null;
  const id = num(found[0].ResourceID);
  return id > 0 ? id : null;
}

function requireConnected(): EffectiveConfigMgrConfig {
  const cm = resolveConfig();
  if (!cm.adminServiceUrl) throw new Error("The ConfigMgr AdminService is not connected.");
  return cm;
}

// ─── Device inventory ────────────────────────────────────────────

/**
 * Count devices known to Configuration Manager.
 *
 * `exact` is false when the site did not honour $count and the fallback hit
 * the page cap, so callers never present a capped page as a fleet total.
 */
export async function getConfigMgrDeviceCount(
  filter?: string
): Promise<{ count: number; exact: boolean }> {
  const cm = requireConnected();
  const base = cm.adminServiceUrl.replace(/\/+$/, "");

  const qs = ["$count=true", "$top=1"];
  if (filter) qs.push(`$filter=${encodeURIComponent(filter)}`);
  try {
    const json = await httpsJsonRequest(
      "GET",
      `${base}/wmi/SMS_R_System?${qs.join("&")}`,
      await getAuthHeaders(cm),
      cm.allowInsecureTls
    );
    const raw = json["@odata.count"];
    if (raw !== undefined) return { count: num(raw), exact: true };
  } catch {
    // Older sites reject $count — fall back to counting a capped page.
  }

  const rows = await adminGet<Record<string, unknown>>(cm, "wmi/SMS_R_System", {
    filter,
    select: "ResourceID",
    top: MAX_TOP,
  });
  return { count: rows.length, exact: rows.length < MAX_TOP };
}

// ─── Collection membership ───────────────────────────────────────

export interface DeviceCollectionMembership {
  deviceName: string;
  resourceId: number | null;
  found: boolean;
  collections: { collectionId: string; name: string }[];
  error?: string;
}

/**
 * Collections each named device belongs to. Unresolved names are returned as
 * explicit misses rather than dropped, so asking about three devices always
 * accounts for three devices.
 */
export async function getDeviceCollections(
  deviceNames: string[]
): Promise<DeviceCollectionMembership[]> {
  const cm = requireConnected();
  const base = cm.adminServiceUrl.replace(/\/+$/, "");
  const names = deviceNames.map((n) => String(n || "").trim()).filter(Boolean);
  if (names.length === 0) throw new Error("At least one device name is required.");

  const results: DeviceCollectionMembership[] = [];
  for (const deviceName of names) {
    try {
      const resourceId = await resolveResourceId(cm, deviceName);
      if (!resourceId) {
        results.push({ deviceName, resourceId: null, found: false, collections: [] });
        continue;
      }
      const url =
        `${base}/v1.0/Device(${resourceId})/ResourceCollectionMembership` +
        `?$expand=Collection&$select=Collection`;
      const json = await httpsJsonRequest(
        "GET",
        url,
        await getAuthHeaders(cm),
        cm.allowInsecureTls
      );
      const rows = Array.isArray(json.value) ? (json.value as Record<string, unknown>[]) : [];
      const collections = rows
        .map((r) => (r.Collection ?? r) as Record<string, unknown>)
        .filter((c) => c && (c.CollectionID || c.Name))
        .map((c) => ({
          collectionId: String(c.CollectionID ?? ""),
          name: String(c.Name ?? c.CollectionName ?? ""),
        }));
      results.push({ deviceName, resourceId, found: true, collections });
    } catch (err: unknown) {
      results.push({
        deviceName,
        resourceId: null,
        found: false,
        collections: [],
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return results;
}

// ─── Direct membership (write) ───────────────────────────────────

/**
 * Add a device to a collection as a direct membership rule.
 * Returns the ConfigMgr SInt32 return value; 0 means success.
 */
export async function addCollectionDirectMember(input: {
  collectionId: string;
  resourceId?: number;
  deviceName?: string;
  ruleName?: string;
}): Promise<{
  collectionId: string;
  resourceId: number;
  ruleName: string;
  returnValue: number;
  simulated?: boolean;
}> {
  const cm = requireConnected();
  const collectionId = String(input.collectionId || "").trim();
  if (!collectionId) throw new Error("A collectionId is required.");

  let resourceId = input.resourceId;
  let ruleName = input.ruleName;
  if (!resourceId) {
    if (!input.deviceName) throw new Error("A resourceId or deviceName is required.");
    const resolved = await resolveResourceId(cm, input.deviceName);
    if (!resolved) {
      throw new Error(
        `Device '${input.deviceName}' was not found in Configuration Manager.`
      );
    }
    resourceId = resolved;
    ruleName = ruleName || input.deviceName;
  }
  if (!ruleName) ruleName = String(resourceId);

  const response = await adminPost<Record<string, unknown>>(
    cm,
    wmiInstanceMethodPath("SMS_Collection", collectionId, "AddMembershipRule"),
    {
      collectionRule: {
        "@odata.type": SMS_COLLECTION_RULE_DIRECT_TYPE,
        ResourceClassName: "SMS_R_System",
        ResourceID: resourceId,
        RuleName: ruleName,
      },
    }
  );

  // AddMembershipRule returns SInt32: 0 success, non-zero is a ConfigMgr error.
  const returnValue = num(response.ReturnValue ?? response.value ?? 0);
  if (returnValue !== 0) {
    throw new Error(
      `ConfigMgr rejected the membership rule (return value ${returnValue}).`
    );
  }
  return {
    collectionId,
    resourceId,
    ruleName,
    returnValue,
    simulated: isConfigMgrSimulated() || undefined,
  };
}

// ─── Drill-down detail (read) ────────────────────────────────────

/** StatusType / AppStatusType, per the SMS_AppDeploymentAssetDetails docs. */
function deploymentStatusLabel(v: unknown): string {
  switch (num(v)) {
    case 1:
      return "Success";
    case 2:
      return "In progress";
    case 3:
      return "Requirements not met";
    case 5:
      return "Error";
    default:
      return "Unknown";
  }
}

/** EnforcementState, per the same documentation (0–14). */
const ENFORCEMENT_STATES: Record<number, string> = {
  0: "Unknown",
  1: "Enforcement started",
  2: "Waiting for content",
  3: "Waiting for another installation",
  4: "Waiting for maintenance window",
  5: "Restart required before installing",
  6: "General failure",
  7: "Pending installation",
  8: "Installing update",
  9: "Pending system restart",
  10: "Successfully installed update",
  11: "Failed to install update",
  12: "Downloading update",
  13: "Downloaded update",
  14: "Failed to download update",
};

/**
 * Devices that are members of a collection.
 *
 * SMS_FullCollectionMembership carries no OS property, so the shape stays to
 * what the class documents.
 */
export async function getCollectionMembers(
  collectionId: string,
  options?: { top?: number }
): Promise<ConfigMgrCollectionMember[]> {
  const cm = requireConnected();
  const id = String(collectionId || "").trim();
  if (!id) throw new Error("A collectionId is required.");

  const rows = await adminGet<Record<string, unknown>>(
    cm,
    "wmi/SMS_FullCollectionMembership",
    {
      filter: `CollectionID eq '${id.replace(/'/g, "''")}'`,
      select: "ResourceID,Name,IsActive,IsClient,ClientVersion,SiteCode,Domain,DeviceCategory",
      orderby: "Name",
      top: options?.top ?? DEFAULT_TOP,
    }
  );

  return rows.map((r) => ({
    resourceId: num(r.ResourceID),
    name: String(r.Name ?? ""),
    isActive: r.IsActive === true || r.IsActive === 1,
    isClient: r.IsClient === true || r.IsClient === 1,
    clientVersion: String(r.ClientVersion ?? ""),
    siteCode: String(r.SiteCode ?? ""),
    domain: String(r.Domain ?? ""),
    deviceCategory: String(r.DeviceCategory ?? ""),
  }));
}

/**
 * Per-device status for one application deployment.
 *
 * Only SMS_AppDeploymentErrorAssetDetails carries ErrorCode, so failures are
 * read from there; `errorsOnly: false` additionally reads the full asset list
 * for the other states. Neither class carries a description string, so the
 * readable text comes entirely from the verified error table.
 */
export async function getDeploymentStatus(
  assignmentId: string | number,
  options?: { top?: number; errorsOnly?: boolean }
): Promise<ConfigMgrDeploymentStatusRow[]> {
  const cm = requireConnected();
  const id = num(assignmentId);
  if (!id) throw new Error("A numeric deployment (assignment) ID is required.");
  const top = options?.top ?? DEFAULT_TOP;

  const mapRow = (r: Record<string, unknown>): ConfigMgrDeploymentStatusRow => {
    const row: ConfigMgrDeploymentStatusRow = {
      machineName: String(r.MachineName ?? ""),
      resourceId: num(r.MachineID),
      status: deploymentStatusLabel(r.StatusType ?? r.AppStatusType),
    };
    if (r.EnforcementState !== undefined) {
      row.enforcementState = ENFORCEMENT_STATES[num(r.EnforcementState)] ?? "Unknown";
    }
    if (r.ErrorCode !== undefined && num(r.ErrorCode) !== 0) {
      const explained = explainDeploymentError(r.ErrorCode);
      row.errorCode = explained.code ?? undefined;
      row.errorRecognised = explained.recognised;
      row.errorDocumentedAs = explained.documentedAs;
      row.errorMeaning = explained.meaning;
      row.errorRemediation = explained.remediation;
      row.errorSource = explained.source;
    }
    return row;
  };

  const errors = await adminGet<Record<string, unknown>>(
    cm,
    "wmi/SMS_AppDeploymentErrorAssetDetails",
    { filter: `AssignmentID eq ${id}`, top }
  );
  const rows = errors.map(mapRow);

  if (options?.errorsOnly === false) {
    const all = await adminGet<Record<string, unknown>>(
      cm,
      "wmi/SMS_AppDeploymentAssetDetails",
      { filter: `AssignmentID eq ${id}`, top }
    );
    const seen = new Set(rows.map((r) => r.machineName.toLowerCase()));
    for (const r of all) {
      const mapped = mapRow(r);
      if (!seen.has(mapped.machineName.toLowerCase())) rows.push(mapped);
    }
  }

  return rows;
}

/**
 * Detail for one application. No $select: the extra properties vary by site
 * version, and selecting one that does not exist fails the whole request.
 */
export async function getApplicationDetail(
  ciId: string | number
): Promise<ConfigMgrApplicationDetail | null> {
  const cm = requireConnected();
  const id = num(ciId);
  if (!id) throw new Error("A numeric application CI_ID is required.");

  const rows = await adminGet<Record<string, unknown>>(cm, "wmi/SMS_Application", {
    filter: `CI_ID eq ${id}`,
    top: 1,
  });
  const r = rows[0];
  if (!r) return null;

  return {
    ciId: String(r.CI_ID ?? id),
    name: String(r.LocalizedDisplayName ?? ""),
    manufacturer: String(r.Manufacturer ?? ""),
    version: String(r.SoftwareVersion ?? ""),
    numberOfDeployments: num(r.NumberOfDeployments),
    numberOfDevicesWithApp: num(r.NumberOfDevicesWithApp),
    isDeployed: r.IsDeployed === true || r.IsDeployed === 1,
    dateCreated: String(r.DateCreated ?? ""),
    description: r.LocalizedDescription ? String(r.LocalizedDescription) : undefined,
    dateLastModified: r.DateLastModified ? String(r.DateLastModified) : undefined,
    createdBy: r.CreatedBy ? String(r.CreatedBy) : undefined,
    isEnabled: r.IsEnabled === undefined ? undefined : r.IsEnabled === true || r.IsEnabled === 1,
    isSuperseded:
      r.IsSuperseded === undefined ? undefined : r.IsSuperseded === true || r.IsSuperseded === 1,
    numberOfDevicesWithFailure:
      r.NumberOfDeviceswithFailure === undefined
        ? undefined
        : num(r.NumberOfDeviceswithFailure),
  };
}

// ─── OSD prestaging (write) ──────────────────────────────────────

/** ImportMachineEntry requires colon-separated MAC, e.g. 00:11:22:33:44:55. */
const MAC_COLON_FORMAT = /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/;

/**
 * Prestage a computer for OS Deployment.
 *
 * A MAC in any other format is accepted by ConfigMgr but silently prevents the
 * client from receiving policy, so it is rejected here before the call is made.
 */
export async function importMachineEntry(input: {
  netbiosName: string;
  macAddress: string;
  smBiosGuid?: string;
  overwriteExistingRecord?: boolean;
  collectionId?: string;
}): Promise<{
  netbiosName: string;
  macAddress: string;
  machineExists: boolean;
  resourceId: number;
  smsUniqueIdentifier: string;
  simulated?: boolean;
}> {
  const cm = requireConnected();
  const netbiosName = String(input.netbiosName || "").trim();
  const macAddress = String(input.macAddress || "").trim();
  if (!netbiosName) throw new Error("A netbiosName is required.");
  if (!MAC_COLON_FORMAT.test(macAddress)) {
    throw new Error(
      `MAC address '${macAddress}' must be colon-separated, e.g. 00:11:22:33:44:55. ` +
        `Other formats are accepted by ConfigMgr but stop the client receiving policy.`
    );
  }

  const collectionId = String(input.collectionId || "").trim();
  const body: Record<string, unknown> = {
    NetbiosName: netbiosName,
    SMBIOSGUID: input.smBiosGuid ? String(input.smBiosGuid).trim() : "",
    MACAddress: macAddress,
    OverwriteExistingRecord: input.overwriteExistingRecord === true,
  };
  if (collectionId) {
    body.AddToCollection = true;
    body.CollectionId = collectionId;
  }

  const response = await adminPost<Record<string, unknown>>(
    cm,
    wmiStaticMethodPath("SMS_Site", "ImportMachineEntry"),
    body
  );

  return {
    netbiosName,
    macAddress,
    machineExists: response.MachineExists === true,
    resourceId: num(response.ResourceID),
    smsUniqueIdentifier: String(response.SMSUniqueIdentifier ?? ""),
    simulated: isConfigMgrSimulated() || undefined,
  };
}

