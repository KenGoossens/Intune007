import { useSettingsStore } from "../stores/settingsStore.ts";

const PANEL_INFO: { id: string; label: string; category: string }[] = [
  // Core
  { id: "alerts", label: "Alerts", category: "Core" },
  { id: "data", label: "Data", category: "Core" },
  { id: "deviceCard", label: "Device Card", category: "Core" },
  { id: "queryBuilder", label: "Query Builder", category: "Core" },
  { id: "reportGenerator", label: "Report Generator", category: "Core" },
  // Operations
  { id: "logs", label: "Logs", category: "Operations" },
  { id: "policies", label: "Policies", category: "Operations" },
  { id: "policyBuilder", label: "Policy Builder", category: "Operations" },
  { id: "policyDiff", label: "Policy Diff", category: "Operations" },
  { id: "remediation", label: "Remediation", category: "Operations" },
  { id: "troubleshooter", label: "Troubleshooter", category: "Operations" },
  // Insights
  { id: "analytics", label: "Analytics", category: "Insights" },
  { id: "appHealth", label: "App Health", category: "Insights" },
  { id: "autopilotReadiness", label: "Autopilot Readiness", category: "Insights" },
  { id: "baselines", label: "Config Baselines", category: "Insights" },
  { id: "cveMonitor", label: "CVE Monitor", category: "Insights" },
  { id: "forecast", label: "Compliance Forecast", category: "Insights" },
  { id: "insights", label: "Insights", category: "Insights" },
  { id: "riskScores", label: "Risk Scores", category: "Insights" },
  { id: "securityPosture", label: "Security Posture", category: "Insights" },
  { id: "tasks", label: "Tasks", category: "Insights" },
  { id: "timeline", label: "Device Timeline", category: "Insights" },
];

const CATEGORIES = ["Core", "Operations", "Insights"];

export default function SettingsPanel() {
  const { panelVisibility, togglePanel, enableAll, disableAll } =
    useSettingsStore();

  const enabledCount = Object.values(panelVisibility).filter(Boolean).length;
  const totalCount = PANEL_INFO.length;

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto">
        <h2 className="text-xl font-bold text-white mb-1">Settings</h2>
        <p className="text-sm text-gray-400 mb-6">
          Toggle panels on or off to customize your navigation sidebar.
        </p>

        {/* Quick actions */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={enableAll}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-brand-600/20 text-brand-400 hover:bg-brand-600/30 transition-colors"
          >
            Enable All
          </button>
          <button
            onClick={disableAll}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-gray-700/50 text-gray-300 hover:bg-gray-700/70 transition-colors"
          >
            Disable All
          </button>
          <span className="text-xs text-gray-500 ml-auto">
            {enabledCount} / {totalCount} panels enabled
          </span>
        </div>

        {/* Panels by category */}
        {CATEGORIES.map((category) => {
          const panels = PANEL_INFO.filter((p) => p.category === category);
          const categoryEnabled = panels.every(
            (p) => panelVisibility[p.id] !== false
          );

          return (
            <div key={category} className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
                  {category}
                </h3>
                <button
                  onClick={() => {
                    for (const p of panels) {
                      const store = useSettingsStore.getState();
                      store.setPanel(p.id, !categoryEnabled);
                    }
                  }}
                  className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
                >
                  {categoryEnabled ? "Disable all" : "Enable all"}
                </button>
              </div>
              <div className="space-y-1">
                {panels.map((panel) => {
                  const enabled = panelVisibility[panel.id] !== false;
                  return (
                    <button
                      key={panel.id}
                      onClick={() => togglePanel(panel.id)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                        enabled
                          ? "bg-gray-800/60 text-gray-200 hover:bg-gray-800/80"
                          : "bg-gray-900/40 text-gray-500 hover:bg-gray-800/40"
                      }`}
                    >
                      <span>{panel.label}</span>
                      <div
                        className={`w-9 h-5 rounded-full relative transition-colors ${
                          enabled ? "bg-brand-500" : "bg-gray-700"
                        }`}
                      >
                        <div
                          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                            enabled ? "translate-x-4" : "translate-x-0.5"
                          }`}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
