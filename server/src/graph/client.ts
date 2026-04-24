import { Client } from "@microsoft/microsoft-graph-client";
import {
  ClientSecretCredential,
  type TokenCredential,
} from "@azure/identity";
import { TokenCredentialAuthenticationProvider } from "@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js";
import { config } from "../config.js";

let graphClient: Client | null = null;
let credential: TokenCredential | null = null;

/**
 * Lazily initializes and returns the Microsoft Graph client
 * using client credentials (app-only) authentication.
 */
export function getGraphClient(): Client {
  if (graphClient) return graphClient;

  credential = new ClientSecretCredential(
    config.azureAd.tenantId,
    config.azureAd.clientId,
    config.azureAd.clientSecret
  );

  const authProvider = new TokenCredentialAuthenticationProvider(credential, {
    scopes: ["https://graph.microsoft.com/.default"],
  });

  graphClient = Client.initWithMiddleware({
    authProvider,
  });

  return graphClient;
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
