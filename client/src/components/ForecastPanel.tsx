import { useState } from "react";
import { useActivityStore } from "../stores/activityStore.ts";
import { Loader2, Target, AlertCircle, CheckCircle2, HelpCircle } from "lucide-react";

interface ForecastDevice { deviceName: string; userPrincipalName: string; currentValue: unknown; result: "pass" | "fail" | "unknown"; }
interface ForecastResult { requirement: string; totalDevices: number; wouldPass: number; wouldFail: number; wouldFailPercent: number; devices: ForecastDevice[]; }

const REQUIREMENTS = [
  { label: "Require BitLocker / Encryption", value: "encryption" },
  { label: "Require Compliance", value: "compliant" },
  { label: "Require Sync within 7 days", value: "synced_7days" },
  { label: "Require Sync within 14 days", value: "synced_14days" },
  { label: "Corporate ownership only", value: "corporate" },
  { label: "Windows devices only", value: "windows" },
];

const RESULT_ICONS = {
  pass: <CheckCircle2 size={13} className="text-green-400" />,
  fail: <AlertCircle size={13} className="text-red-400" />,
  unknown: <HelpCircle size={13} className="text-gray-500" />,
};

export default function ForecastPanel() {
  const [selected, setSelected] = useState("");
  const [result, setResult] = useState<ForecastResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const runForecast = async () => {
    if (!selected || isLoading) return;
    setIsLoading(true); useActivityStore.getState().addActivity("forecast");
    try {
      const res = await fetch("/api/forecast", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requirement: selected }),
      });
      setResult(await res.json());
    } catch { /* ignore */ } finally { setIsLoading(false); useActivityStore.getState().removeActivity("forecast"); }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-800">
        <Target size={16} className="text-brand-400" />
        <h2 className="text-sm font-semibold text-gray-200">Compliance Forecast</h2>
        <span className="text-[10px] bg-brand-600/20 text-brand-400 px-1.5 py-0.5 rounded">What-If</span>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        <div>
          <label className="text-xs text-gray-400 font-medium mb-1.5 block">What if I require...</label>
          <div className="grid grid-cols-2 gap-2">
            {REQUIREMENTS.map((r) => (
              <button key={r.value} onClick={() => setSelected(r.value)}
                className={`text-left px-3 py-2 rounded-lg text-xs transition-colors border ${selected === r.value ? "bg-brand-600/15 border-brand-500/30 text-brand-400" : "bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200"}`}>
                {r.label}
              </button>
            ))}
          </div>
          <button onClick={runForecast} disabled={!selected || isLoading}
            className="mt-3 flex items-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm px-4 py-2 rounded-lg transition-colors">
            {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Target size={14} />} Run Forecast
          </button>
        </div>

        {result && (
          <div>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-white">{result.totalDevices}</p>
                <p className="text-[10px] text-gray-500">Total Devices</p>
              </div>
              <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-green-400">{result.wouldPass}</p>
                <p className="text-[10px] text-gray-500">Would Pass</p>
              </div>
              <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-red-400">{result.wouldFail}</p>
                <p className="text-[10px] text-gray-500">Would Fail ({result.wouldFailPercent}%)</p>
              </div>
            </div>

            <div className="h-3 rounded-full overflow-hidden bg-gray-800 mb-4">
              <div className="h-full bg-green-500 transition-all" style={{ width: `${100 - result.wouldFailPercent}%` }} />
            </div>

            <p className="text-xs text-gray-400 mb-2">Device Details ({result.devices.length})</p>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {result.devices.map((d, i) => (
                <div key={i} className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs ${d.result === "fail" ? "bg-red-500/5" : d.result === "pass" ? "bg-green-500/5" : "bg-gray-800/30"}`}>
                  {RESULT_ICONS[d.result]}
                  <span className="text-gray-300 flex-1 truncate">{d.deviceName}</span>
                  <span className="text-gray-500 truncate max-w-32">{d.userPrincipalName}</span>
                  <span className="text-gray-600 font-mono text-[10px]">{String(d.currentValue ?? "—")}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
