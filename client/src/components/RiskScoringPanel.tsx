import { useEffect, useState, useCallback } from "react";
import { useActivityStore } from "../stores/activityStore.ts";
import {
  RefreshCw,
  Loader2,
  ShieldAlert,
  AlertCircle,
  AlertTriangle,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  Clock,
  Monitor,
  CheckCircle2,
} from "lucide-react";
import DeviceLink from "./DeviceLink.tsx";

interface RiskFactor {
  name: string;
  score: number;
  weight: number;
  detail: string;
}

interface DeviceRiskScore {
  deviceId: string;
  deviceName: string;
  userPrincipalName: string;
  operatingSystem: string;
  osVersion: string;
  riskScore: number;
  riskLevel: "critical" | "high" | "medium" | "low";
  factors: RiskFactor[];
}

interface FleetRiskSummary {
  generatedAt: string;
  durationMs: number;
  totalDevices: number;
  averageRiskScore: number;
  distribution: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  devices: DeviceRiskScore[];
  topRisks: DeviceRiskScore[];
}

const RISK_STYLES: Record<string, { color: string; bg: string; border: string; icon: React.ReactNode }> = {
  critical: {
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    icon: <AlertCircle size={14} />,
  },
  high: {
    color: "text-orange-400",
    bg: "bg-orange-500/10",
    border: "border-orange-500/30",
    icon: <AlertTriangle size={14} />,
  },
  medium: {
    color: "text-yellow-400",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/30",
    icon: <ShieldAlert size={14} />,
  },
  low: {
    color: "text-green-400",
    bg: "bg-green-500/10",
    border: "border-green-500/30",
    icon: <ShieldCheck size={14} />,
  },
};

