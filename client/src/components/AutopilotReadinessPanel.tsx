import { useState } from "react";
import { useActivityStore } from "../stores/activityStore.ts";
import { Loader2, Rocket, CheckCircle2, XCircle, AlertTriangle, Info } from "lucide-react";

interface ReadinessCheck { step: string; status: "pass" | "fail" | "warning" | "info"; detail: string; }
interface ReadinessResult { serialNumber: string; deviceName: string; readinessScore: number; checks: ReadinessCheck[]; }

const STATUS_ICONS = {
  pass: <CheckCircle2 size={14} className="text-green-400" />,
  fail: <XCircle size={14} className="text-red-400" />,
  warning: <AlertTriangle size={14} className="text-yellow-400" />,
  info: <Info size={14} className="text-blue-400" />,
};

export default function AutopilotReadinessPanel() {
  const [serial, setSerial] = useState("");
  const [result, setResult] = useState<ReadinessResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const check = async () => {
    if (!serial.trim() || isLoading) return;
    setIsLoading(true); useActivityStore.getState().addActivity("autopilot-check"); setResult(null);
    try {
      const res = await fetch("/api/autopilot-readiness/check", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serialNumber: serial.trim() }),
      });
      setResult(await res.json());
    } catch { /* ignore */ } finally { setIsLoading(false); useActivityStore.getState().removeActivity("autopilot-check"); }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-800">
        <Rocket size={16} className="text-brand-400" />
        <h2 className="text-sm font-semibold text-gray-200">Autopilot Readiness</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        <div>
          <label className="text-xs text-gray-400 font-medium mb-1.5 block">Device Serial Number</label>
          <div className="flex gap-2">
            <input value={serial} onChange={(e) => setSerial(e.target.value)} placeholder="Enter serial number"
              className="flex-1 bg-gray-800 text-white text-sm rounded-lg px-3 py-2 border border-gray-700 focus:border-brand-500 focus:outline-none placeholder-gray-500"
              onKeyDown={(e) => e.key === "Enter" && check()} />
            <button onClick={check} disabled={!serial.trim() || isLoading}
              className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm px-4 py-2 rounded-lg transition-colors">
              {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />} Check
            </button>
          </div>
        </div>

        {result && (
          <div>
            <div className="flex items-center gap-4 mb-4">
              <div className="relative">
                <svg viewBox="0 0 100 100" className="w-20 h-20">
                  <circle cx="50" cy="50" r="42" fill="none" stroke="#1f2937" strokeWidth="6" />
                  <circle cx="50" cy="50" r="42" fill="none" stroke={result.readinessScore >= 80 ? "#22c55e" : result.readinessScore >= 50 ? "#eab308" : "#ef4444"}
                    strokeWidth="6" strokeDasharray={`${(result.readinessScore / 100) * 264} 264`} strokeLinecap="round" transform="rotate(-90 50 50)" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xl font-bold text-white">{result.readinessScore}%</span>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-200">Readiness Score</p>
                <p className="text-xs text-gray-500">{result.readinessScore >= 80 ? "Ready for deployment" : result.readinessScore >= 50 ? "Partially ready" : "Not ready"}</p>
              </div>
            </div>

            <div className="space-y-2">
              {result.checks.map((check, i) => (
                <div key={i} className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border ${check.status === "pass" ? "bg-green-500/5 border-green-500/20" : check.status === "fail" ? "bg-red-500/5 border-red-500/20" : check.status === "warning" ? "bg-yellow-500/5 border-yellow-500/20" : "bg-blue-500/5 border-blue-500/20"}`}>
                  <span className="mt-0.5 shrink-0">{STATUS_ICONS[check.status]}</span>
                  <div>
                    <p className="text-xs font-medium text-gray-200">{check.step}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">{check.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
