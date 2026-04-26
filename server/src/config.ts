import dotenv from "dotenv";
dotenv.config();

export const config = {
  // Azure OpenAI
  azureOpenAI: {
    apiKey: process.env.AZURE_OPENAI_API_KEY!,
    endpoint: process.env.AZURE_OPENAI_ENDPOINT!,
    deployment: process.env.AZURE_OPENAI_DEPLOYMENT!,
    embeddingDeployment: process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT || "text-embedding-ada-002",
    apiVersion: process.env.AZURE_OPENAI_API_VERSION || "2024-10-01-preview",
  },

  // Azure AD / Microsoft Graph
  azureAd: {
    tenantId: process.env.AZURE_TENANT_ID!,
    clientId: process.env.AZURE_CLIENT_ID!,
    clientSecret: process.env.AZURE_CLIENT_SECRET!,
  },

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
    ["AZURE_CLIENT_SECRET", config.azureAd.clientSecret],
  ];

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
