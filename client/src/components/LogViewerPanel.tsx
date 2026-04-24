import { useEffect, useState, useCallback } from "react";
import {
  FileText,
  RefreshCw,
  Loader2,
  ChevronDown,
  ChevronRight,
  Clock,
  User,
  Monitor,
  Search,
  Download,
} from "lucide-react";

type LogTab = "audit" | "signins" | "directory";

interface LogEntry {
  [key: string]: unknown;
}

export default function LogViewerPanel() {
  const [activeTab, setActiveTab] = useState<LogTab>("audit");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [filterText, setFilterText] = useState("");
  const [topCount, setTopCount] = useState(25);

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const endpoint =
        activeTab === "audit"
          ? "/api/logs/audit"
          : activeTab === "signins"
            ? "/api/logs/signins"
            : "/api/logs/directory";

      const res = await fetch(`${endpoint}?top=${topCount}`);
      const data = await res.json();
      setLogs(data.items || []);
    } catch (err) {
      console.error("Failed to fetch logs:", err);
      setLogs([]);
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, topCount]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const filteredLogs = filterText
    ? logs.filter((log) =>
        JSON.stringify(log).toLowerCase().includes(filterText.toLowerCase())
      )
    : logs;

  const exportCsv = () => {
    if (filteredLogs.length === 0) return;
    const keys = Object.keys(filteredLogs[0]).filter((k) => !k.startsWith("@"));
    const header = keys.join(",");
    const rows = filteredLogs.map((log) =>
      keys.map((k) => `"${String(log[k] ?? "").replace(/"/g, '""')}"`).join(",")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeTab}-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <FileText size={16} className="text-brand-400" />
          <h2 className="text-sm font-semibold text-gray-300">Logs</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportCsv}
            disabled={filteredLogs.length === 0}
            className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors disabled:opacity-30"
          >
            <Download size={12} />
            Export
          </button>
          <button
            onClick={fetchLogs}
            disabled={isLoading}
            className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
          >
            {isLoading ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <RefreshCw size={12} />
            )}
            Refresh
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-gray-800">
        {(
          [
            { key: "audit", label: "Intune Audit" },
            { key: "signins", label: "Sign-Ins" },
            { key: "directory", label: "Directory Audit" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === tab.key
                ? "bg-gray-700 text-white"
                : "text-gray-400 hover:text-gray-300 hover:bg-gray-800"
            }`}
          >
            {tab.label}
          </button>
        ))}

        <div className="flex-1" />

        {/* Top count selector */}
        <select
          value={topCount}
          onChange={(e) => setTopCount(Number(e.target.value))}
          className="bg-gray-800 text-gray-300 text-xs border border-gray-700 rounded px-2 py-1 focus:outline-none"
        >
          <option value={10}>10 rows</option>
          <option value={25}>25 rows</option>
          <option value={50}>50 rows</option>
          <option value={100}>100 rows</option>
        </select>
      </div>

      {/* Filter bar */}
      <div className="px-4 py-2 border-b border-gray-800">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500"
          />
          <input
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Filter logs..."
            className="w-full bg-gray-800 text-gray-300 text-xs rounded px-8 py-1.5 border border-gray-700 focus:border-brand-500 focus:outline-none placeholder-gray-500"
          />
        </div>
      </div>

      {/* Log entries */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 size={20} className="animate-spin text-gray-500" />
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-500">
            <FileText size={24} className="mb-2" />
            <p className="text-xs">No log entries found</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-800">
            {filteredLogs.map((log, i) => (
              <LogRow
                key={i}
                log={log}
                tab={activeTab}
                expanded={expandedRow === i}
                onToggle={() =>
                  setExpandedRow(expandedRow === i ? null : i)
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-gray-800 text-xs text-gray-500">
        Showing {filteredLogs.length} of {logs.length} entries
      </div>
    </div>
  );
}

function LogRow({
  log,
  tab,
  expanded,
  onToggle,
}: {
  log: LogEntry;
  tab: LogTab;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { title, subtitle, time, icon } = getLogDisplay(log, tab);

  return (
    <div className="px-4">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 py-2.5 text-left hover:bg-gray-800/50 transition-colors"
      >
        <span className="text-gray-500">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <span className="text-gray-400">{icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-gray-200 truncate">{title}</p>
          <p className="text-[11px] text-gray-500 truncate">{subtitle}</p>
        </div>
        <span className="text-[11px] text-gray-500 whitespace-nowrap flex items-center gap-1">
          <Clock size={10} />
          {time}
        </span>
      </button>

      {expanded && (
        <div className="pb-3 pl-10">
          <pre className="text-[11px] text-gray-400 bg-gray-800/50 rounded p-3 overflow-x-auto max-h-48">
            {JSON.stringify(log, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function getLogDisplay(
  log: LogEntry,
  tab: LogTab
): { title: string; subtitle: string; time: string; icon: React.ReactNode } {
  const formatTime = (val: unknown) => {
    if (!val) return "—";
    try {
      return new Date(String(val)).toLocaleString();
    } catch {
      return String(val);
    }
  };

  switch (tab) {
    case "audit":
      return {
        title: String(log.displayName || log.activity || log.activityType || "Audit Event"),
        subtitle: `${String(log.componentName || "")} · ${String(log.activityOperationType || log.activityType || "")} · ${String(log.activityResult || "")}`,
        time: formatTime(log.activityDateTime),
        icon: <Monitor size={14} />,
      };
    case "signins":
      return {
        title: String(log.userDisplayName || log.userPrincipalName || "Sign-In"),
        subtitle: `${String(log.appDisplayName || "")} · ${String(log.ipAddress || "")} · ${String(log.clientAppUsed || "")}`,
        time: formatTime(log.createdDateTime),
        icon: <User size={14} />,
      };
    case "directory":
      return {
        title: String(log.activityDisplayName || log.displayName || "Directory Event"),
        subtitle: `${String(log.category || "")} · ${String(log.operationType || "")} · ${String(log.result || "")}`,
        time: formatTime(log.activityDateTime),
        icon: <FileText size={14} />,
      };
  }
}
