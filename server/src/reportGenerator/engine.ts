/**
 * Report Generator v2 — Intent-driven report builder.
 *
 * Unlike v1 which did naive keyword matching on the user's prompt,
 * v2 uses a two-pass LLM approach:
 *
 *  PASS 1 (Planning): The LLM analyzes the user's question and produces
 *    a structured plan: which data sources to pull, what filters to apply,
 *    what the report should focus on, and what format to use.
 *
 *  PASS 2 (Generation): With the full relevant data in hand, the LLM
 *    generates a targeted report that directly answers the user's question
 *    with specific data, insights, and recommendations.
 *
 * This produces reports that are precise, data-rich, and directly
 * responsive to what the user actually asked.
 */

import { AzureOpenAI } from "openai";
import { config } from "../config.js";
import { getManagedDevices, getDeviceDetails } from "../graph/devices.js";
import { getCompliancePolicies, getComplianceStatus } from "../graph/compliance.js";
import { getDeviceConfigurations, getDeviceConfigurationStates } from "../graph/configurations.js";
import { getMobileApps, getAppInstallStatus, getDeviceDetectedApps } from "../graph/apps.js";
import { getConditionalAccessPolicies } from "../graph/conditionalAccess.js";
import { getAutopilotDevices, getAutopilotProfiles } from "../graph/autopilot.js";
import { getGroups, getGroupMembers } from "../graph/groups.js";
import { getSecurityAlerts } from "../graph/security.js";
import { getUpdateRings, getUpdateComplianceSummary } from "../graph/windowsUpdate.js";
import { listRemediationScripts } from "../graph/remediation.js";
import { getAuditEvents, getSignInLogs } from "../graph/logs.js";
import { getGraphClient, fetchWithPagination } from "../graph/client.js";

// ════════════════════════════════════════════════════════════════
//  Types
// ════════════════════════════════════════════════════════════════

export interface GeneratedReport {
  title: string;
  prompt: string;
  generatedAt: string;
  durationMs: number;
  dataSources: string[];
  markdown: string;
  rawData: Record<string, unknown>;
  planningDurationMs?: number;
}

interface ReportPlan {
  /** Which data sources to fetch */
  sources: Array<{
    id: string;
    filter?: string;
    top?: number;
    reason: string;
  }>;
  /** What the report should focus on — passed to generation prompt */
  focus: string;
  /** Report style/format guidance */
  style: "executive" | "technical" | "operational" | "comparative" | "investigative";
  /** Specific questions the report must answer */
  questions: string[];
  /** Suggested title */
  title: string;
}

// ════════════════════════════════════════════════════════════════
//  Available Data Sources (with filter support)
// ════════════════════════════════════════════════════════════════

type SourceFetcher = (opts?: {
  filter?: string;
  top?: number;
}) => Promise<{ label: string; data: unknown; count?: number }>;

