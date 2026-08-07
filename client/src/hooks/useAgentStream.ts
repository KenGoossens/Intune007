import { useCallback, useRef } from "react";
import { useChatStore } from "../stores/chatStore.ts";
import { useActivityStore } from "../stores/activityStore.ts";
import { useNavigationStore, type TargetPanel } from "../stores/navigationStore.ts";
import { useSettingsStore } from "../stores/settingsStore.ts";
import { PANEL_TO_TOOLS } from "@intune-agent/shared";
import type { SSEEvent } from "@intune-agent/shared";

/**
 * Map of tool names to the panel they should auto-navigate to.
 * When the agent calls one of these tools, the UI navigates to the panel
 * so the user sees both the text AND visual output.
 */
const TOOL_PANEL_MAP: Record<string, { panel: TargetPanel; deviceNameArg?: string }> = {
  // Devices → Data panel (shows device table)
  get_managed_devices: { panel: "data" },
  get_device_details: { panel: "data" },

  // Device Card → Device Card panel
  get_device_card: { panel: "deviceCard", deviceNameArg: "deviceName" },

  // Device Timeline → Timeline panel (auto-loads)
  get_device_timeline: { panel: "timeline", deviceNameArg: "deviceName" },

  // Troubleshooter → Troubleshooter panel (auto-runs)
  run_troubleshooter: { panel: "troubleshooter", deviceNameArg: "deviceName" },

  // Compliance → relevant panels
  get_compliance_policies: { panel: "data" },
  get_compliance_status: { panel: "data" },
  create_compliance_policy: { panel: "policyBuilder" },
  get_compliance_trend: { panel: "data" },
  run_compliance_forecast: { panel: "forecast" },

  // Configuration
  get_device_configurations: { panel: "data" },
  get_device_configuration_states: { panel: "data" },
  manage_config_baseline: { panel: "data" },

  // Policy analysis
  analyze_policies: { panel: "policies" },

  // Apps
  get_mobile_apps: { panel: "data" },
  get_app_install_status: { panel: "data" },
  get_device_detected_apps: { panel: "data" },
  get_device_app_install_states: { panel: "data" },
  get_app_health: { panel: "appHealth" },
  scan_app_icons: { panel: "appHealth" },
  fix_app_icon: { panel: "appHealth" },
  fix_all_missing_icons: { panel: "appHealth" },

  // Conditional Access
  get_conditional_access_policies: { panel: "data" },

  // Autopilot
  get_autopilot_devices: { panel: "data" },
  get_autopilot_profiles: { panel: "data" },
  check_autopilot_readiness: { panel: "autopilotReadiness" },

  // Security
  get_security_alerts: { panel: "data" },
  get_bitlocker_keys: { panel: "data" },
  get_device_threat_summary: { panel: "data" },
  get_security_posture: { panel: "securityPosture" },
  get_device_risk_scores: { panel: "riskScores" },

  // Groups
  get_groups: { panel: "data" },
  get_group_members: { panel: "data" },

  // Policy assignments
  get_policies_assigned_to_group: { panel: "data" },
  get_policies_assigned_to_device: { panel: "data" },

  // Logs
  get_audit_logs: { panel: "data" },
  get_sign_in_logs: { panel: "data" },
  get_directory_audit_logs: { panel: "data" },

  // Remediation
  generate_remediation_script: { panel: "remediation" },
  list_remediation_scripts: { panel: "remediation" },

  // Updates
  get_update_rings: { panel: "data" },
  get_update_compliance: { panel: "data" },

  // Reports
  generate_report: { panel: "data" },

  // App Management actions → App Health (refresh after changes)
  remove_app: { panel: "appHealth" },
  rename_app: { panel: "appHealth" },
  bulk_rename_apps: { panel: "appHealth" },

  // CVE Monitor
  get_cve_status: { panel: "cveMonitor" as TargetPanel },
  get_cve_list: { panel: "cveMonitor" as TargetPanel },
  scan_cves: { panel: "cveMonitor" as TargetPanel },

  // DO Simulator
  create_do_simulation: { panel: "doSimulator" as TargetPanel },
  analyze_do_simulation: { panel: "doSimulator" as TargetPanel },
  analyze_current_tenant_for_do: { panel: "doSimulator" as TargetPanel },
  generate_do_intune_profile: { panel: "doSimulator" as TargetPanel },
  list_do_simulations: { panel: "doSimulator" as TargetPanel },

  // Configuration Manager (co-management)
  get_comanagement_summary: { panel: "configMgr" as TargetPanel },
  get_comanaged_devices: { panel: "configMgr" as TargetPanel },
  get_comanagement_eligible_devices: { panel: "configMgr" as TargetPanel },
  get_configmgr_client_health: { panel: "configMgr" as TargetPanel },

  // Configuration Manager (on-prem AdminService)
  get_configmgr_connection_status: { panel: "configMgr" as TargetPanel },
  get_configmgr_collections: { panel: "configMgr" as TargetPanel },
  get_configmgr_deployments: { panel: "configMgr" as TargetPanel },
  get_configmgr_applications: { panel: "configMgr" as TargetPanel },
  trigger_configmgr_client_action: { panel: "configMgr" as TargetPanel },
  run_cmpivot_query: { panel: "configMgr" as TargetPanel },

  // Learning / Analytics
  get_learning_stats: { panel: "analytics" },
};

