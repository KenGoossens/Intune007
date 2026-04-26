import { useEffect, useState } from "react";
import {
  BarChart3,
  RefreshCw,
  Loader2,
  Trash2,
  DollarSign,
  Zap,
  Clock,
  Hash,
  Wrench,
  AlertCircle,
  TrendingUp,
  Activity,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useAnalyticsStore } from "../stores/analyticsStore.ts";
import type { AnalyticsEntry, AnalyticsToolCall } from "@intune-agent/shared";

export default function AnalyticsPanel() {
  const { summary, loading, error, fetch: fetchAnalytics, clear } = useAnalyticsStore();
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);

  useEffect(() => {
    fetchAnalytics();
    const interval = setInterval(fetchAnalytics, 10_000);
    return () => clearInterval(interval);
  }, [fetchAnalytics]);

  if (!summary || summary.totalRequests === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <BarChart3 size={16} className="text-brand-400" />
            <h2 className="text-sm font-semibold text-gray-200">Analytics</h2>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center flex-1 text-gray-500 px-8">
          <Activity size={48} className="mb-4 text-gray-600" />
          <h3 className="text-lg font-medium text-gray-400 mb-2">No Analytics Yet</h3>
          <p className="text-sm text-center max-w-xs">Send messages to the agent to start tracking usage, costs, tools, and response times.</p>
        </div>
      </div>
    );
  }

  // Compute derived metrics
  const entries = summary.entries || [];
  const costPerToken = summary.totalTokens > 0 ? summary.totalCost / summary.totalTokens : 0;
  const avgToolsPerReq = summary.totalRequests > 0 ? summary.totalToolCalls / summary.totalRequests : 0;
  const avgCostPerReq = summary.totalRequests > 0 ? summary.totalCost / summary.totalRequests : 0;
  const maxResponseTime = entries.length > 0 ? Math.max(...entries.map((e) => e.totalDurationMs)) : 0;
  const minResponseTime = entries.length > 0 ? Math.min(...entries.map((e) => e.totalDurationMs)) : 0;
  const errorCount = entries.filter((e) => e.error).length;
  const errorRate = entries.length > 0 ? (errorCount / entries.length) * 100 : 0;

  // Tool usage breakdown
  const toolUsage = new Map<string, { count: number; totalMs: number; errors: number }>();
  for (const entry of entries) {
    for (const tc of entry.toolCalls) {
      const existing = toolUsage.get(tc.name) || { count: 0, totalMs: 0, errors: 0 };
      existing.count++;
      existing.totalMs += tc.durationMs;
      if (tc.error) existing.errors++;
      toolUsage.set(tc.name, existing);
    }
  }
  const toolStats = Array.from(toolUsage.entries())
    .map(([name, stats]) => ({ name, ...stats, avgMs: Math.round(stats.totalMs / stats.count) }))
    .sort((a, b) => b.count - a.count);

  const maxToolCount = toolStats.length > 0 ? toolStats[0].count : 1;

  // Cost over time (last N requests)
  const costTimeline = entries.slice(0, 20).reverse().map((e) => ({
    cost: e.estimatedCost,
    tokens: e.totalTokens,
    time: new Date(e.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  }));
  const maxCost = costTimeline.length > 0 ? Math.max(...costTimeline.map((c) => c.cost), 0.0001) : 1;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <BarChart3 size={16} className="text-brand-400" />
          <h2 className="text-sm font-semibold text-gray-200">Analytics</h2>
          <span className="text-[10px] bg-gray-700 text-gray-400 px-2 py-0.5 rounded-full">{summary.totalRequests} requests</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={clear} className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded-lg transition-colors" title="Clear">
            <Trash2 size={14} />
          </button>
          <button onClick={fetchAnalytics} disabled={loading} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors" title="Refresh">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {error && <div className="mx-5 mt-4 text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2 border border-red-500/30">{error}</div>}

        {/* ─── KPI Cards ──────────────────────────────────────── */}
        <div className="grid grid-cols-4 gap-3 px-5 py-4">
          <KPICard icon={<DollarSign size={14} />} label="Total Cost" value={`$${summary.totalCost.toFixed(4)}`} sub={`$${avgCostPerReq.toFixed(4)}/req`} color="text-green-400" bgColor="bg-green-500/5" borderColor="border-green-500/20" />
          <KPICard icon={<Hash size={14} />} label="Total Tokens" value={formatNumber(summary.totalTokens)} sub={`${formatNumber(Math.round(summary.avgTokensPerRequest))}/req`} color="text-blue-400" bgColor="bg-blue-500/5" borderColor="border-blue-500/20" />
          <KPICard icon={<Clock size={14} />} label="Avg Response" value={`${(summary.avgResponseMs / 1000).toFixed(1)}s`} sub={`${(minResponseTime / 1000).toFixed(1)}s — ${(maxResponseTime / 1000).toFixed(1)}s range`} color="text-yellow-400" bgColor="bg-yellow-500/5" borderColor="border-yellow-500/20" />
          <KPICard icon={<Wrench size={14} />} label="Tool Calls" value={formatNumber(summary.totalToolCalls)} sub={`${avgToolsPerReq.toFixed(1)}/req · ${toolStats.length} unique`} color="text-purple-400" bgColor="bg-purple-500/5" borderColor="border-purple-500/20" />
        </div>

        {/* ─── Cost & Token Timeline ──────────────────────────── */}
        <div className="px-5 pb-4">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Cost Per Request</h3>
          <div className="bg-gray-800/30 border border-gray-700/40 rounded-lg p-3">
            <div className="flex items-end gap-1 h-16">
              {costTimeline.map((c, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-0.5 group relative">
                  <div className="w-full bg-green-500/60 rounded-t-sm transition-all hover:bg-green-400/80" style={{ height: `${Math.max((c.cost / maxCost) * 100, 4)}%` }} />
                  <div className="hidden group-hover:block absolute -top-8 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-[9px] text-gray-300 whitespace-nowrap z-10">
                    ${c.cost.toFixed(4)} · {formatNumber(c.tokens)} tok
                  </div>
                </div>
              ))}
            </div>
            {costTimeline.length > 1 && (
              <div className="flex justify-between mt-1 text-[9px] text-gray-600">
                <span>{costTimeline[0]?.time}</span>
                <span>{costTimeline[costTimeline.length - 1]?.time}</span>
              </div>
            )}
          </div>
        </div>

        {/* ─── Token Distribution ─────────────────────────────── */}
        <div className="px-5 pb-4">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Token Distribution</h3>
          <div className="flex h-4 rounded-full overflow-hidden bg-gray-800">
            <div className="bg-blue-500 transition-all" style={{ width: `${(summary.totalPromptTokens / Math.max(summary.totalTokens, 1)) * 100}%` }} />
            <div className="bg-emerald-500 transition-all" style={{ width: `${(summary.totalCompletionTokens / Math.max(summary.totalTokens, 1)) * 100}%` }} />
          </div>
          <div className="flex justify-between mt-1.5">
            <span className="flex items-center gap-1.5 text-[11px] text-gray-400">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
              Prompt: {formatNumber(summary.totalPromptTokens)} ({((summary.totalPromptTokens / Math.max(summary.totalTokens, 1)) * 100).toFixed(0)}%)
            </span>
            <span className="flex items-center gap-1.5 text-[11px] text-gray-400">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              Completion: {formatNumber(summary.totalCompletionTokens)} ({((summary.totalCompletionTokens / Math.max(summary.totalTokens, 1)) * 100).toFixed(0)}%)
            </span>
          </div>
        </div>

        {/* ─── Error Rate ─────────────────────────────────────── */}
        {errorCount > 0 && (
          <div className="px-5 pb-4">
            <div className="flex items-center gap-2 bg-red-500/5 border border-red-500/20 rounded-lg px-3 py-2">
              <AlertCircle size={14} className="text-red-400" />
              <span className="text-xs text-red-400">{errorCount} error(s) — {errorRate.toFixed(0)}% error rate</span>
            </div>
          </div>
        )}

        {/* ─── Tool Usage Breakdown ───────────────────────────── */}
        <div className="px-5 pb-4">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Tool Usage ({toolStats.length} tools used)</h3>
          <div className="space-y-1.5">
            {toolStats.slice(0, 15).map((tool) => (
              <div key={tool.name} className="flex items-center gap-2">
                <span className="text-[11px] text-gray-400 w-36 truncate shrink-0" title={tool.name}>
                  {tool.name.replace(/^get_/, "").replace(/_/g, " ")}
                </span>
                <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div className="h-full bg-brand-500/60 rounded-full transition-all" style={{ width: `${(tool.count / maxToolCount) * 100}%` }} />
                </div>
                <span className="text-[10px] text-gray-500 w-8 text-right">{tool.count}×</span>
                <span className="text-[10px] text-gray-600 w-12 text-right">{tool.avgMs}ms</span>
                {tool.errors > 0 && <span className="text-[10px] text-red-400">{tool.errors}err</span>}
              </div>
            ))}
          </div>
        </div>

        {/* ─── Request History ─────────────────────────────────── */}
        <div className="px-5 pb-4">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Request History</h3>
          <div className="space-y-1">
            {entries.map((entry) => {
              const isExpanded = expandedEntry === entry.id;
              return (
                <div key={entry.id} className="bg-gray-800/20 border border-gray-700/30 rounded-lg overflow-hidden">
                  <button onClick={() => setExpandedEntry(isExpanded ? null : entry.id)} className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-800/40 transition-colors">
                    <span className="text-gray-600">{isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>
                    <span className="text-xs text-gray-300 flex-1 truncate">{entry.userMessage}</span>
                    <span className="text-[10px] text-gray-600 shrink-0 flex items-center gap-2">
                      {entry.error && <AlertCircle size={10} className="text-red-400" />}
                      <span className="text-green-400">${entry.estimatedCost.toFixed(4)}</span>
                      <span>{formatNumber(entry.totalTokens)}tok</span>
                      <span>{(entry.totalDurationMs / 1000).toFixed(1)}s</span>
                      <span>{new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    </span>
                  </button>
                  {isExpanded && (
                    <div className="px-3 pb-2.5 border-t border-gray-700/30">
                      <div className="grid grid-cols-4 gap-2 mt-2 mb-2">
                        <MiniStat label="Prompt Tokens" value={formatNumber(entry.promptTokens)} />
                        <MiniStat label="Completion Tokens" value={formatNumber(entry.completionTokens)} />
                        <MiniStat label="Iterations" value={String(entry.iterations)} />
                        <MiniStat label="Model" value={entry.model.split("/").pop() || entry.model} />
                      </div>
                      {entry.toolCalls.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {entry.toolCalls.map((tc, i) => (
                            <span key={i} className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${tc.error ? "bg-red-500/10 text-red-400 border border-red-500/30" : "bg-brand-500/10 text-brand-400 border border-brand-500/30"}`}>
                              {tc.name.replace(/^get_/, "").replace(/_/g, " ")}
                              <span className="text-gray-500 ml-1">{tc.durationMs}ms · {tc.resultCount} results</span>
                            </span>
                          ))}
                        </div>
                      )}
                      {entry.error && <p className="text-[11px] text-red-400 mt-1.5">{entry.error}</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function KPICard({ icon, label, value, sub, color, bgColor, borderColor }: {
  icon: React.ReactNode; label: string; value: string; sub: string; color: string; bgColor: string; borderColor: string;
}) {
  return (
    <div className={`${bgColor} border ${borderColor} rounded-lg p-3`}>
      <div className={`flex items-center gap-1 text-[10px] uppercase tracking-wider ${color} mb-1`}>{icon}{label}</div>
      <p className="text-xl font-bold text-white">{value}</p>
      <p className="text-[10px] text-gray-500 mt-0.5">{sub}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-800/50 rounded px-2 py-1.5">
      <p className="text-[9px] text-gray-600 uppercase">{label}</p>
      <p className="text-xs text-gray-300 font-medium">{value}</p>
    </div>
  );
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}
