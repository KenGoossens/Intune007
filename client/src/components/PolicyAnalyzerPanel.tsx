import { useEffect, useState } from "react";
import {
  ScanSearch,
  RefreshCw,
  Loader2,
  AlertCircle,
  AlertTriangle,
  Info,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Monitor,
  Shield,
  KeyRound,
  AppWindow,
  Settings,
  Lock,
} from "lucide-react";
import { usePolicyAnalyzerStore } from "../stores/policyAnalyzerStore.ts";
import type { PolicyFinding, PolicyFindingCategory, PolicyFindingSeverity } from "@intune-agent/shared";

const SEVERITY_CONFIG: Record<PolicyFindingSeverity, { icon: React.ReactNode; color: string; bg: string; border: string }> = {
  critical: {
    icon: <AlertCircle size={14} />,
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
  },
  warning: {
    icon: <AlertTriangle size={14} />,
    color: "text-yellow-400",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/30",
  },
  info: {
    icon: <Info size={14} />,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
  },
  good: {
    icon: <CheckCircle2 size={14} />,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
  },
};

const CATEGORY_CONFIG: Record<PolicyFindingCategory, { icon: React.ReactNode; label: string }> = {
  compliance: { icon: <Shield size={12} />, label: "Compliance" },
  configuration: { icon: <Settings size={12} />, label: "Configuration" },
  conditional_access: { icon: <KeyRound size={12} />, label: "Conditional Access" },
  device_health: { icon: <Monitor size={12} />, label: "Device Health" },
  app_management: { icon: <AppWindow size={12} />, label: "App Management" },
  security: { icon: <Lock size={12} />, label: "Security" },
};

