/**
 * Tenant Manager — Multi-tenant support for managing multiple Intune tenants.
 *
 * Replaces the singleton Graph client with a tenant-keyed client map.
 * Allows switching between tenants during a conversation.
 *
 * Configuration via environment variables:
 *   Primary tenant: AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET
 *   Additional tenants: AZURE_TENANTS JSON array (optional)
 */

import { Client } from "@microsoft/microsoft-graph-client";
import { ClientSecretCredential } from "@azure/identity";
import { TokenCredentialAuthenticationProvider } from "@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js";
import { config } from "../config.js";

export interface TenantConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  label: string;
}

const clients: Map<string, Client> = new Map();
let activeTenantId: string = config.azureAd.tenantId;
const tenantConfigs: Map<string, TenantConfig> = new Map();

// Register the primary tenant
tenantConfigs.set(config.azureAd.tenantId, {
  tenantId: config.azureAd.tenantId,
  clientId: config.azureAd.clientId,
  clientSecret: config.azureAd.clientSecret,
  label: "Primary",
});

// Load additional tenants from AZURE_TENANTS env var if present
try {
  const tenantsJson = process.env.AZURE_TENANTS;
  if (tenantsJson) {
    const tenants = JSON.parse(tenantsJson) as TenantConfig[];
    for (const t of tenants) {
      tenantConfigs.set(t.tenantId, t);
    }
  }
} catch {
  // Invalid JSON — ignore
}

/**
 * Get or create a Graph client for a specific tenant.
 */
function getClientForTenant(tenantId: string): Client {
  const existing = clients.get(tenantId);
  if (existing) return existing;

  const tenantConfig = tenantConfigs.get(tenantId);
  if (!tenantConfig) {
    throw new Error(`Tenant ${tenantId} is not configured. Add it via AZURE_TENANTS env var.`);
  }

  const credential = new ClientSecretCredential(
    tenantConfig.tenantId,
    tenantConfig.clientId,
    tenantConfig.clientSecret
  );

  const authProvider = new TokenCredentialAuthenticationProvider(credential, {
    scopes: ["https://graph.microsoft.com/.default"],
  });

  const client = Client.initWithMiddleware({ authProvider });
  clients.set(tenantId, client);
  return client;
}

/**
 * Get the active tenant's Graph client.
 */
export function getActiveTenantClient(): Client {
  return getClientForTenant(activeTenantId);
}

/**
 * Get the active tenant ID.
 */
export function getActiveTenantId(): string {
  return activeTenantId;
}

/**
 * Switch the active tenant.
 */
export function switchTenant(tenantId: string): {
  success: boolean;
  message: string;
  activeTenant: string;
} {
  if (!tenantConfigs.has(tenantId)) {
    return {
      success: false,
      message: `Tenant ${tenantId} is not configured. Available tenants: ${listConfiguredTenants().map((t) => t.label).join(", ")}`,
      activeTenant: activeTenantId,
    };
  }

  activeTenantId = tenantId;
  return {
    success: true,
    message: `Switched to tenant: ${tenantConfigs.get(tenantId)?.label || tenantId}`,
    activeTenant: activeTenantId,
  };
}

/**
 * List all configured tenants.
 */
export function listConfiguredTenants(): Array<{
  tenantId: string;
  label: string;
  isActive: boolean;
}> {
  return Array.from(tenantConfigs.values()).map((t) => ({
    tenantId: t.tenantId,
    label: t.label,
    isActive: t.tenantId === activeTenantId,
  }));
}
