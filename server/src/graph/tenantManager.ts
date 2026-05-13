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
  getActiveTenantId as getStoredActiveTenantId,
  setActiveTenantId as setStoredActiveTenantId,
  toTenantInfo,
} from "../tenants/tenantStore.js";
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
export function switchTenant(tenantId: string): {
  success: boolean;
  message: string;
  activeTenant: string;
} {
  initialize();
  const tenant = getTenant(tenantId);
  if (!tenant) {
    return {
      success: false,
      message: `Tenant ${tenantId} is not connected.`,
      activeTenant: activeTenantId,
    };
  }
  activeTenantId = tenantId;
  setStoredActiveTenantId(tenantId);
  touchTenant(tenantId);
  return {
    success: true,
    message: `Switched to tenant: ${tenant.displayName}`,
    activeTenant: activeTenantId,
  };
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
export async function registerTenant(tenantId: string): Promise<TenantInfo> {
  initialize();

  let displayName = tenantId;
  try {
    const probe = buildClient(tenantId);
    const org = await probe.api("/organization").select("displayName").get();
    const first = org?.value?.[0];
    if (first?.displayName) {
      displayName = String(first.displayName);
    }
  } catch (err) {
    throw new Error(
      `Could not query tenant ${tenantId}: ${err instanceof Error ? err.message : String(err)}. ` +
        `Verify the app is multi-tenant and admin consent was granted.`
    );
  }

  addTenant(tenantId, displayName);
  clients.delete(tenantId);

  const stored = getTenant(tenantId)!;
  return toTenantInfo(stored, stored.tenantId === activeTenantId);
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
