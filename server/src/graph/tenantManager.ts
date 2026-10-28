/**
 * Tenant Manager — Multi-tenant Graph client factory.
 *
 * Loads connected tenants from the SQLite tenant store and creates one
 * Graph client per tenant on demand. Authenticates with either a client
 * certificate (preferred) or a client secret, both from the shared Azure AD
 * multi-tenant app registration.
 */

import { Client } from "@microsoft/microsoft-graph-client";
import {
  ClientSecretCredential,
  ClientCertificateCredential,
  type TokenCredential,
} from "@azure/identity";
import { TokenCredentialAuthenticationProvider } from "@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js";
import { config } from "../config.js";
import {
  addTenant,
  listTenants,
  getTenant,
  removeTenant,
  touchTenant,
  setFriendlyName,
  getActiveTenantId as getStoredActiveTenantId,
  setActiveTenantId as setStoredActiveTenantId,
  toTenantInfo,
} from "../tenants/tenantStore.js";
import type { StoredTenant } from "../tenants/tenantStore.js";
import type { TenantInfo } from "@intune-agent/shared";

const clients: Map<string, Client> = new Map();
let activeTenantId: string = "";
let initialized = false;

function buildCredential(tenantId: string): TokenCredential {
  if (config.azureAd.clientCertPath) {
    return new ClientCertificateCredential(
      tenantId,
      config.azureAd.clientId,
      {
        certificatePath: config.azureAd.clientCertPath,
        certificatePassword: config.azureAd.clientCertPassword || undefined,
      }
    );
  }
  return new ClientSecretCredential(
    tenantId,
    config.azureAd.clientId,
    config.azureAd.clientSecret
  );
}

function buildClient(tenantId: string): Client {
  const credential = buildCredential(tenantId);
  const authProvider = new TokenCredentialAuthenticationProvider(credential, {
    scopes: ["https://graph.microsoft.com/.default"],
  });
  return Client.initWithMiddleware({ authProvider });
}

function initialize(): void {
  if (initialized) return;
  initialized = true;

  const existing = listTenants();

  // Seed the env-defined primary tenant on first run.
  if (existing.length === 0 && config.azureAd.tenantId && config.azureAd.clientId) {
    addTenant(config.azureAd.tenantId, "Primary");
  }

  // Best-effort import of legacy AZURE_TENANTS JSON.
  try {
    const tenantsJson = process.env.AZURE_TENANTS;
    if (tenantsJson) {
      const tenants = JSON.parse(tenantsJson) as Array<{ tenantId: string; label?: string }>;
      for (const t of tenants) {
        if (t.tenantId && !getTenant(t.tenantId)) {
          addTenant(t.tenantId, t.label || t.tenantId);
        }
      }
    }
  } catch {
    /* ignore malformed JSON */
  }

  const stored = getStoredActiveTenantId();
  const all = listTenants();
  if (stored && all.some((t) => t.tenantId === stored)) {
    activeTenantId = stored;
  } else if (all.length > 0) {
    activeTenantId = all[0].tenantId;
    setStoredActiveTenantId(activeTenantId);
  } else {
    activeTenantId = config.azureAd.tenantId || "";
  }
}

function getOrCreateClient(tenantId: string): Client {
  const cached = clients.get(tenantId);
  if (cached) return cached;
  const client = buildClient(tenantId);
  clients.set(tenantId, client);
  return client;
}

/**
 * Get the Graph client for the currently active tenant.
 */
export function getActiveTenantClient(): Client {
  initialize();
  if (!activeTenantId) {
    throw new Error("No tenant configured. Connect a tenant via the UI or set AZURE_TENANT_ID.");
  }
  touchTenant(activeTenantId);
  return getOrCreateClient(activeTenantId);
}

/**
 * Get the Graph client for a specific connected tenant.
 */
export function getClientForSpecificTenant(tenantId: string): Client {
  initialize();
  if (!getTenant(tenantId)) {
    throw new Error(`Tenant ${tenantId} is not connected.`);
  }
  return getOrCreateClient(tenantId);
}

export function getActiveTenantId(): string {
  initialize();
  return activeTenantId;
}

/**
 * Switch the active tenant. Persists across restarts.
 */
/**
 * Resolve however a person referred to a tenant — a GUID, the friendly name
 * they gave it, or the directory's own name — to a connected tenant.
 *
 * A prompt says "in Mauvlan", not a GUID, so a tenant that cannot be addressed
 * by name cannot be addressed at all. An ambiguous name is reported rather than
 * guessed: picking one of two tenants at random would run the query somewhere
 * the user did not mean.
 */
