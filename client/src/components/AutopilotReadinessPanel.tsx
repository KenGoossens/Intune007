import { useState, useEffect, useCallback } from "react";
import { useActivityStore } from "../stores/activityStore.ts";
import {
  Loader2, Plane, CheckCircle2, XCircle, AlertTriangle, Info, RefreshCw,
  ChevronDown, ChevronRight, Monitor, Search, Upload, Clock, ArrowRight,
} from "lucide-react";
import DeviceLink from "./DeviceLink.tsx";

// ─── Types ───────────────────────────────────────────────────────

interface PipelineStage { stage: string; label: string; count: number; percentage: number; color: string; }
interface AutopilotDevice {
  id: string; serialNumber: string; model: string; manufacturer: string;
  groupTag: string; enrollmentState: string; profileAssignmentStatus: string;
  profileAssignedDate: string | null; lastContactedDateTime: string | null;
  stage: string; stageLabel: string; stageOrder: number;
  managedDeviceId: string | null; userPrincipalName: string | null;
  intuneDeviceName: string | null; complianceState: string | null;
  osVersion: string | null; lastSyncDateTime: string | null;
}
interface PipelineData {
  totalDevices: number; stages: PipelineStage[]; devices: AutopilotDevice[];
  profiles: Array<{ id: string; displayName: string; description: string }>;
  generatedAt: string;
}
interface ReadinessCheck { step: string; status: "pass" | "fail" | "warning" | "info"; detail: string; }

// ─── Stage Colors + Icons ────────────────────────────────────────

