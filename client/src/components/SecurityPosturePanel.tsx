import { useEffect, useState, useCallback } from "react";
import {
  Loader2, Shield, TrendingUp, TrendingDown, Minus, RefreshCw,
  Lock, ShieldCheck, ShieldAlert, Clock, Monitor, CheckCircle2,
  XCircle, AlertTriangle, ChevronDown, ChevronRight,
} from "lucide-react";
import DeviceLink from "./DeviceLink.tsx";
import { TroubleshootDrillLink, TimelineDrillLink, UserDrillLink } from "./DrillLinks.tsx";

interface PostureDevice { deviceName: string; userPrincipalName: string; operatingSystem: string; osVersion: string; complianceState: string; isEncrypted: boolean; lastSyncDateTime: string; }
interface Delta { current: number; previous: number; delta: number; direction: string; }
interface PostureData { generatedAt: string; period: string; current: Record<string, number>; deviceLists: Record<string, PostureDevice[]>; deltas: Record<string, Delta>; trends: Record<string, Array<{ date: string; avg: number }>>; availableMetrics: string[]; }

function DeltaBadge({ d, invert }: { d: Delta; invert?: boolean }) {
  const dir = invert ? (d.direction === "up" ? "down" : d.direction === "down" ? "up" : "stable") : d.direction;
  if (dir === "up") return <span className="flex items-center gap-0.5 text-[10px] text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded-full"><TrendingUp size={10} />+{Math.abs(d.delta)}</span>;
  if (dir === "down") return <span className="flex items-center gap-0.5 text-[10px] text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded-full"><TrendingDown size={10} />-{Math.abs(d.delta)}</span>;
  return <span className="flex items-center gap-0.5 text-[10px] text-gray-500 bg-gray-700/30 px-1.5 py-0.5 rounded-full"><Minus size={10} />0</span>;
}

function ScoreRing({ value, label, color, size = 100 }: { value: number; label: string; color: string; size?: number }) {
  const r = (size - 12) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (value / 100) * circ;
  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1f2937" strokeWidth="6" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="6"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" className="transition-all duration-700" />
      </svg>
      <div className="absolute flex flex-col items-center justify-center" style={{ width: size, height: size }}>
        <span className="text-xl font-bold text-white">{value}%</span>
      </div>
      <p className="text-[10px] text-gray-500 mt-1">{label}</p>
    </div>
  );
}

