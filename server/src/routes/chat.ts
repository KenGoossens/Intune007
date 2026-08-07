import { Router, type Request, type Response } from "express";
import { runAgentLoop } from "../agent/agent.js";
import type { ChatRequest, ChatMessage, SSEEvent } from "@intune-agent/shared";
import type { ToolResult } from "../agent/executor.js";
import { validateChatInput, sanitizeErrorMessage } from "../security.js";

const router = Router();

interface CollectedToolResult {
  name: string;
  data: unknown[];
  totalCount?: number;
  error?: string;
}

/**
 * POST /api/chat
 *
 * Accepts a user message and conversation history, runs the agent loop,
 * and returns the complete result as JSON.
 *
 * Response: {
 *   response: string,         // The agent's final text answer
 *   toolResults: [...]         // Data from any Graph API tools that were called
 *   error?: string             // If something went wrong
 * }
 */
router.post("/", async (req: Request, res: Response) => {
  // Validate and sanitize input
  const validation = validateChatInput(req.body);
  if ("error" in validation) {
    res.status(400).json({ error: validation.error });
    return;
  }

  const { message, history, disabledTools } = validation;

  const toolResults: CollectedToolResult[] = [];
  let finalResponse = "";
  let agentError: string | null = null;

  try {
    await runAgentLoop(message, (history || []) as ChatMessage[], {
      onToolCall(name: string, _args: Record<string, unknown>) {
        console.log(`[Route] Tool call: ${name}`);
      },
      onToolResult(name: string, result: ToolResult) {
        console.log(`[Route] Tool result: ${name} — ${result.data.length} items`);
        toolResults.push({
          name,
          data: result.data,
          totalCount: result.totalCount,
          error: result.error,
        });
      },
      onToken(_content: string) {
        // Not used in JSON mode
      },
      onDone(fullResponse: string) {
        finalResponse = fullResponse;
      },
      onError(message: string) {
        agentError = message;
      },
    }, disabledTools);

    res.json({
      response: finalResponse || agentError || "No response generated.",
      toolResults,
      error: agentError,
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[Route] Unhandled error:", errMsg);
    res.status(500).json({
      response: "An error occurred processing your request.",
      toolResults,
      error: sanitizeErrorMessage(errMsg),
    });
  }
});

/**
 * POST /api/chat/stream
 *
 * Same input as POST /api/chat, but streams the agent's progress in real time
 * via Server-Sent Events so the client can follow the agent's steps and watch
 * the answer generate token-by-token. Events emitted (one JSON object per
 * `data:` line):
 *   - tool_call    { name, arguments }      — a tool is about to run
 *   - tool_result  { name, data, totalCount, error } — a tool finished
 *   - token        { content }              — a chunk of the answer
 *   - done         { fullResponse }         — the final answer is complete
 *   - error        { message }              — something went wrong
 */
router.post("/stream", async (req: Request, res: Response) => {
  // Validate and sanitize input
  const validation = validateChatInput(req.body);
  if ("error" in validation) {
    res.status(400).json({ error: validation.error });
    return;
  }

  const { message, history, disabledTools } = validation;

  // Set up the SSE stream. `no-transform` + `X-Accel-Buffering: no` prevent any
  // intermediary (or the dev proxy) from buffering events.
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  let closed = false;
  const send = (event: SSEEvent) => {
    if (closed) return;
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  // Heartbeat comments keep the connection alive through idle gaps.
  const heartbeat = setInterval(() => {
    if (!closed) res.write(`: ping\n\n`);
  }, 15000);

  // Stop work if the client disconnects.
  req.on("close", () => {
    closed = true;
    clearInterval(heartbeat);
  });

  try {
    await runAgentLoop(
      message,
      (history || []) as ChatMessage[],
      {
        onToolCall(name: string, args: Record<string, unknown>) {
          send({ type: "tool_call", name, arguments: args });
        },
        onToolResult(name: string, result: ToolResult) {
          send({
            type: "tool_result",
            name,
            data: result.data,
            totalCount: result.totalCount,
            error: result.error,
          });
        },
        onToken(content: string) {
          send({ type: "token", content });
        },
        onDone(fullResponse: string) {
          send({ type: "done", fullResponse });
        },
        onError(errMessage: string) {
          send({ type: "error", message: sanitizeErrorMessage(errMessage) });
        },
      },
      disabledTools,
      { stream: true }
    );
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[Route] Unhandled streaming error:", errMsg);
    send({ type: "error", message: sanitizeErrorMessage(errMsg) });
  } finally {
    clearInterval(heartbeat);
    if (!closed) res.end();
  }
});

export default router;