const AVAILABLE_SOURCES: Record<string, {
  description: string;
  supportedFilters: string[];
  fetch: SourceFetcher;
}> = {
  devices: {
    description: "All managed devices with hardware/OS info, compliance state, last sync, encryption status",
    supportedFilters: ["operatingSystem eq 'Windows'", "complianceState eq 'noncompliant'", "contains(deviceName,'...')", "lastSyncDateTime lt ..."],
    fetch: async (opts) => {
      const r = await getManagedDevices({ filter: opts?.filter, top: opts?.top || 500 });
      return { label: "Managed Devices", data: r.items, count: r.totalCount };
    },
  },
  compliance_status: {
    description: "Compliance summary across all devices — compliant vs non-compliant counts",
    supportedFilters: [],
    fetch: async () => {
      const r = await getComplianceStatus();
      return { label: "Compliance Status Summary", data: r };
    },
  },
  compliance_policies: {
    description: "All compliance policies with their settings and platform targeting",
    supportedFilters: [],
    fetch: async (opts) => {
      const r = await getCompliancePolicies({ top: opts?.top || 100 });
      return { label: "Compliance Policies", data: r.items, count: r.totalCount };
    },
  },
  config_profiles: {
    description: "Device configuration profiles (Wi-Fi, VPN, restrictions, endpoint protection, etc.)",
    supportedFilters: [],
    fetch: async (opts) => {
      const r = await getDeviceConfigurations({ top: opts?.top || 100 });
      return { label: "Configuration Profiles", data: r.items, count: r.totalCount };
    },
  },
  apps: {
    description: "Managed applications (Win32, LOB, Store, Microsoft 365) with assignment info",
    supportedFilters: ["contains(displayName,'...')", "isAssigned eq true"],
    fetch: async (opts) => {
      const r = await getMobileApps({ filter: opts?.filter, top: opts?.top || 100 });
      return { label: "Managed Apps", data: r.items, count: r.totalCount };
    },
  },
  conditional_access: {
    description: "Conditional Access policies — conditions, grant/session controls, state",
    supportedFilters: [],
    fetch: async (opts) => {
      const r = await getConditionalAccessPolicies({ top: opts?.top || 100 });
      return { label: "Conditional Access Policies", data: r.items, count: r.totalCount };
    },
  },
  autopilot_devices: {
    description: "Windows Autopilot registered devices with deployment status",
    supportedFilters: [],
    fetch: async (opts) => {
      const r = await getAutopilotDevices({ top: opts?.top || 200 });
      return { label: "Autopilot Devices", data: r.items, count: r.totalCount };
    },
  },
  autopilot_profiles: {
    description: "Autopilot deployment profiles and their OOBE configuration",
    supportedFilters: [],
    fetch: async (opts) => {
      const r = await getAutopilotProfiles({ top: opts?.top || 50 });
      return { label: "Autopilot Profiles", data: r.items, count: r.totalCount };
    },
  },
  groups: {
    description: "Azure AD/Entra ID groups used for policy/app targeting",
    supportedFilters: ["contains(displayName,'...')"],
    fetch: async (opts) => {
      const r = await getGroups({ filter: opts?.filter, top: opts?.top || 100 });
      return { label: "Groups", data: r.items, count: r.totalCount };
    },
  },
  security_alerts: {
    description: "Security alerts from Defender/Sentinel — active threats and risk events",
    supportedFilters: [],
    fetch: async (opts) => {
      const r = await getSecurityAlerts({ top: opts?.top || 50 });
      return { label: "Security Alerts", data: r.items, count: r.totalCount };
    },
  },
  update_rings: {
    description: "Windows Update for Business rings — deferral settings and assignment",
    supportedFilters: [],
    fetch: async (opts) => {
      const r = await getUpdateRings({ top: opts?.top || 50 });
      return { label: "Update Rings", data: r.items, count: r.totalCount };
    },
  },
  update_compliance: {
    description: "Windows Update compliance — which devices are up to date vs behind",
    supportedFilters: [],
    fetch: async () => {
      const r = await getUpdateComplianceSummary();
      return { label: "Update Compliance", data: r };
    },
  },
  remediation_scripts: {
    description: "Proactive Remediations / deviceHealthScripts deployed to devices",
    supportedFilters: [],
    fetch: async (opts) => {
      const r = await listRemediationScripts({ top: opts?.top || 50 });
      return { label: "Proactive Remediations", data: r.items, count: r.totalCount };
    },
  },
  audit_logs: {
    description: "Intune audit events — admin actions, policy changes, deployments",
    supportedFilters: [],
    fetch: async (opts) => {
      const r = await getAuditEvents({ top: opts?.top || 50 });
      return { label: "Audit Events", data: r.items, count: r.totalCount };
    },
  },
  signin_logs: {
    description: "Azure AD sign-in logs — user authentication events, failures, MFA",
    supportedFilters: [],
    fetch: async (opts) => {
      const r = await getSignInLogs({ top: opts?.top || 50 });
      return { label: "Sign-In Logs", data: r.items, count: r.totalCount };
    },
  },
  noncompliant_devices: {
    description: "Only non-compliant devices — filtered view for compliance investigations",
    supportedFilters: [],
    fetch: async (opts) => {
      const r = await getManagedDevices({ filter: "complianceState eq 'noncompliant'", top: opts?.top || 500 });
      return { label: "Non-Compliant Devices", data: r.items, count: r.totalCount };
    },
  },
  stale_devices: {
    description: "Devices that haven't synced in 7+ days — potentially lost, offline, or decommissioned",
    supportedFilters: [],
    fetch: async () => {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const r = await getManagedDevices({ filter: `lastSyncDateTime lt ${sevenDaysAgo.toISOString()}`, top: 500 });
      return { label: "Stale Devices (7+ days)", data: r.items, count: r.totalCount };
    },
  },
  windows_devices: {
    description: "Only Windows-managed devices — for Windows-specific reports",
    supportedFilters: [],
    fetch: async (opts) => {
      const r = await getManagedDevices({ filter: "operatingSystem eq 'Windows'", top: opts?.top || 500 });
      return { label: "Windows Devices", data: r.items, count: r.totalCount };
    },
  },
};

