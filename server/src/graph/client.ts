import { Client } from "@microsoft/microsoft-graph-client";
import { getActiveTenantClient } from "./tenantManager.js";

/**
 * Returns the Microsoft Graph client for the currently active tenant.
 * Switching the active tenant (via the tenants API) transparently changes
 * which tenant subsequent calls hit.
 */
export function getGraphClient(): Client {
  return getActiveTenantClient();
}

/**
 * Helper to handle paginated Graph API responses.
 * Returns up to maxItems results, along with the total count.
 */
export async function fetchWithPagination<T>(
  client: Client,
  endpoint: string,
  options?: {
    filter?: string;
    select?: string;
    top?: number;
    orderby?: string;
    maxItems?: number;
  }
): Promise<{ items: T[]; totalCount: number }> {
  const maxItems = options?.maxItems ?? 100;
  let request = client.api(endpoint);

  if (options?.filter) request = request.filter(options.filter);
  if (options?.select) request = request.select(options.select);
  if (options?.top) request = request.top(Math.min(options.top, maxItems));
  if (options?.orderby) request = request.orderby(options.orderby);

  const items: T[] = [];
  let response = await request.get();

  if (response.value) {
    items.push(...response.value);
  } else {
    // Single-object response (e.g., summary endpoints)
    return { items: [response as T], totalCount: 1 };
  }

  // Follow pagination links up to maxItems
  while (response["@odata.nextLink"] && items.length < maxItems) {
    response = await client.api(response["@odata.nextLink"]).get();
    if (response.value) {
      items.push(...response.value);
    }
  }

  const totalCount =
    response["@odata.count"] ?? items.length;

  return {
    items: items.slice(0, maxItems),
    totalCount,
  };
}
