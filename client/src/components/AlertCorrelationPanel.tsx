import { useEffect, useState, useCallback } from "react";
import { Loader2, Link2, RefreshCw, AlertCircle, AlertTriangle, Info } from "lucide-react";

interface Correlation { pattern: string; severity: "critical" | "warning" | "info"; description: string; affectedDevices: string[]; suggestedCause: string; }
interface CorrelationData { generatedAt: string; totalDevices: number; correlations: Correlation[]; count: number; }

const SEV = { critical: { icon: <AlertCircle size={14} />, color: "text-red-400", bg: "bg-red-500/5", border: "border-red-500/20" }, warning: { icon: <AlertTriangle size={14} />, color: "text-yellow-400", bg: "bg-yellow-500/5", border: "border-yellow-500/20" }, info: { icon: <Info size={14} />, color: "text-blue-400", bg: "bg-blue-500/5", border: "border-blue-500/20" } };

export default function AlertCorrelationPanel() {
  const [data, setData] = useState<CorrelationData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try { const res = await fetch("/api/alert-correlation"); setData(await res.json()); }
    catch { /* */ } finally { setIsLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (isLoading && !data) return <div className="flex items-center justify-center h-full"><Loader2 size={24} className="animate-spin text-gray-500" /></div>;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <Link2 size={16} className="text-brand-400" />
          <h2 className="text-sm font-semibold text-gray-200">Alert Correlation</h2>
          {data && <span className="text-[10px] bg-gray-700 text-gray-400 px-2 py-0.5 rounded-full">{data.count} pattern(s)</span>}
        </div>
        <button onClick={fetchData} disabled={isLoading} className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors">
          {isLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Refresh
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-3">
        {data && data.correlations.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <Link2 size={40} className="mb-3 text-gray-600" />
            <p className="text-sm font-medium text-gray-400">No patterns detected</p>
            <p className="text-xs text-gray-600 mt-1">Alert correlation checks for OS-specific failures, sync clusters, encryption gaps, and ownership differences</p>
          </div>
        )}
        {data?.correlations.map((c, i) => {
          const s = SEV[c.severity];
          return (
            <div key={i} className={`${s.bg} border ${s.border} rounded-lg p-4`}>
              <div className="flex items-start gap-3">
                <span className={`mt-0.5 ${s.color}`}>{s.icon}</span>
                <div className="flex-1">
                  <p className="text-xs font-semibold text-gray-200">{c.pattern}</p>
                  <p className="text-xs text-gray-400 mt-1">{c.description}</p>
                  <div className="mt-2 bg-gray-800/30 rounded px-3 py-2">
                    <p className="text-[10px] text-gray-500 mb-1">Suggested Cause</p>
                    <p className="text-xs text-gray-300">{c.suggestedCause}</p>
                  </div>
                  <p className="text-[10px] text-gray-600 mt-2">Affected: {c.affectedDevices.slice(0, 5).join(", ")}{c.affectedDevices.length > 5 ? ` +${c.affectedDevices.length - 5} more` : ""}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
