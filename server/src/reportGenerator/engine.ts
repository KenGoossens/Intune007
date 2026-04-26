/**
 * Report Generator — Natural language report builder that combines ALL
 * Intune Graph API data sources into a single comprehensive report.
 *
 * The user describes what they want in plain English. The engine:
 * 1. Parses the request to determine which data sources to pull
 * 2. Fetches data from relevant APIs in parallel
 * 3. Feeds the raw data to Azure OpenAI to generate a formatted report
 * 4. Returns the report in markdown with optional data tables
 *
 * Supports 15 data source categories covering the full Intune surface.
 */

import { AzureOpenAI } from "openai";
import { config } from "../config.js";
import { getManagedDevices } from "../graph/devices.js";
import { getCompliancePolicies, getComplianceStatus } from "../graph/compliance.js";
import { getDeviceConfigurations } from "../graph/configurations.js";
import { getMobileApps } from "../graph/apps.js";
import { getConditionalAccessPolicies } from "../graph/conditionalAccess.js";
import { getAutopilotDevices, getAutopilotProfiles } from "../graph/autopilot.js";
import { getGroups } from "../graph/groups.js";
import { getSecurityAlerts } from "../graph/security.js";
import { getUpdateRings, getUpdateComplianceSummary } from "../graph/windowsUpdate.js";
import { listRemediationScripts } from "../graph/remediation.js";
import { getAuditEvents, getSignInLogs } from "../graph/logs.js";
import { getGraphClient, fetchWithPagination } from "../graph/client.js";

/**
 * All available data source categories the report generator can pull.
 */
