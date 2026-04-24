import { AzureOpenAI } from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionToolMessageParam,
} from "openai/resources/chat/completions.js";
import { config } from "../config.js";
import { agentTools } from "./tools.js";
import { executeTool, type ToolResult } from "./executor.js";
import type { ChatMessage } from "@intune-agent/shared";
import { analyticsTracker } from "../analytics/tracker.js";
import { getRecentContext } from "./memory.js";

const SYSTEM_PROMPT = `You are an Intune administration assistant called "Intune007 Agent". You help IT administrators query, understand, and manage their Microsoft Intune environment.

Use the provided tools to interact with Microsoft Intune via Microsoft Graph API. You have access to tools for:
- Managed devices (list, filter, details)
- Device actions (sync, restart, lock, reset passcode, retire, wipe)
- Compliance policies and compliance status summaries
- Device configuration profiles
- Mobile apps and app install status
- Conditional Access policies
- Windows Autopilot devices and deployment profiles
- Azure AD groups (list, members, create, add members)
- Security alerts and threat intelligence
- Audit logs and sign-in logs
- Policy and assignment management (create, assign, update)
- Windows Update management
- Remediation script generation and deployment
- Policy analysis and health scoring

Guidelines:
- Always use $filter and $select parameters when possible to keep results focused and efficient.
- When listing items, summarize the results clearly. Mention the total count if available.
- Present data with clear formatting — use tables, bullet points, or numbered lists as appropriate.
- If the user asks about something you can't query with your tools, explain what you can help with.
- If a tool returns an error, explain the issue in plain language and suggest what the user can do.
- Be concise but thorough. IT admins want actionable information.
- When you don't know a device ID or app ID, first search by name using filters, then use the ID for detailed queries.

SAFETY — Destructive Actions:
- For retire_device and wipe_device: ALWAYS confirm with the user before executing. Show the device name, user, and OS first.
- For restart_device: warn the user that unsaved work may be lost.
- Never execute destructive actions on multiple devices without explicit confirmation for each.
- If the user asks to wipe or retire "all" devices, refuse and ask them to specify individual devices.`;

/**
 * Callback type for streaming SSE events to the client during the agent loop.
 */
export interface AgentStreamCallbacks {
  onToolCall: (name: string, args: Record<string, unknown>) => void;
  onToolResult: (name: string, result: ToolResult) => void;
  onToken: (content: string) => void;
  onDone: (fullResponse: string) => void;
  onError: (message: string) => void;
}

/**
 * Creates an AzureOpenAI client instance.
 */
function createOpenAIClient(): AzureOpenAI {
  return new AzureOpenAI({
    apiKey: config.azureOpenAI.apiKey,
    endpoint: config.azureOpenAI.endpoint,
    deployment: config.azureOpenAI.deployment,
    apiVersion: config.azureOpenAI.apiVersion,
  });
}

/**
 * Converts our ChatMessage format to the OpenAI SDK message format.
 */
function toOpenAIMessages(
  history: ChatMessage[]
): ChatCompletionMessageParam[] {
  return history.map((msg) => {
    if (msg.role === "tool") {
      return {
        role: "tool" as const,
        content: msg.content,
        tool_call_id: msg.toolCallId || "",
      } satisfies ChatCompletionToolMessageParam;
    }
    if (msg.role === "assistant" && msg.toolCalls && msg.toolCalls.length > 0) {
      return {
        role: "assistant" as const,
        content: msg.content || null,
        tool_calls: msg.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: {
            name: tc.name,
            arguments: tc.arguments,
          },
        })),
      };
    }
    return {
      role: msg.role as "system" | "user" | "assistant",
      content: msg.content,
    };
  });
}

/**
 * Runs the agent loop: sends messages to Azure OpenAI with tools,
 * executes tool calls, streams results via callbacks, and repeats
 * until the model produces a final text response.
 */
