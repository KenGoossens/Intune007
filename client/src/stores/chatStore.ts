import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ChatMessage, DataPanel, DataPanelType } from "@intune-agent/shared";
import { TOOL_TO_PANEL_TYPE, TOOL_TO_PANEL_TITLE, formatToolTitle } from "@intune-agent/shared";

interface ChatState {
  // Chat
  messages: ChatMessage[];
  isStreaming: boolean;
  activeToolCall: string | null;

  // Data panels
  dataPanels: DataPanel[];

  // Actions
  addUserMessage: (content: string) => void;
  addAssistantMessage: (content: string) => void;
  setStreaming: (streaming: boolean) => void;
  setActiveToolCall: (toolName: string | null) => void;
  addDataPanel: (toolName: string, data: unknown[], totalCount?: number) => void;
  removePanel: (panelId: string) => void;
  clearPanels: () => void;
  clearChat: () => void;
}

let panelIdCounter = 0;

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      messages: [],
      isStreaming: false,
      activeToolCall: null,
      dataPanels: [],

      addUserMessage: (content: string) =>
        set((state) => ({
          messages: [...state.messages, { role: "user", content }],
        })),

      addAssistantMessage: (content: string) =>
        set((state) => ({
          messages: [...state.messages, { role: "assistant", content }],
        })),

      setStreaming: (streaming: boolean) =>
        set({ isStreaming: streaming }),

      setActiveToolCall: (toolName: string | null) =>
        set({ activeToolCall: toolName }),

      addDataPanel: (toolName: string, data: unknown[], totalCount?: number) =>
        set((state) => ({
          activeToolCall: null,
          dataPanels: [
            ...state.dataPanels,
            {
              id: `panel-${++panelIdCounter}`,
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
        }),
    }),
    {
      name: "intune007-chat",
      partialize: (state) => ({
        messages: state.messages,
        dataPanels: state.dataPanels,
      }),
    }
  )
);
