import { useEffect } from "react";
import {
  Bell,
  RefreshCw,
  AlertTriangle,
  AlertCircle,
  Info,
  Check,
  X,
  Loader2,
  ChevronDown,
  ChevronRight,
  Clock,
  Shield,
  Monitor,
  AppWindow,
  KeyRound,
  PlusCircle,
} from "lucide-react";
import { useAlertStore } from "../stores/alertStore.ts";
import type { Alert } from "@intune-agent/shared";
import { useState } from "react";

const SEVERITY_CONFIG = {
  critical: {
    icon: <AlertCircle size={16} />,
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    badge: "bg-red-500/20 text-red-400",
  },
  warning: {
    icon: <AlertTriangle size={16} />,
    color: "text-yellow-400",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/30",
    badge: "bg-yellow-500/20 text-yellow-400",
  },
  info: {
    icon: <Info size={16} />,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
    badge: "bg-blue-500/20 text-blue-400",
  },
};

const CHECK_ICONS: Record<string, React.ReactNode> = {
  non_compliant_devices: <Shield size={14} />,
  policy_conflicts: <AlertTriangle size={14} />,
  stale_devices: <Clock size={14} />,
  failed_app_installs: <AppWindow size={14} />,
  ca_policy_issues: <KeyRound size={14} />,
  new_enrollments: <PlusCircle size={14} />,
  high_risk_devices: <AlertCircle size={14} />,
  update_compliance: <Monitor size={14} />,
};

