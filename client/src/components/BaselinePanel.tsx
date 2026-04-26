import { useEffect, useState, useCallback } from "react";
import { useActivityStore } from "../stores/activityStore.ts";
import { Loader2, Database, Plus, Trash2, GitCompare, RefreshCw, ArrowRight, Minus, CheckCircle2 } from "lucide-react";

interface Snapshot { id: number; name: string; description: string; createdAt: string; stats: { compliancePolicies: number; configProfiles: number; caPolicies: number }; }
interface DriftChange { property: string; was: unknown; now: unknown; }
interface DriftResult { snapshotName: string; snapshotDate: string; added: Array<{ type: string; displayName: string }>; removed: Array<{ type: string; displayName: string }>; modified: Array<{ type: string; displayName: string; changes: DriftChange[] }>; }

export default function BaselinePanel() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isTaking, setIsTaking] = useState(false);
  const [drift, setDrift] = useState<DriftResult | null>(null);
  const [driftLoading, setDriftLoading] = useState(false);
  const [newName, setNewName] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const fetchSnapshots = useCallback(async () => {
    try { const res = await fetch("/api/baselines"); setSnapshots((await res.json()).snapshots || []); } catch { /* */ }
  }, []);

  useEffect(() => { fetchSnapshots(); }, [fetchSnapshots]);

  const takeSnapshot = async () => {
    if (!newName.trim() || isTaking) return;
    setIsTaking(true);
    try { await fetch("/api/baselines", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newName.trim() }) }); setNewName(""); setShowCreate(false); fetchSnapshots(); }
    catch { /* */ } finally { setIsTaking(false); }
  };

  const deleteSnapshot = async (id: number) => {
    await fetch(`/api/baselines/${id}`, { method: "DELETE" }); fetchSnapshots(); setDrift(null);
  };

  const compareDrift = async (id: number) => {
    setDriftLoading(true); setDrift(null);
    try { const res = await fetch(`/api/baselines/${id}/drift`); setDrift(await res.json()); }
    catch { /* */ } finally { setDriftLoading(false); }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <Database size={16} className="text-brand-400" />
          <h2 className="text-sm font-semibold text-gray-200">Config Baselines</h2>
        </div>
        <button onClick={() => setShowCreate(!showCreate)} className="flex items-center gap-1 px-2 py-1 text-xs text-brand-400 hover:text-brand-300 hover:bg-gray-700 rounded transition-colors">
          <Plus size={12} /> Take Snapshot
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {showCreate && (
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3 flex gap-2">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Snapshot name (e.g. Pre-Migration Baseline)"
              className="flex-1 bg-gray-800 text-gray-200 text-xs rounded px-3 py-2 border border-gray-700 focus:border-brand-500 focus:outline-none" />
            <button onClick={takeSnapshot} disabled={!newName.trim() || isTaking}
              className="flex items-center gap-1 bg-brand-600 hover:bg-brand-700 disabled:bg-gray-700 text-white text-xs px-3 py-2 rounded transition-colors">
              {isTaking ? <Loader2 size={12} className="animate-spin" /> : <Database size={12} />} Save
            </button>
          </div>
        )}

        {snapshots.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <Database size={40} className="mb-3 text-gray-600" />
            <p className="text-sm font-medium text-gray-400">No baselines saved</p>
            <p className="text-xs text-gray-600 mt-1">Take a snapshot to track configuration drift over time</p>
          </div>
        ) : (
          <div className="space-y-2">
            {snapshots.map((s) => (
              <div key={s.id} className="bg-gray-800/30 border border-gray-700/40 rounded-lg px-4 py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-gray-200">{s.name}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">{new Date(s.createdAt).toLocaleString()} · {s.stats.compliancePolicies} compliance · {s.stats.configProfiles} config · {s.stats.caPolicies} CA</p>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => compareDrift(s.id)} className="p-1.5 text-gray-400 hover:text-brand-400 hover:bg-gray-700 rounded transition-colors" title="Compare with current">
                      <GitCompare size={13} />
                    </button>
                    <button onClick={() => deleteSnapshot(s.id)} className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded transition-colors" title="Delete">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {driftLoading && <div className="flex items-center justify-center py-8"><Loader2 size={20} className="animate-spin text-gray-500" /></div>}

        {drift && (
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Drift from "{drift.snapshotName}"</h3>
            <div className="flex gap-3 mb-3">
              <span className="text-xs text-green-400">{drift.added.length} added</span>
              <span className="text-xs text-red-400">{drift.removed.length} removed</span>
              <span className="text-xs text-yellow-400">{drift.modified.length} modified</span>
            </div>
            {drift.added.length === 0 && drift.removed.length === 0 && drift.modified.length === 0 && (
              <p className="text-xs text-green-400 flex items-center gap-1"><CheckCircle2 size={12} /> No drift detected — current config matches the baseline</p>
            )}
            {drift.added.map((a, i) => (
              <div key={`a${i}`} className="flex items-center gap-2 px-3 py-1.5 rounded bg-green-500/5 mb-1">
                <Plus size={12} className="text-green-400" />
                <span className="text-xs text-gray-300">{a.type}: {a.displayName}</span>
                <span className="text-[10px] text-green-400 ml-auto">Added</span>
              </div>
            ))}
            {drift.removed.map((r, i) => (
              <div key={`r${i}`} className="flex items-center gap-2 px-3 py-1.5 rounded bg-red-500/5 mb-1">
                <Minus size={12} className="text-red-400" />
                <span className="text-xs text-gray-300">{r.type}: {r.displayName}</span>
                <span className="text-[10px] text-red-400 ml-auto">Removed</span>
              </div>
            ))}
            {drift.modified.map((m, i) => (
              <div key={`m${i}`} className="bg-yellow-500/5 rounded-lg px-3 py-2 mb-1">
                <p className="text-xs text-gray-200 flex items-center gap-1"><ArrowRight size={11} className="text-yellow-400" /> {m.type}: {m.displayName}</p>
                {m.changes.map((c, ci) => (
                  <p key={ci} className="text-[10px] text-gray-500 ml-4 mt-0.5">{c.property}: <span className="text-red-400">{JSON.stringify(c.was)}</span> → <span className="text-green-400">{JSON.stringify(c.now)}</span></p>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