export function resolveTenantRef(
  ref: string
): { tenant: StoredTenant } | { error: string } {
  initialize();
  const needle = String(ref ?? "").trim().toLowerCase();
  if (!needle) return { error: "A tenant name or ID is required." };

  const all = listTenants();
  const exact = all.find((t) => t.tenantId.toLowerCase() === needle);
  if (exact) return { tenant: exact };

  const named = (t: StoredTenant) =>
    [t.friendlyName ?? "", t.displayName].filter(Boolean).map((v) => v.toLowerCase());

  const byName = all.filter((t) => named(t).includes(needle));
  if (byName.length === 1) return { tenant: byName[0] };
  if (byName.length > 1) return { error: ambiguous(ref, byName) };

  const partial = all.filter((t) => named(t).some((n) => n.includes(needle)));
  if (partial.length === 1) return { tenant: partial[0] };
  if (partial.length > 1) return { error: ambiguous(ref, partial) };

  const known = all.map((t) => t.friendlyName || t.displayName).join(", ");
  return {
    error: `No connected tenant matches "${ref}".${known ? ` Connected: ${known}.` : " No tenants are connected."}`,
  };
}

function ambiguous(ref: string, matches: StoredTenant[]): string {
  const list = matches
    .map((t) => `${t.friendlyName || t.displayName} (${t.tenantId})`)
    .join(", ");
  return `"${ref}" matches more than one connected tenant: ${list}. Please be more specific.`;
}

export function switchTenant(tenantRef: string): {
  success: boolean;
  message: string;
  activeTenant: string;
} {
  initialize();
  const resolved = resolveTenantRef(tenantRef);
  if ("error" in resolved) {
    return { success: false, message: resolved.error, activeTenant: activeTenantId };
  }
  const tenant = resolved.tenant;
  activeTenantId = tenant.tenantId;
  setStoredActiveTenantId(tenant.tenantId);
  touchTenant(tenant.tenantId);
  return {
    success: true,
    message: `Switched to tenant: ${tenantLabel(tenant)}`,
    activeTenant: activeTenantId,
  };
}

/** How a tenant should be named back to the user. */
function tenantLabel(t: StoredTenant): string {
  return t.friendlyName ? `${t.friendlyName} (${t.displayName})` : t.displayName;
}

/** Rename a connected tenant. */
export function renameTenant(tenantId: string, friendlyName: string | null): TenantInfo | null {
  initialize();
  if (!setFriendlyName(tenantId, friendlyName)) return null;
  const stored = getTenant(tenantId)!;
  return toTenantInfo(stored, stored.tenantId === activeTenantId);
}

/**
 * List all connected tenants.
 */
export function listConfiguredTenants(): TenantInfo[] {
  initialize();
  return listTenants().map((t) => toTenantInfo(t, t.tenantId === activeTenantId));
}

/**
 * Register a newly-consented tenant by probing Graph for its display name.
 * This both verifies admin consent succeeded and gives us a friendly label.
 */
export async function registerTenant(
  tenantId: string,
  friendlyName?: string | null
): Promise<TenantInfo> {
  initialize();

  const probe = await probeTenantName(tenantId);
  if ("error" in probe) throw new Error(probe.error);

  addTenant(tenantId, probe.displayName, friendlyName);
  clients.delete(tenantId);

  const stored = getTenant(tenantId)!;
  return toTenantInfo(stored, stored.tenantId === activeTenantId);
}

/**
 * Read the new tenant's directory name, retrying while the service principal
 * propagates.
 *
 * Consent creates the enterprise application in the target tenant, but it is
 * not immediately usable everywhere: a token request made in the seconds right
 * after consent can still be refused as though the app did not exist. The
 * consent callback runs exactly in that window, so a single attempt turns a
 * successful consent into "could not query tenant" and the tenant is never
 * added — with no way to retry but to consent again.
 */
async function probeTenantName(
  tenantId: string
): Promise<{ displayName: string } | { error: string }> {
  const delaysMs = [0, 2_000, 4_000, 8_000];
  let last = "";

  for (const delay of delaysMs) {
    if (delay) await new Promise((r) => setTimeout(r, delay));
    try {
      const org = await buildClient(tenantId).api("/organization").select("displayName").get();
      const name = org?.value?.[0]?.displayName;
      if (name) return { displayName: String(name) };
      return { displayName: tenantId };
    } catch (err) {
      last = err instanceof Error ? err.message : String(err);
      // Only propagation-shaped failures are worth waiting on. A genuine
      // misconfiguration will not fix itself, and retrying it just makes the
      // user wait fourteen seconds for the same answer.
      if (!isPropagationError(last)) break;
    }
  }

  return {
    error:
      `Could not query tenant ${tenantId}: ${last}. ` +
      `If consent was just granted, the enterprise application may still be propagating — ` +
      `wait a moment and try connecting again. Otherwise verify the app registration is ` +
      `multi-tenant and that admin consent completed.`,
  };
}

function isPropagationError(message: string): boolean {
  return /AADSTS700016|AADSTS900023|not found in the directory|was not found|does not exist/i.test(
    message
  );
}

