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
  checkConsentReadiness,
  renameTenant,
} from "../graph/tenantManager.js";
import { isValidUUID, sanitizeErrorMessage } from "../security.js";

const router = Router();

// ─── CSRF state for consent flow ──────────────────────────────────
// Map of state -> { createdAt, requestedTenantId? }. TTL: 10 minutes.

interface ConsentState {
  /** Chosen before the popup opened; applied when consent comes back. */
  friendlyName?: string;
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
 * PATCH /api/tenants/:tenantId — set or clear the operator-chosen name.
 *
 * The name is how a prompt addresses this tenant ("in Mauvlan"), so it is
 * editable after connecting, not only at consent time.
 */
router.patch("/:tenantId", (req, res) => {
  const tenantId = String(req.params.tenantId || "");
  if (!isValidUUID(tenantId)) {
    return res.status(400).json({ error: "Invalid tenant ID." });
  }
  const raw = (req.body ?? {}).friendlyName;
  if (raw !== null && typeof raw !== "string") {
    return res.status(400).json({ error: "friendlyName must be a string, or null to clear it." });
  }
  const updated = renameTenant(tenantId, raw === null ? null : String(raw));
  if (!updated) return res.status(404).json({ error: "Tenant is not connected." });
  res.json(updated);
});

/**
 * GET /api/tenants/consent-url?tenantId=xxx
 *
 * Returns the admin-consent URL the client should open in a popup.
 * tenantId is optional — pass "common" or omit to let the admin choose.
 */
router.get("/consent-url", async (req, res) => {
  pruneStates();

  const requested = typeof req.query.tenantId === "string" ? req.query.tenantId : "common";
  if (requested !== "common" && !isValidUUID(requested) && !/^[\w.-]+\.[\w.-]+$/.test(requested)) {
    return res.status(400).json({ error: "Invalid tenantId — must be a UUID, domain, or 'common'." });
  }

  // Check our own registration first. Entra raises both of these failures on
  // its own sign-in page without redirecting, so the callback below never sees
  // them — explaining them here is the only chance to say anything useful, and
  // it saves asking another tenant's admin to click a link that cannot work.
  const readiness = await checkConsentReadiness();
  if (!readiness.ready) {
    return res.status(409).json({
      error:
        "This app registration cannot be consented in another tenant yet:\n\n" +
        readiness.blockers.map((b) => `• ${b}`).join("\n\n"),
      blockers: readiness.blockers,
    });
  }

  const friendlyName =
    typeof req.query.friendlyName === "string" ? req.query.friendlyName.trim().slice(0, 64) : "";

  const state = randomBytes(32).toString("hex");
  consentStates.set(state, {
    createdAt: Date.now(),
    requestedTenantId: requested,
    friendlyName: friendlyName || undefined,
  });

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
  const pending = consentStates.get(state);
  consentStates.delete(state);

  // Surface any error from Azure AD. Only errors raised after Entra has
  // validated the redirect URI arrive here; the registration-level ones
  // (AADSTS700016, AADSTS50011) are caught by the preflight on /consent-url.
  if (errorCode) {
    return res.type("html").send(renderCallback({
      ok: false,
      message: explainConsentError(errorCode, errorDesc),
    }));
  }

  if (!adminConsent || !tenantParam || !isValidUUID(tenantParam)) {
    return res.status(400).type("html").send(renderCallback({
      ok: false,
      message: "Consent did not complete (no tenant id returned).",
    }));
  }

  try {
    const tenant = await registerTenant(tenantParam, pending?.friendlyName ?? null);
    return res.type("html").send(renderCallback({
      ok: true,
      message: `Connected: ${tenant.friendlyName ? `${tenant.friendlyName} (${tenant.displayName})` : tenant.displayName}`,
      tenant,
    }));
  } catch (err) {
    return res.status(500).type("html").send(renderCallback({
      ok: false,
      message: sanitizeErrorMessage(err instanceof Error ? err.message : String(err)),
    }));
  }
});

/**
 * Turn an Entra consent error into something a person can act on. Unknown codes
 * keep their original text rather than being given an invented meaning.
 */
function explainConsentError(code: string, description: string): string {
  const known: Record<string, string> = {
    access_denied:
      "The administrator declined consent, or cancelled the sign-in. Nothing was changed in that tenant.",
    AADSTS65004:
      "The administrator declined consent. Nothing was changed in that tenant.",
    AADSTS90094:
      "The account that signed in is not a Global Administrator in that tenant. " +
      "Granting these permissions is tenant-wide, so only a Global Administrator can do it.",
    AADSTS650056:
      "The app is misconfigured for that tenant, or the admin signed in to a different " +
      "tenant than the one requested.",
  };

  // The description carries the AADSTS code even when `error` is a generic
  // OAuth code such as access_denied, so match on both.
  const matched = Object.keys(known).find(
    (k) => k === code || description.includes(k)
  );
  const detail = description || "no description";
  return matched
    ? `${known[matched]}\n\n(Entra reported: ${code} — ${detail})`
    : `Entra error: ${code} — ${detail}`;
}

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
