/**
 * Microsoft Graph $batch API helper.
 *
 * Combines up to 20 independent requests into a single HTTP call.
 * At 100K devices, this reduces detected-app fetches from 100K calls to 5K.
 */

import { getGraphClient } from "./client.js";

export interface BatchRequest {
  id: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  url: string;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface BatchResponse {
  id: string;
  status: number;
  body: unknown;
}

const MAX_BATCH_SIZE = 20; // Graph API limit

/**
 * Execute a batch of Graph API requests.
 * Automatically splits into chunks of 20 if needed.
 */
export async function executeBatch(
  requests: BatchRequest[]
): Promise<BatchResponse[]> {
  if (requests.length === 0) return [];

  const client = getGraphClient();
  const results: BatchResponse[] = [];

  // Split into chunks of MAX_BATCH_SIZE
  for (let i = 0; i < requests.length; i += MAX_BATCH_SIZE) {
    const chunk = requests.slice(i, i + MAX_BATCH_SIZE);

    const batchBody = {
      requests: chunk.map((r) => ({
        id: r.id,
        method: r.method,
        url: r.url.startsWith("/") ? r.url : `/${r.url}`,
        ...(r.body ? { body: r.body } : {}),
        headers: r.headers || { "Content-Type": "application/json" },
      })),
    };

    try {
      const response = await client
        .api("/$batch")
        .post(batchBody);

      if (response.responses) {
        for (const resp of response.responses) {
          results.push({
            id: resp.id,
            status: resp.status,
            body: resp.body,
          });
        }
      }
    } catch (err) {
      // If the batch fails, mark all requests in this chunk as failed
      for (const req of chunk) {
        results.push({
          id: req.id,
          status: 500,
          body: { error: { message: err instanceof Error ? err.message : "Batch request failed" } },
        });
      }
    }
  }

  return results;
}

/**
 * Batch-fetch detected apps for multiple devices at once.
 * Instead of N individual requests, uses N/20 batch calls.
 */
export async function batchGetDetectedApps(
  deviceIds: string[]
): Promise<Map<string, Array<{ displayName: string; version: string }>>> {
  const result = new Map<string, Array<{ displayName: string; version: string }>>();
  if (deviceIds.length === 0) return result;

  const requests: BatchRequest[] = deviceIds.map((id) => ({
    id,
    method: "GET" as const,
    url: `/deviceManagement/managedDevices/${id}/detectedApps?$select=displayName,version&$top=200`,
  }));

  const responses = await executeBatch(requests);

  for (const resp of responses) {
    if (resp.status === 200 && resp.body) {
      const body = resp.body as { value?: Array<{ displayName: string; version: string }> };
      result.set(resp.id, body.value || []);
    } else {
      result.set(resp.id, []);
    }
  }

  return result;
}

/**
 * Batch-fetch device details for multiple device IDs.
 */
export async function batchGetDevices(
  deviceIds: string[],
  select?: string
): Promise<Map<string, Record<string, unknown>>> {
  const result = new Map<string, Record<string, unknown>>();
  if (deviceIds.length === 0) return result;

  const selectParam = select ? `?$select=${select}` : "";
  const requests: BatchRequest[] = deviceIds.map((id) => ({
    id,
    method: "GET" as const,
    url: `/deviceManagement/managedDevices/${id}${selectParam}`,
  }));

  const responses = await executeBatch(requests);

  for (const resp of responses) {
    if (resp.status === 200 && resp.body) {
      result.set(resp.id, resp.body as Record<string, unknown>);
    }
  }

  return result;
}
