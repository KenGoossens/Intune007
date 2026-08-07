import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ChatMessage, DataPanel, DataPanelType } from "@intune-agent/shared";
import { TOOL_TO_PANEL_TYPE, TOOL_TO_PANEL_TITLE, formatToolTitle } from "@intune-agent/shared";

/** A single live step in the agent's reasoning trail (one per tool call). */
export interface StreamStep {
  name: string;
  status: "running" | "done" | "error";
  count?: number;
  error?: string;
}

interface ChatState {
  // Chat
  messages: ChatMessage[];
  isStreaming: boolean;
  activeToolCall: string | null;
  // Tool names used in the most recent agent turn (drives follow-up suggestions)
  lastToolNames: string[];

  // Live streaming state for the in-progress turn
  streamSteps: StreamStep[];
  streamingText: string;
  // Completed steps recorded per assistant message index (for review after the
  // turn finishes). Keyed by the message's index in `messages`.
  stepsByMessage: Record<number, StreamStep[]>;

  // Data panels
  dataPanels: DataPanel[];

  // Actions
  addUserMessage: (content: string) => void;
  addAssistantMessage: (content: string) => void;
  setStreaming: (streaming: boolean) => void;
  setActiveToolCall: (toolName: string | null) => void;
  setLastToolNames: (toolNames: string[]) => void;
  addDataPanel: (toolName: string, data: unknown[], totalCount?: number) => void;
  removePanel: (panelId: string) => void;
  clearPanels: () => void;
  clearChat: () => void;

  // Streaming lifecycle
  beginTurn: (userMessage: string) => void;
  noteToolCall: (name: string) => void;
  noteToolResult: (name: string, count?: number, error?: string) => void;
  appendStreamingText: (chunk: string) => void;
  endTurn: (fullResponse: string, toolNames: string[]) => void;
  failTurn: (message: string) => void;
}

let panelIdCounter = 0;
// Unique, collision-proof panel id. The timestamp prefix avoids clashes with
// panels restored from persisted storage after a reload (where the counter
// would otherwise restart from 0 and duplicate existing ids).
function nextPanelId(): string {
  return `panel-${Date.now().toString(36)}-${++panelIdCounter}`;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      messages: [],
      isStreaming: false,
      activeToolCall: null,
      lastToolNames: [],
      streamSteps: [],
      streamingText: "",
      stepsByMessage: {},
      dataPanels: [],

      addUserMessage: (content: string) =>
        set((state) => ({
          messages: [...state.messages, { role: "user", content }],
          // Clear stale follow-up suggestions as soon as a new turn begins
          lastToolNames: [],
        })),

      addAssistantMessage: (content: string) =>
        set((state) => ({
          messages: [...state.messages, { role: "assistant", content }],
        })),

      setStreaming: (streaming: boolean) =>
        set({ isStreaming: streaming }),

      setActiveToolCall: (toolName: string | null) =>
        set({ activeToolCall: toolName }),

      setLastToolNames: (toolNames: string[]) =>
        set({ lastToolNames: toolNames }),

      addDataPanel: (toolName: string, data: unknown[], totalCount?: number) =>
        set((state) => ({
          activeToolCall: null,
          dataPanels: [
            ...state.dataPanels,
            {
              id: nextPanelId(),
              type: (TOOL_TO_PANEL_TYPE[toolName] || "devices") as DataPanelType,
              title: formatToolTitle(toolName),
              data,
              totalCount,
              timestamp: new Date(),
            },
          ],
        })),

      clearPanels: () => set({ dataPanels: [] }),

      removePanel: (panelId: string) =>
        set((state) => ({
          dataPanels: state.dataPanels.filter((p) => p.id !== panelId),
        })),

      clearChat: () =>
        set({
          messages: [],
          dataPanels: [],
          isStreaming: false,
          activeToolCall: null,
          lastToolNames: [],
          streamSteps: [],
          streamingText: "",
          stepsByMessage: {},
        }),

      // ─── Streaming lifecycle ──────────────────────────────────────
      beginTurn: (userMessage: string) =>
        set((state) => ({
          messages: [...state.messages, { role: "user", content: userMessage }],
          isStreaming: true,
          activeToolCall: "processing",
          lastToolNames: [],
          streamSteps: [],
          streamingText: "",
        })),

      noteToolCall: (name: string) =>
        set((state) => ({
          activeToolCall: name,
          // Any text streamed before a tool call is a transient "thought" —
          // clear it so it doesn't bleed into the final answer.
          streamingText: "",
          streamSteps: [...state.streamSteps, { name, status: "running" }],
        })),

      noteToolResult: (name: string, count?: number, error?: string) =>
        set((state) => {
          // Mark the most recent running step with this name as finished.
          const steps = [...state.streamSteps];
          for (let i = steps.length - 1; i >= 0; i--) {
            if (steps[i].name === name && steps[i].status === "running") {
              steps[i] = {
                ...steps[i],
                status: error ? "error" : "done",
                count,
                error,
              };
              break;
            }
          }
          return { streamSteps: steps, activeToolCall: null };
        }),

      appendStreamingText: (chunk: string) =>
        set((state) => ({
          activeToolCall: null,
          streamingText: state.streamingText + chunk,
        })),

      endTurn: (fullResponse: string, toolNames: string[]) =>
        set((state) => {
          const content = fullResponse || state.streamingText || "No response.";
          const assistantIndex = state.messages.length;
          const stepsByMessage = { ...state.stepsByMessage };
          if (state.streamSteps.length > 0) {
            stepsByMessage[assistantIndex] = state.streamSteps;
          }
          return {
            messages: [...state.messages, { role: "assistant", content }],
            stepsByMessage,
            isStreaming: false,
            activeToolCall: null,
            streamSteps: [],
            streamingText: "",
            lastToolNames: toolNames,
          };
        }),

      failTurn: (message: string) =>
        set((state) => {
          const assistantIndex = state.messages.length;
          const stepsByMessage = { ...state.stepsByMessage };
          if (state.streamSteps.length > 0) {
            stepsByMessage[assistantIndex] = state.streamSteps;
          }
          return {
            messages: [...state.messages, { role: "assistant", content: message }],
            stepsByMessage,
            isStreaming: false,
            activeToolCall: null,
            streamSteps: [],
            streamingText: "",
          };
        }),
    }),
    {
      name: "intune007-chat",
      partialize: (state) => ({
        messages: state.messages,
        dataPanels: state.dataPanels,
        lastToolNames: state.lastToolNames,
        stepsByMessage: state.stepsByMessage,
      }),
    }
  )
);
