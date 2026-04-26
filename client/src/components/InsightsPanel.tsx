import { useEffect, useState, useCallback } from "react";
import {
  RefreshCw,
  Loader2,
  AlertCircle,
  AlertTriangle,
  Info,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Minus,
  Clock,
  Download,
  Sparkles,
  ShieldCheck,
  Monitor,
  AppWindow,
} from "lucide-react";

interface InsightItem {
  category: string;
  severity: string;
  title: string;
  description: string;
  metric?: string;
  value?: number;
}

interface EnvironmentReport {
  generatedAt: string;
  durationMs: number;
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
  complianceRate: number;
  staleRate: number;
  updateComplianceRate: number;
  insights: InsightItem[];
  executiveSummary: string;
}

const SEVERITY_STYLES: Record<string, { icon: React.ReactNode; border: string; bg: string; text: string }> = {
  critical: {
    icon: <AlertCircle size={15} />,
    border: "border-red-500/30",
    bg: "bg-red-500/5",
    text: "text-red-400",
  },
  warning: {
    icon: <AlertTriangle size={15} />,
    border: "border-yellow-500/30",
    bg: "bg-yellow-500/5",
    text: "text-yellow-400",
  },
  info: {
    icon: <Info size={15} />,
    border: "border-blue-500/30",
    bg: "bg-blue-500/5",
    text: "text-blue-400",
  },
  good: {
    icon: <CheckCircle2 size={15} />,
    border: "border-green-500/30",
    bg: "bg-green-500/5",
    text: "text-green-400",
  },
};

