import { useState, useEffect, useRef } from "react";
import { Loader2, Search, Monitor } from "lucide-react";
import { useNavigationStore } from "../stores/navigationStore.ts";
import { useActivity } from "../hooks/useActivity.ts";

export default function QueryBuilderPanel() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string | null>(null);
  const [devices, setDevices] = useState<Record<string, unknown>[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const autoRunRef = useRef(false);
  const { wrap } = useActivity("query-builder");

  // Auto-fill and auto-run from cross-panel navigation
  const pendingNav = useNavigationStore((s) => s.pendingNavigation);
  const clearNavigation = useNavigationStore((s) => s.clearNavigation);

  useEffect(() => {
    if (pendingNav?.panel === "queryBuilder" && pendingNav.query && !isLoading) {
      setQuery(pendingNav.query);
      clearNavigation();
      autoRunRef.current = true;
    }
  }, [pendingNav, clearNavigation, isLoading]);

  useEffect(() => {
    if (autoRunRef.current && query && !isLoading) {
      autoRunRef.current = false;
      executeQuery(query);
    }
  }, [query]);

  const executeQuery = async (q: string) => {
    if (!q.trim() || isLoading) return;
    setIsLoading(true); setFilter(null); setDevices([]);
    await wrap(async () => {
      try {
        const res = await fetch("/api/query-builder", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: q.trim() }),
        });
        const data = await res.json();
        setFilter(data.filter || data.error);
        setDevices(data.devices || []);
        setTotalCount(data.totalCount || 0);
      } catch { /* ignore */ } finally { setIsLoading(false); }
    });
  };

  const runQuery = () => executeQuery(query);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-800">
        <Search size={16} className="text-brand-400" />
        <h2 className="text-sm font-semibold text-gray-200">Query Builder</h2>
        <span className="text-[10px] bg-brand-600/20 text-brand-400 px-1.5 py-0.5 rounded">Natural Language</span>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        <div>
          <label className="text-xs text-gray-400 font-medium mb-1.5 block">Describe the devices you want to find</label>
          <textarea value={query} onChange={(e) => setQuery(e.target.value)} rows={2} placeholder="e.g. Show me all non-compliant Windows devices that haven't synced in 2 weeks"
            className="w-full bg-gray-800 text-white text-sm rounded-lg px-3 py-2 border border-gray-700 focus:border-brand-500 focus:outline-none placeholder-gray-500 resize-none" />
          <div className="flex flex-wrap gap-1.5 mt-2">
            {["Non-compliant Windows devices", "Devices not synced in 7 days", "Personal iOS devices", "All compliant corporate devices"].map((s) => (
              <button key={s} onClick={() => setQuery(s)} className="text-[10px] px-2 py-1 rounded-md bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 border border-gray-700">{s}</button>
            ))}
          </div>
          <button onClick={runQuery} disabled={!query.trim() || isLoading}
            className="mt-3 flex items-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm px-4 py-2 rounded-lg transition-colors">
            {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} Search
          </button>
        </div>

        {filter && (
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2">
            <p className="text-[10px] text-gray-500 mb-1">Generated OData Filter:</p>
            <code className="text-xs text-brand-300 font-mono">{filter}</code>
          </div>
        )}

        {devices.length > 0 && (
          <div>
            <p className="text-xs text-gray-400 mb-2">{totalCount} device(s) found</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="border-b border-gray-700">
                  {["Device", "OS", "Version", "Compliance", "Owner", "User", "Last Sync"].map((h) => (
                    <th key={h} className="text-left py-2 px-2 text-gray-400 font-medium">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {devices.map((d, i) => (
                    <tr key={i} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                      <td className="py-1.5 px-2 text-gray-200 flex items-center gap-1"><Monitor size={11} className="text-gray-500" />{String(d.deviceName || "")}</td>
                      <td className="py-1.5 px-2 text-gray-400">{String(d.operatingSystem || "")}</td>
                      <td className="py-1.5 px-2 text-gray-400">{String(d.osVersion || "")}</td>
                      <td className="py-1.5 px-2"><span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${String(d.complianceState) === "compliant" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>{String(d.complianceState || "")}</span></td>
                      <td className="py-1.5 px-2 text-gray-400">{String(d.managedDeviceOwnerType || "")}</td>
                      <td className="py-1.5 px-2 text-gray-400 truncate max-w-24">{String(d.userPrincipalName || "")}</td>
                      <td className="py-1.5 px-2 text-gray-500 text-[10px]">{d.lastSyncDateTime ? new Date(String(d.lastSyncDateTime)).toLocaleDateString() : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
