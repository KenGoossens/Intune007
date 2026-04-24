import { create } from "zustand";
import type { ChatMessage, DataPanel, DataPanelType } from "@intune-agent/shared";
import { TOOL_TO_PANEL_TYPE, TOOL_TO_PANEL_TITLE } from "@intune-agent/shared";

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
  clearPanels: () => void;
  clearChat: () => void;
}

let panelIdCounter = 0;

export const useChatStore = create<ChatState>((set) => ({
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
          title: TOOL_TO_PANEL_TITLE[toolName] || toolName,
          data,
          totalCount,
          timestamp: new Date(),
        },
      ],
    })),

  clearPanels: () => set({ dataPanels: [] }),

  clearChat: () =>
    set({
      messages: [],
      dataPanels: [],
      isStreaming: false,
      activeToolCall: null,
    }),
}));
