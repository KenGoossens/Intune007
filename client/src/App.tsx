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
import PolicyBuilderPanel from "./components/PolicyBuilderPanel.tsx";
import RiskScoringPanel from "./components/RiskScoringPanel.tsx";
import TroubleshooterPanel from "./components/TroubleshooterPanel.tsx";
import PolicyDiffPanel from "./components/PolicyDiffPanel.tsx";
import ForecastPanel from "./components/ForecastPanel.tsx";
import QueryBuilderPanel from "./components/QueryBuilderPanel.tsx";
import AppHealthPanel from "./components/AppHealthPanel.tsx";
import AutopilotReadinessPanel from "./components/AutopilotReadinessPanel.tsx";
import BaselinePanel from "./components/BaselinePanel.tsx";
import TimelinePanel from "./components/TimelinePanel.tsx";
import SecurityPosturePanel from "./components/SecurityPosturePanel.tsx";
import ReportGeneratorPanel from "./components/ReportGeneratorPanel.tsx";
import DeviceCardPanel from "./components/DeviceCardPanel.tsx";
import CVEMonitorPanel from "./components/CVEMonitorPanel.tsx";
import SettingsPanel from "./components/SettingsPanel.tsx";
import SparkleOverlay from "./components/SparkleOverlay.tsx";
import TenantSwitcher from "./components/TenantSwitcher.tsx";
import DOSimulatorPanel from "./components/DOSimulatorPanel.tsx";
import { GripVertical, Shield, MessageSquare, X } from "lucide-react";
import { useAlertStore } from "./stores/alertStore.ts";
import { useNavigationStore } from "./stores/navigationStore.ts";
import { useChatStore } from "./stores/chatStore.ts";
import { useActivityStore } from "./stores/activityStore.ts";
import { useSettingsStore } from "./stores/settingsStore.ts";

type ActivePanel = "alerts" | "data" | "remediation" | "analytics" | "policies" | "policyBuilder" | "policyDiff" | "riskScores" | "troubleshooter" | "forecast" | "queryBuilder" | "appHealth" | "autopilotReadiness" | "baselines" | "timeline" | "securityPosture" | "reportGenerator" | "deviceCard" | "cveMonitor" | "doSimulator" | "logs" | "tasks" | "insights" | "settings";

interface NavItem {
  id: ActivePanel;
  label: string;
  section: "core" | "operations" | "insights";
}