const STAGE_STYLES: Record<string, { bg: string; border: string; text: string; icon: React.ReactNode }> = {
  registered: { bg: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-400", icon: <Upload size={12} /> },
  profile_assigned: { bg: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-400", icon: <CheckCircle2 size={12} /> },
  awaiting_enrollment: { bg: "bg-purple-500/10", border: "border-purple-500/30", text: "text-purple-400", icon: <Clock size={12} /> },
  enrolling: { bg: "bg-cyan-500/10", border: "border-cyan-500/30", text: "text-cyan-400", icon: <Loader2 size={12} className="animate-spin" /> },
  enrolled: { bg: "bg-green-500/10", border: "border-green-500/30", text: "text-green-400", icon: <CheckCircle2 size={12} /> },
  failed: { bg: "bg-red-500/10", border: "border-red-500/30", text: "text-red-400", icon: <XCircle size={12} /> },
};

// ─── Main Panel ──────────────────────────────────────────────────

export default function AutopilotReadinessPanel() {
  const [tab, setTab] = useState<"pipeline" | "check" | "onboard">("pipeline");
  const [pipeline, setPipeline] = useState<PipelineData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedStage, setExpandedStage] = useState<string | null>(null);

  // Check tab state
  const [serialNumber, setSerialNumber] = useState("");
  const [checks, setChecks] = useState<ReadinessCheck[] | null>(null);
  const [readinessScore, setReadinessScore] = useState<number | null>(null);
  const [checkLoading, setCheckLoading] = useState(false);

  // Onboard tab state
  const [onboardSerial, setOnboardSerial] = useState("");
  const [onboardHash, setOnboardHash] = useState("");
  const [onboardGroupTag, setOnboardGroupTag] = useState("");
  const [onboardLoading, setOnboardLoading] = useState(false);
  const [onboardResult, setOnboardResult] = useState<Record<string, unknown> | null>(null);

  const fetchPipeline = useCallback(async () => {
    setIsLoading(true);
    useActivityStore.getState().addActivity("autopilot-pipeline");
    try {
      const res = await fetch("/api/autopilot-readiness/pipeline");
      if (res.ok) setPipeline(await res.json());
    } catch { /* */ }
    finally { setIsLoading(false); useActivityStore.getState().removeActivity("autopilot-pipeline"); }
  }, []);

  useEffect(() => { if (tab === "pipeline") fetchPipeline(); }, [tab, fetchPipeline]);

  const runCheck = async () => {
    if (!serialNumber.trim()) return;
    setCheckLoading(true); setChecks(null); setReadinessScore(null);
    useActivityStore.getState().addActivity("autopilot-check");
    try {
      const res = await fetch("/api/autopilot-readiness/check", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serialNumber: serialNumber.trim() }),
      });
      const data = await res.json();
      setChecks(data.checks || []);
      setReadinessScore(data.readinessScore ?? 0);
    } catch { /* */ }
    finally { setCheckLoading(false); useActivityStore.getState().removeActivity("autopilot-check"); }
  };

  const runOnboard = async () => {
    if (!onboardSerial.trim() || !onboardHash.trim()) return;
    setOnboardLoading(true); setOnboardResult(null);
    useActivityStore.getState().addActivity("autopilot-onboard");
    try {
      const res = await fetch("/api/autopilot-readiness/onboard", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serialNumber: onboardSerial.trim(), hardwareHash: onboardHash.trim(), groupTag: onboardGroupTag.trim() || undefined }),
      });
      setOnboardResult(await res.json());
    } catch { /* */ }
    finally { setOnboardLoading(false); useActivityStore.getState().removeActivity("autopilot-onboard"); }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header + Tabs */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <Plane size={16} className="text-brand-400" />
          <h2 className="text-sm font-semibold text-gray-200">Autopilot</h2>
        </div>
        <div className="flex bg-gray-800 rounded-lg p-0.5 text-[11px]">
          {(["pipeline", "check", "onboard"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-1 rounded-md transition-colors capitalize ${tab === t ? "bg-gray-700 text-white" : "text-gray-400 hover:text-gray-300"}`}>
              {t === "pipeline" ? "Pipeline" : t === "check" ? "Readiness Check" : "Onboard Device"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* ════════ PIPELINE TAB ════════ */}
        {tab === "pipeline" && (
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500">{pipeline ? `${pipeline.totalDevices} Autopilot devices` : ""}</p>
              <button onClick={fetchPipeline} disabled={isLoading} className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors">
                {isLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Refresh
              </button>
            </div>

            {isLoading && !pipeline ? (
              <div className="flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin text-gray-500" /></div>
            ) : pipeline ? (
              <>
                {/* Pipeline flow visualization */}
                <div className="flex items-center gap-1">
                  {pipeline.stages.map((s, i) => {
                    const style = STAGE_STYLES[s.stage] || STAGE_STYLES.registered;
                    return (
                      <div key={s.stage} className="flex items-center flex-1">
                        <button
                          onClick={() => setExpandedStage(expandedStage === s.stage ? null : s.stage)}
                          className={`flex-1 ${style.bg} border ${style.border} rounded-lg p-3 text-center hover:brightness-125 transition-all ${expandedStage === s.stage ? "ring-2 ring-white/20" : ""}`}
                        >
                          <div className={`flex items-center justify-center gap-1 ${style.text} mb-1`}>
                            {style.icon}
                            <span className="text-lg font-bold">{s.count}</span>
                          </div>
                          <p className="text-[9px] text-gray-400">{s.label}</p>
                          <p className="text-[8px] text-gray-600">{s.percentage}%</p>
                        </button>
                        {i < pipeline.stages.length - 1 && <ArrowRight size={12} className="text-gray-700 shrink-0 mx-0.5" />}
                      </div>
                    );
                  })}
                </div>

                {/* Progress bar */}
                <div className="h-2 rounded-full overflow-hidden flex bg-gray-800">
                  {pipeline.stages.map((s) => (
                    <div key={s.stage} style={{ width: `${s.percentage}%`, backgroundColor: s.color }} className="transition-all" />
                  ))}
                </div>

                {/* Expanded stage: device list */}
                {expandedStage && (
                  <div className="bg-gray-800/30 border border-gray-700/40 rounded-lg overflow-hidden">
                    <div className="px-3 py-2 border-b border-gray-700/30">
                      <p className="text-[10px] text-gray-400 uppercase tracking-wider">
                        {pipeline.stages.find((s) => s.stage === expandedStage)?.label} — {pipeline.devices.filter((d) => d.stage === expandedStage).length} devices
                      </p>
                    </div>
                    <div className="max-h-64 overflow-y-auto divide-y divide-gray-700/20">
                      {pipeline.devices.filter((d) => d.stage === expandedStage).map((d) => (
                        <div key={d.id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-800/40">
                          <Monitor size={12} className="text-gray-500 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-300 font-mono">{d.serialNumber}</span>
                              {d.intuneDeviceName && <DeviceLink name={d.intuneDeviceName} className="text-[10px]" />}
                            </div>
                            <p className="text-[10px] text-gray-500">{d.manufacturer} {d.model}{d.groupTag ? ` · ${d.groupTag}` : ""}</p>
                          </div>
                          <div className="text-right shrink-0">
                            {d.userPrincipalName && <p className="text-[10px] text-gray-400">{d.userPrincipalName}</p>}
                            {d.lastContactedDateTime && <p className="text-[9px] text-gray-600">Contact: {new Date(d.lastContactedDateTime).toLocaleDateString()}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* All devices table */}
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">All Autopilot Devices</p>
                  <div className="space-y-1">
                    {pipeline.devices.map((d) => {
                      const style = STAGE_STYLES[d.stage] || STAGE_STYLES.registered;
                      return (
                        <div key={d.id} className="flex items-center gap-2 px-3 py-2 rounded bg-gray-800/30 hover:bg-gray-800/50 transition-colors">
                          <span className={`${style.text} shrink-0`}>{style.icon}</span>
                          <span className="text-xs text-gray-300 font-mono w-28 shrink-0">{d.serialNumber}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${style.bg} ${style.text} border ${style.border} shrink-0`}>{d.stageLabel}</span>
                          <span className="text-[10px] text-gray-500 flex-1 truncate">{d.manufacturer} {d.model}</span>
                          {d.groupTag && <span className="text-[10px] text-gray-600">{d.groupTag}</span>}
                          {d.intuneDeviceName && <DeviceLink name={d.intuneDeviceName} className="text-[10px]" />}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Profiles */}
                {pipeline.profiles.length > 0 && (
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Deployment Profiles ({pipeline.profiles.length})</p>
                    <div className="flex flex-wrap gap-1.5">
                      {pipeline.profiles.map((p) => (
                        <span key={p.id} className="px-2 py-1 text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded">{p.displayName}</span>
                      ))}
                    </div>
                  </div>
                )}

                <p className="text-[9px] text-gray-600">Generated {new Date(pipeline.generatedAt).toLocaleString()}</p>
              </>
            ) : null}
          </div>
        )}

        {/* ════════ READINESS CHECK TAB ════════ */}
        {tab === "check" && (
          <div className="p-5 space-y-4">
            <div className="flex gap-2">
              <input value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} placeholder="Serial number"
                className="flex-1 bg-gray-800 text-white text-sm rounded-lg px-3 py-2 border border-gray-700 focus:border-brand-500 focus:outline-none placeholder-gray-500"
                onKeyDown={(e) => e.key === "Enter" && runCheck()} />
              <button onClick={runCheck} disabled={!serialNumber.trim() || checkLoading}
                className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm px-4 py-2 rounded-lg transition-colors">
                {checkLoading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} Check
              </button>
            </div>

            {readinessScore !== null && checks && (
              <div className="space-y-3">
                <div className="flex items-center gap-4">
                  <div className={`text-3xl font-bold ${readinessScore >= 80 ? "text-green-400" : readinessScore >= 50 ? "text-yellow-400" : "text-red-400"}`}>
                    {readinessScore}%
                  </div>
                  <p className="text-sm text-gray-300">
                    {readinessScore >= 80 ? "Ready for deployment" : readinessScore >= 50 ? "Partially ready" : "Not ready"}
                  </p>
                </div>
                <div className="space-y-1.5">
                  {checks.map((c, i) => (
                    <div key={i} className="flex items-start gap-2 px-3 py-2 rounded bg-gray-800/30">
                      {c.status === "pass" ? <CheckCircle2 size={14} className="text-green-400 mt-0.5 shrink-0" />
                        : c.status === "fail" ? <XCircle size={14} className="text-red-400 mt-0.5 shrink-0" />
                        : c.status === "warning" ? <AlertTriangle size={14} className="text-yellow-400 mt-0.5 shrink-0" />
                        : <Info size={14} className="text-blue-400 mt-0.5 shrink-0" />}
                      <div>
                        <p className="text-xs text-gray-200 font-medium">{c.step}</p>
                        <p className="text-[10px] text-gray-500">{c.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ════════ ONBOARD TAB ════════ */}
        {tab === "onboard" && (
          <div className="p-5 space-y-4">
            <div className="bg-gray-800/30 border border-gray-700/40 rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-200">Register New Device for Autopilot</h3>
              <p className="text-[10px] text-gray-500">Import a hardware hash to register a bare-metal device. Get the hash by running <code className="text-brand-400">Get-WindowsAutopilotInfo</code> on the device.</p>

              <div>
                <label className="text-[10px] text-gray-400 mb-1 block">Serial Number *</label>
                <input value={onboardSerial} onChange={(e) => setOnboardSerial(e.target.value)} placeholder="e.g., ABC123XYZ"
                  className="w-full bg-gray-800 text-white text-sm rounded px-3 py-2 border border-gray-700 focus:border-brand-500 focus:outline-none placeholder-gray-600" />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 mb-1 block">Hardware Hash (Base64) *</label>
                <textarea value={onboardHash} onChange={(e) => setOnboardHash(e.target.value)} placeholder="Paste the Base64 hardware hash..."
                  rows={3} className="w-full bg-gray-800 text-white text-xs font-mono rounded px-3 py-2 border border-gray-700 focus:border-brand-500 focus:outline-none placeholder-gray-600 resize-y" />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 mb-1 block">Group Tag (optional)</label>
                <input value={onboardGroupTag} onChange={(e) => setOnboardGroupTag(e.target.value)} placeholder="e.g., Sales-Dept"
                  className="w-full bg-gray-800 text-white text-sm rounded px-3 py-2 border border-gray-700 focus:border-brand-500 focus:outline-none placeholder-gray-600" />
              </div>

              <button onClick={runOnboard} disabled={!onboardSerial.trim() || !onboardHash.trim() || onboardLoading}
                className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm px-4 py-2 rounded-lg transition-colors">
                {onboardLoading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                {onboardLoading ? "Importing..." : "Import & Register"}
              </button>
            </div>

            {/* Onboarding result */}
            {onboardResult && (
              <div className={`rounded-lg border p-4 ${onboardResult.success ? "bg-green-500/5 border-green-500/20" : "bg-red-500/5 border-red-500/20"}`}>
                <p className={`text-sm font-medium mb-2 ${onboardResult.success ? "text-green-400" : "text-red-400"}`}>
                  {onboardResult.success ? "✅ Device Registered" : "❌ Registration Failed"}
                </p>
                <p className="text-xs text-gray-300 mb-2">{String(onboardResult.summary || "")}</p>
                {Array.isArray(onboardResult.steps) && (
                  <div className="space-y-1">
                    {(onboardResult.steps as Array<Record<string, unknown>>).map((step, i) => (
                      <div key={i} className="flex items-center gap-2 text-[10px]">
                        {step.status === "success" ? <CheckCircle2 size={11} className="text-green-400" />
                          : step.status === "failed" ? <XCircle size={11} className="text-red-400" />
                          : step.status === "skipped" ? <Info size={11} className="text-gray-500" />
                          : <Clock size={11} className="text-yellow-400" />}
                        <span className="text-gray-400">{String(step.name)}</span>
                        <span className="text-gray-500 flex-1 truncate">{String(step.detail)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* How to get the hardware hash */}
            <div className="bg-gray-800/20 border border-gray-700/30 rounded-lg p-3">
              <p className="text-[10px] text-gray-400 font-semibold mb-1">How to get the hardware hash:</p>
              <ol className="text-[10px] text-gray-500 space-y-1 list-decimal list-inside">
                <li>Boot the new device to OOBE or Windows desktop</li>
                <li>Open PowerShell as Administrator</li>
                <li>Run: <code className="text-brand-400">Install-Script -Name Get-WindowsAutopilotInfo -Force</code></li>
                <li>Run: <code className="text-brand-400">Get-WindowsAutopilotInfo -OutputFile C:\autopilot.csv</code></li>
                <li>Open the CSV — copy the Serial Number and Hardware Hash columns</li>
                <li>Paste them above and click "Import & Register"</li>
              </ol>
              <p className="text-[10px] text-gray-600 mt-2">Or use the agent: <em>"deploy hash collector to my devices"</em> for enrolled devices.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
