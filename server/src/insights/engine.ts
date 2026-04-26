/**
 * Insights Engine — Generates AI-powered insights and reports from live
 * Intune data combined with historical trends.
 *
 * Pulls compliance, devices, alerts, apps, CA policies, and update status
 * in parallel, then uses Azure OpenAI to generate actionable insights,
 * risk assessments, and executive-level summaries.
 */

import { AzureOpenAI } from "openai";
import { config } from "../config.js";
import { getGraphClient, fetchWithPagination } from "../graph/client.js";
import { getComplianceStatus } from "../graph/compliance.js";
import { getUpdateComplianceSummary } from "../graph/windowsUpdate.js";
import { getDailyTrend, getAvailableMetrics } from "../analytics/history.js";

export interface InsightItem {
  category: "risk" | "optimization" | "trend" | "recommendation" | "highlight";
  severity: "critical" | "warning" | "info" | "good";
  title: string;
  description: string;
  metric?: string;
  value?: number;
}

export interface EnvironmentReport {
  generatedAt: string;
  durationMs: number;

  // Live counts
  stats: {
    totalDevices: number;
    compliantDevices: number;
    nonCompliantDevices: number;
    staleDevices: number;
    windowsDevices: number;
    iosDevices: number;
    androidDevices: number;
    macDevices: number;
    compliancePolicies: number;
    configProfiles: number;
    caPolicies: number;
    managedApps: number;
    updateCompliant: number;
    updateNonCompliant: number;
  };

  // Computed metrics
  complianceRate: number;
  staleRate: number;
  updateComplianceRate: number;

  // AI-generated insights
  insights: InsightItem[];
  executiveSummary: string;
}

/**
 * Generate a full environment report with AI insights.
 */
export async function generateInsightsReport(): Promise<EnvironmentReport> {
  const start = Date.now();
  const client = getGraphClient();

  // ── Fetch everything in parallel ──────────────────────────────

  const [
    devicesResult,
    complianceStatus,
    compliancePolicies,
    configProfiles,
    caPolicies,
    apps,
    updateSummary,
  ] = await Promise.all([
    fetchWithPagination<Record<string, unknown>>(
      client,
      "/deviceManagement/managedDevices",
      {
        select: "id,deviceName,operatingSystem,complianceState,lastSyncDateTime,userPrincipalName",
        maxItems: 200,
      }
    ),
    getComplianceStatus(),
    fetchWithPagination<Record<string, unknown>>(
      client,
      "/deviceManagement/deviceCompliancePolicies",
      { select: "id", maxItems: 200 }
    ),
    fetchWithPagination<Record<string, unknown>>(
      client,
      "/deviceManagement/deviceConfigurations",
      { select: "id", maxItems: 200 }
    ),
    fetchWithPagination<Record<string, unknown>>(
      client,
      "/identity/conditionalAccess/policies",
      { select: "id,state", maxItems: 200 }
    ).catch(() => ({ items: [] as Record<string, unknown>[], totalCount: 0 })),
    fetchWithPagination<Record<string, unknown>>(
      client,
      "/deviceAppManagement/mobileApps",
      { select: "id", maxItems: 200 }
    ),
    getUpdateComplianceSummary(),
  ]);

  const devices = devicesResult.items;
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // OS breakdown
  const osCounts: Record<string, number> = {};
  for (const d of devices) {
    const os = String(d.operatingSystem || "Unknown").toLowerCase();
    if (os.includes("windows")) osCounts["windows"] = (osCounts["windows"] || 0) + 1;
    else if (os.includes("ios") || os.includes("iphone") || os.includes("ipad")) osCounts["ios"] = (osCounts["ios"] || 0) + 1;
    else if (os.includes("android")) osCounts["android"] = (osCounts["android"] || 0) + 1;
    else if (os.includes("mac")) osCounts["mac"] = (osCounts["mac"] || 0) + 1;
  }

  const staleDevices = devices.filter(
    (d) => d.lastSyncDateTime && new Date(String(d.lastSyncDateTime)) < sevenDaysAgo
  );

  const totalDevices = devices.length || 1; // avoid div by 0
  const compliantCount = complianceStatus.compliantDeviceCount;
  const nonCompliantCount = complianceStatus.nonCompliantDeviceCount;
  const complianceRate = Math.round((compliantCount / totalDevices) * 100);
  const staleRate = Math.round((staleDevices.length / totalDevices) * 100);

  const updateCompliant = (updateSummary.compliantDeviceCount as number) || 0;
  const updateNonCompliant = (updateSummary.nonCompliantDeviceCount as number) || 0;
  const updateTotal = updateCompliant + updateNonCompliant || 1;
  const updateComplianceRate = Math.round((updateCompliant / updateTotal) * 100);

  const stats = {
    totalDevices: devices.length,
    compliantDevices: compliantCount,
    nonCompliantDevices: nonCompliantCount,
    staleDevices: staleDevices.length,
    windowsDevices: osCounts["windows"] || 0,
    iosDevices: osCounts["ios"] || 0,
    androidDevices: osCounts["android"] || 0,
    macDevices: osCounts["mac"] || 0,
    compliancePolicies: compliancePolicies.totalCount,
    configProfiles: configProfiles.totalCount,
    caPolicies: caPolicies.totalCount,
    managedApps: apps.totalCount,
    updateCompliant,
    updateNonCompliant,
  };

  // ── Fetch historical trends ───────────────────────────────────

  const availableMetrics = getAvailableMetrics();
  const trendSummaries: string[] = [];

  for (const metric of availableMetrics.slice(0, 5)) {
    const trend = getDailyTrend(metric, 7);
    if (trend.length >= 2) {
      const first = trend[0].avg;
      const last = trend[trend.length - 1].avg;
      const change = last - first;
      const dir = change > 0 ? "increased" : change < 0 ? "decreased" : "stable";
      trendSummaries.push(`${metric}: ${dir} from ${first.toFixed(0)} to ${last.toFixed(0)} over 7 days`);
    }
  }

  // ── Generate AI Insights ──────────────────────────────────────

  const insights = generateRuleBasedInsights(stats, complianceRate, staleRate, updateComplianceRate, caPolicies.items);
  let executiveSummary = "";

  try {
    executiveSummary = await generateAISummary(stats, complianceRate, staleRate, updateComplianceRate, trendSummaries, insights);
  } catch {
    executiveSummary = buildFallbackSummary(stats, complianceRate, staleRate, updateComplianceRate);
  }

  return {
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - start,
    stats,
    complianceRate,
    staleRate,
    updateComplianceRate,
    insights,
    executiveSummary,
  };
}