const NAV_ITEMS: NavItem[] = [
  // Core — alphabetical
  { id: "alerts",             label: "Alerts",              section: "core" },
  { id: "data",               label: "Data",                section: "core" },
  { id: "deviceCard",         label: "Device Card",         section: "core" },
  { id: "queryBuilder",       label: "Query Builder",       section: "core" },
  { id: "reportGenerator",    label: "Report Generator",    section: "core" },
  // Operations — alphabetical
  { id: "logs",               label: "Logs",                section: "operations" },
  { id: "policies",           label: "Policies",            section: "operations" },
  { id: "policyBuilder",      label: "Policy Builder",      section: "operations" },
  { id: "policyDiff",         label: "Policy Diff",         section: "operations" },
  { id: "remediation",        label: "Remediation",         section: "operations" },
  { id: "troubleshooter",     label: "Troubleshooter",      section: "operations" },
  { id: "doSimulator",        label: "DO Simulator",        section: "operations" },
  // Insights — alphabetical
  { id: "analytics",          label: "Analytics",           section: "insights" },
  { id: "appHealth",          label: "App Health",          section: "insights" },
  { id: "autopilotReadiness", label: "Autopilot",           section: "insights" },
  { id: "baselines",          label: "Config Baselines",    section: "insights" },
  { id: "cveMonitor",         label: "CVE Monitor",         section: "insights" },
  { id: "forecast",           label: "Compliance Forecast", section: "insights" },
  { id: "insights",           label: "Insights",            section: "insights" },
  { id: "riskScores",         label: "Risk Scores",         section: "insights" },
  { id: "securityPosture",    label: "Security Posture",    section: "insights" },
  { id: "tasks",              label: "Tasks",               section: "insights" },
  { id: "timeline",           label: "Device Timeline",     section: "insights" },
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

  // Listen for device card navigation requests
  const deviceCardTarget = useNavigationStore((s) => s.deviceCardTarget);
  const pendingNavigation = useNavigationStore((s) => s.pendingNavigation);

  useEffect(() => {
    if (pendingNavigation) {
      setActivePanel(pendingNavigation.panel as ActivePanel);
    }
  }, [pendingNavigation]);

  const unacknowledgedCount = useAlertStore(
    (s) => s.alerts.filter((a) => !a.acknowledged).length
  );
  const criticalCount = useAlertStore(
    (s) => s.alerts.filter((a) => a.severity === "critical" && !a.acknowledged).length
  );
  const isStreaming = useChatStore((s) => s.isStreaming);
  const isAgentActive = useActivityStore((s) => s.isActive);
  const isPanelVisible = useSettingsStore((s) => s.isPanelVisible);

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
        <div className="px-5 py-4 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-center leading-none">
              <span className="text-2xl font-black text-brand-400 italic tracking-tighter" style={{ fontFamily: "'Georgia', serif" }}>007</span>
              <div className="w-full h-[2px] bg-brand-400 mt-0.5" />
            </div>
            <div>
              <span className="text-sm font-bold text-white tracking-tight">
                Intune <span className="text-brand-400 italic" style={{ fontFamily: "'Georgia', serif" }}>007</span>
              </span>
              <p className="text-[10px] text-gray-500 italic leading-tight" style={{ fontFamily: "'Georgia', serif" }}>Your license to manage.</p>
            </div>
          </div>
        </div>

        {/* Tenant switcher */}
        <div className="px-3 py-2 border-b border-gray-800">
          <TenantSwitcher />
        </div>

        {/* Nav sections */}
        <div className="flex-1 overflow-y-auto py-3 px-3">
          {(["core", "operations", "insights"] as const).map((section) => {
            const sectionItems = NAV_ITEMS.filter((n) => n.section === section && isPanelVisible(n.id));
            if (sectionItems.length === 0) return null;
            return (
            <div key={section} className="mb-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider px-2 mb-1.5 text-gray-500">
                {SECTION_LABELS[section]}
              </p>
              {sectionItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActivePanel(item.id)}
                  className={`w-full flex items-center justify-between px-2.5 py-[7px] rounded-md text-[13px] font-medium transition-colors mb-0.5 ${
                    activePanel === item.id
                      ? "bg-brand-600/15 text-brand-400"
                      : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/60"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    {item.label}
                  </span>
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
            );
          })}
        </div>

        {/* Settings + Agent toggle at bottom */}
        <div className="px-3 pb-3 space-y-1">
          <button
            onClick={() => setActivePanel("settings")}
            className={`w-full flex items-center gap-2 px-2.5 py-[7px] rounded-md text-[13px] font-medium transition-colors ${
              activePanel === "settings"
                ? "bg-brand-600/15 text-brand-400"
                : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/60"
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><circle cx={12} cy={12} r={3} /></svg>
            Settings
          </button>
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
          <p className="text-[10px] text-gray-600 italic" style={{ fontFamily: "'Georgia', serif" }}>v1.0 · AI-Powered</p>
        </div>
      </nav>

      {/* ─── Main Content Area ───────────────────────────────────── */}
      <div ref={contentRef} className="flex flex-1 overflow-hidden">
        {/* Center: Active panel content */}
        <div className="flex-1 overflow-hidden relative">
          <SparkleOverlay active={isStreaming || isAgentActive} />
          {activePanel === "alerts" ? (
            <AlertsPanel />
          ) : activePanel === "remediation" ? (
            <RemediationPanel />
          ) : activePanel === "analytics" ? (
            <AnalyticsPanel />
          ) : activePanel === "policies" ? (
            <PolicyAnalyzerPanel />
          ) : activePanel === "policyBuilder" ? (
            <PolicyBuilderPanel />
          ) : activePanel === "policyDiff" ? (
            <PolicyDiffPanel />
          ) : activePanel === "riskScores" ? (
            <RiskScoringPanel />
          ) : activePanel === "troubleshooter" ? (
            <TroubleshooterPanel />
          ) : activePanel === "forecast" ? (
            <ForecastPanel />
          ) : activePanel === "queryBuilder" ? (
            <QueryBuilderPanel />
          ) : activePanel === "appHealth" ? (
            <AppHealthPanel />
          ) : activePanel === "autopilotReadiness" ? (
            <AutopilotReadinessPanel />
          ) : activePanel === "baselines" ? (
            <BaselinePanel />
          ) : activePanel === "timeline" ? (
            <TimelinePanel />
          ) : activePanel === "securityPosture" ? (
            <SecurityPosturePanel />
          ) : activePanel === "cveMonitor" ? (
            <CVEMonitorPanel />
          ) : activePanel === "doSimulator" ? (
            <DOSimulatorPanel />
          ) : activePanel === "reportGenerator" ? (
            <ReportGeneratorPanel />
          ) : activePanel === "deviceCard" ? (
            <DeviceCardPanel />
          ) : activePanel === "logs" ? (
            <LogViewerPanel />
          ) : activePanel === "tasks" ? (
            <TasksPanel />
          ) : activePanel === "insights" ? (
            <InsightsPanel />
          ) : activePanel === "settings" ? (
            <SettingsPanel />
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
