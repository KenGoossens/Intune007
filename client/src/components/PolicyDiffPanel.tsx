import { useState, useEffect, useCallback } from "react";
import { useActivityStore } from "../stores/activityStore.ts";
import {
  Loader2,
  GitCompare,
  Copy,
  CheckCircle,
  XCircle,
  Minus,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  Plus,
} from "lucide-react";

interface PolicyDiffItem {
  property: string;
  policyA: unknown;
  policyB: unknown;
  status: "same" | "different" | "only_a" | "only_b";
}

interface PolicyDiffResult {
  policyA: { id: string; displayName: string; odataType: string };
  policyB: { id: string; displayName: string; odataType: string };
  totalProperties: number;
  sameCount: number;
  differentCount: number;
  onlyACount: number;
  onlyBCount: number;
  diffs: PolicyDiffItem[];
}

interface PolicyListItem {
  id: string;
  displayName: string;
  lastModifiedDateTime?: string;
}

const STATUS_STYLES: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  different: { label: "Changed", color: "text-yellow-400", bg: "bg-yellow-500/10", icon: <ArrowRight size={12} /> },
  only_a: { label: "Only in A", color: "text-red-400", bg: "bg-red-500/10", icon: <Minus size={12} /> },
  only_b: { label: "Only in B", color: "text-green-400", bg: "bg-green-500/10", icon: <Plus size={12} /> },
  same: { label: "Same", color: "text-gray-500", bg: "bg-gray-800/30", icon: <CheckCircle size={12} /> },
};