// ════════════════════════════════════════════════════════════════
//  PASS 1: Planning — LLM decides what data to fetch
// ════════════════════════════════════════════════════════════════

const PLANNING_PROMPT = `You are a report planning assistant for Microsoft Intune. The user wants a report. Your job is to decide:
1. Which data sources to fetch
2. What filters to apply
3. What the report should focus on
4. What style/format is appropriate

Available data sources:
${Object.entries(AVAILABLE_SOURCES).map(([id, s]) => `- "${id}": ${s.description}${s.supportedFilters.length ? ` [Filters: ${s.supportedFilters.join(", ")}]` : ""}`).join("\n")}

Report styles:
- "executive": High-level numbers, KPIs, risk summary — for management
- "technical": Detailed configs, policy settings, specific device states — for IT admins
- "operational": Actionable items, what needs fixing, priority lists — for daily ops
- "comparative": Before/after, trends, deltas, changes over time
- "investigative": Deep dive into a specific issue, device, or problem area

Respond with ONLY a JSON object (no markdown fences):
{
  "sources": [{"id": "source_name", "filter": "optional OData filter or null", "top": number_or_null, "reason": "why this source is needed"}],
  "focus": "One paragraph describing what the report should focus on and what makes it directly relevant to the user's question",
  "style": "executive|technical|operational|comparative|investigative",
  "questions": ["Specific question 1 the report must answer", "Question 2", ...],
  "title": "Suggested report title"
}

Rules:
- Only include sources that are DIRECTLY relevant to the user's request
- For broad requests ("full report", "executive summary"), include 6-8 core sources
- For specific requests ("compliance of Windows devices"), include only 2-4 targeted sources
- Use filters when the user's question implies a subset of data
- The "questions" array should contain 3-6 specific questions derived from the user's prompt
- The "focus" must be specific to THIS user's question — not a generic description`;

async function planReport(prompt: string): Promise<ReportPlan> {
  const openai = new AzureOpenAI({
    apiKey: config.azureOpenAI.apiKey,
    endpoint: config.azureOpenAI.endpoint,
    deployment: config.azureOpenAI.deployment,
    apiVersion: config.azureOpenAI.apiVersion,
  });

  const completion = await openai.chat.completions.create({
    model: config.azureOpenAI.deployment,
    messages: [
      { role: "system", content: PLANNING_PROMPT },
      { role: "user", content: `User's report request: "${prompt}"` },
    ],
    max_completion_tokens: 1500,
  });

  const raw = completion.choices[0]?.message?.content?.trim() || "";

  try {
    const cleaned = raw.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim();
    const plan = JSON.parse(cleaned) as ReportPlan;

    // Validate sources exist
    plan.sources = plan.sources.filter((s) => AVAILABLE_SOURCES[s.id]);

    // Fallback: if plan has no sources, use a sensible default
    if (plan.sources.length === 0) {
      plan.sources = [
        { id: "devices", reason: "Device inventory baseline" },
        { id: "compliance_status", reason: "Compliance overview" },
        { id: "apps", reason: "Application landscape" },
      ];
    }

    return plan;
  } catch {
    console.warn("[ReportGenerator] Failed to parse plan, using fallback");
    return {
      sources: [
        { id: "devices", reason: "Device inventory" },
        { id: "compliance_status", reason: "Compliance summary" },
        { id: "apps", reason: "Application overview" },
        { id: "config_profiles", reason: "Configuration baseline" },
        { id: "security_alerts", reason: "Security posture" },
      ],
      focus: prompt,
      style: "executive",
      questions: [prompt],
      title: "Intune Environment Report",
    };
  }
}

