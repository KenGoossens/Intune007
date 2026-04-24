/**
 * Quick script to test Graph API connectivity and permissions.
 * Run: npx tsx src/test-graph.ts
 */
import { config, validateConfig } from "./config.js";
import { ClientSecretCredential } from "@azure/identity";
import { Client } from "@microsoft/microsoft-graph-client";
import { TokenCredentialAuthenticationProvider } from "@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js";

async function main() {
  console.log("=== Intune007 Graph API Permission Test ===\n");
  validateConfig();

  console.log(`Tenant ID:  ${config.azureAd.tenantId}`);
  console.log(`Client ID:  ${config.azureAd.clientId}`);
  console.log(`Secret:     ${config.azureAd.clientSecret.slice(0, 6)}...`);
  console.log();

  // Step 1: Test authentication
  console.log("1. Testing authentication...");
  let credential: ClientSecretCredential;
  try {
    credential = new ClientSecretCredential(
      config.azureAd.tenantId,
      config.azureAd.clientId,
      config.azureAd.clientSecret
    );
    const token = await credential.getToken("https://graph.microsoft.com/.default");
    console.log(`   ✅ Token acquired (expires: ${token.expiresOnTimestamp})\n`);
  } catch (err: any) {
    console.log(`   ❌ Auth FAILED: ${err.message}\n`);
    return;
  }

  const authProvider = new TokenCredentialAuthenticationProvider(credential, {
    scopes: ["https://graph.microsoft.com/.default"],
  });
  const graphClient = Client.initWithMiddleware({ authProvider });

  // Step 2: Test each permission
  const tests = [
    {
      name: "Organization (basic connectivity)",
      endpoint: "/organization",
      permission: "Organization.Read.All",
    },
    {
      name: "Managed Devices",
      endpoint: "/deviceManagement/managedDevices?$top=1&$select=id,deviceName",
      permission: "DeviceManagementManagedDevices.Read.All",
    },
    {
      name: "Compliance Policies",
      endpoint: "/deviceManagement/deviceCompliancePolicies?$top=1&$select=id,displayName",
      permission: "DeviceManagementConfiguration.Read.All",
    },
    {
      name: "Device Configurations",
      endpoint: "/deviceManagement/deviceConfigurations?$top=1&$select=id,displayName",
      permission: "DeviceManagementConfiguration.Read.All",
    },
    {
      name: "Compliance Status Summary",
      endpoint: "/deviceManagement/deviceCompliancePolicyDeviceStateSummary",
      permission: "DeviceManagementConfiguration.Read.All",
    },
    {
      name: "Mobile Apps",
      endpoint: "/deviceAppManagement/mobileApps?$top=1&$select=id,displayName",
      permission: "DeviceManagementApps.Read.All",
    },
    {
      name: "Conditional Access Policies",
      endpoint: "/identity/conditionalAccess/policies?$top=1&$select=id,displayName",
      permission: "Policy.Read.All",
    },
    {
      name: "Autopilot Devices (Beta)",
      endpoint: "/deviceManagement/windowsAutopilotDeviceIdentities?$top=1",
      permission: "DeviceManagementServiceConfig.Read.All",
      useBeta: true,
    },
  ];

  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    const num = i + 2;
    console.log(`${num}. Testing: ${test.name}`);
    console.log(`   Endpoint:   ${test.endpoint}`);
    console.log(`   Permission: ${test.permission}`);

    try {
      const apiPath = test.useBeta
        ? `/beta${test.endpoint}`
        : test.endpoint;

      const result = await graphClient.api(apiPath).get();
      const count = result.value?.length ?? (result.id ? 1 : 0);
      console.log(`   ✅ OK — returned ${count} item(s)\n`);
    } catch (err: any) {
      const status = err.statusCode || err.code || "unknown";
      const msg = err.body ? JSON.parse(err.body)?.error?.message : err.message;
      console.log(`   ❌ FAILED (${status}): ${msg}\n`);
    }
  }

  console.log("=== Test Complete ===");
}

main().catch(console.error);