export default function InsightsPanel() {
  const [report, setReport] = useState<EnvironmentReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = useCallback(async (force = false) => {
    setIsLoading(true);
    setError(null);
    try {
      const url = force ? "/api/insights/refresh" : "/api/insights";
      const method = force ? "POST" : "GET";
      const res = await fetch(url, { method });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const exportReport = () => {
    if (!report) return;
    const text = [
      `INTUNE007 — ENVIRONMENT REPORT`,
      `Generated: ${new Date(report.generatedAt).toLocaleString()}`,
      ``,
      `═══ EXECUTIVE SUMMARY ═══`,
      report.executiveSummary,
      ``,
      `═══ KEY METRICS ═══`,
      `Total Devices: ${report.stats.totalDevices}`,
      `Compliance Rate: ${report.complianceRate}%`,
      `Stale Device Rate: ${report.staleRate}%`,
      `Update Compliance: ${report.updateComplianceRate}%`,
      `Compliant: ${report.stats.compliantDevices} | Non-Compliant: ${report.stats.nonCompliantDevices}`,
      `Windows: ${report.stats.windowsDevices} | iOS: ${report.stats.iosDevices} | Android: ${report.stats.androidDevices} | macOS: ${report.stats.macDevices}`,
      `Compliance Policies: ${report.stats.compliancePolicies} | Config Profiles: ${report.stats.configProfiles}`,
      `CA Policies: ${report.stats.caPolicies} | Managed Apps: ${report.stats.managedApps}`,
      ``,
      `═══ INSIGHTS ═══`,
      ...report.insights.map(
        (i) => `[${i.severity.toUpperCase()}] ${i.title}\n  ${i.description}`
      ),
    ].join("\n");

    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `intune007-report-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading && !report) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500">
        <Loader2 size={28} className="animate-spin mb-3 text-brand-400" />
        <p className="text-sm font-medium text-gray-400">Generating insights report...</p>
        <p className="text-xs text-gray-600 mt-1">Analyzing your Intune environment</p>
      </div>
    );
  }

  if (error && !report) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500 px-8">
        <AlertCircle size={28} className="mb-3 text-red-400" />
        <p className="text-sm text-red-400 mb-2">Failed to generate report</p>
        <p className="text-xs text-gray-500 mb-4">{error}</p>
        <button
          onClick={() => fetchReport()}
          className="px-3 py-1.5 text-xs bg-gray-800 text-gray-300 hover:text-white rounded transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!report) return null;

  const criticalInsights = report.insights.filter((i) => i.severity === "critical");
  const warningInsights = report.insights.filter((i) => i.severity === "warning");
  const goodInsights = report.insights.filter((i) => i.severity === "good");
  const infoInsights = report.insights.filter((i) => i.severity === "info");

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-brand-400" />
          <h2 className="text-sm font-semibold text-gray-200">Insights & Reports</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportReport}
            className="flex items-center gap-1 px-2.5 py-1 text-xs text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
          >
            <Download size={12} />
            Export
          </button>
          <button
            onClick={() => fetchReport(true)}
            disabled={isLoading}
            className="flex items-center gap-1 px-2.5 py-1 text-xs text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
          >
            {isLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Refresh
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* ── Score Cards ─────────────────────────────────────────── */}
        <div className="grid grid-cols-4 gap-3 px-5 py-4">
          <ScoreCard
            label="Compliance"
            value={`${report.complianceRate}%`}
            detail={`${report.stats.compliantDevices} of ${report.stats.totalDevices}`}
            status={report.complianceRate >= 90 ? "good" : report.complianceRate >= 70 ? "warning" : "critical"}
          />
          <ScoreCard
            label="Stale Devices"
            value={`${report.staleRate}%`}
            detail={`${report.stats.staleDevices} devices`}
            status={report.staleRate <= 5 ? "good" : report.staleRate <= 20 ? "warning" : "critical"}
          />
          <ScoreCard
            label="Update Compliance"
            value={`${report.updateComplianceRate}%`}
            detail={`${report.stats.updateNonCompliant} behind`}
            status={report.updateComplianceRate >= 90 ? "good" : report.updateComplianceRate >= 70 ? "warning" : "critical"}
          />
          <ScoreCard
            label="Total Devices"
            value={String(report.stats.totalDevices)}
            detail={[
              report.stats.windowsDevices > 0 ? `${report.stats.windowsDevices} Windows` : null,
              report.stats.iosDevices > 0 ? `${report.stats.iosDevices} iOS` : null,
              report.stats.androidDevices > 0 ? `${report.stats.androidDevices} Android` : null,
              report.stats.macDevices > 0 ? `${report.stats.macDevices} macOS` : null,
            ].filter(Boolean).join(", ") || "No devices"}
            status="info"
          />
        </div>

        {/* ── Executive Summary ───────────────────────────────────── */}
        <div className="px-5 pb-4">
          <div className="bg-gray-800/40 border border-gray-700/50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2.5">
              <Sparkles size={14} className="text-brand-400" />
              <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">AI Executive Summary</h3>
            </div>
            <div className="text-[13px] text-gray-300 leading-relaxed whitespace-pre-wrap">
              {report.executiveSummary}
            </div>
          </div>
        </div>

        {/* ── Insights by Severity ────────────────────────────────── */}
        <div className="px-5 pb-4 space-y-3">
          {criticalInsights.length > 0 && (
            <InsightSection title="Critical Issues" items={criticalInsights} />
          )}
          {warningInsights.length > 0 && (
            <InsightSection title="Warnings" items={warningInsights} />
          )}
          {goodInsights.length > 0 && (
            <InsightSection title="What's Going Well" items={goodInsights} />
          )}
          {infoInsights.length > 0 && (
            <InsightSection title="Information" items={infoInsights} />
          )}
        </div>

        {/* ── Environment Breakdown ───────────────────────────────── */}
        <div className="px-5 pb-4">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Environment Breakdown</h3>
          <div className="grid grid-cols-2 gap-3">
            <StatBlock
              icon={<ShieldCheck size={14} />}
              label="Compliance Policies"
              value={report.stats.compliancePolicies}
            />
            <StatBlock
              icon={<Monitor size={14} />}
              label="Config Profiles"
              value={report.stats.configProfiles}
            />
            <StatBlock
              icon={<ShieldCheck size={14} />}
              label="CA Policies"
              value={report.stats.caPolicies}
            />
            <StatBlock
              icon={<AppWindow size={14} />}
              label="Managed Apps"
              value={report.stats.managedApps}
            />
          </div>
        </div>

        {/* ── OS Distribution Bar ─────────────────────────────────── */}
        <div className="px-5 pb-4">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Platform Distribution</h3>
          <OsDistributionBar stats={report.stats} />
        </div>

        {/* ── Footer ──────────────────────────────────────────────── */}
        <div className="px-5 py-3 border-t border-gray-800 flex items-center justify-between">
          <span className="text-[10px] text-gray-600 flex items-center gap-1">
            <Clock size={10} />
            Generated {new Date(report.generatedAt).toLocaleString()} in {(report.durationMs / 1000).toFixed(1)}s
          </span>
        </div>
      </div>
    </div>
  );
}

/* ─── Sub-Components ───────────────────────────────────────────── */

function ScoreCard({
  label,
  value,
  detail,
  status,
}: {
  label: string;
  value: string;
  detail: string;
  status: "good" | "warning" | "critical" | "info";
}) {
  const colors: Record<string, string> = {
    good: "text-green-400 border-green-500/20",
    warning: "text-yellow-400 border-yellow-500/20",
    critical: "text-red-400 border-red-500/20",
    info: "text-blue-400 border-blue-500/20",
  };
  const bgColors: Record<string, string> = {
    good: "bg-green-500/5",
    warning: "bg-yellow-500/5",
    critical: "bg-red-500/5",
    info: "bg-blue-500/5",
  };

  return (
    <div className={`rounded-lg border p-3 ${colors[status]} ${bgColors[status]}`}>
      <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-xl font-bold">{value}</p>
      <p className="text-[11px] text-gray-500 mt-0.5">{detail}</p>
    </div>
  );
}

function InsightSection({ title, items }: { title: string; items: InsightItem[] }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{title}</h3>
      <div className="space-y-2">
        {items.map((item, i) => {
          const style = SEVERITY_STYLES[item.severity] || SEVERITY_STYLES.info;
          return (
            <div
              key={i}
              className={`flex gap-3 rounded-lg border p-3 ${style.border} ${style.bg}`}
            >
              <span className={`mt-0.5 shrink-0 ${style.text}`}>{style.icon}</span>
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-gray-200">{item.title}</p>
                <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{item.description}</p>
              </div>
              {item.value !== undefined && (
                <span className={`ml-auto text-lg font-bold shrink-0 ${style.text}`}>
                  {typeof item.value === "number" && item.metric?.includes("rate")
                    ? `${item.value}%`
                    : item.value}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatBlock({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-3 bg-gray-800/30 border border-gray-700/40 rounded-lg px-3 py-2.5">
      <span className="text-gray-500">{icon}</span>
      <div>
        <p className="text-[11px] text-gray-500">{label}</p>
        <p className="text-sm font-semibold text-gray-200">{value}</p>
      </div>
    </div>
  );
}

function OsDistributionBar({ stats }: { stats: EnvironmentReport["stats"] }) {
  const total = stats.totalDevices || 1;
  const segments = [
    { label: "Windows", count: stats.windowsDevices, color: "bg-blue-500" },
    { label: "iOS", count: stats.iosDevices, color: "bg-purple-500" },
    { label: "Android", count: stats.androidDevices, color: "bg-green-500" },
    { label: "macOS", count: stats.macDevices, color: "bg-orange-500" },
  ].filter((s) => s.count > 0);

  return (
    <div>
      {/* Bar */}
      <div className="flex h-3 rounded-full overflow-hidden bg-gray-800 mb-2.5">
        {segments.map((seg) => (
          <div
            key={seg.label}
            className={`${seg.color} transition-all`}
            style={{ width: `${(seg.count / total) * 100}%` }}
          />
        ))}
      </div>
      {/* Legend */}
      <div className="flex gap-4">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${seg.color}`} />
            <span className="text-[11px] text-gray-400">
              {seg.label} <span className="text-gray-500">{seg.count} ({Math.round((seg.count / total) * 100)}%)</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
