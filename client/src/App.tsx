import { useState, useCallback, useRef, useEffect } from "react";
import ChatPanel from "./components/ChatPanel.tsx";
import DataPanel from "./components/DataPanel.tsx";
import AlertsPanel from "./components/AlertsPanel.tsx";
import RemediationPanel from "./components/RemediationPanel.tsx";
import AnalyticsPanel from "./components/AnalyticsPanel.tsx";
import PolicyAnalyzerPanel from "./components/PolicyAnalyzerPanel.tsx";
import { GripVertical, Shield, LayoutGrid, Bell, Wrench, BarChart3, ScanSearch } from "lucide-react";
import { useAlertStore } from "./stores/alertStore.ts";

type RightTab = "data" | "alerts" | "remediation" | "analytics" | "policies";

export default function App() {
  const [leftWidth, setLeftWidth] = useState(40); // percentage
  const [rightTab, setRightTab] = useState<RightTab>("alerts");
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const unacknowledgedCount = useAlertStore(
    (s) => s.alerts.filter((a) => !a.acknowledged).length
  );
  const criticalCount = useAlertStore(
    (s) => s.alerts.filter((a) => a.severity === "critical" && !a.acknowledged).length
  );

  const handleMouseDown = useCallback(() => {
    isDragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newWidth = ((e.clientX - rect.left) / rect.width) * 100;
      setLeftWidth(Math.max(25, Math.min(75, newWidth)));
    };

    const handleMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  return (
    <div className="h-screen flex flex-col bg-gray-950">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
              <Shield size={18} className="text-white" />
            </div>
            <span className="text-base font-bold text-white tracking-tight">
              Intune<span className="text-brand-400">007</span>
            </span>
          </div>
          <span className="text-xs text-gray-500 hidden sm:inline">
            AI-Powered Intune Security Copilot
          </span>
        </div>

        {/* Right panel tab switcher */}
        <div className="flex items-center bg-gray-800 rounded-lg p-0.5">
          <button
            onClick={() => setRightTab("alerts")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              rightTab === "alerts"
                ? "bg-gray-700 text-white"
                : "text-gray-400 hover:text-gray-300"
            }`}
          >
            <Bell size={13} />
            Alerts
            {unacknowledgedCount > 0 && (
              <span
                className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  criticalCount > 0
                    ? "bg-red-500 text-white"
                    : "bg-yellow-500 text-black"
                }`}
              >
                {unacknowledgedCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setRightTab("data")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              rightTab === "data"
                ? "bg-gray-700 text-white"
                : "text-gray-400 hover:text-gray-300"
            }`}
          >
            <LayoutGrid size={13} />
            Data
          </button>
          <button
            onClick={() => setRightTab("remediation")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              rightTab === "remediation"
                ? "bg-gray-700 text-white"
                : "text-gray-400 hover:text-gray-300"
            }`}
          >
            <Wrench size={13} />
            Remediation
          </button>
          <button
            onClick={() => setRightTab("analytics")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              rightTab === "analytics"
                ? "bg-gray-700 text-white"
                : "text-gray-400 hover:text-gray-300"
            }`}
          >
            <BarChart3 size={13} />
            Analytics
          </button>
          <button
            onClick={() => setRightTab("policies")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              rightTab === "policies"
                ? "bg-gray-700 text-white"
                : "text-gray-400 hover:text-gray-300"
            }`}
          >
            <ScanSearch size={13} />
            Policies
          </button>
        </div>
      </header>

      {/* Main panels */}
      <div ref={containerRef} className="flex flex-1 overflow-hidden">
        {/* Left: Chat */}
        <div style={{ width: `${leftWidth}%` }} className="flex-shrink-0">
          <ChatPanel />
        </div>

        {/* Resizer */}
        <div
          onMouseDown={handleMouseDown}
          className="w-1.5 bg-gray-800 hover:bg-brand-600 cursor-col-resize flex items-center justify-center transition-colors group"
        >
          <GripVertical
            size={14}
            className="text-gray-600 group-hover:text-white"
          />
        </div>

        {/* Right: Alerts or Data panels */}
        <div className="flex-1 bg-gray-900/50 overflow-hidden">
          {rightTab === "alerts" ? (
            <AlertsPanel />
          ) : rightTab === "remediation" ? (
            <RemediationPanel />
          ) : rightTab === "analytics" ? (
            <AnalyticsPanel />
          ) : rightTab === "policies" ? (
            <PolicyAnalyzerPanel />
          ) : (
            <DataPanel />
          )}
        </div>
      </div>
    </div>
  );
}
