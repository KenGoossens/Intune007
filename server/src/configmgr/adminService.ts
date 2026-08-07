import https from "node:https";
import { ClientSecretCredential } from "@azure/identity";
import { config } from "../config.js";
import { sanitizeErrorMessage } from "../security.js";
import { getStoredConnection } from "./connectionStore.js";
import type {
  ConfigMgrApplicationInfo,
  ConfigMgrCollectionInfo,
  ConfigMgrConnectionStatus,
  ConfigMgrDeploymentInfo,
} from "@intune-agent/shared";

/**
 * Read-only connector for the Configuration Manager AdminService REST API.
 *
 * Auth is pluggable via CONFIGMGR_AUTH_MODE:
 *   - "azuread" (default): request an Entra ID token for the CMG server app and
 *     send it as a bearer token. Works over the internet via a Cloud Management
 *     Gateway and reuses the @azure/identity library.
 *   - "bearer": send a static CONFIGMGR_BEARER_TOKEN (testing / manual).
 *   - "none": no Authorization header (rare — anonymous intranet endpoints).
 *   - "windows": not supported in this build (NTLM/Kerberos from Node).
 *
 * Every call is a GET — this connector never mutates ConfigMgr.
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
  return withCredFallback(config.configMgr);
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

