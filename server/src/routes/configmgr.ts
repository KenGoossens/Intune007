import { Router, type Request, type Response } from "express";
import {
  getComanagementSummary,
  getComanagedDevices,
  getComanagementEligibleDevices,
  getConfigMgrClientHealth,
} from "../configmgr/comanagement.js";
import {
  getConfigMgrConnectionStatus,
  getCollections,
  getDeployments,
  getApplications,
  isConfigMgrConfigured,
  resetConfigMgrAuthCache,
  runCmPivot,
} from "../configmgr/adminService.js";
import { triggerConfigMgrClientAction } from "../configmgr/comanagement.js";
import {
  getStoredConnection,
  saveStoredConnection,
  clearStoredConnection,
} from "../configmgr/connectionStore.js";
import { sanitizeErrorMessage, auditLog } from "../security.js";

const router = Router();

const NOT_CONFIGURED = {
  configured: false,
  message:
    "The on-prem ConfigMgr AdminService is not connected. Use the Config Manager " +
    "panel → Site (on-prem) tab → Connect to set it up.",
};

/**
 * GET /api/configmgr/summary
 * Aggregated co-management dashboard: adoption counts, per-workload split,
 * client-health breakdown, eligibility funnel, and co-managed device list.
 */
router.get("/summary", async (_req: Request, res: Response) => {
  try {
    const summary = await getComanagementSummary();
    res.json(summary);
  } catch (err) {
    res
      .status(500)
      .json({ error: sanitizeErrorMessage(String(err)) });
  }
});

/**
 * GET /api/configmgr/devices
 * Co-managed devices (managed by both ConfigMgr and Intune).
 */
router.get("/devices", async (_req: Request, res: Response) => {
  try {
    const result = await getComanagedDevices({ top: 1000 });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: sanitizeErrorMessage(String(err)) });
  }
});

/**
 * GET /api/configmgr/eligible?status=eligible
 * Co-management eligibility feed, optionally filtered by status.
 */
router.get("/eligible", async (req: Request, res: Response) => {
  try {
    const status =
      typeof req.query.status === "string" ? req.query.status : undefined;
    const result = await getComanagementEligibleDevices({ status, top: 1000 });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: sanitizeErrorMessage(String(err)) });
  }
});

/**
 * GET /api/configmgr/health
 * Co-managed devices whose ConfigMgr client is unhealthy or blocked.
 */
router.get("/health", async (_req: Request, res: Response) => {
  try {
    const result = await getConfigMgrClientHealth();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: sanitizeErrorMessage(String(err)) });
  }
});

// ─── On-prem AdminService (site data) ────────────────────────────

/**
 * GET /api/configmgr/connection
 * Current AdminService connection config for the wizard, with secrets masked.
 */
router.get("/connection", (_req: Request, res: Response) => {
  const stored = getStoredConnection();
  const source = stored ? "store" : isConfigMgrConfigured() ? "env" : "none";
  res.json({
    configured: isConfigMgrConfigured(),
    source,
    adminServiceUrl: stored?.adminServiceUrl ?? "",
    authMode: stored?.authMode ?? "azuread",
    resource: stored?.resource ?? "",
    tenantId: stored?.tenantId ?? "",
    clientId: stored?.clientId ?? "",
    hasClientSecret: Boolean(stored?.clientSecret),
    hasBearerToken: Boolean(stored?.bearerToken),
    allowInsecureTls: stored?.allowInsecureTls ?? false,
    updatedAt: stored?.updatedAt ?? null,
  });
});

function buildOverrideFromBody(b: Record<string, unknown>) {
  const existing = getStoredConnection();
  return {
    adminServiceUrl: String(b.adminServiceUrl ?? "").trim(),
    authMode: String(b.authMode ?? "azuread"),
    resource: String(b.resource ?? "").trim(),
    tenantId: String(b.tenantId ?? "").trim(),
    clientId: String(b.clientId ?? "").trim(),
    // Preserve stored secrets when the field is left blank on edit.
    clientSecret: b.clientSecret ? String(b.clientSecret) : existing?.clientSecret ?? "",
    bearerToken: b.bearerToken ? String(b.bearerToken) : existing?.bearerToken ?? "",
    allowInsecureTls: Boolean(b.allowInsecureTls),
  };
}

function validateUrl(url: string): string | null {
  if (!url) return "An AdminService URL is required.";
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "The AdminService URL is not a valid URL.";
  }
  if (parsed.protocol !== "https:") return "The AdminService URL must use HTTPS.";
  return null;
}

/**
 * POST /api/configmgr/connection/test
 * Test a connection (from the wizard form) WITHOUT saving it.
 */
router.post("/connection/test", async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const override = buildOverrideFromBody(body);
  const urlError = validateUrl(override.adminServiceUrl);
  if (urlError) {
    res.json({ configured: false, connected: false, authMode: override.authMode, error: urlError });
    return;
  }
  resetConfigMgrAuthCache();
  try {
    const status = await getConfigMgrConnectionStatus(override);
    res.json(status);
  } catch (err) {
    res.json({
      configured: true,
      connected: false,
      authMode: override.authMode,
      error: sanitizeErrorMessage(String(err)),
    });
  }
});

/**
 * POST /api/configmgr/connection
 * Save the AdminService connection (from the wizard). Secrets left blank are
 * preserved from the previously-saved connection.
 */
