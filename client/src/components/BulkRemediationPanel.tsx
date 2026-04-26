import { useState } from "react";
import { Loader2, Zap, Monitor, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";

type IssueType = "noncompliant" | "stale" | "unencrypted" | "outdated_os";

interface BulkDevice { id: string; deviceName: string; operatingSystem: string; osVersion: string; complianceState: string; isEncrypted: unknown; lastSyncDateTime: string; userPrincipalName: string; }
interface ExecResult { deviceId: string; success: boolean; error?: string; }

const ISSUE_TYPES: Array<{ value: IssueType; label: string; desc: string }> = [
  { value: "noncompliant", label: "Non-Compliant Devices", desc: "Devices failing compliance policies" },
  { value: "stale", label: "Stale Devices (14+ days)", desc: "Devices not syncing with Intune" },
  { value: "unencrypted", label: "Unencrypted Devices", desc: "Devices without disk encryption" },
  { value: "outdated_os", label: "Outdated OS", desc: "Windows devices on end-of-service versions" },
];

const ACTIONS = [
  { value: "syncDevice", label: "Sync All", desc: "Force sync with Intune" },
  { value: "rebootNow", label: "Restart All", desc: "Remote restart" },
];

export default function BulkRemediationPanel() {
  const [issueType, setIssueType] = useState<IssueType>("noncompliant");
  const [devices, setDevices] = useState<BulkDevice[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPreview, setIsPreview] = useState(false);
  const [isExec, setIsExec] = useState(false);
  const [execResults, setExecResults] = useState<ExecResult[] | null>(null);
  const [action, setAction] = useState("syncDevice");

  const preview = async () => {
    setIsPreview(true); setDevices([]); setSelected(new Set()); setExecResults(null);
    try {
      const res = await fetch(`/api/bulk-remediation/preview?issueType=${issueType}`);
      const data = await res.json();
      setDevices(data.devices || []);
      setSelected(new Set((data.devices || []).map((d: BulkDevice) => d.id)));
    } catch { /* */ } finally { setIsPreview(false); }
  };

  const execute = async () => {
    if (selected.size === 0 || isExec) return;
    setIsExec(true); setExecResults(null);
    try {
      const res = await fetch("/api/bulk-remediation/execute", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceIds: Array.from(selected), action }),
      });
      const data = await res.json();
      setExecResults(data.results || []);
    } catch { /* */ } finally { setIsExec(false); }
  };

  const toggleDevice = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const toggleAll = () => {
    setSelected(selected.size === devices.length ? new Set() : new Set(devices.map((d) => d.id)));
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-800">
        <Zap size={16} className="text-brand-400" />
        <h2 className="text-sm font-semibold text-gray-200">Bulk Remediation</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* Step 1: Select issue */}
        <div>
          <p className="text-xs text-gray-400 font-medium mb-2">1. Select issue type</p>
          <div className="grid grid-cols-2 gap-2">
            {ISSUE_TYPES.map((t) => (
              <button key={t.value} onClick={() => setIssueType(t.value)}
                className={`text-left px-3 py-2 rounded-lg text-xs border transition-colors ${issueType === t.value ? "bg-brand-600/15 border-brand-500/30 text-brand-400" : "bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200"}`}>
                <p className="font-medium">{t.label}</p>
                <p className="text-[10px] text-gray-500 mt-0.5">{t.desc}</p>
              </button>
            ))}
          </div>
          <button onClick={preview} disabled={isPreview}
            className="mt-3 flex items-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:bg-gray-700 text-white text-sm px-4 py-2 rounded-lg transition-colors">
            {isPreview ? <Loader2 size={14} className="animate-spin" /> : <Monitor size={14} />} Preview Affected Devices
          </button>
        </div>

        {/* Step 2: Review devices */}
        {devices.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-400 font-medium">2. Review ({selected.size}/{devices.length} selected)</p>
              <button onClick={toggleAll} className="text-[10px] text-brand-400 hover:text-brand-300">{selected.size === devices.length ? "Deselect all" : "Select all"}</button>
            </div>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {devices.map((d) => (
                <label key={d.id} className="flex items-center gap-2 px-3 py-1.5 rounded bg-gray-800/30 cursor-pointer hover:bg-gray-800/50">
                  <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggleDevice(d.id)} className="rounded border-gray-600" />
                  <span className="text-xs text-gray-300 flex-1 truncate">{d.deviceName}</span>
                  <span className="text-[10px] text-gray-500">{d.operatingSystem}</span>
                  <span className="text-[10px] text-gray-600 truncate max-w-24">{d.userPrincipalName}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Choose action & execute */}
        {devices.length > 0 && selected.size > 0 && (
          <div>
            <p className="text-xs text-gray-400 font-medium mb-2">3. Choose action</p>
            <div className="flex gap-2 mb-3">
              {ACTIONS.map((a) => (
                <button key={a.value} onClick={() => setAction(a.value)}
                  className={`px-3 py-2 rounded-lg text-xs border transition-colors ${action === a.value ? "bg-brand-600/15 border-brand-500/30 text-brand-400" : "bg-gray-800 border-gray-700 text-gray-400"}`}>
                  {a.label}
                </button>
              ))}
            </div>
            <button onClick={execute} disabled={isExec}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 text-white text-sm px-4 py-2 rounded-lg transition-colors">
              {isExec ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />} Execute on {selected.size} device(s)
            </button>
          </div>
        )}

        {/* Results */}
        {execResults && (
          <div>
            <p className="text-xs text-gray-400 font-medium mb-2">Results</p>
            <div className="flex gap-3 mb-2">
              <span className="text-xs text-green-400">{execResults.filter((r) => r.success).length} succeeded</span>
              <span className="text-xs text-red-400">{execResults.filter((r) => !r.success).length} failed</span>
            </div>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {execResults.map((r, i) => (
                <div key={i} className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs ${r.success ? "bg-green-500/5" : "bg-red-500/5"}`}>
                  {r.success ? <CheckCircle2 size={12} className="text-green-400" /> : <XCircle size={12} className="text-red-400" />}
                  <span className="text-gray-300">{devices.find((d) => d.id === r.deviceId)?.deviceName || r.deviceId}</span>
                  {r.error && <span className="text-[10px] text-red-400 ml-auto truncate max-w-48">{r.error}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
