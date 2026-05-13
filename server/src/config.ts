import dotenv from "dotenv";
dotenv.config();

export const config = {
  // Azure OpenAI
  azureOpenAI: {
    apiKey: process.env.AZURE_OPENAI_API_KEY!,
    endpoint: process.env.AZURE_OPENAI_ENDPOINT!,
    deployment: process.env.AZURE_OPENAI_DEPLOYMENT!,
    embeddingDeployment: process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT || "text-embedding-ada-002",
    embeddingEndpoint: process.env.AZURE_OPENAI_EMBEDDING_ENDPOINT || process.env.AZURE_OPENAI_ENDPOINT!,
    embeddingApiKey: process.env.AZURE_OPENAI_EMBEDDING_API_KEY || process.env.AZURE_OPENAI_API_KEY!,
    embeddingApiVersion: process.env.AZURE_OPENAI_EMBEDDING_API_VERSION || "2023-05-15",
    apiVersion: process.env.AZURE_OPENAI_API_VERSION || "2024-10-01-preview",
  },

  // Azure AD / Microsoft Graph
  azureAd: {
    tenantId: process.env.AZURE_TENANT_ID!,
    clientId: process.env.AZURE_CLIENT_ID!,
    clientSecret: process.env.AZURE_CLIENT_SECRET!,
    // Certificate auth (preferred for multi-tenant). If both cert and secret
    // are set, certificate takes precedence.
    clientCertPath: process.env.AZURE_CLIENT_CERT_PATH || "",
    clientCertPassword: process.env.AZURE_CLIENT_CERT_PASSWORD || "",
  },

  // Public base URL for OAuth/admin-consent redirects. In dev this is the
  // server's localhost URL; in prod it should be the externally reachable URL.
  appBaseUrl: process.env.APP_BASE_URL || `http://localhost:${parseInt(process.env.PORT || "3001", 10)}`,

  // Server
  port: parseInt(process.env.PORT || "3001", 10),
} as const;

// Validate required config on startup
export function validateConfig(): void {
  const required: [string, string][] = [
    ["AZURE_OPENAI_API_KEY", config.azureOpenAI.apiKey],
    ["AZURE_OPENAI_ENDPOINT", config.azureOpenAI.endpoint],
    ["AZURE_OPENAI_DEPLOYMENT", config.azureOpenAI.deployment],
    ["AZURE_TENANT_ID", config.azureAd.tenantId],
    ["AZURE_CLIENT_ID", config.azureAd.clientId],
  ];

  // Either secret OR cert must be set
  if (!config.azureAd.clientSecret && !config.azureAd.clientCertPath) {
    required.push(["AZURE_CLIENT_SECRET or AZURE_CLIENT_CERT_PATH", ""]);
  }

  const missing = required
    .filter(([, value]) => !value || value === "YOUR_CLIENT_SECRET_HERE")
    .map(([name]) => name);

  if (missing.length > 0) {
    console.warn(
      `⚠️  Missing or placeholder environment variables: ${missing.join(", ")}`
    );
    console.warn("   Update server/.env with valid values before using Graph API features.");
  }
}