/**
 * Disconnect a tenant. If the active tenant is removed, the active pointer
 * falls back to another connected tenant.
 */
export function disconnectTenant(tenantId: string): {
  success: boolean;
  message: string;
} {
  initialize();
  if (tenantId === activeTenantId) {
    const others = listTenants().filter((t) => t.tenantId !== tenantId);
    if (others.length === 0) {
      return { success: false, message: "Cannot remove the last connected tenant." };
    }
    activeTenantId = others[0].tenantId;
    setStoredActiveTenantId(activeTenantId);
  }
  const removed = removeTenant(tenantId);
  clients.delete(tenantId);
  return {
    success: removed,
    message: removed ? "Tenant disconnected." : "Tenant not found.",
  };
}

/**
 * Why a consent attempt would fail, read from our own app registration.
 *
 * Both of these errors are raised by Entra on its own sign-in page, before it
 * will redirect anywhere — it refuses to send a browser to a redirect URI it
 * has not validated. That means the consent callback never runs and cannot
 * report them. The only place they can be explained is here, before the popup
 * opens.
 */
export interface ConsentReadiness {
  ready: boolean;
  blockers: string[];
  signInAudience?: string;
}

const READINESS_TTL_MS = 60_000;
let readinessCache: { at: number; value: ConsentReadiness } | null = null;

export async function checkConsentReadiness(): Promise<ConsentReadiness> {
  if (readinessCache && Date.now() - readinessCache.at < READINESS_TTL_MS) {
    return readinessCache.value;
  }

  const expectedRedirect = `${config.appBaseUrl}/api/tenants/consent-callback`;
  const blockers: string[] = [];
  let signInAudience: string | undefined;

  try {
    const home = buildClient(config.azureAd.tenantId);
    const apps = await home
      .api("/applications")
      .filter(`appId eq '${config.azureAd.clientId}'`)
      .select("signInAudience,web")
      .get();
    const app = apps?.value?.[0];

    if (!app) {
      console.warn(
        "[consent] readiness check: app registration not visible to this token " +
          "(Application.Read.All may not be granted)"
      );
      // Reading our own registration needs Application.Read.All. Without it we
      // cannot tell ready from not-ready, and blocking on a check we could not
      // run would be worse than letting the attempt proceed.
      return cacheReadiness({ ready: true, blockers: [] });
    }

    signInAudience = String(app.signInAudience ?? "");
    if (signInAudience === "AzureADMyOrg") {
      blockers.push(
        "The app registration is single-tenant (signInAudience: AzureADMyOrg), so it does not " +
          "exist in any other directory and no enterprise application can be created there. " +
          "Entra reports this as AADSTS700016. Fix: Entra admin centre → App registrations → " +
          `${config.azureAd.clientId} → Authentication → Supported account types → ` +
          '"Accounts in any organizational directory".'
      );
    }

    const redirectUris: string[] = Array.isArray(app.web?.redirectUris)
      ? app.web.redirectUris.map(String)
      : [];
    if (!redirectUris.some((u) => u.toLowerCase() === expectedRedirect.toLowerCase())) {
      blockers.push(
        `The consent callback "${expectedRedirect}" is not a registered redirect URI, so Entra ` +
          "will refuse the redirect after the admin has already signed in (AADSTS50011). " +
          "Fix: same registration → Authentication → Web → Redirect URIs → add that exact URL."
      );
    }
  } catch (err) {
    // A readiness check that cannot complete must not block a consent attempt
    // that might well succeed — but it must say so, or a broken check is
    // indistinguishable from a healthy registration.
    console.warn(
      "[consent] readiness check could not read the app registration:",
      err instanceof Error ? err.message : String(err)
    );
    return cacheReadiness({ ready: true, blockers: [] });
  }

  return cacheReadiness({ ready: blockers.length === 0, blockers, signInAudience });
}

function cacheReadiness(value: ConsentReadiness): ConsentReadiness {
  // Only a ready result is cached. Blockers are fixed in the Entra portal and
  // the user retries straight afterwards — serving them a stale failure for up
  // to a minute would look like the fix had not worked.
  if (value.ready) readinessCache = { at: Date.now(), value };
  return value;
}

/**
 * Build the Azure AD admin-consent URL for a target tenant. Pass `"common"`
 * to let the admin choose their tenant during sign-in.
 */
export function buildAdminConsentUrl(tenantId: string, state: string): string {
  const redirectUri = `${config.appBaseUrl}/api/tenants/consent-callback`;
  const params = new URLSearchParams({
    client_id: config.azureAd.clientId,
    redirect_uri: redirectUri,
    state,
  });
  const target = tenantId && tenantId !== "common" ? tenantId : "common";
  return `https://login.microsoftonline.com/${encodeURIComponent(target)}/adminconsent?${params.toString()}`;
}