export default function RiskScoringPanel() {
  const [summary, setSummary] = useState<FleetRiskSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedDevice, setExpandedDevice] = useState<string | null>(null);
  const [filterLevel, setFilterLevel] = useState<string>("all");

  const fetchScores = useCallback(async (force = false) => {
    setIsLoading(true); useActivityStore.getState().addActivity("risk-scoring");
    setError(null);
    try {
      const url = force ? "/api/risk-scores/refresh" : "/api/risk-scores";
      const method = force ? "POST" : "GET";
      const res = await fetch(url, { method });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSummary(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false); useActivityStore.getState().removeActivity("risk-scoring");
    }
  }, []);

  useEffect(() => {
    fetchScores();
  }, [fetchScores]);

  if (isLoading && !summary) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500">
        <Loader2 size={28} className="animate-spin mb-3 text-brand-400" />
        <p className="text-sm font-medium text-gray-400">Computing risk scores...</p>
        <p className="text-xs text-gray-600 mt-1">Analyzing compliance, sync, encryption, OS, and configs</p>
      </div>
    );
  }

  if (error && !summary) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500 px-8">
        <AlertCircle size={28} className="mb-3 text-red-400" />
        <p className="text-sm text-red-400 mb-2">Failed to compute risk scores</p>
        <p className="text-xs text-gray-500 mb-4">{error}</p>
        <button onClick={() => fetchScores()} className="px-3 py-1.5 text-xs bg-gray-800 text-gray-300 hover:text-white rounded transition-colors">
          Retry
        </button>
      </div>
    );
  }

  if (!summary) return null;

  const filteredDevices = filterLevel === "all"
    ? summary.devices
    : summary.devices.filter((d) => d.riskLevel === filterLevel);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <ShieldAlert size={16} className="text-brand-400" />
          <h2 className="text-sm font-semibold text-gray-200">Device Risk Scores</h2>
        </div>
        <button
          onClick={() => fetchScores(true)}
          disabled={isLoading}
          className="flex items-center gap-1 px-2.5 py-1 text-xs text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
        >
          {isLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          Refresh
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Fleet average score */}
        <div className="px-5 py-4">
          <div className="flex items-center gap-6">
            <div className="relative">
              <svg viewBox="0 0 120 120" className="w-24 h-24">
                <circle cx="60" cy="60" r="52" fill="none" stroke="#1f2937" strokeWidth="8" />
                <circle
                  cx="60" cy="60" r="52"
                  fill="none"
                  stroke={getScoreColor(summary.averageRiskScore)}
                  strokeWidth="8"
                  strokeDasharray={`${(summary.averageRiskScore / 100) * 327} 327`}
                  strokeLinecap="round"
                  transform="rotate(-90 60 60)"
                  className="transition-all duration-700"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-white">{summary.averageRiskScore}</span>
                <span className="text-[10px] text-gray-500">AVG RISK</span>
              </div>
            </div>

            <div className="flex-1 grid grid-cols-4 gap-2">
              {(["critical", "high", "medium", "low"] as const).map((level) => {
                const style = RISK_STYLES[level];
                const count = summary.distribution[level];
                return (
                  <button
                    key={level}
                    onClick={() => setFilterLevel(filterLevel === level ? "all" : level)}
                    className={`rounded-lg border p-2.5 text-center transition-all ${style.border} ${style.bg} ${
                      filterLevel === level ? "ring-1 ring-white/20" : ""
                    }`}
                  >
                    <p className={`text-lg font-bold ${style.color}`}>{count}</p>
                    <p className="text-[10px] text-gray-500 capitalize">{level}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Device list */}
        <div className="px-5 pb-2">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              {filterLevel === "all" ? "All Devices" : `${filterLevel} Risk Devices`}
            </p>
            <p className="text-[10px] text-gray-600">{filteredDevices.length} device(s)</p>
          </div>
        </div>

        <div className="px-5 pb-4 space-y-1.5">
          {filteredDevices.map((device) => (
            <DeviceRiskRow
              key={device.deviceId}
              device={device}
              expanded={expandedDevice === device.deviceId}
              onToggle={() =>
                setExpandedDevice(expandedDevice === device.deviceId ? null : device.deviceId)
              }
            />
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-800 flex items-center gap-2">
          <Clock size={10} className="text-gray-600" />
          <span className="text-[10px] text-gray-600">
            Generated {new Date(summary.generatedAt).toLocaleString()} in {(summary.durationMs / 1000).toFixed(1)}s
          </span>
        </div>
      </div>
    </div>
  );
}

/* ─── Device Risk Row ──────────────────────────────────────────── */

function DeviceRiskRow({
  device,
  expanded,
  onToggle,
}: {
  device: DeviceRiskScore;
  expanded: boolean;
  onToggle: () => void;
}) {
  const style = RISK_STYLES[device.riskLevel];

  return (
    <div className={`rounded-lg border ${style.border} ${style.bg} overflow-hidden`}>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left"
      >
        <span className={style.color}>
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </span>

        {/* Score badge */}
        <div
          className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold ${style.color}`}
          style={{ background: "rgba(0,0,0,0.2)" }}
        >
          {device.riskScore}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <DeviceLink name={device.deviceName} className="text-xs font-medium" />
            <span className={`text-[10px] px-1.5 py-0.5 rounded capitalize font-medium ${style.color}`} style={{ background: "rgba(0,0,0,0.2)" }}>
              {device.riskLevel}
            </span>
          </div>
          <p className="text-[11px] text-gray-500 truncate">
            {device.userPrincipalName} · {device.operatingSystem} {device.osVersion}
          </p>
        </div>

        <Monitor size={13} className="text-gray-600 shrink-0" />
      </button>

      {/* Expanded factors */}
      {expanded && (
        <div className="px-3 pb-3 pt-1">
          <div className="space-y-1.5">
            {device.factors.map((factor, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-24 text-[11px] text-gray-400 shrink-0 flex items-center gap-1">
                  {factor.score === 0 ? <CheckCircle2 size={10} className="text-green-400" /> : 
                   factor.score >= 70 ? <AlertCircle size={10} className="text-red-400" /> :
                   factor.score >= 40 ? <AlertTriangle size={10} className="text-yellow-400" /> : null}
                  {factor.name}
                </div>
                {/* Score bar — show green for 0, colored for risk */}
                <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                  {factor.score === 0 ? (
                    <div className="h-full w-full rounded-full bg-green-500/30" />
                  ) : (
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.max(factor.score, 5)}%`,
                        background: factor.score >= 70 ? "#ef4444" : factor.score >= 40 ? "#f59e0b" : "#22c55e",
                      }}
                    />
                  )}
                </div>
                <span className={`text-[10px] w-6 text-right font-bold ${factor.score === 0 ? "text-green-400" : factor.score >= 70 ? "text-red-400" : factor.score >= 40 ? "text-yellow-400" : "text-gray-400"}`}>{factor.score}</span>
                <span className={`text-[10px] truncate max-w-[160px] ${factor.score === 0 ? "text-green-400/70" : "text-gray-500"}`} title={factor.detail}>
                  {factor.detail}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function getScoreColor(score: number): string {
  if (score >= 70) return "#ef4444";
  if (score >= 45) return "#f97316";
  if (score >= 20) return "#eab308";
  return "#22c55e";
}
