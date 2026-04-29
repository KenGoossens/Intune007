import { Router, type Request, type Response } from "express";
import { runAgentLoop } from "../agent/agent.js";
import type { ChatRequest, ChatMessage } from "@intune-agent/shared";
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

export default router;