/**
 * Rule-based insights (always available, no AI needed).
 */
function generateRuleBasedInsights(
  stats: EnvironmentReport["stats"],
  complianceRate: number,
  staleRate: number,
  updateComplianceRate: number,
  caPolicies: Record<string, unknown>[]
): InsightItem[] {
  const insights: InsightItem[] = [];

  // Compliance rate
  if (complianceRate >= 95) {
    insights.push({
      category: "highlight",
      severity: "good",
      title: "Excellent Compliance Rate",
      description: `${complianceRate}% of devices are compliant — well above the 90% industry benchmark.`,
      metric: "compliance_rate",
      value: complianceRate,
    });
  } else if (complianceRate >= 80) {
    insights.push({
      category: "optimization",
      severity: "warning",
      title: "Compliance Rate Below Target",
      description: `${complianceRate}% compliance rate. ${stats.nonCompliantDevices} device(s) are non-compliant. Target is 95%+.`,
      metric: "compliance_rate",
      value: complianceRate,
    });
  } else {
    insights.push({
      category: "risk",
      severity: "critical",
      title: "Low Compliance Rate",
      description: `Only ${complianceRate}% of devices are compliant. ${stats.nonCompliantDevices} device(s) are at risk. Immediate attention required.`,
      metric: "compliance_rate",
      value: complianceRate,
    });
  }

  // Stale devices
  if (staleRate > 20) {
    insights.push({
      category: "risk",
      severity: "critical",
      title: "High Stale Device Rate",
      description: `${staleRate}% of devices (${stats.staleDevices}) haven't synced in 7+ days. These devices may be lost, retired, or disconnected.`,
      metric: "stale_rate",
      value: staleRate,
    });
  } else if (staleRate > 5) {
    insights.push({
      category: "optimization",
      severity: "warning",
      title: "Stale Devices Detected",
      description: `${stats.staleDevices} device(s) (${staleRate}%) haven't synced in 7+ days. Consider investigating or retiring them.`,
      metric: "stale_rate",
      value: staleRate,
    });
  } else {
    insights.push({
      category: "highlight",
      severity: "good",
      title: "Devices Actively Syncing",
      description: `${100 - staleRate}% of devices synced within the last 7 days.`,
      metric: "stale_rate",
      value: staleRate,
    });
  }

  // Update compliance
  if (updateComplianceRate < 80) {
    insights.push({
      category: "risk",
      severity: "warning",
      title: "Windows Update Compliance Gap",
      description: `Only ${updateComplianceRate}% of devices are update-compliant. ${stats.updateNonCompliant} device(s) are behind on patches.`,
      metric: "update_compliance_rate",
      value: updateComplianceRate,
    });
  } else {
    insights.push({
      category: "highlight",
      severity: "good",
      title: "Windows Updates On Track",
      description: `${updateComplianceRate}% of devices are up to date with Windows Update policies.`,
      metric: "update_compliance_rate",
      value: updateComplianceRate,
    });
  }

  // CA policies
  const disabledCA = caPolicies.filter((p) => String(p.state) === "disabled").length;
  const reportOnlyCA = caPolicies.filter((p) => String(p.state) === "enabledForReportingButNotEnforced").length;
  if (disabledCA > 0 || reportOnlyCA > 0) {
    insights.push({
      category: "risk",
      severity: disabledCA > 0 ? "warning" : "info",
      title: "Conditional Access Policies Not Enforcing",
      description: `${disabledCA} disabled and ${reportOnlyCA} report-only CA polic${(disabledCA + reportOnlyCA) > 1 ? "ies" : "y"}. Review and enable as appropriate.`,
      metric: "ca_not_enforcing",
      value: disabledCA + reportOnlyCA,
    });
  }

  // Policy coverage
  if (stats.compliancePolicies === 0) {
    insights.push({
      category: "risk",
      severity: "critical",
      title: "No Compliance Policies",
      description: "No compliance policies are configured. Devices cannot be evaluated for compliance.",
    });
  }

  // OS distribution insight
  const platforms = [
    { name: "Windows", count: stats.windowsDevices },
    { name: "iOS", count: stats.iosDevices },
    { name: "Android", count: stats.androidDevices },
    { name: "macOS", count: stats.macDevices },
  ].filter((p) => p.count > 0);

  if (platforms.length > 0) {
    const dominant = platforms.sort((a, b) => b.count - a.count)[0];
    insights.push({
      category: "trend",
      severity: "info",
      title: "Platform Distribution",
      description: `Fleet is ${platforms.map((p) => `${p.name}: ${p.count}`).join(", ")}. ${dominant.name} is the dominant platform (${Math.round((dominant.count / stats.totalDevices) * 100)}%).`,
    });
  }

  // Environment scale
  insights.push({
    category: "trend",
    severity: "info",
    title: "Environment Overview",
    description: `Managing ${stats.totalDevices} devices with ${stats.compliancePolicies} compliance policies, ${stats.configProfiles} configuration profiles, ${stats.caPolicies} CA policies, and ${stats.managedApps} apps.`,
  });

  return insights;
}