router.post("/connection", (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const conn = buildOverrideFromBody(body);
  const urlError = validateUrl(conn.adminServiceUrl);
  if (urlError) {
    res.status(400).json({ error: urlError });
    return;
  }
  const authMode = ["azuread", "bearer", "none"].includes(conn.authMode)
    ? conn.authMode
    : "azuread";
  saveStoredConnection({ ...conn, authMode });
  resetConfigMgrAuthCache();
  res.json({ ok: true });
});

/**
 * DELETE /api/configmgr/connection
 * Disconnect — remove the saved AdminService connection.
 */
router.delete("/connection", (_req: Request, res: Response) => {
  clearStoredConnection();
  resetConfigMgrAuthCache();
  res.json({ ok: true });
});

/**
 * GET /api/configmgr/adminservice-status
 * Connectivity/config state of the on-prem AdminService connector.
 */
router.get("/adminservice-status", async (_req: Request, res: Response) => {
  try {
    const status = await getConfigMgrConnectionStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: sanitizeErrorMessage(String(err)) });
  }
});

/**
 * GET /api/configmgr/collections
 * ConfigMgr collections from the AdminService (read-only).
 */
router.get("/collections", async (req: Request, res: Response) => {
  if (!isConfigMgrConfigured()) {
    res.json(NOT_CONFIGURED);
    return;
  }
  try {
    const top = req.query.top ? parseInt(String(req.query.top), 10) : undefined;
    const items = await getCollections({ top });
    res.json({ configured: true, items, totalCount: items.length });
  } catch (err) {
    res.status(502).json({ error: sanitizeErrorMessage(String(err)) });
  }
});

/**
 * GET /api/configmgr/deployments
 * ConfigMgr deployment summaries from the AdminService (read-only).
 */
router.get("/deployments", async (req: Request, res: Response) => {
  if (!isConfigMgrConfigured()) {
    res.json(NOT_CONFIGURED);
    return;
  }
  try {
    const top = req.query.top ? parseInt(String(req.query.top), 10) : undefined;
    const items = await getDeployments({ top });
    res.json({ configured: true, items, totalCount: items.length });
  } catch (err) {
    res.status(502).json({ error: sanitizeErrorMessage(String(err)) });
  }
});

/**
 * GET /api/configmgr/applications
 * ConfigMgr applications (latest revision) from the AdminService (read-only).
 */
router.get("/applications", async (req: Request, res: Response) => {
  if (!isConfigMgrConfigured()) {
    res.json(NOT_CONFIGURED);
    return;
  }
  try {
    const top = req.query.top ? parseInt(String(req.query.top), 10) : undefined;
    const nameContains =
      typeof req.query.nameContains === "string" ? req.query.nameContains : undefined;
    const items = await getApplications({ top, nameContains });
    res.json({ configured: true, items, totalCount: items.length });
  } catch (err) {
    res.status(502).json({ error: sanitizeErrorMessage(String(err)) });
  }
});

// ─── Write actions (audited) ──────────────────────────────

/**
 * POST /api/configmgr/client-action
 * Trigger a ConfigMgr client action on a co-managed device (write, audited).
 * Body: { deviceId, action }
 */
router.post("/client-action", async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const deviceId = String(body.deviceId ?? "");
  const action = String(body.action ?? "");
  if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(deviceId)) {
    res.status(400).json({ error: "A valid device ID (GUID) is required." });
    return;
  }
  try {
    const result = await triggerConfigMgrClientAction(deviceId, action);
    auditLog({
      timestamp: new Date().toISOString(),
      toolName: "trigger_configmgr_client_action",
      args: { deviceId, action },
      isDestructive: true,
      confirmed: true,
      result: "success",
    });
    res.json(result);
  } catch (err) {
    const msg = sanitizeErrorMessage(String(err));
    auditLog({
      timestamp: new Date().toISOString(),
      toolName: "trigger_configmgr_client_action",
      args: { deviceId, action },
      isDestructive: true,
      confirmed: true,
      result: "error",
      error: msg,
    });
    res.status(502).json({ error: msg });
  }
});

/**
 * POST /api/configmgr/cmpivot
 * Run a CMPivot query against a device via the AdminService (write, audited).
 * Body: { deviceName?, resourceId?, query }
 */
router.post("/cmpivot", async (req: Request, res: Response) => {
  if (!isConfigMgrConfigured()) {
    res.json(NOT_CONFIGURED);
    return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const query = String(body.query ?? "");
  const deviceName = body.deviceName ? String(body.deviceName) : undefined;
  const resourceId = typeof body.resourceId === "number" ? body.resourceId : undefined;
  try {
    const result = await runCmPivot({ resourceId, deviceName }, query);
    auditLog({
      timestamp: new Date().toISOString(),
      toolName: "run_cmpivot_query",
      args: { deviceName, resourceId, query: query.substring(0, 200) },
      isDestructive: true,
      confirmed: true,
      result: "success",
    });
    res.json(result);
  } catch (err) {
    const msg = sanitizeErrorMessage(String(err));
    auditLog({
      timestamp: new Date().toISOString(),
      toolName: "run_cmpivot_query",
      args: { deviceName, resourceId },
      isDestructive: true,
      confirmed: true,
      result: "error",
      error: msg,
    });
    res.status(502).json({ error: msg });
  }
});

export default router;