function TrendChart({ data, color, height = 40 }: { data: Array<{ date: string; avg: number }>; color: string; height?: number }) {
  if (data.length < 2) return <p className="text-[10px] text-gray-600 italic">Not enough data for trend</p>;
  const values = data.slice(-14);
  const max = Math.max(...values.map((v) => v.avg), 1);
  return (
    <div className="flex items-end gap-[2px] group" style={{ height }}>
      {values.map((v, i) => (
        <div key={i} className="flex-1 relative">
          <div className="rounded-t-sm transition-all hover:opacity-100 opacity-80" style={{
            height: `${Math.max((v.avg / max) * 100, 4)}%`,
            background: color,
          }} />
          <div className="hidden group-hover:block absolute -top-6 left-1/2 -translate-x-1/2 bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-[8px] text-gray-300 whitespace-nowrap z-10">
            {v.date}: {Math.round(v.avg)}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function SecurityPosturePanel() {
  const [data, setData] = useState<PostureData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try { const res = await fetch("/api/security-posture"); setData(await res.json()); }
    catch { /* */ } finally { setIsLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (isLoading && !data) return (
    <div className="flex flex-col items-center justify-center h-full text-gray-500">
      <Loader2 size={28} className="animate-spin mb-3 text-brand-400" />
      <p className="text-sm text-gray-400">Analyzing security posture...</p>
    </div>
  );
  if (!data) return null;

  const compliance = data.current.complianceRate ?? 0;
  const encryption = data.current.encryptionRate ?? 0;
  const stale = data.current.staleRate ?? 0;
  const overallScore = Math.round((compliance + encryption + (100 - stale)) / 3);
  const overallColor = overallScore >= 90 ? "#22c55e" : overallScore >= 70 ? "#eab308" : "#ef4444";
  const overallLabel = overallScore >= 90 ? "Excellent" : overallScore >= 70 ? "Good" : overallScore >= 50 ? "Fair" : "At Risk";

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <Shield size={16} className="text-brand-400" />
          <h2 className="text-sm font-semibold text-gray-200">Security Posture</h2>
        </div>
        <button onClick={fetchData} disabled={isLoading} className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors">
          {isLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Refresh
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {/* ─── Overall Score ───────────────────────────────────── */}
        <div className="px-5 py-5">
          <div className="flex items-center gap-8">
            <div className="relative">
              <ScoreRing value={overallScore} label="" color={overallColor} size={110} />
            </div>
            <div className="flex-1">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider">Overall Security Score</p>
              <p className="text-3xl font-bold text-white">{overallScore}<span className="text-lg text-gray-500">/100</span></p>
              <p className={`text-sm font-medium mt-1 ${overallScore >= 90 ? "text-green-400" : overallScore >= 70 ? "text-yellow-400" : "text-red-400"}`}>
                {overallLabel}
              </p>
              <p className="text-[10px] text-gray-600 mt-1">Based on compliance, encryption, and device freshness</p>
            </div>
          </div>
        </div>

        {/* ─── Key Metrics ─────────────────────────────────────── */}
        <div className="px-5 pb-4">
          <div className="grid grid-cols-3 gap-3">
            {/* Compliance */}
            <div className={`rounded-xl border p-4 ${compliance >= 90 ? "bg-green-500/5 border-green-500/20" : compliance >= 70 ? "bg-yellow-500/5 border-yellow-500/20" : "bg-red-500/5 border-red-500/20"}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck size={14} className={compliance >= 90 ? "text-green-400" : "text-yellow-400"} />
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider">Compliance</p>
                </div>
                {data.deltas.compliant_devices && <DeltaBadge d={data.deltas.compliant_devices} />}
              </div>
              <p className={`text-3xl font-bold ${compliance >= 90 ? "text-green-400" : compliance >= 70 ? "text-yellow-400" : "text-red-400"}`}>{compliance}%</p>
              <p className="text-[10px] text-gray-500 mt-1">{data.current.compliantDevices ?? 0} of {data.current.totalDevices ?? 0} devices</p>
              <TrendChart data={data.trends.compliant_devices || []} color="rgba(34,197,94,0.5)" />
            </div>

            {/* Encryption */}
            <div className={`rounded-xl border p-4 ${encryption >= 90 ? "bg-blue-500/5 border-blue-500/20" : "bg-yellow-500/5 border-yellow-500/20"}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <Lock size={14} className={encryption >= 90 ? "text-blue-400" : "text-yellow-400"} />
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider">Encryption</p>
                </div>
                {data.deltas.encrypted_devices && <DeltaBadge d={data.deltas.encrypted_devices} />}
              </div>
              <p className={`text-3xl font-bold ${encryption >= 90 ? "text-blue-400" : "text-yellow-400"}`}>{encryption}%</p>
              <p className="text-[10px] text-gray-500 mt-1">{data.current.encryptedDevices ?? 0} encrypted</p>
              <TrendChart data={data.trends.encrypted_devices || []} color="rgba(59,130,246,0.5)" />
            </div>

            {/* Stale Devices */}
            <div className={`rounded-xl border p-4 ${stale <= 5 ? "bg-green-500/5 border-green-500/20" : stale <= 20 ? "bg-yellow-500/5 border-yellow-500/20" : "bg-red-500/5 border-red-500/20"}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <Clock size={14} className={stale <= 5 ? "text-green-400" : "text-yellow-400"} />
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider">Stale Devices</p>
                </div>
                {data.deltas.stale_devices && <DeltaBadge d={data.deltas.stale_devices} invert />}
              </div>
              <p className={`text-3xl font-bold ${stale <= 5 ? "text-green-400" : stale <= 20 ? "text-yellow-400" : "text-red-400"}`}>{stale}%</p>
              <p className="text-[10px] text-gray-500 mt-1">{data.current.staleDevices ?? 0} not synced 7d+</p>
              <TrendChart data={data.trends.stale_devices || []} color="rgba(234,179,8,0.5)" />
            </div>
          </div>
        </div>

        {/* ─── Device Breakdown ────────────────────────────────── */}
        <div className="px-5 pb-4">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Device Health Breakdown</h3>
          <div className="space-y-2">
            {[
              { key: "compliant", icon: <CheckCircle2 size={14} className="text-green-400" />, label: "Compliant Devices", value: data.current.compliantDevices ?? 0, total: data.current.totalDevices ?? 1, color: "bg-green-500", listKey: "compliant" },
              { key: "nonCompliant", icon: <XCircle size={14} className="text-red-400" />, label: "Non-Compliant Devices", value: data.current.nonCompliantDevices ?? 0, total: data.current.totalDevices ?? 1, color: "bg-red-500", listKey: "nonCompliant" },
              { key: "encrypted", icon: <Lock size={14} className="text-blue-400" />, label: "Encrypted Devices", value: data.current.encryptedDevices ?? 0, total: data.current.totalDevices ?? 1, color: "bg-blue-500", listKey: "encrypted" },
              { key: "unencrypted", icon: <XCircle size={14} className="text-orange-400" />, label: "Unencrypted Devices", value: data.current.unencryptedDevices ?? 0, total: data.current.totalDevices ?? 1, color: "bg-orange-500", listKey: "unencrypted" },
              { key: "stale", icon: <Clock size={14} className="text-yellow-400" />, label: "Stale Devices (7d+)", value: data.current.staleDevices ?? 0, total: data.current.totalDevices ?? 1, color: "bg-yellow-500", listKey: "stale" },
            ].map((item) => {
              const pct = item.total > 0 ? Math.round((item.value / item.total) * 100) : 0;
              const isExpanded = expandedCategory === item.key;
              const deviceList = (data.deviceLists?.[item.listKey] || []) as PostureDevice[];
              return (
                <div key={item.key} className="bg-gray-800/30 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setExpandedCategory(isExpanded ? null : item.key)}
                    className="w-full px-4 py-3 hover:bg-gray-800/50 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        {item.icon}
                        <span className="text-xs text-gray-300">{item.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">{item.value}</span>
                        <span className="text-[10px] text-gray-500">/ {item.total} ({pct}%)</span>
                        <span className="text-gray-600">{isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${item.color} transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-gray-700/30 px-4 py-2">
                      {deviceList.length === 0 ? (
                        <p className="text-[11px] text-gray-500 py-2">No devices in this category</p>
                      ) : (
                        <div className="space-y-1 max-h-48 overflow-y-auto">
                          {deviceList.map((d, i) => (
                            <div key={i} className="flex items-center gap-2 py-1.5 hover:bg-gray-800/30 rounded px-1">
                              <DeviceLink name={d.deviceName} className="text-[11px] flex-1 min-w-0" />
                              {d.userPrincipalName && (
                                <UserDrillLink upn={d.userPrincipalName} className="text-[10px] truncate max-w-28" />
                              )}
                              <span className="text-[10px] text-gray-600 shrink-0">{d.operatingSystem}</span>
                              <TroubleshootDrillLink deviceName={d.deviceName} className="text-[9px] shrink-0" />
                              <TimelineDrillLink deviceName={d.deviceName} className="text-[9px] shrink-0" />
                              {item.key === "stale" && d.lastSyncDateTime && (
                                <span className="text-[10px] text-yellow-400 shrink-0">{Math.round((Date.now() - new Date(d.lastSyncDateTime).getTime()) / 86400000)}d ago</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ─── Security Checklist ──────────────────────────────── */}
        <div className="px-5 pb-4">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Security Checklist</h3>
          <div className="space-y-1.5">
            {[
              { label: "All devices compliant", pass: (data.current.nonCompliantDevices ?? 0) === 0, detail: `${data.current.nonCompliantDevices ?? 0} non-compliant` },
              { label: "All devices encrypted", pass: encryption >= 100, detail: `${encryption}% encrypted` },
              { label: "No stale devices", pass: (data.current.staleDevices ?? 0) === 0, detail: `${data.current.staleDevices ?? 0} stale` },
              { label: "Fleet fully managed", pass: (data.current.totalDevices ?? 0) > 0, detail: `${data.current.totalDevices ?? 0} devices` },
            ].map((check) => (
              <div key={check.label} className={`flex items-center gap-3 px-3 py-2 rounded-lg ${check.pass ? "bg-green-500/5 border border-green-500/20" : "bg-red-500/5 border border-red-500/20"}`}>
                {check.pass ? <CheckCircle2 size={14} className="text-green-400 shrink-0" /> : <AlertTriangle size={14} className="text-red-400 shrink-0" />}
                <span className="text-xs text-gray-300 flex-1">{check.label}</span>
                <span className={`text-[10px] ${check.pass ? "text-green-400" : "text-red-400"}`}>{check.detail}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ─── Footer ──────────────────────────────────────────── */}
        <div className="px-5 py-3 border-t border-gray-800">
          <p className="text-[10px] text-gray-600">Generated {new Date(data.generatedAt).toLocaleString()} · {data.period} trend window · {data.availableMetrics.length} metrics tracked</p>
        </div>
      </div>
    </div>
  );
}