/**
 * AI-generated executive summary.
 */
async function generateAISummary(
  stats: EnvironmentReport["stats"],
  complianceRate: number,
  staleRate: number,
  updateComplianceRate: number,
  trends: string[],
  insights: InsightItem[]
): Promise<string> {
  const openai = new AzureOpenAI({
    apiKey: config.azureOpenAI.apiKey,
    endpoint: config.azureOpenAI.endpoint,
    deployment: config.azureOpenAI.deployment,
    apiVersion: config.azureOpenAI.apiVersion,
  });

  const criticalCount = insights.filter((i) => i.severity === "critical").length;
  const warningCount = insights.filter((i) => i.severity === "warning").length;

  const prompt = `You are an IT security analyst writing an executive summary for an Intune environment report. Be concise, professional, and actionable. Use 3-5 short paragraphs.

Environment Data:
- Total devices: ${stats.totalDevices}
- Compliance rate: ${complianceRate}% (${stats.compliantDevices} compliant, ${stats.nonCompliantDevices} non-compliant)
- Stale devices (7+ days no sync): ${stats.staleDevices} (${staleRate}%)
- Windows Update compliance: ${updateComplianceRate}%
- OS breakdown: Windows ${stats.windowsDevices}, iOS ${stats.iosDevices}, Android ${stats.androidDevices}, macOS ${stats.macDevices}
- Policies: ${stats.compliancePolicies} compliance, ${stats.configProfiles} config profiles, ${stats.caPolicies} CA policies
- Managed apps: ${stats.managedApps}
- Critical issues: ${criticalCount}, Warnings: ${warningCount}
${trends.length > 0 ? `\nTrends (last 7 days):\n${trends.join("\n")}` : ""}

Write a professional executive summary covering: overall health assessment, key risks, and top 2-3 recommended actions.`;

  const completion = await openai.chat.completions.create({
    model: config.azureOpenAI.deployment,
    messages: [{ role: "user", content: prompt }],
    max_completion_tokens: 500,
  });

  return completion.choices[0]?.message?.content?.trim() || buildFallbackSummary(stats, complianceRate, staleRate, updateComplianceRate);
}

/**
 * Fallback summary when AI is unavailable.
 */
function buildFallbackSummary(
  stats: EnvironmentReport["stats"],
  complianceRate: number,
  staleRate: number,
  updateComplianceRate: number
): string {
  const health = complianceRate >= 90 ? "healthy" : complianceRate >= 70 ? "moderate" : "at risk";
  return `The Intune environment is currently ${health} with a ${complianceRate}% device compliance rate across ${stats.totalDevices} managed devices. ${stats.nonCompliantDevices} device(s) require attention. ${staleRate}% of devices are stale (7+ days without sync). Windows Update compliance stands at ${updateComplianceRate}%. The environment has ${stats.compliancePolicies} compliance policies, ${stats.configProfiles} configuration profiles, and ${stats.caPolicies} Conditional Access policies in place.`;
}