// ════════════════════════════════════════════════════════════════
//  PASS 2: Data Fetch + Report Generation
// ════════════════════════════════════════════════════════════════

const STYLE_GUIDES: Record<ReportPlan["style"], string> = {
  executive: `Write for C-level / management audience. Lead with KPIs and risk indicators.
Use percentages, traffic-light status (✅ ⚠️ ❌), and brief explanations.
Focus on business impact, not technical detail. Keep sections concise.
Include a "Risk Summary" table and end with strategic recommendations.`,

  technical: `Write for experienced IT admins and engineers. Include specific settings,
policy names, version numbers, device IDs where relevant. Use code blocks for
configuration values. Reference specific Graph API properties. Be precise
and detailed — admins want facts, not marketing.`,

  operational: `Write for day-to-day IT operations. Focus on what needs attention NOW.
Prioritize items by urgency (Critical → High → Medium → Low).
Include a clear "Action Items" table with owner, due date, and impact.
Each finding should have a concrete next step. Skip context the team already knows.`,

  comparative: `Structure as a comparison or trend analysis. Use before/after tables,
delta columns (▲▼), and percentage changes. Highlight improvements AND regressions.
Call out anomalies. If comparing current state to a baseline, show the gap clearly.`,

  investigative: `Deep dive into the specific issue. Start with the problem statement,
then methodically present evidence from the data. Cross-reference between data sources.
Build a timeline if events are involved. Conclude with root cause analysis and
specific remediation steps.`,
};

/**
 * Format data for the AI — more intelligent than just JSON dump.
 * Provides ALL data (not just first 5) up to reasonable limits,
 * with smart summarization for very large datasets.
 */
function formatDataForAI(data: unknown, label: string, count?: number): string {
  if (Array.isArray(data)) {
    const total = count ?? data.length;

    if (data.length === 0) {
      return `${label}: 0 items (empty)`;
    }

    // For datasets up to 30 items, include ALL data
    if (data.length <= 30) {
      return `${label} (${total} total):\n${JSON.stringify(data, null, 2)}`;
    }

    // For larger datasets, include first 20 + statistical summary
    const sample = data.slice(0, 20);
    const fields = Object.keys(data[0] as Record<string, unknown>);

    // Build field-level aggregation for key properties
    const aggregations: string[] = [];
    for (const field of fields) {
      const values = data.map((item) => (item as Record<string, unknown>)[field]);

      // Count unique values for categorical fields
      if (typeof values[0] === "string") {
        const counts: Record<string, number> = {};
        for (const v of values) {
          const key = String(v || "null");
          counts[key] = (counts[key] || 0) + 1;
        }
        const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        if (entries.length <= 10) {
          aggregations.push(`  ${field}: ${entries.map(([k, v]) => `${k}(${v})`).join(", ")}`);
        }
      }
    }

    let result = `${label} (showing 20 of ${total} total):\n${JSON.stringify(sample, null, 2)}`;
    if (aggregations.length > 0) {
      result += `\n\nField distributions across all ${total} items:\n${aggregations.join("\n")}`;
    }
    return result;
  }

  // For objects, include full data
  return `${label}:\n${JSON.stringify(data, null, 2)}`;
}

/**
 * Generate a report from a natural language prompt.
 *
 * Two-pass approach:
 *   Pass 1: LLM plans what data to fetch and what to focus on
 *   Pass 2: LLM generates the report from the collected data
 */