export async function runAgentLoop(
  userMessage: string,
  history: ChatMessage[],
  callbacks: AgentStreamCallbacks
): Promise<void> {
  console.log(`\n[Agent] New request: "${userMessage}"`);
  const client = createOpenAIClient();
  const tracker = analyticsTracker.startRequest(userMessage, config.azureOpenAI.deployment);

  // Build the message list: system prompt + memory context + history + new user message
  const memoryContext = getRecentContext(10);
  const systemContent = memoryContext
    ? `${SYSTEM_PROMPT}\n\n--- Agent Memory (saved notes) ---\n${memoryContext}`
    : SYSTEM_PROMPT;

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemContent },
    ...toOpenAIMessages(history),
    { role: "user", content: userMessage },
  ];

  const MAX_ITERATIONS = 10; // Safety limit to prevent infinite loops
  let iterations = 0;

  try {
    while (iterations < MAX_ITERATIONS) {
      iterations++;

      console.log(`[Agent] Iteration ${iterations} — calling Azure OpenAI...`);
      const startTime = Date.now();

      const completion = await client.chat.completions.create({
        model: config.azureOpenAI.deployment,
        messages,
        tools: agentTools,
        tool_choice: "auto",
      });

      console.log(`[Agent] OpenAI responded in ${Date.now() - startTime}ms — finish_reason: ${completion.choices[0]?.finish_reason}`);

      // Track token usage from this iteration
      if (completion.usage) {
        tracker.addTokenUsage(
          completion.usage.prompt_tokens,
          completion.usage.completion_tokens
        );
      }

      const choice = completion.choices[0];
      if (!choice) {
        callbacks.onError("No response from Azure OpenAI");
        return;
      }

      const assistantMessage = choice.message;

      // Append assistant message to conversation
      messages.push(assistantMessage);

      // If the model wants to call tools
      if (
        choice.finish_reason === "tool_calls" ||
        (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0)
      ) {
        for (const toolCall of assistantMessage.tool_calls ?? []) {
          const toolName = toolCall.function.name;
          const toolArgs = toolCall.function.arguments;

          // Notify client that a tool is being called
          let parsedArgs: Record<string, unknown> = {};
          try {
            parsedArgs = JSON.parse(toolArgs || "{}");
          } catch {
            // If args parsing fails, continue with empty args
          }
          callbacks.onToolCall(toolName, parsedArgs);

          // Execute the tool
          console.log(`[Agent] Executing tool: ${toolName}`, parsedArgs);
          const toolStart = Date.now();
          const result = await executeTool(toolName, toolArgs);
          const toolDuration = Date.now() - toolStart;
          console.log(`[Agent] Tool ${toolName} completed in ${toolDuration}ms — ${result.data.length} items${result.error ? ` (error: ${result.error})` : ''}`);

          // Track tool call analytics
          tracker.addToolCall({
            name: toolName,
            durationMs: toolDuration,
            resultCount: result.data.length,
            error: result.error,
          });

          // Notify client of the tool result (for data panel rendering)
          callbacks.onToolResult(toolName, result);

          // Add tool result to conversation for the model
          const toolMessage: ChatCompletionToolMessageParam = {
            role: "tool",
            tool_call_id: toolCall.id,
            content: result.error
              ? JSON.stringify({ error: result.error })
              : JSON.stringify({
                  data: result.data,
                  totalCount: result.totalCount,
                }),
          };
          messages.push(toolMessage);
        }
        // Continue the loop — model will receive tool results and respond
        continue;
      }

      // Model produced a final text response
      if (choice.finish_reason === "stop" || choice.finish_reason === "length") {
        const content = assistantMessage.content || "";
        console.log(`[Agent] Final response (${content.length} chars)`);
        tracker.finish();
        callbacks.onToken(content);
        callbacks.onDone(content);
        return;
      }

      // Unexpected finish reason
      tracker.setError(`Unexpected finish reason: ${choice.finish_reason}`);
      tracker.finish();
      callbacks.onError(
        `Unexpected finish reason: ${choice.finish_reason}`
      );
      return;
    }

    // If we hit the iteration limit
    tracker.setError("Max iteration limit reached");
    tracker.finish();
    callbacks.onError(
      "Agent reached maximum iteration limit. Please try a more specific question."
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Agent loop error:", message);
    tracker.setError(message);
    tracker.finish();
    callbacks.onError(`Agent error: ${message}`);
  }
}
