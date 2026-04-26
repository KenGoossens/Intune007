import { useState, useRef, useEffect, useCallback } from "react";
import {
  Send,
  Loader2,
  Trash2,
  ThumbsUp,
  ThumbsDown,
  Bot,
  User,
  Search,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useChatStore } from "../stores/chatStore.ts";
import { formatToolTitle } from "@intune-agent/shared";
import { useAgentStream } from "../hooks/useAgentStream.ts";
import { useNavigationStore } from "../stores/navigationStore.ts";

export default function ChatPanel({ onClose }: { onClose?: () => void }) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { messages, isStreaming, activeToolCall, clearChat } = useChatStore();
  const { sendMessage } = useAgentStream();

  // Auto-execute queries from cross-panel navigation
  const pendingNav = useNavigationStore((s) => s.pendingNavigation);
  const clearNavigation = useNavigationStore((s) => s.clearNavigation);

  useEffect(() => {
    if (pendingNav?.query && !isStreaming) {
      const query = pendingNav.query;
      clearNavigation();
      // Small delay to let panel switch render first
      setTimeout(() => sendMessage(query), 150);
    }
  }, [pendingNav, isStreaming, clearNavigation, sendMessage]);

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
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      code({ className, children, ...props }) {
                        const match = /language-(\w+)/.exec(className || "");
                        const codeString = String(children).replace(/\n$/, "");
                        // Heuristic: if no language tag but looks like PowerShell, highlight as powershell
                        const lang = match?.[1] || (looksLikePowerShell(codeString) ? "powershell" : "");
                        if (lang || codeString.includes("\n")) {
                          return (
                            <SyntaxHighlighter
                              style={oneDark}
                              language={lang || "text"}
                              PreTag="div"
                              customStyle={{
                                margin: "0.5em 0",
                                borderRadius: "8px",
                                fontSize: "0.8em",
                                border: "1px solid #374151",
                              }}
                            >
                              {codeString}
                            </SyntaxHighlighter>
                          );
                        }
                        return (
                          <code className={className} {...props}>
                            {children}
                          </code>
                        );
                      },
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                </div>
              )}
            </div>
            {msg.role === "user" && (
              <div className="w-7 h-7 bg-gray-700 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                <User size={14} />
              </div>
            )}
            {msg.role === "assistant" && msg.content && (
              <FeedbackButtons messageIndex={i} />
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
                  {formatToolTitle(activeToolCall)}
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

// formatToolName removed — using shared formatToolTitle instead

function looksLikePowerShell(code: string): boolean {
  const indicators = [
    /\$\w+/,                          // $variables
    /\b(Get-|Set-|New-|Remove-|Start-|Stop-|Test-|Write-|Import-|Export-)/i,  // cmdlets
    /\b(try|catch|finally|param|function|if|else|foreach|ForEach-Object)\b/,
    /\bWrite-(Host|Output|Error|Warning|Verbose)\b/i,
    /\$ErrorActionPreference/,
    /\bexit\s+[01]\b/,
    /\b(Invoke-|Select-Object|Where-Object|Out-Null)\b/i,
    /\[string\]|\[int\]|\[bool\]/,
  ];
  return indicators.some((re) => re.test(code));
}

/** Thumbs up / thumbs down feedback buttons for agent responses */
function FeedbackButtons({ messageIndex }: { messageIndex: number }) {
  const [feedback, setFeedback] = useState<1 | -1 | null>(null);
  const [sending, setSending] = useState(false);

  const sendFeedback = useCallback(async (score: 1 | -1) => {
    if (feedback !== null || sending) return;
    setSending(true);
    try {
      await fetch("http://localhost:3001/api/learning/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score }),
      });
      setFeedback(score);
    } catch {
      // silently fail
    } finally {
      setSending(false);
    }
  }, [feedback, sending]);

  return (
    <div className="flex items-center gap-1 mt-1 self-start ml-10">
      <button
        onClick={() => sendFeedback(1)}
        disabled={feedback !== null || sending}
        className={`p-1 rounded transition-all ${
          feedback === 1
            ? "text-green-400"
            : feedback === null
            ? "text-gray-600 hover:text-green-400 hover:bg-gray-800"
            : "text-gray-700 cursor-default"
        }`}
        title="Good response"
      >
        <ThumbsUp size={13} />
      </button>
      <button
        onClick={() => sendFeedback(-1)}
        disabled={feedback !== null || sending}
        className={`p-1 rounded transition-all ${
          feedback === -1
            ? "text-red-400"
            : feedback === null
            ? "text-gray-600 hover:text-red-400 hover:bg-gray-800"
            : "text-gray-700 cursor-default"
        }`}
        title="Bad response"
      >
        <ThumbsDown size={13} />
      </button>
      {feedback === 1 && (
        <span className="text-[10px] text-green-500 ml-1">Learned!</span>
      )}
      {feedback === -1 && (
        <span className="text-[10px] text-gray-500 ml-1">Noted</span>
      )}
    </div>
  );
}