export async function generateReport(prompt: string): Promise<GeneratedReport> {
  const start = Date.now();

  // ─── PASS 1: Plan ──────────────────────────────────────────────
  console.log(`[ReportGenerator] Planning report for: "${prompt.slice(0, 80)}..."`);
  const plan = await planReport(prompt);
  const planningDurationMs = Date.now() - start;
  console.log(`[ReportGenerator] Plan: ${plan.sources.length} sources, style=${plan.style}, ${plan.questions.length} questions (${planningDurationMs}ms)`);

  // ─── PASS 2: Fetch data ────────────────────────────────────────
  const batchSize = 4;
  const allResults: Array<{ key: string; label: string; data: unknown; count?: number } | null> = [];

  for (let i = 0; i < plan.sources.length; i += batchSize) {
    const batch = plan.sources.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(
      batch.map(async (source) => {
        const fetcher = AVAILABLE_SOURCES[source.id];
        if (!fetcher) return null;
        const result = await fetcher.fetch({
          filter: source.filter || undefined,
          top: source.top || undefined,
        });
        return { key: source.id, ...result };
      })
    );
    for (const r of batchResults) {
      if (r.status === "fulfilled" && r.value) {
        allResults.push(r.value);
      } else {
        allResults.push(null);
      }
    }
  }

  const rawData: Record<string, unknown> = {};
  const dataSections: string[] = [];
  const failedSources: string[] = [];

  for (let i = 0; i < allResults.length; i++) {
    const result = allResults[i];
    if (result) {
      rawData[result.key] = result.data;
      const formatted = formatDataForAI(result.data, result.label, result.count);
      dataSections.push(formatted);
      const count = Array.isArray(result.data) ? result.data.length : 1;
      console.log(`[ReportGenerator] ✓ ${result.key}: ${count} item(s)`);
    } else {
      const sourceId = plan.sources[i]?.id || `source-${i}`;
      failedSources.push(sourceId);
      console.error(`[ReportGenerator] ✗ ${sourceId} failed`);
    }
  }

  // ─── PASS 3: Generate report ───────────────────────────────────
  const openai = new AzureOpenAI({
    apiKey: config.azureOpenAI.apiKey,
    endpoint: config.azureOpenAI.endpoint,
    deployment: config.azureOpenAI.deployment,
    apiVersion: config.azureOpenAI.apiVersion,
  });

  const styleGuide = STYLE_GUIDES[plan.style] || STYLE_GUIDES.executive;

  const systemPrompt = `You are an expert Intune report writer. Generate a precise, data-driven report that DIRECTLY answers the user's specific question.

STYLE: ${plan.style.toUpperCase()}
${styleGuide}

FORMAT RULES:
- Markdown with proper headings (##, ###), tables, bullet points
- Every claim must reference actual data from below — NEVER fabricate numbers
- Use exact counts, percentages, and names from the data
- Tables for lists of 3+ items (devices, policies, apps)
- Bold key metrics and status indicators
- If data is insufficient to answer a question, say so explicitly

STRUCTURE:
1. Title (# heading) — specific to this report
2. Brief summary (2-3 sentences answering the core question upfront)
3. Detailed findings organized by the questions below
4. Key observations / risks (if applicable)
5. Recommendations (specific, actionable, prioritized)

IMPORTANT: This report must SPECIFICALLY answer these questions:
${plan.questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}

Focus: ${plan.focus}`;

  const failedNote = failedSources.length > 0
    ? `\n\n⚠️ ${failedSources.length} data source(s) unavailable: ${failedSources.join(", ")}. Note this in the report but do NOT invent data.`
    : "";

  const userPrompt = `Generate the report for: "${prompt}"

DATA (${dataSections.length} sources):

${dataSections.join("\n\n---\n\n")}
${failedNote}`;

  const completion = await openai.chat.completions.create({
    model: config.azureOpenAI.deployment,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    max_completion_tokens: 8000,
  });

  const markdown = completion.choices[0]?.message?.content?.trim() || "Report generation failed — no response from AI.";

  // Extract title from first heading or use plan title
  const titleMatch = markdown.match(/^#\s+(.+)/m);
  const title = titleMatch ? titleMatch[1] : plan.title;

  const durationMs = Date.now() - start;
  console.log(`[ReportGenerator] Complete: "${title}" (${durationMs}ms, ${plan.sources.length} sources, style=${plan.style})`);

  return {
    title,
    prompt,
    generatedAt: new Date().toISOString(),
    durationMs,
    planningDurationMs,
    dataSources: plan.sources.map((s) => s.id),
    markdown,
    rawData,
  };
}
