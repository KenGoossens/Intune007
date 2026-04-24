import { useEffect } from "react";
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
} from "lucide-react";
import { useAnalyticsStore } from "../stores/analyticsStore.ts";
import type { AnalyticsEntry } from "@intune-agent/shared";

export default function AnalyticsPanel() {
  const { summary, loading, error, fetch: fetchAnalytics, clear } = useAnalyticsStore();

  useEffect(() => {
    fetchAnalytics();
    const interval = setInterval(fetchAnalytics, 10_000);
    return () => clearInterval(interval);
  }, [fetchAnalytics]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <BarChart3 size={18} className="text-brand-400" />
          <h2 className="text-sm font-semibold text-white">Analytics</h2>
          {summary && (
            <span className="text-xs text-gray-500">
              {summary.totalRequests} request{summary.totalRequests !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={clear}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
            title="Clear analytics"
          >
            <Trash2 size={14} />
          </button>
          <button
            onClick={fetchAnalytics}
            disabled={loading}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
            title="Refresh"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {error && (
          <div className="text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2 border border-red-500/30">
            {error}
          </div>
        )}

        {!summary || summary.totalRequests === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-500">
            <BarChart3 size={48} className="mb-4 text-gray-600" />
            <h3 className="text-lg font-medium text-gray-300 mb-2">No Analytics Yet</h3>
            <p className="text-sm max-w-sm">
              Send messages to the agent to start tracking token usage, costs, and response times.
            </p>
          </div>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                icon={<Hash size={16} />}
                label="Total Tokens"
                value={formatNumber(summary.totalTokens)}
                sub={`${formatNumber(summary.totalPromptTokens)} prompt / ${formatNumber(summary.totalCompletionTokens)} completion`}
                color="text-blue-400"
              />
              <StatCard
                icon={<DollarSign size={16} />}
                label="Estimated Cost"
                value={`$${summary.totalCost.toFixed(4)}`}
                sub={`$${(summary.totalCost / Math.max(summary.totalRequests, 1)).toFixed(4)} avg/request`}
                color="text-green-400"
              />
              <StatCard
                icon={<Clock size={16} />}
                label="Avg Response"
                value={`${(summary.avgResponseMs / 1000).toFixed(1)}s`}
                sub={`${formatNumber(Math.round(summary.avgTokensPerRequest))} tokens/req`}
                color="text-yellow-400"
              />
              <StatCard
                icon={<Wrench size={16} />}
                label="Tool Calls"
                value={formatNumber(summary.totalToolCalls)}
                sub={`${(summary.totalToolCalls / Math.max(summary.totalRequests, 1)).toFixed(1)} avg/request`}
                color="text-purple-400"
              />
            </div>

            {/* Token Breakdown Bar */}
            <div className="bg-gray-800/50 rounded-lg border border-gray-700/50 p-3">
              <div className="text-xs font-medium text-gray-400 mb-2">Token Distribution</div>
              <div className="flex h-3 rounded-full overflow-hidden bg-gray-700">
                <div
                  className="bg-blue-500 transition-all"
                  style={{
                    width: `${(summary.totalPromptTokens / Math.max(summary.totalTokens, 1)) * 100}%`,
                  }}
                  title={`Prompt: ${formatNumber(summary.totalPromptTokens)}`}
                />
                <div
                  className="bg-emerald-500 transition-all"
                  style={{
                    width: `${(summary.totalCompletionTokens / Math.max(summary.totalTokens, 1)) * 100}%`,
                  }}
                  title={`Completion: ${formatNumber(summary.totalCompletionTokens)}`}
                />
              </div>
              <div className="flex justify-between mt-1.5 text-[10px] text-gray-500">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                  Prompt ({((summary.totalPromptTokens / Math.max(summary.totalTokens, 1)) * 100).toFixed(0)}%)
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                  Completion ({((summary.totalCompletionTokens / Math.max(summary.totalTokens, 1)) * 100).toFixed(0)}%)
                </span>
              </div>
            </div>

            {/* Request Log */}
            <div>
              <div className="text-xs font-medium text-gray-400 mb-2">Request History</div>
              <div className="space-y-2">
                {summary.entries.map((entry) => (
                  <RequestRow key={entry.id} entry={entry} />
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  color: string;
}) {
  return (
    <div className="bg-gray-800/50 rounded-lg border border-gray-700/50 p-3">
      <div className={`flex items-center gap-1.5 text-xs ${color} mb-1`}>
        {icon}
        {label}
      </div>
      <div className="text-lg font-semibold text-white">{value}</div>
      <div className="text-[10px] text-gray-500 mt-0.5">{sub}</div>
    </div>
  );
}

function RequestRow({ entry }: { entry: AnalyticsEntry }) {
  const time = new Date(entry.timestamp);
  const timeStr = time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div className="bg-gray-800/30 rounded-lg border border-gray-700/40 p-2.5 text-xs">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="text-gray-200 font-medium truncate flex-1" title={entry.userMessage}>
          {entry.userMessage}
        </div>
        <span className="text-gray-500 shrink-0">{timeStr}</span>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-gray-400">
        <span className="flex items-center gap-1">
          <Hash size={10} />
          {formatNumber(entry.totalTokens)} tokens
        </span>
        <span className="flex items-center gap-1">
          <DollarSign size={10} />
          ${entry.estimatedCost.toFixed(4)}
        </span>
        <span className="flex items-center gap-1">
          <Clock size={10} />
          {(entry.totalDurationMs / 1000).toFixed(1)}s
        </span>
        <span className="flex items-center gap-1">
          <Zap size={10} />
          {entry.iterations} iter
        </span>
        {entry.toolCalls.length > 0 && (
          <span className="flex items-center gap-1">
            <Wrench size={10} />
            {entry.toolCalls.length} tool{entry.toolCalls.length !== 1 ? "s" : ""}
          </span>
        )}
        {entry.error && (
          <span className="flex items-center gap-1 text-red-400">
            <AlertCircle size={10} />
            Error
          </span>
        )}
      </div>
      {entry.toolCalls.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {entry.toolCalls.map((tc, i) => (
            <span
              key={i}
              className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                tc.error
                  ? "bg-red-500/10 text-red-400 border border-red-500/30"
                  : "bg-brand-500/10 text-brand-400 border border-brand-500/30"
              }`}
            >
              {tc.name.replace(/^get_/, "").replace(/_/g, " ")}
              <span className="text-gray-500 ml-1">{tc.durationMs}ms</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}