export default function PolicyDiffPanel() {
  const [policies, setPolicies] = useState<PolicyListItem[]>([]);
  const [policyType, setPolicyType] = useState<"compliance" | "configuration">("compliance");
  const [selectedA, setSelectedA] = useState("");
  const [selectedB, setSelectedB] = useState("");
  const [diffResult, setDiffResult] = useState<PolicyDiffResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCloning, setIsCloning] = useState(false);
  const [cloneResult, setCloneResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [cloneName, setCloneName] = useState("");
  const [showClone, setShowClone] = useState(false);
  const [showSame, setShowSame] = useState(false);

  const fetchPolicies = useCallback(async () => {
    try {
      const res = await fetch(`/api/policy-diff/policies?type=${policyType}`);
      const data = await res.json();
      setPolicies(data.policies || []);
    } catch { setPolicies([]); }
  }, [policyType]);

  useEffect(() => { fetchPolicies(); }, [fetchPolicies]);

  const runDiff = async () => {
    if (!selectedA || !selectedB || isLoading) return;
    setIsLoading(true); useActivityStore.getState().addActivity("policy-diff");
    setDiffResult(null);
    setCloneResult(null);
    try {
      const res = await fetch("/api/policy-diff/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policyIdA: selectedA, policyIdB: selectedB, policyType }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setDiffResult(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false); useActivityStore.getState().removeActivity("policy-diff");
    }
  };

  const runClone = async () => {
    if (!selectedA || !cloneName.trim() || isCloning) return;
    setIsCloning(true);
    setCloneResult(null);
    try {
      const res = await fetch("/api/policy-diff/clone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourcePolicyId: selectedA, newDisplayName: cloneName.trim(), policyType }),
      });
      const data = await res.json();
      setCloneResult(data);
      if (data.success) fetchPolicies();
    } catch (err) {
      setCloneResult({ success: false, error: err instanceof Error ? err.message : String(err) });
    } finally {
      setIsCloning(false);
    }
  };

  const filteredDiffs = diffResult
    ? showSame ? diffResult.diffs : diffResult.diffs.filter((d) => d.status !== "same")
    : [];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-800">
        <GitCompare size={16} className="text-brand-400" />
        <h2 className="text-sm font-semibold text-gray-200">Policy Diff & Clone</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* Policy type + selectors */}
        <div className="space-y-2">
          <div className="flex gap-2">
            {(["compliance", "configuration"] as const).map((t) => (
              <button key={t} onClick={() => { setPolicyType(t); setDiffResult(null); }}
                className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${policyType === t ? "bg-brand-600/15 text-brand-400" : "bg-gray-800 text-gray-400 hover:text-gray-200"}`}>
                {t === "compliance" ? "Compliance Policies" : "Configuration Profiles"}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 block">Policy A</label>
              <select value={selectedA} onChange={(e) => setSelectedA(e.target.value)}
                className="w-full bg-gray-800 text-gray-200 text-xs rounded-lg px-3 py-2 border border-gray-700 focus:border-brand-500 focus:outline-none">
                <option value="">Select policy...</option>
                {policies.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 block">Policy B</label>
              <select value={selectedB} onChange={(e) => setSelectedB(e.target.value)}
                className="w-full bg-gray-800 text-gray-200 text-xs rounded-lg px-3 py-2 border border-gray-700 focus:border-brand-500 focus:outline-none">
                <option value="">Select policy...</option>
                {policies.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
              </select>
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={runDiff} disabled={!selectedA || !selectedB || isLoading}
              className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm px-4 py-2 rounded-lg transition-colors">
              {isLoading ? <Loader2 size={14} className="animate-spin" /> : <GitCompare size={14} />}
              Compare
            </button>
            <button onClick={() => setShowClone(!showClone)} disabled={!selectedA}
              className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 disabled:bg-gray-800 disabled:text-gray-600 text-gray-300 text-sm px-4 py-2 rounded-lg transition-colors border border-gray-700">
              <Copy size={14} /> Clone Policy A
            </button>
          </div>
        </div>

        {/* Clone form */}
        {showClone && selectedA && (
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3 space-y-2">
            <p className="text-xs text-gray-400">Clone <span className="text-gray-200">{policies.find((p) => p.id === selectedA)?.displayName}</span> as:</p>
            <input value={cloneName} onChange={(e) => setCloneName(e.target.value)} placeholder="New policy name"
              className="w-full bg-gray-800 text-gray-200 text-xs rounded px-3 py-2 border border-gray-700 focus:border-brand-500 focus:outline-none" />
            <button onClick={runClone} disabled={!cloneName.trim() || isCloning}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 text-white text-xs px-3 py-1.5 rounded-lg transition-colors">
              {isCloning ? <Loader2 size={12} className="animate-spin" /> : <Copy size={12} />} Clone
            </button>
            {cloneResult && (
              <p className={`text-xs flex items-center gap-1 ${cloneResult.success ? "text-green-400" : "text-red-400"}`}>
                {cloneResult.success ? <><CheckCircle size={12} /> Cloned successfully!</> : <><XCircle size={12} /> {cloneResult.error}</>}
              </p>
            )}
          </div>
        )}

        {/* Diff results */}
        {diffResult && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex gap-3">
                <span className="text-xs text-yellow-400">{diffResult.differentCount} changed</span>
                <span className="text-xs text-red-400">{diffResult.onlyACount} only in A</span>
                <span className="text-xs text-green-400">{diffResult.onlyBCount} only in B</span>
                <span className="text-xs text-gray-500">{diffResult.sameCount} same</span>
              </div>
              <button onClick={() => setShowSame(!showSame)} className="text-[10px] text-gray-500 hover:text-gray-300">
                {showSame ? "Hide" : "Show"} unchanged
              </button>
            </div>

            <div className="space-y-1">
              {filteredDiffs.map((diff) => {
                const style = STATUS_STYLES[diff.status];
                return (
                  <div key={diff.property} className={`flex items-center gap-2 px-3 py-2 rounded-lg ${style.bg}`}>
                    <span className={style.color}>{style.icon}</span>
                    <span className="text-xs font-medium text-gray-300 w-48 shrink-0 truncate">{diff.property}</span>
                    <span className="text-[11px] text-gray-400 flex-1 truncate font-mono" title={JSON.stringify(diff.policyA)}>
                      {diff.policyA !== undefined ? String(diff.policyA) : "—"}
                    </span>
                    {diff.status === "different" && <ArrowRight size={10} className="text-gray-600 shrink-0" />}
                    <span className="text-[11px] text-gray-400 flex-1 truncate font-mono" title={JSON.stringify(diff.policyB)}>
                      {diff.policyB !== undefined ? String(diff.policyB) : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