const DATA_SOURCES: Record<string, {
  keywords: string[];
  fetch: () => Promise<{ label: string; data: unknown; count?: number }>;
}> = {
  devices: {
    keywords: ["device", "managed", "fleet", "inventory", "hardware", "endpoint", "laptop", "desktop", "mobile"],
    fetch: async () => {
      const r = await getManagedDevices({ top: 200 });
      return { label: "Managed Devices", data: r.items, count: r.totalCount };
    },
  },
  compliance_status: {
    keywords: ["compliance", "compliant", "non-compliant", "noncompliant", "health"],
    fetch: async () => {
      const r = await getComplianceStatus();
      return { label: "Compliance Status", data: r };
    },
  },
  compliance_policies: {
    keywords: ["compliance polic", "policy", "policies"],
    fetch: async () => {
      const r = await getCompliancePolicies({ top: 100 });
      return { label: "Compliance Policies", data: r.items, count: r.totalCount };
    },
  },
  config_profiles: {
    keywords: ["configuration", "config profile", "profile", "settings"],
    fetch: async () => {
      const r = await getDeviceConfigurations({ top: 100 });
      return { label: "Configuration Profiles", data: r.items, count: r.totalCount };
    },
  },
  apps: {
    keywords: ["app", "application", "software", "deploy", "install"],
    fetch: async () => {
      const r = await getMobileApps({ top: 100 });
      return { label: "Managed Apps", data: r.items, count: r.totalCount };
    },
  },
  conditional_access: {
    keywords: ["conditional access", "ca polic", "mfa", "access control"],
    fetch: async () => {
      const r = await getConditionalAccessPolicies({ top: 100 });
      return { label: "Conditional Access Policies", data: r.items, count: r.totalCount };
    },
  },
  autopilot: {
    keywords: ["autopilot", "enrollment", "provisioning", "oobe", "onboard"],
    fetch: async () => {
      const [devices, profiles] = await Promise.all([
        getAutopilotDevices({ top: 100 }),
        getAutopilotProfiles({ top: 50 }),
      ]);
      return { label: "Autopilot", data: { devices: devices.items, profiles: profiles.items }, count: devices.totalCount };
    },
  },
  groups: {
    keywords: ["group", "azure ad", "entra", "membership", "assignment target"],
    fetch: async () => {
      const r = await getGroups({ top: 100 });
      return { label: "Azure AD Groups", data: r.items, count: r.totalCount };
    },
  },
  security: {
    keywords: ["security", "threat", "alert", "defender", "risk", "vulnerability"],
    fetch: async () => {
      const r = await getSecurityAlerts({ top: 50 });
      return { label: "Security Alerts", data: r.items, count: r.totalCount };
    },
  },
  updates: {
    keywords: ["update", "patch", "windows update", "ring", "quality update", "feature update"],
    fetch: async () => {
      const [rings, summary] = await Promise.all([
        getUpdateRings({ top: 50 }),
        getUpdateComplianceSummary(),
      ]);
      return { label: "Windows Updates", data: { rings: rings.items, summary } };
    },
  },
  remediation: {
    keywords: ["remediation", "proactive", "health script", "detection", "fix"],
    fetch: async () => {
      const r = await listRemediationScripts({ top: 50 });
      return { label: "Proactive Remediations", data: r.items, count: r.totalCount };
    },
  },
  audit: {
    keywords: ["audit", "change", "admin action", "who changed", "history"],
    fetch: async () => {
      const r = await getAuditEvents({ top: 30 });
      return { label: "Recent Audit Events", data: r.items, count: r.totalCount };
    },
  },
  signin: {
    keywords: ["sign-in", "signin", "login", "authentication", "logon"],
    fetch: async () => {
      const r = await getSignInLogs({ top: 30 });
      return { label: "Recent Sign-In Logs", data: r.items, count: r.totalCount };
    },
  },
  os_breakdown: {
    keywords: ["os", "operating system", "windows", "ios", "android", "mac", "platform", "breakdown", "distribution"],
    fetch: async () => {
      const r = await getManagedDevices({ top: 500 });
      const os: Record<string, number> = {};
      for (const d of r.items) {
        const name = String((d as unknown as Record<string, unknown>).operatingSystem || "Unknown");
        os[name] = (os[name] || 0) + 1;
      }
      return { label: "OS Distribution", data: os, count: r.totalCount };
    },
  },
  stale_devices: {
    keywords: ["stale", "inactive", "not syncing", "offline", "dormant", "old"],
    fetch: async () => {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const r = await getManagedDevices({ filter: `lastSyncDateTime lt ${sevenDaysAgo.toISOString()}`, top: 200 });
      return { label: "Stale Devices (7+ days)", data: r.items, count: r.totalCount };
    },
  },
};

export interface GeneratedReport {
  title: string;
  prompt: string;
  generatedAt: string;
  durationMs: number;
  dataSources: string[];
  markdown: string;
  rawData: Record<string, unknown>;
}

/**
 * Determine which data sources match a report prompt.
 */
function matchDataSources(prompt: string): string[] {
  const lower = prompt.toLowerCase();
  const matched = new Set<string>();

  for (const [key, source] of Object.entries(DATA_SOURCES)) {
    for (const keyword of source.keywords) {
      if (lower.includes(keyword)) {
        matched.add(key);
        break;
      }
    }
  }

  // If nothing matched or prompt says "all" / "complete" / "full" / "comprehensive" / "executive"
  if (matched.size === 0 || /\b(all|complete|full|comprehensive|executive|everything|overview|summary)\b/i.test(prompt)) {
    // Pull the core data sources for a comprehensive report
    matched.add("devices");
    matched.add("compliance_status");
    matched.add("compliance_policies");
    matched.add("config_profiles");
    matched.add("apps");
    matched.add("conditional_access");
    matched.add("security");
    matched.add("updates");
    matched.add("os_breakdown");
    matched.add("stale_devices");
  }

  return Array.from(matched);
}

/**
 * Generate a report from a natural language prompt.
 */
