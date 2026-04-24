import { useState, useCallback, useRef, useEffect } from "react";
import ChatPanel from "./components/ChatPanel.tsx";
import DataPanel from "./components/DataPanel.tsx";
import AlertsPanel from "./components/AlertsPanel.tsx";
import RemediationPanel from "./components/RemediationPanel.tsx";
import AnalyticsPanel from "./components/AnalyticsPanel.tsx";
import PolicyAnalyzerPanel from "./components/PolicyAnalyzerPanel.tsx";
import LogViewerPanel from "./components/LogViewerPanel.tsx";
import TasksPanel from "./components/TasksPanel.tsx";
import InsightsPanel from "./components/InsightsPanel.tsx";
import { GripVertical, Shield, MessageSquare, X } from "lucide-react";
import { useAlertStore } from "./stores/alertStore.ts";

type ActivePanel = "alerts" | "data" | "remediation" | "analytics" | "policies" | "logs" | "tasks" | "insights";

interface NavItem {
  id: ActivePanel;
  label: string;
  section: "core" | "operations" | "insights";
}

const NAV_ITEMS: NavItem[] = [
  { id: "alerts",      label: "Alerts",      section: "core" },
  { id: "data",        label: "Data",        section: "core" },
  { id: "policies",    label: "Policies",    section: "operations" },
  { id: "remediation", label: "Remediation", section: "operations" },
  { id: "logs",        label: "Logs",        section: "operations" },
  { id: "insights",    label: "Insights",    section: "insights" },
  { id: "tasks",       label: "Tasks",       section: "insights" },
  { id: "analytics",   label: "Analytics",   section: "insights" },
];

const SECTION_LABELS: Record<string, string> = {
  core: "Core",
  operations: "Operations",
  insights: "Insights",
};

export default function App() {
  const [activePanel, setActivePanel] = useState<ActivePanel>("alerts");
  const [chatOpen, setChatOpen] = useState(true);
  const [chatWidth, setChatWidth] = useState(28); // percentage
  const isDragging = useRef(false);
  const contentRef = useRef<HTMLDivElement>(null);

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
      if (!isDragging.current || !contentRef.current) return;
      const rect = contentRef.current.getBoundingClientRect();
      // chatWidth is measured from the right
      const pct = 100 - ((e.clientX - rect.left) / rect.width) * 100;
      setChatWidth(Math.max(20, Math.min(50, pct)));
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
    <div className="h-screen flex bg-gray-950">
      {/* ─── Left Navigation ─────────────────────────────────────── */}
      <nav className="w-52 flex flex-col bg-gray-900 border-r border-gray-800 shrink-0">
        {/* Branding */}
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-gray-800">
          <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
            <Shield size={16} className="text-white" />
          </div>
          <div>
            <span className="text-sm font-bold text-white tracking-tight">
              Intune<span className="text-brand-400">007</span>
            </span>
            <p className="text-[10px] text-gray-500 leading-tight">Security Copilot</p>
          </div>
        </div>

        {/* Nav sections */}
        <div className="flex-1 overflow-y-auto py-3 px-3">
          {(["core", "operations", "insights"] as const).map((section) => (
            <div key={section} className="mb-4">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-2 mb-1.5">
                {SECTION_LABELS[section]}
              </p>
              {NAV_ITEMS.filter((n) => n.section === section).map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActivePanel(item.id)}
                  className={`w-full flex items-center justify-between px-2.5 py-[7px] rounded-md text-[13px] font-medium transition-colors mb-0.5 ${
                    activePanel === item.id
                      ? "bg-brand-600/15 text-brand-400"
                      : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/60"
                  }`}
                >
                  {item.label}
                  {item.id === "alerts" && unacknowledgedCount > 0 && (
                    <span
                      className={`min-w-[18px] h-[18px] flex items-center justify-center px-1 rounded-full text-[10px] font-bold ${
                        criticalCount > 0
                          ? "bg-red-500 text-white"
                          : "bg-yellow-500 text-black"
                      }`}
                    >
                      {unacknowledgedCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Copilot toggle at bottom */}
        <div className="px-3 pb-3">
          <button
            onClick={() => setChatOpen(!chatOpen)}
            className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-[13px] font-medium transition-colors ${
              chatOpen
                ? "bg-brand-600/15 text-brand-400"
                : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/60"
            }`}
          >
            <MessageSquare size={14} />
            Agent
          </button>
        </div>

        <div className="px-5 py-3 border-t border-gray-800">
          <p className="text-[10px] text-gray-600">v1.0 · AI-Powered</p>
        </div>
      </nav>

      {/* ─── Main Content Area ───────────────────────────────────── */}
      <div ref={contentRef} className="flex flex-1 overflow-hidden">
        {/* Center: Active panel content */}
        <div className="flex-1 overflow-hidden">
          {activePanel === "alerts" ? (
            <AlertsPanel />
          ) : activePanel === "remediation" ? (
            <RemediationPanel />
          ) : activePanel === "analytics" ? (
            <AnalyticsPanel />
          ) : activePanel === "policies" ? (
            <PolicyAnalyzerPanel />
          ) : activePanel === "logs" ? (
            <LogViewerPanel />
          ) : activePanel === "tasks" ? (
            <TasksPanel />
          ) : activePanel === "insights" ? (
            <InsightsPanel />
          ) : (
            <DataPanel />
          )}
        </div>

        {/* Resizer */}
        {chatOpen && (
          <div
            onMouseDown={handleMouseDown}
            className="w-1.5 bg-gray-800 hover:bg-brand-600 cursor-col-resize flex items-center justify-center transition-colors group shrink-0"
          >
            <GripVertical
              size={14}
              className="text-gray-600 group-hover:text-white"
            />
          </div>
        )}

        {/* Right: Agent Chat Panel */}
        {chatOpen && (
          <div
            style={{ width: `${chatWidth}%` }}
            className="shrink-0 h-full border-l border-gray-800"
          >
            <ChatPanel onClose={() => setChatOpen(false)} />
          </div>
        )}
      </div>
    </div>
  );
}