export default function PolicyAnalyzerPanel() {
  const { result, loading, error, fetch: fetchAnalysis, refresh } = usePolicyAnalyzerStore();

  useEffect(() => {
    fetchAnalysis();
  }, [fetchAnalysis]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <ScanSearch size={18} className="text-brand-400" />
          <h2 className="text-sm font-semibold text-white">Policy Analyzer</h2>
          {result && (
            <span className="text-xs text-gray-500">
              {result.findings.length} finding{result.findings.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-300 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          {loading ? "Analyzing..." : "Re-scan"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {error && (
          <div className="text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2 border border-red-500/30">
            {error}
          </div>
        )}

        {loading && !result && (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-500">
            <Loader2 size={48} className="mb-4 text-brand-400 animate-spin" />
            <h3 className="text-lg font-medium text-gray-300 mb-2">Analyzing Policies...</h3>
            <p className="text-sm max-w-sm">
              Scanning compliance, configuration, conditional access, and device health.
            </p>
          </div>
        )}

        {!result && !loading && !error && (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-500">
            <ScanSearch size={48} className="mb-4 text-gray-600" />
            <h3 className="text-lg font-medium text-gray-300 mb-2">Policy Analyzer</h3>
            <p className="text-sm max-w-sm">
              Click Re-scan to analyze your Intune policies for security gaps, misconfigurations, and best practice violations.
            </p>
          </div>
        )}

        {result && (
          <>
            {/* Score Ring + Summary */}
            <div className="flex items-center gap-4">
              <ScoreRing score={result.score} />
              <div className="flex-1 grid grid-cols-4 gap-2">
                <SummaryBadge severity="critical" count={result.summary.critical} />
                <SummaryBadge severity="warning" count={result.summary.warning} />
                <SummaryBadge severity="info" count={result.summary.info} />
                <SummaryBadge severity="good" count={result.summary.good} />
              </div>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-4 gap-2">
              <MiniStat label="Devices" value={result.stats.totalDevices} />
              <MiniStat label="Compliance" value={result.stats.compliancePolicies} />
              <MiniStat label="Config Profiles" value={result.stats.configurationProfiles} />
              <MiniStat label="CA Policies" value={result.stats.conditionalAccessPolicies} />
            </div>

            {/* Findings by severity */}
            <div className="space-y-2">
              <div className="text-xs font-medium text-gray-400">Findings</div>
              {result.findings
                .sort((a, b) => severityOrder(a.severity) - severityOrder(b.severity))
                .map((f) => (
                  <FindingCard key={f.id} finding={f} />
                ))}
            </div>

            <div className="text-[10px] text-gray-600 text-center">
              Analysis completed in {(result.durationMs / 1000).toFixed(1)}s at{" "}
              {new Date(result.timestamp).toLocaleTimeString()}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color =
    score >= 80 ? "text-emerald-400" : score >= 50 ? "text-yellow-400" : "text-red-400";
  const strokeColor =
    score >= 80 ? "stroke-emerald-400" : score >= 50 ? "stroke-yellow-400" : "stroke-red-400";

  return (
    <div className="relative w-24 h-24 shrink-0">
      <svg className="w-24 h-24 -rotate-90" viewBox="0 0 80 80">
        <circle
          cx="40" cy="40" r={radius}
          fill="none"
          stroke="currentColor"
          className="text-gray-700"
          strokeWidth="6"
        />
        <circle
          cx="40" cy="40" r={radius}
          fill="none"
          className={strokeColor}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.5s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-xl font-bold ${color}`}>{score}</span>
        <span className="text-[9px] text-gray-500 -mt-0.5">Score</span>
      </div>
    </div>
  );
}

function SummaryBadge({ severity, count }: { severity: PolicyFindingSeverity; count: number }) {
  const cfg = SEVERITY_CONFIG[severity];
  return (
    <div className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg ${cfg.bg} border ${cfg.border}`}>
      <span className={cfg.color}>{cfg.icon}</span>
      <span className={`text-xs font-semibold ${cfg.color}`}>{count}</span>
      <span className="text-[10px] text-gray-400 capitalize">{severity}</span>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-gray-800/50 rounded-lg border border-gray-700/50 px-2.5 py-2 text-center">
      <div className="text-sm font-semibold text-white">{value}</div>
      <div className="text-[10px] text-gray-500">{label}</div>
    </div>
  );
}

function FindingCard({ finding }: { finding: PolicyFinding }) {
  const [expanded, setExpanded] = useState(false);
  const sev = SEVERITY_CONFIG[finding.severity];
  const cat = CATEGORY_CONFIG[finding.category];

  return (
    <div className={`rounded-lg border ${sev.border} ${sev.bg} overflow-hidden`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-2 px-3 py-2.5 text-left"
      >
        <span className={`mt-0.5 shrink-0 ${sev.color}`}>{sev.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-white">{finding.title}</span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="flex items-center gap-1 text-[10px] text-gray-400">
              {cat.icon} {cat.label}
            </span>
          </div>
        </div>
        <span className="text-gray-500 mt-0.5 shrink-0">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-gray-700/30 pt-2">
          <p className="text-xs text-gray-300 leading-relaxed">{finding.description}</p>
          <div className="bg-gray-800/60 rounded-md px-2.5 py-2">
            <div className="text-[10px] font-medium text-brand-400 mb-0.5">Recommendation</div>
            <p className="text-xs text-gray-300 leading-relaxed">{finding.recommendation}</p>
          </div>
          {finding.affectedItems.length > 0 && (
            <div>
              <div className="text-[10px] font-medium text-gray-400 mb-1">Affected Items</div>
              <div className="flex flex-wrap gap-1">
                {finding.affectedItems.slice(0, 10).map((item, i) => (
                  <span key={i} className="px-1.5 py-0.5 rounded text-[10px] bg-gray-800 text-gray-300 border border-gray-700">
                    {item}
                  </span>
                ))}
                {finding.affectedItems.length > 10 && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] text-gray-500">
                    +{finding.affectedItems.length - 10} more
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function severityOrder(s: PolicyFindingSeverity): number {
  return { critical: 0, warning: 1, info: 2, good: 3 }[s];
}
