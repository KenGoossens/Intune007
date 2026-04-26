import { useEffect, useState, useCallback } from "react";
import { useActivityStore } from "../stores/activityStore.ts";
import {
  Loader2, Shield, RefreshCw, AlertTriangle, AlertCircle, CheckCircle2,
  Info, ChevronDown, ChevronRight, Clock, ExternalLink, ShieldAlert,
  ShieldCheck, XCircle, Eye, CheckCircle, X,
} from "lucide-react";

interface CVEItem {
  cveId: string; title: string; description: string; severity: string;
  cvssScore: number; publishedDate: string; affectedProducts: string[];
  source: string; isExploited: boolean; relevanceScore: number;
  affectedDeviceCount: number; remediation: string | null;
  remediationType: string | null; status: string;
}

interface CVEStats {
  totalTracked: number; newCount: number; criticalCount: number;
  exploitedCount: number; remediatedCount: number; lastScan: string | null;
}

const SEV_STYLES: Record<string, { color: string; bg: string; border: string; icon: React.ReactNode }> = {
  critical: { color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/30", icon: <AlertCircle size={14} /> },
  high: { color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/30", icon: <AlertTriangle size={14} /> },
  medium: { color: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/30", icon: <Info size={14} /> },
  low: { color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/30", icon: <Info size={14} /> },
  unknown: { color: "text-gray-400", bg: "bg-gray-500/10", border: "border-gray-500/30", icon: <Info size={14} /> },
};

export default function CVEMonitorPanel() {
  const [stats, setStats] = useState<CVEStats | null>(null);
  const [cves, setCves] = useState<CVEItem[]>([]);
  const [isLoading, setIsLoading] = useState(false); useActivityStore.getState();
  const [isScanning, setIsScanning] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "new" | "critical" | "exploited">("all");

  const fetchData = useCallback(async () => {
    setIsLoading(true); useActivityStore.getState().addActivity("cve-monitor");
    try {
      const [statsRes, cvesRes] = await Promise.all([
        fetch("/api/cve/stats"),
        fetch("/api/cve?limit=50"),
      ]);
      setStats(await statsRes.json());
      const data = await cvesRes.json();
      setCves(data.cves || []);
    } catch { /* */ }
    finally { setIsLoading(false); useActivityStore.getState().removeActivity("cve-monitor"); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const runScan = async () => {
    setIsScanning(true); useActivityStore.getState().addActivity("cve-scan");
    try {
      await fetch("/api/cve/scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ daysBack: 7 }) });
      await fetchData();
    } catch { /* */ }
    finally { setIsScanning(false); useActivityStore.getState().removeActivity("cve-scan"); }
  };

  const updateStatus = async (cveId: string, status: string) => {
    try {
      await fetch(`/api/cve/${encodeURIComponent(cveId)}/status`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      setCves((prev) => prev.map((c) => c.cveId === cveId ? { ...c, status } : c));
    } catch { /* */ }
  };

  const filtered = cves.filter((c) => {
    if (filter === "new") return c.status === "new";
    if (filter === "critical") return c.severity === "critical";
    if (filter === "exploited") return c.isExploited;
    return true;
  });

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <ShieldAlert size={16} className="text-brand-400" />
          <h2 className="text-sm font-semibold text-gray-200">CVE Monitor</h2>
          {stats && stats.newCount > 0 && (
            <span className="text-[10px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full font-medium">{stats.newCount} new</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={runScan} disabled={isScanning} className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors disabled:opacity-50">
            {isScanning ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            {isScanning ? "Scanning..." : "Scan Now"}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* KPI Cards */}
        {stats && (
          <div className="grid grid-cols-5 gap-2 px-5 py-4">
            <button onClick={() => setFilter("all")} className={`border rounded-lg p-2 text-center transition-all ${filter === "all" ? "border-brand-500/40 bg-gray-700/50" : "border-gray-700/50 bg-gray-800/50 hover:border-gray-600"}`}>
              <p className="text-lg font-bold text-white">{stats.totalTracked}</p>
              <p className="text-[9px] text-gray-500">Tracked</p>
            </button>
            <button onClick={() => setFilter("new")} className={`border rounded-lg p-2 text-center transition-all ${filter === "new" ? "border-yellow-500/40 bg-yellow-500/10" : "border-gray-700/50 bg-gray-800/50 hover:border-gray-600"}`}>
              <p className="text-lg font-bold text-yellow-400">{stats.newCount}</p>
              <p className="text-[9px] text-gray-500">New</p>
            </button>
            <button onClick={() => setFilter("critical")} className={`border rounded-lg p-2 text-center transition-all ${filter === "critical" ? "border-red-500/40 bg-red-500/10" : "border-gray-700/50 bg-gray-800/50 hover:border-gray-600"}`}>
              <p className="text-lg font-bold text-red-400">{stats.criticalCount}</p>
              <p className="text-[9px] text-gray-500">Critical</p>
            </button>
            <button onClick={() => setFilter("exploited")} className={`border rounded-lg p-2 text-center transition-all ${filter === "exploited" ? "border-orange-500/40 bg-orange-500/10" : "border-gray-700/50 bg-gray-800/50 hover:border-gray-600"}`}>
              <p className="text-lg font-bold text-orange-400">{stats.exploitedCount}</p>
              <p className="text-[9px] text-gray-500">Exploited</p>
            </button>
            <div className="border border-green-500/20 bg-green-500/5 rounded-lg p-2 text-center">
              <p className="text-lg font-bold text-green-400">{stats.remediatedCount}</p>
              <p className="text-[9px] text-gray-500">Fixed</p>
            </div>
          </div>
        )}

        {stats?.lastScan && (
          <div className="px-5 pb-2 text-[10px] text-gray-600 flex items-center gap-1">
            <Clock size={10} /> Last scan: {new Date(stats.lastScan).toLocaleString()}
          </div>
        )}

        {/* CVE List */}
        {isLoading && cves.length === 0 ? (
          <div className="flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin text-gray-500" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <ShieldCheck size={32} className="mb-2 text-green-500" />
            <p className="text-sm text-gray-400">{cves.length === 0 ? "No CVEs scanned yet" : "No CVEs match this filter"}</p>
            {cves.length === 0 && <button onClick={runScan} className="mt-2 text-xs text-brand-400 hover:text-brand-300">Run first scan →</button>}
          </div>
        ) : (
          <div className="px-5 pb-4 space-y-1.5">
            {filtered.map((cve) => {
              const sev = SEV_STYLES[cve.severity] || SEV_STYLES.unknown;
              const isExpanded = expanded === cve.cveId;
              return (
                <div key={cve.cveId} className={`rounded-lg border ${sev.border} ${sev.bg} overflow-hidden`}>
                  <button onClick={() => setExpanded(isExpanded ? null : cve.cveId)} className="w-full flex items-start gap-2 px-3 py-2.5 text-left hover:bg-white/5 transition-colors">
                    <span className={`mt-0.5 ${sev.color}`}>{sev.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium uppercase ${sev.bg} ${sev.color} border ${sev.border}`}>{cve.severity}</span>
                        <span className="text-[10px] text-gray-500">CVSS {cve.cvssScore}</span>
                        {cve.isExploited && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 font-medium">⚠️ EXPLOITED</span>}
                        <span className="text-[10px] text-gray-600">{cve.relevanceScore}% relevant</span>
                      </div>
                      <p className="text-xs font-medium text-gray-200">{cve.cveId}</p>
                      <p className="text-[10px] text-gray-400 truncate">{cve.title !== cve.cveId ? cve.title : cve.description.substring(0, 100)}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {cve.affectedDeviceCount > 0 && <span className="text-[10px] text-gray-500">{cve.affectedDeviceCount} devices</span>}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${cve.status === "new" ? "bg-yellow-500/20 text-yellow-400" : cve.status === "remediated" ? "bg-green-500/20 text-green-400" : "bg-gray-700 text-gray-400"}`}>{cve.status}</span>
                      {isExpanded ? <ChevronDown size={13} className="text-gray-600" /> : <ChevronRight size={13} className="text-gray-600" />}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-3 pb-3 border-t border-white/5 space-y-2 pt-2">
                      <p className="text-xs text-gray-300 leading-relaxed">{cve.description.substring(0, 500)}</p>

                      {cve.remediation && (
                        <div className="bg-gray-800/60 rounded-md px-2.5 py-2">
                          <div className="flex items-center gap-1 text-[10px] font-medium text-brand-400 mb-0.5">
                            <Shield size={10} /> Recommended Remediation ({cve.remediationType || "general"})
                          </div>
                          <p className="text-xs text-gray-300 leading-relaxed">{cve.remediation}</p>
                        </div>
                      )}

                      <div className="flex items-center gap-3 text-[10px] text-gray-500">
                        <span>Source: {cve.source}</span>
                        <span>Published: {cve.publishedDate ? new Date(cve.publishedDate).toLocaleDateString() : "—"}</span>
                        {cve.affectedProducts.length > 0 && <span>Products: {cve.affectedProducts.slice(0, 3).join(", ")}</span>}
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <a href={`https://nvd.nist.gov/vuln/detail/${cve.cveId}`} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-colors">
                          <ExternalLink size={10} /> NVD Details
                        </a>
                        {cve.status !== "remediated" && (
                          <PrepareRemediationButton cveId={cve.cveId} description={cve.description} severity={cve.severity} remediationType={cve.remediationType} onRemediated={() => { updateStatus(cve.cveId, "remediated"); fetchData(); }} />
                        )}
                        {cve.status === "new" && (
                          <button onClick={() => updateStatus(cve.cveId, "reviewed")}
                            className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors">
                            <Eye size={10} /> Mark Reviewed
                          </button>
                        )}
                        {cve.status !== "remediated" && (
                          <button onClick={() => updateStatus(cve.cveId, "remediated")}
                            className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 transition-colors">
                            <CheckCircle size={10} /> Mark Fixed
                          </button>
                        )}
                        <button onClick={() => updateStatus(cve.cveId, "dismissed")}
                          className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded bg-gray-700 text-gray-400 hover:bg-gray-600 transition-colors">
                          <X size={10} /> Dismiss
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/** Inline component for the prepare → review → approve remediation workflow */
function PrepareRemediationButton({ cveId, description, severity, remediationType, onRemediated }: {
  cveId: string; description: string; severity: string; remediationType: string | null; onRemediated: () => void;
}) {
  const [state, setState] = useState<"idle" | "preparing" | "ready" | "executing" | "done" | "error">("idle");
  const [action, setAction] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [targetGroupId, setTargetGroupId] = useState("");
  const [groups, setGroups] = useState<Array<{ id: string; name: string }>>([]);

  const loadGroups = async () => {
    if (groups.length > 0) return;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "list security groups", history: [] }),
      });
      const data = await res.json();
      const groupData = (data.toolResults || []).flatMap((t: Record<string, unknown>) => (t.data || []) as Array<Record<string, unknown>>);
      const parsed = groupData.filter((g: Record<string, unknown>) => g.id && g.displayName).map((g: Record<string, unknown>) => ({ id: String(g.id), name: String(g.displayName) }));
      if (parsed.length > 0) setGroups(parsed);
    } catch { /* skip */ }
  };

  const prepare = async () => {
    setState("preparing");
    useActivityStore.getState().addActivity("cve-remediate");
    try {
      const [actionRes] = await Promise.all([
        fetch(`/api/cve/${encodeURIComponent(cveId)}/prepare`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description, severity, suggestedType: remediationType || "update" }),
        }),
        loadGroups(),
      ]);
      const data = await actionRes.json();
      setAction(data);
      setState("ready");
    } catch {
      setError("Failed to prepare action");
      setState("error");
    } finally {
      useActivityStore.getState().removeActivity("cve-remediate");
    }
  };

  const approve = async () => {
    if (!action?.id) return;
    setState("executing");
    useActivityStore.getState().addActivity("cve-execute");
    try {
      const res = await fetch(`/api/cve/actions/${action.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetGroupId: targetGroupId || undefined }),
      });
      const data = await res.json();
      if (data.status === "completed") {
        setState("done");
        onRemediated();
      } else {
        setError(data.error || "Execution failed");
        setState("error");
      }
    } catch {
      setError("Network error during execution");
      setState("error");
    } finally {
      useActivityStore.getState().removeActivity("cve-execute");
    }
  };

  const reject = async () => {
    if (!action?.id) return;
    await fetch(`/api/cve/actions/${action.id}/reject`, { method: "POST" });
    setState("idle");
    setAction(null);
  };

  if (state === "idle") {
    return (
      <button onClick={prepare}
        className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded bg-brand-500/10 text-brand-400 border border-brand-500/20 hover:bg-brand-500/20 transition-colors">
        <Shield size={10} /> Prepare Auto-Fix
      </button>
    );
  }

  if (state === "preparing") {
    return (
      <span className="flex items-center gap-1 px-2 py-1 text-[10px] text-brand-400">
        <Loader2 size={10} className="animate-spin" /> Generating remediation action...
      </span>
    );
  }

  if (state === "ready" && action) {
    return (
      <div className="w-full mt-2 bg-brand-500/5 border border-brand-500/20 rounded-lg p-2.5 space-y-2">
        <div className="flex items-center gap-1 text-[10px] font-medium text-brand-400">
          <Shield size={10} /> Prepared Action: {String(action.title)}
        </div>
        <p className="text-[10px] text-gray-300">{String(action.description)}</p>
        <div className="text-[10px] text-gray-500">Type: {String(action.actionType)} · Status: awaiting approval</div>

        {/* Target group selector */}
        <div className="flex items-center gap-2">
          <label className="text-[10px] text-gray-400 shrink-0">Assign to group:</label>
          {groups.length > 0 ? (
            <select
              value={targetGroupId}
              onChange={(e) => setTargetGroupId(e.target.value)}
              className="flex-1 bg-gray-800 text-gray-300 text-[10px] rounded px-2 py-1 border border-gray-700 focus:border-brand-500 focus:outline-none"
            >
              <option value="">— No assignment (create only) —</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          ) : (
            <input
              value={targetGroupId}
              onChange={(e) => setTargetGroupId(e.target.value)}
              placeholder="Paste group ID (optional)"
              className="flex-1 bg-gray-800 text-gray-300 text-[10px] rounded px-2 py-1 border border-gray-700 focus:border-brand-500 focus:outline-none"
            />
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button onClick={approve}
            className="flex items-center gap-1 px-3 py-1.5 text-[10px] font-semibold rounded bg-green-600 hover:bg-green-700 text-white transition-colors">
            <CheckCircle size={10} /> Approve & Execute
          </button>
          <button onClick={reject}
            className="flex items-center gap-1 px-2 py-1.5 text-[10px] font-medium rounded bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors">
            <X size={10} /> Reject
          </button>
        </div>
      </div>
    );
  }

  if (state === "executing") {
    return (
      <span className="flex items-center gap-1 px-2 py-1 text-[10px] text-green-400">
        <Loader2 size={10} className="animate-spin" /> Executing remediation...
      </span>
    );
  }

  if (state === "done") {
    return (
      <span className="flex items-center gap-1 px-2 py-1 text-[10px] text-green-400">
        <CheckCircle size={10} /> Remediation applied!
      </span>
    );
  }

  return (
    <span className="text-[10px] text-red-400">{error || "Error"}</span>
  );
}
