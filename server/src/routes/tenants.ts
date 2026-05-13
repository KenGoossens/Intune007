/**
 * Tenants API — connect, list, switch, and disconnect Intune tenants.
 *
 * Connect flow:
 *   1. Client calls GET /api/tenants/consent-url?tenantId=xxx
 *   2. Server returns the Azure AD admin-consent URL with a CSRF state token
 *   3. Client opens that URL in a popup
 *   4. Target tenant's Global Admin signs in & grants consent
 *   5. Azure AD redirects to GET /api/tenants/consent-callback?tenant=...&state=...
 *   6. Server validates state, queries the new tenant for its display name,
 *      writes it to tenants.db, then renders an HTML page that posts a message
 *      back to the opener and closes the popup
 *   7. Client refreshes its tenant list
 */

import { Router } from "express";
import { randomBytes } from "crypto";
import {
  listConfiguredTenants,
  switchTenant,
  registerTenant,
  disconnectTenant,
  getActiveTenantId,
  buildAdminConsentUrl,
} from "../graph/tenantManager.js";
import { isValidUUID, sanitizeErrorMessage } from "../security.js";

const router = Router();

// ─── CSRF state for consent flow ──────────────────────────────────
// Map of state -> { createdAt, requestedTenantId? }. TTL: 10 minutes.

interface ConsentState {
  createdAt: number;
  requestedTenantId?: string;
}

const consentStates = new Map<string, ConsentState>();
const STATE_TTL_MS = 10 * 60 * 1000;

function pruneStates(): void {
  const now = Date.now();
  for (const [state, data] of consentStates.entries()) {
    if (now - data.createdAt > STATE_TTL_MS) {
      consentStates.delete(state);
    }
  }
}

function isHexState(value: string): boolean {
  return /^[a-f0-9]{32,128}$/i.test(value);
}

// ─── Routes ───────────────────────────────────────────────────────

/** GET /api/tenants — list all connected tenants */
router.get("/", (_req, res) => {
  res.json({ tenants: listConfiguredTenants() });
});

/** GET /api/tenants/active — current active tenant */
router.get("/active", (_req, res) => {
  const id = getActiveTenantId();
  res.json({ activeTenantId: id });
});

/** POST /api/tenants/active — switch active tenant */
router.post("/active", (req, res) => {
  const { tenantId } = req.body ?? {};
  if (typeof tenantId !== "string" || !isValidUUID(tenantId)) {
    return res.status(400).json({ error: "Invalid tenantId — must be a UUID." });
  }
  const result = switchTenant(tenantId);
  if (!result.success) {
    return res.status(404).json(result);
  }
  res.json(result);
});

/** DELETE /api/tenants/:tenantId — disconnect a tenant */
router.delete("/:tenantId", (req, res) => {
  const { tenantId } = req.params;
  if (!isValidUUID(tenantId)) {
    return res.status(400).json({ error: "Invalid tenantId — must be a UUID." });
  }
  const result = disconnectTenant(tenantId);
  if (!result.success) {
    return res.status(400).json(result);
  }
  res.json(result);
});

/**
 * GET /api/tenants/consent-url?tenantId=xxx
 *
 * Returns the admin-consent URL the client should open in a popup.
 * tenantId is optional — pass "common" or omit to let the admin choose.
 */
router.get("/consent-url", (req, res) => {
  pruneStates();

  const requested = typeof req.query.tenantId === "string" ? req.query.tenantId : "common";
  if (requested !== "common" && !isValidUUID(requested) && !/^[\w.-]+\.[\w.-]+$/.test(requested)) {
    return res.status(400).json({ error: "Invalid tenantId — must be a UUID, domain, or 'common'." });
  }

  const state = randomBytes(32).toString("hex");
  consentStates.set(state, { createdAt: Date.now(), requestedTenantId: requested });

  const url = buildAdminConsentUrl(requested, state);
  res.json({ url, state });
});

/**
 * GET /api/tenants/consent-callback
 *
 * Azure AD redirects here after the admin grants (or denies) consent.
 * Success params: ?tenant={tenantId}&state={state}&admin_consent=True
 * Error params:   ?error=...&error_description=...&state={state}
 *
 * Renders an HTML page that posts a message back to window.opener and closes.
 */
router.get("/consent-callback", async (req, res) => {
  pruneStates();

  // Allow the inline script in our callback HTML (helmet's global CSP blocks it).
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'"
  );

  const state = typeof req.query.state === "string" ? req.query.state : "";
  const tenantParam = typeof req.query.tenant === "string" ? req.query.tenant : "";
  const adminConsent = String(req.query.admin_consent || "").toLowerCase() === "true";
  const errorCode = typeof req.query.error === "string" ? req.query.error : "";
  const errorDesc = typeof req.query.error_description === "string" ? req.query.error_description : "";

  // Validate state token (CSRF defence). Must be present, well-formed, and known.
  if (!state || !isHexState(state) || !consentStates.has(state)) {
    return res.status(400).type("html").send(renderCallback({
      ok: false,
      message: "Invalid or expired state token. Please retry the connection.",
    }));
  }
  consentStates.delete(state);

  // Surface any error from Azure AD.
  if (errorCode) {
    return res.type("html").send(renderCallback({
      ok: false,
      message: `Azure AD error: ${errorCode} — ${errorDesc || "no description"}`,
    }));
  }

  if (!adminConsent || !tenantParam || !isValidUUID(tenantParam)) {
    return res.status(400).type("html").send(renderCallback({
      ok: false,
      message: "Consent did not complete (no tenant id returned).",
    }));
  }

  try {
    const tenant = await registerTenant(tenantParam);
    return res.type("html").send(renderCallback({
      ok: true,
      message: `Connected: ${tenant.displayName}`,
      tenant,
    }));
  } catch (err) {
    return res.status(500).type("html").send(renderCallback({
      ok: false,
      message: sanitizeErrorMessage(err instanceof Error ? err.message : String(err)),
    }));
  }
});

// ─── HTML callback page ───────────────────────────────────────────
// Posts a message to window.opener (the React app) and closes the popup.

function renderCallback(payload: { ok: boolean; message: string; tenant?: unknown }): string {
  // Escape JSON for safe inline embedding (prevent </script> breakout).
  const json = JSON.stringify(payload).replace(/</g, "\\u003c");
  const heading = payload.ok ? "Tenant connected" : "Connection failed";
  const color = payload.ok ? "#10b981" : "#ef4444";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${heading}</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0;
           display: flex; align-items: center; justify-content: center;
           height: 100vh; margin: 0; }
    .card { max-width: 440px; padding: 32px; background: #1e293b;
            border-radius: 12px; border: 1px solid #334155; text-align: center; }
    h1 { color: ${color}; margin: 0 0 12px; font-size: 20px; }
    p { color: #94a3b8; margin: 0 0 20px; }
    .hint { font-size: 12px; color: #64748b; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${heading}</h1>
    <p>${escapeHtml(payload.message)}</p>
    <p class="hint">You can close this window.</p>
  </div>
  <script>
    (function () {
      try {
        var data = ${json};
        if (window.opener) {
          // Use "*" because the popup origin (server port) differs from the
          // SPA origin (Vite dev port). The receiver validates the
          // "source" field on the message payload.
          window.opener.postMessage({ source: "intune007-tenant-consent", payload: data }, "*");
        }
      } catch (e) { /* noop */ }
      setTimeout(function () { window.close(); }, 1500);
    })();
  </script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export default router;
