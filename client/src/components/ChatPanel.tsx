import { useState, useRef, useEffect } from "react";
import {
  Send,
  Loader2,
  Trash2,
  Bot,
  User,
  Search,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useChatStore } from "../stores/chatStore.ts";
import { useAgentStream } from "../hooks/useAgentStream.ts";

export default function ChatPanel({ onClose }: { onClose?: () => void }) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { messages, isStreaming, activeToolCall, clearChat } = useChatStore();
  const { sendMessage } = useAgentStream();

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeToolCall]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    setInput("");
    sendMessage(trimmed);
  };

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
            <Bot size={18} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">Intune007 Agent</h2>
            <p className="text-xs text-gray-400">AI-Powered Intune Management</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={clearChat}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
            title="Clear conversation"
          >
            <Trash2 size={16} />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
              title="Close agent"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-500">
            <Bot size={48} className="mb-4 text-gray-600" />
            <h3 className="text-lg font-medium text-gray-300 mb-2">
              Welcome to Intune007
            </h3>
            <p className="text-sm max-w-sm mb-6">
              Ask me anything about your Intune-managed devices, policies,
              apps, Conditional Access, and Autopilot.
            </p>
            <div className="grid gap-2 w-full max-w-sm">
              {[
                "How many managed devices do I have?",
                "Show me non-compliant devices",
                "List all Azure AD security groups",
                "Show recent security alerts",
                "What apps are deployed?",
                "Sync a device with Intune",
                "Show me the audit logs",
                "Check Windows Update compliance",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => {
                    setInput(suggestion);
                    inputRef.current?.focus();
                  }}
                  className="flex items-center gap-2 text-left text-sm px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-750 text-gray-300 hover:text-white transition-colors border border-gray-700 hover:border-gray-600"
                >
                  <Search size={14} className="text-gray-500 shrink-0" />
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {msg.role === "assistant" && (
              <div className="w-7 h-7 bg-brand-600 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                <Bot size={14} />
              </div>
            )}
            <div
              className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-brand-600 text-white"
                  : "bg-gray-800 text-gray-200"
              }`}
            >
              {msg.role === "user" ? (
                <div className="whitespace-pre-wrap">{msg.content}</div>
              ) : (
                <div className="chat-markdown">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              )}
            </div>
            {msg.role === "user" && (
              <div className="w-7 h-7 bg-gray-700 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                <User size={14} />
              </div>
            )}
          </div>
        ))}

        {/* Active tool call indicator */}
        {activeToolCall && (
          <div className="flex gap-3 justify-start">
            <div className="w-7 h-7 bg-brand-600 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
              <Bot size={14} />
            </div>
            <div className="bg-gray-800 rounded-xl px-4 py-2.5 text-sm text-gray-300 flex items-center gap-2">
              <Loader2 size={14} className="animate-spin text-brand-400" />
              <span>
                Querying{" "}
                <span className="text-brand-400 font-medium">
                  {formatToolName(activeToolCall)}
                </span>
                ...
              </span>
            </div>
          </div>
        )}

        {/* Streaming indicator (after tool calls complete) */}
        {isStreaming && !activeToolCall && messages[messages.length - 1]?.role === "user" && (
          <div className="flex gap-3 justify-start">
            <div className="w-7 h-7 bg-brand-600 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
              <Bot size={14} />
            </div>
            <div className="bg-gray-800 rounded-xl px-4 py-2.5 text-sm text-gray-400 flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" />
              Thinking...
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="px-4 py-3 border-t border-gray-800"
      >
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your Intune environment..."
            disabled={isStreaming}
            className="flex-1 bg-gray-800 text-white text-sm rounded-xl px-4 py-2.5 border border-gray-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 placeholder-gray-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isStreaming || !input.trim()}
            className="bg-brand-600 hover:bg-brand-700 disabled:bg-gray-700 disabled:text-gray-500 text-white p-2.5 rounded-xl transition-colors"
          >
            {isStreaming ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Send size={18} />
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

function formatToolName(toolName: string): string {
  return toolName
    .replace(/^get_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