export async function generateReport(prompt: string): Promise<GeneratedReport> {
  const start = Date.now();

  // 1. Determine data sources
  const sourceKeys = matchDataSources(prompt);

  // 2. Fetch data sources sequentially in small batches to avoid Graph API throttling
  const batchSize = 3;
  const allResults: Array<{ key: string; label: string; data: unknown; count?: number } | null> = [];

  for (let i = 0; i < sourceKeys.length; i += batchSize) {
    const batch = sourceKeys.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(
      batch.map(async (key) => {
        const source = DATA_SOURCES[key];
        const result = await source.fetch();
        return { key, ...result };
      })
    );
    for (const r of batchResults) {
      allResults.push(r.status === "fulfilled" ? r.value : null);
    }
  }

  const rawData: Record<string, unknown> = {};
  const dataSummaries: string[] = [];
  const failedSources: string[] = [];

  for (let i = 0; i < allResults.length; i++) {
    const result = allResults[i];
    if (result) {
      const { key, label, data, count } = result;
      rawData[key] = data;

      // Create a concise text summary for AI — avoid huge JSON blobs
      let summary: string;
      if (Array.isArray(data)) {
        // For arrays, show count + first 5 items
        const sample = data.slice(0, 5);
        const jsonStr = JSON.stringify(sample, null, 2);
        summary = `${label}: ${count ?? data.length} item(s)\nSample data (first ${sample.length}):\n${jsonStr}`;
      } else {
        summary = `${label}:\n${JSON.stringify(data, null, 2)}`;
      }

      dataSummaries.push(`### ${label}\n\`\`\`\n${summary}\n\`\`\``);
      console.log(`[ReportGenerator] ✓ ${key}: ${Array.isArray(data) ? data.length : 1} item(s)`);
    } else {
      const key = sourceKeys[i] || `source-${i}`;
      failedSources.push(key);
      console.error(`[ReportGenerator] ✗ ${key} failed`);
    }
  }

  if (dataSummaries.length === 0) {
    console.error("[ReportGenerator] ALL data sources failed! Failed:", failedSources);
  }

  // 3. Generate report with AI
  const openai = new AzureOpenAI({
    apiKey: config.azureOpenAI.apiKey,
    endpoint: config.azureOpenAI.endpoint,
    deployment: config.azureOpenAI.deployment,
    apiVersion: config.azureOpenAI.apiVersion,
  });

  const systemPrompt = `You are a professional IT report writer for Microsoft Intune environments. Generate a well-structured, clear report based on the data provided.

Format rules:
- Use proper Markdown with headings (##, ###), tables, bullet points, and bold for emphasis
- Include an Executive Summary at the top
- Use tables for listing devices, policies, apps where appropriate
- Include key metrics and percentages
- Add a "Key Findings" section highlighting important observations
- Add a "Recommendations" section at the end
- Be data-driven — reference actual numbers from the data
- If data is truncated, note the total count and work with what's available
- Make the report suitable for management/executive review`;

  const failedNote = failedSources.length > 0
    ? `\n\nNote: ${failedSources.length} data source(s) could not be retrieved: ${failedSources.join(", ")}. Do NOT fabricate data for these — just note they were unavailable.`
    : "";

  const userPrompt = `Generate a report based on this request: "${prompt}"

Data collected from Microsoft Intune (${dataSummaries.length} of ${sourceKeys.length} sources retrieved successfully):

${dataSummaries.join("\n\n")}
${failedNote}

IMPORTANT: Use ONLY the actual data provided above. Do NOT invent or assume any numbers. If data shows values, use those exact values. Generate the full report in Markdown format with proper tables.`;

  const completion = await openai.chat.completions.create({
    model: config.azureOpenAI.deployment,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    max_completion_tokens: 4000,
  });

  const markdown = completion.choices[0]?.message?.content?.trim() || "Report generation failed — no response from AI.";

  // Extract a title from the first heading or generate one
  const titleMatch = markdown.match(/^#\s+(.+)/m);
  const title = titleMatch ? titleMatch[1] : `Intune Report — ${new Date().toLocaleDateString()}`;

  return {
    title,
    prompt,
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - start,
    dataSources: sourceKeys,
    markdown,
    rawData,
  };
}