interface ChatApiResponse {
  response: string;
  toolResults: {
    name: string;
    data: unknown[];
    totalCount?: number;
    error?: string;
  }[];
  error?: string;
}

/**
 * Hook that sends a message to the agent backend via POST /api/chat/stream
 * and consumes the Server-Sent Events stream, updating the store in real time
 * so the UI can show the agent's steps and stream the answer token-by-token.
 */
export function useAgentStream() {
  const store = useChatStore;
  const streamingRef = useRef(false);

  const sendMessage = useCallback(async (userMessage: string) => {
    if (streamingRef.current) return;
    streamingRef.current = true;

    // Build conversation history BEFORE adding the new message (the server
    // appends the new message itself, so we must not duplicate it here).
    const history = store
      .getState()
      .messages.filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role, content: m.content }));

    const { beginTurn, noteToolCall, noteToolResult, appendStreamingText, endTurn, failTurn, addDataPanel } =
      store.getState();

    beginTurn(userMessage);
    useActivityStore.getState().addActivity("agent-chat");

    // Compute disabled tools based on settings panel toggles
    const panelVis = useSettingsStore.getState().panelVisibility;
    const disabledTools: string[] = [];
    for (const [panelId, tools] of Object.entries(PANEL_TO_TOOLS)) {
      if (panelVis[panelId] === false) {
        disabledTools.push(...tools);
      }
    }

    const toolNames: string[] = [];
    let navigated = false;
    let finalText = "";
    let errorText = "";

    const handleEvent = (event: SSEEvent) => {
      switch (event.type) {
        case "tool_call":
          noteToolCall(event.name);
          break;
        case "tool_result": {
          toolNames.push(event.name);
          const count =
            event.totalCount ?? (Array.isArray(event.data) ? event.data.length : undefined);
          noteToolResult(event.name, count, event.error);

          if (Array.isArray(event.data) && event.data.length > 0) {
            addDataPanel(event.name, event.data, event.totalCount);

            // Auto-navigate to the visual panel for the first data-bearing tool.
            if (!navigated) {
              const mapping = TOOL_PANEL_MAP[event.name];
              if (mapping) {
                let deviceName: string | undefined;
                if (mapping.deviceNameArg) {
                  const firstRow = event.data[0] as Record<string, unknown> | undefined;
                  deviceName = firstRow
                    ? String(firstRow.deviceName || firstRow.device_name || firstRow.name || "")
                    : undefined;
                  if (deviceName === "" || deviceName === "undefined") deviceName = undefined;
                }
                useNavigationStore.getState().navigateTo(mapping.panel, { deviceName });
                navigated = true;
              }
            }
          }
          break;
        }
        case "token":
          appendStreamingText(event.content);
          break;
        case "done":
          finalText = event.fullResponse;
          break;
        case "error":
          errorText = event.message;
          break;
      }
    };

    try {
      const response = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage, history, disabledTools }),
      });

      if (!response.ok || !response.body) {
        const text = await response.text().catch(() => "");
        throw new Error(text || `HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // Parse the SSE stream: events are separated by a blank line, fields by
      // newlines. We ignore ": " comment heartbeats.
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let sepIndex: number;
        while ((sepIndex = buffer.indexOf("\n\n")) !== -1) {
          const rawEvent = buffer.slice(0, sepIndex);
          buffer = buffer.slice(sepIndex + 2);

          const dataLines = rawEvent
            .split("\n")
            .filter((l) => l.startsWith("data:"))
            .map((l) => l.slice(5).replace(/^ /, ""));
          if (dataLines.length === 0) continue;

          try {
            handleEvent(JSON.parse(dataLines.join("\n")) as SSEEvent);
          } catch {
            /* ignore malformed event */
          }
        }
      }

      if (errorText && !finalText) {
        failTurn(errorText);
      } else {
        endTurn(finalText, toolNames);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      store.getState().failTurn(`Connection error: ${msg}`);
    } finally {
      streamingRef.current = false;
      useActivityStore.getState().removeActivity("agent-chat");
    }
  }, []);

  const isStreaming = useChatStore((s) => s.isStreaming);
  return { sendMessage, isStreaming };
}
