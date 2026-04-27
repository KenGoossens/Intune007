import { useCallback, useRef } from "react";
import { useChatStore } from "../stores/chatStore.ts";
import { useActivityStore } from "../stores/activityStore.ts";
import { useNavigationStore, type TargetPanel } from "../stores/navigationStore.ts";

/**
 * Map of tool names to the panel they should auto-navigate to.
 * When the agent calls one of these tools, the UI navigates to the panel
 * so the user sees both the text AND visual output.
 */
const TOOL_PANEL_MAP: Record<string, { panel: TargetPanel; deviceNameArg?: string; query?: boolean }> = {
  get_device_timeline: { panel: "timeline", deviceNameArg: "deviceName" },
  run_troubleshooter: { panel: "troubleshooter", deviceNameArg: "deviceName" },
  get_device_card: { panel: "deviceCard", deviceNameArg: "deviceName" },
  check_autopilot_readiness: { panel: "autopilotReadiness" },
  get_security_posture: { panel: "securityPosture" },
  get_app_health: { panel: "appHealth" },
  get_device_risk_scores: { panel: "riskScores" },
  run_compliance_forecast: { panel: "forecast" },
  analyze_policies: { panel: "policies" },
  get_learning_stats: { panel: "analytics" },
  create_compliance_policy: { panel: "policyBuilder" },
  get_cve_status: { panel: "cveMonitor" as TargetPanel },
  get_cve_list: { panel: "cveMonitor" as TargetPanel },
  scan_cves: { panel: "cveMonitor" as TargetPanel },
  scan_app_icons: { panel: "appHealth" },
  get_managed_devices: { panel: "data" },
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
 * Hook that sends a message to the agent backend via POST /api/chat
 * and processes the JSON response, updating the store with results.
 */
export function useAgentStream() {
  const store = useChatStore;
  const streamingRef = useRef(false);

  const sendMessage = useCallback(async (userMessage: string) => {
    if (streamingRef.current) return;
    streamingRef.current = true;

    const {
      addUserMessage,
      addAssistantMessage,
      setStreaming,
      setActiveToolCall,
      addDataPanel,
    } = store.getState();

    addUserMessage(userMessage);
    setStreaming(true);
    setActiveToolCall("processing");
    useActivityStore.getState().addActivity("agent-chat");

    // Build conversation history from store (user + assistant messages only)
    const currentMessages = store.getState().messages;
    const history = currentMessages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage, history }),
      });

      const data: ChatApiResponse = await response.json();

      // Add tool result panels + auto-navigate to relevant panel
      let navigated = false;
      for (const toolResult of data.toolResults) {
        if (toolResult.data && toolResult.data.length > 0) {
          addDataPanel(
            toolResult.name,
            toolResult.data,
            toolResult.totalCount
          );

          // Auto-navigate to the visual panel for this tool
          if (!navigated) {
            const mapping = TOOL_PANEL_MAP[toolResult.name];
            if (mapping) {
              // Try to extract device name from result data
              let deviceName: string | undefined;
              if (mapping.deviceNameArg) {
                const firstRow = toolResult.data[0] as Record<string, unknown> | undefined;
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
      }

      // Add assistant message
      addAssistantMessage(data.response || data.error || "No response.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const { addAssistantMessage } = store.getState();
      addAssistantMessage(`Connection error: ${msg}`);
    } finally {
      const { setStreaming, setActiveToolCall } = store.getState();
      setStreaming(false);
      setActiveToolCall(null);
      streamingRef.current = false;
      useActivityStore.getState().removeActivity("agent-chat");
    }
  }, []);

  const isStreaming = useChatStore((s) => s.isStreaming);
  return { sendMessage, isStreaming };
}
