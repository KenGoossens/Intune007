import { Router, type Request, type Response } from "express";
import { runAgentLoop } from "../agent/agent.js";
import type { ChatRequest } from "@intune-agent/shared";
import type { ToolResult } from "../agent/executor.js";

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
  const { message, history } = req.body as ChatRequest;

  if (!message || typeof message !== "string") {
    res.status(400).json({ error: "Missing or invalid 'message' field" });
    return;
  }

  const toolResults: CollectedToolResult[] = [];
  let finalResponse = "";
  let agentError: string | null = null;

  try {
    await runAgentLoop(message, history || [], {
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
    });

    res.json({
      response: finalResponse || agentError || "No response generated.",
      toolResults,
      error: agentError,
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[Route] Unhandled error:", errMsg);
    res.status(500).json({
      response: `Error: ${errMsg}`,
      toolResults,
      error: errMsg,
    });
  }
});

export default router;
