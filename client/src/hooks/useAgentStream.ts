import { useCallback, useRef } from "react";
import { useChatStore } from "../stores/chatStore.ts";
import { useActivityStore } from "../stores/activityStore.ts";

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

      // Add tool result panels
      for (const toolResult of data.toolResults) {
        if (toolResult.data && toolResult.data.length > 0) {
          addDataPanel(
            toolResult.name,
            toolResult.data,
            toolResult.totalCount
          );
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