export default function AlertsPanel() {
  const {
    alerts,
    configs,
    isLoading,
    lastFetched,
    fetchAlerts,
    refreshAlerts,
    acknowledgeAlert,
    dismissAlert,
    updateConfig,
  } = useAlertStore();
  const [expandedAlert, setExpandedAlert] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  // Fetch alerts on mount and every 60 seconds
  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 60000);
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  const unacknowledgedCount = alerts.filter((a) => !a.acknowledged).length;
  const criticalCount = alerts.filter(
    (a) => a.severity === "critical" && !a.acknowledged
  ).length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <Bell size={16} className="text-brand-400" />
          <h2 className="text-sm font-semibold text-gray-300">Alerts</h2>
          {unacknowledgedCount > 0 && (
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                criticalCount > 0
                  ? "bg-red-500/20 text-red-400"
                  : "bg-yellow-500/20 text-yellow-400"
              }`}
            >
              {unacknowledgedCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-1.5 text-gray-500 hover:text-gray-300 rounded-lg hover:bg-gray-800 transition-colors text-xs"
            title="Alert settings"
          >
            ⚙️
          </button>
          <button
            onClick={refreshAlerts}
            disabled={isLoading}
            className="p-1.5 text-gray-500 hover:text-gray-300 rounded-lg hover:bg-gray-800 transition-colors"
            title="Refresh all checks now"
          >
            <RefreshCw
              size={14}
              className={isLoading ? "animate-spin" : ""}
            />
          </button>
        </div>
      </div>

      {/* Settings panel (collapsible) */}
      {showSettings && (
        <div className="px-4 py-3 border-b border-gray-800 bg-gray-800/50 space-y-2">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Check Configuration
          </h3>
          {configs.map((config) => (
            <div
              key={config.type}
              className="flex items-center justify-between text-xs"
            >
              <div className="flex items-center gap-2">
                <button
                  onClick={() =>
                    updateConfig(config.type, { enabled: !config.enabled })
                  }
                  className={`w-8 h-4 rounded-full transition-colors relative ${
                    config.enabled ? "bg-brand-600" : "bg-gray-600"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                      config.enabled ? "left-4" : "left-0.5"
                    }`}
                  />
                </button>
                <span className="text-gray-300">{config.label}</span>
              </div>
              <select
                value={config.intervalMinutes}
                onChange={(e) =>
                  updateConfig(config.type, {
                    intervalMinutes: parseInt(e.target.value),
                  })
                }
                className="bg-gray-700 text-gray-300 rounded px-1.5 py-0.5 text-xs border border-gray-600"
              >
                <option value={5}>5 min</option>
                <option value={15}>15 min</option>
                <option value={30}>30 min</option>
                <option value={60}>1 hour</option>
                <option value={360}>6 hours</option>
              </select>
            </div>
          ))}
        </div>
      )}

      {/* Alert list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <Loader2 size={24} className="animate-spin mb-2" />
            <p className="text-sm">Running alert checks...</p>
          </div>
        ) : alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <Check size={32} className="mb-2 text-green-500" />
            <p className="text-sm text-gray-400">All clear — no alerts</p>
            <p className="text-xs text-gray-600 mt-1">
              {lastFetched
                ? `Last checked: ${new Date(lastFetched).toLocaleTimeString()}`
                : "Checks will run automatically"}
            </p>
          </div>
        ) : (
          <div className="p-3 space-y-2">
            {alerts.map((alert) => (
              <AlertCard
                key={alert.id}
                alert={alert}
                isExpanded={expandedAlert === alert.id}
                onToggle={() =>
                  setExpandedAlert(
                    expandedAlert === alert.id ? null : alert.id
                  )
                }
                onAcknowledge={() => acknowledgeAlert(alert.id)}
                onDismiss={() => dismissAlert(alert.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {lastFetched && (
        <div className="px-4 py-2 border-t border-gray-800 text-xs text-gray-600">
          Last updated: {new Date(lastFetched).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}

function AlertCard({
  alert,
  isExpanded,
  onToggle,
  onAcknowledge,
  onDismiss,
}: {
  alert: Alert;
  isExpanded: boolean;
  onToggle: () => void;
  onAcknowledge: () => void;
  onDismiss: () => void;
}) {
  const sev = SEVERITY_CONFIG[alert.severity];
  const checkIcon = CHECK_ICONS[alert.checkType] || <Monitor size={14} />;

  return (
    <div
      className={`rounded-lg border ${sev.border} ${sev.bg} overflow-hidden ${
        alert.acknowledged ? "opacity-60" : ""
      }`}
    >
      {/* Alert header */}
      <div
        onClick={onToggle}
        className="flex items-start gap-2 px-3 py-2.5 cursor-pointer hover:bg-white/5 transition-colors"
      >
        <span className={`mt-0.5 ${sev.color}`}>{sev.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className={`${sev.badge} text-[10px] px-1.5 py-0.5 rounded-full font-medium uppercase`}>
              {alert.severity}
            </span>
            <span className="text-gray-500">{checkIcon}</span>
          </div>
          <h4 className="text-sm font-medium text-gray-200 leading-tight">
            {alert.title}
          </h4>
          <p className="text-xs text-gray-400 mt-0.5">{alert.message}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!alert.acknowledged && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAcknowledge();
              }}
              className="p-1 text-gray-500 hover:text-green-400 rounded transition-colors"
              title="Acknowledge"
            >
              <Check size={14} />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDismiss();
            }}
            className="p-1 text-gray-500 hover:text-red-400 rounded transition-colors"
            title="Dismiss"
          >
            <X size={14} />
          </button>
          {isExpanded ? (
            <ChevronDown size={14} className="text-gray-500" />
          ) : (
            <ChevronRight size={14} className="text-gray-500" />
          )}
        </div>
      </div>

      {/* Expanded details */}
      {isExpanded && alert.details && alert.details.length > 0 && (
        <div className="px-3 pb-3 border-t border-white/5">
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-700">
                  {inferDetailColumns(alert.details).map((col) => (
                    <th
                      key={col}
                      className="text-left py-1.5 px-2 text-gray-500 font-medium"
                    >
                      {formatColumnLabel(col)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {alert.details.slice(0, 20).map((item, i) => (
                  <tr
                    key={i}
                    className="border-b border-gray-700/30"
                  >
                    {inferDetailColumns(alert.details).map((col) => (
                      <td
                        key={col}
                        className="py-1.5 px-2 text-gray-400 max-w-[200px] truncate"
                      >
                        {formatCellValue(
                          (item as Record<string, unknown>)[col]
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {alert.details.length > 20 && (
              <p className="text-xs text-gray-600 mt-1 text-center">
                Showing 20 of {alert.details.length} items
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function inferDetailColumns(details: unknown[]): string[] {
  if (!details.length) return [];
  const first = details[0] as Record<string, unknown>;
  return Object.keys(first)
    .filter(
      (k) =>
        !k.startsWith("@") &&
        k !== "id" &&
        typeof first[k] !== "object"
    )
    .slice(0, 5);
}

function formatColumnLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

function formatCellValue(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string" && value.includes("T") && value.includes("Z")) {
    try {
      return new Date(value).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return value;
    }
  }
  return String(value);
}
