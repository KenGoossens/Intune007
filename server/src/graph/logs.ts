/**
 * Logs — Audit events, sign-in logs, and device timeline via Microsoft Graph API.
 *
 * Provides visibility into administrative actions, user sign-in activity,
 * and device management events for troubleshooting and compliance auditing.
 *
 * Graph API Reference:
 *   https://learn.microsoft.com/en-us/graph/api/resources/directoryaudit
 *   https://learn.microsoft.com/en-us/graph/api/resources/signin
 *
 * Required Permissions:
 *   AuditLog.Read.All          (audit logs, sign-in logs)
 *   DeviceManagementApps.Read.All (Intune audit events)
 */

import { getGraphClient, fetchWithPagination } from "./client.js";

export interface AuditEventInfo {
  id: string;
  displayName: string;
  componentName: string;
  activity: string;
  activityDateTime: string;
  activityType: string;
  actor: Record<string, unknown>;
  resources: Record<string, unknown>[];
}

export interface SignInLogInfo {
  id: string;
  userDisplayName: string;
  userPrincipalName: string;
  appDisplayName: string;
  ipAddress: string;
  clientAppUsed: string;
  status: Record<string, unknown>;
  createdDateTime: string;
  location: Record<string, unknown>;
  deviceDetail: Record<string, unknown>;
}

/**
 * Get Intune audit events (admin actions within Intune).
 */
export async function getAuditEvents(options?: {
  filter?: string;
  top?: number;
}): Promise<{ items: AuditEventInfo[]; totalCount: number }> {
  const client = getGraphClient();
  return fetchWithPagination<AuditEventInfo>(
    client,
    "/deviceManagement/auditEvents",
    {
      filter: options?.filter,
      top: options?.top,
      orderby: "activityDateTime desc",
      select: [
        "id",
        "displayName",
        "componentName",
        "activity",
        "activityDateTime",
        "activityType",
        "activityOperationType",
        "activityResult",
        "actor",
        "resources",
      ].join(","),
    }
  );
}

/**
 * Get Azure AD sign-in logs.
 */
export async function getSignInLogs(options?: {
  filter?: string;
  top?: number;
}): Promise<{ items: SignInLogInfo[]; totalCount: number }> {
  const client = getGraphClient();
  return fetchWithPagination<SignInLogInfo>(
    client,
    "/auditLogs/signIns",
    {
      filter: options?.filter,
      select: [
        "id",
        "userDisplayName",
        "userPrincipalName",
        "appDisplayName",
        "ipAddress",
        "clientAppUsed",
        "status",
        "createdDateTime",
        "location",
        "deviceDetail",
      ].join(","),
      top: options?.top,
      orderby: "createdDateTime desc",
    }
  );
}

/**
 * Get Azure AD directory audit logs (tenant-level admin actions).
 */
export async function getDirectoryAuditLogs(options?: {
  filter?: string;
  top?: number;
}): Promise<{ items: Record<string, unknown>[]; totalCount: number }> {
  const client = getGraphClient();

  // Fetch more items since we filter client-side
  const requestTop = (options?.top ?? 50) * 2;

  const result = await fetchWithPagination<Record<string, unknown>>(
    client,
    "/auditLogs/directoryAudits",
    {
      filter: options?.filter,
      select: [
        "id",
        "activityDisplayName",
        "activityDateTime",
        "category",
        "result",
        "operationType",
        "initiatedBy",
        "targetResources",
      ].join(","),
      top: requestTop,
      orderby: "activityDateTime desc",
    }
  );

  // Exclude Intune-specific categories client-side to avoid overlap with the Intune Audit tab
  const intuneCategories = new Set(["Device", "DeviceConfiguration", "DeviceCompliancePolicy", "MobileAppManagement"]);
  const filtered = result.items.filter(
    (item) => !intuneCategories.has(String(item.category || ""))
  );

  return {
    items: filtered.slice(0, options?.top ?? 50),
    totalCount: filtered.length,
  };
}
