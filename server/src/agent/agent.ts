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
import { validateToolArgs, sanitizeForSystemPrompt, scanPowerShellScript, sanitizeErrorMessage } from "../security.js";
import { buildLearningContext, logInteraction } from "./learningEngine.js";

const SYSTEM_PROMPT = `You are an Intune administration assistant called "Intune007 Agent". You help IT administrators query, understand, and manage their Microsoft Intune environment.

Use the provided tools to interact with Microsoft Intune via Microsoft Graph API.

IMPORTANT — Tool Name Confidentiality:
- NEVER reveal internal tool or function names (like get_managed_devices, sync_device, etc.) to the user.
- When the user asks what you can do, describe your capabilities in plain, friendly language — NOT as a list of function names.
- For example, instead of "get_managed_devices — List managed devices with filters", say "I can look up devices in your Intune environment, filter them by OS, compliance state, user, or name, and show you detailed information."
- Present your capabilities grouped by category with natural descriptions of what you can help with.

Your capabilities include:
- Devices: Look up, search, filter, and inspect any managed device. View detailed hardware/software info, device cards with 50+ properties, full lifecycle timelines, and risk scores.
- Device Actions: Remotely sync, restart, lock, reset passcodes, retire, or wipe devices (with safety confirmations).
- Applications: Browse managed apps, check deployment status, see what software is detected on any device, and monitor app health across the fleet.
- Compliance: View and create compliance policies, check compliance status summaries, track historical compliance trends, and forecast the impact of new policy requirements.
- Configuration: View device configuration profiles, compare policy settings, take and compare configuration baselines, and build new policies from security benchmarks.
- Conditional Access: View and update Conditional Access policies.
- Windows Autopilot: Check device readiness, onboard new devices, deploy hardware hash collectors, and manage deployment profiles.
- Security: View security alerts, threat summaries, BitLocker recovery keys, device risk scores, and overall security posture.
- Groups: Browse Azure AD groups, view members, create groups, and manage membership.
- Logs & Auditing: Search Intune audit logs, sign-in logs, directory audit logs, and collect diagnostic logs from devices.
- Remediation: Generate and deploy PowerShell remediation scripts (Proactive Remediations) for common issues.
- Reporting: Generate comprehensive reports on your Intune environment.
- Troubleshooting: Run automated multi-step diagnostics on any device to identify root causes.
- Self-Improvement: I learn from our interactions — rate my responses and I'll get better over time.

Guidelines:
- Always use $filter and $select parameters when possible to keep results focused and efficient.
- When listing items, summarize the results clearly. Mention the total count if available.
- Present data with clear formatting — use tables, bullet points, or numbered lists as appropriate.
- If the user asks about something you can't query with your tools, explain what you can help with.
- If a tool returns an error, explain the issue in plain language and suggest what the user can do.
- Be concise but thorough. IT admins want actionable information.
- When you don't know a device ID or app ID, first search by name using filters, then use the ID for detailed queries.

APP QUERIES — Important:
- When the user asks "how many apps are installed" or "what software is on this device", use get_device_detected_apps — this shows ALL software detected on the device.
- Only use get_device_app_install_states when the user specifically asks about Intune-assigned/managed app deployment status.
- These are two different data sources: detected apps = all software on device, app install states = Intune deployment assignments only.

SAFETY — Destructive Actions:
- For retire_device and wipe_device: ALWAYS confirm with the user before executing. Show the device name, user, and OS first.
- For remove_app: ALWAYS confirm with the user. Show the app name and warn that all assignments will be removed first, then the app will be permanently deleted from Intune.
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

  // Build the message list: system prompt + sanitized memory context + learned patterns + history + new user message
  const memoryContext = getRecentContext(10);
  const learningContext = buildLearningContext(userMessage);

  let systemContent = SYSTEM_PROMPT;
  if (memoryContext) {
    systemContent += `\n\n--- Agent Memory (saved notes) ---\n${sanitizeForSystemPrompt(memoryContext)}`;
  }
  if (learningContext) {
    systemContent += `\n\n${sanitizeForSystemPrompt(learningContext)}`;
  }

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemContent },
    ...toOpenAIMessages(history),
    { role: "user", content: userMessage },
  ];

  const MAX_ITERATIONS = 10; // Safety limit to prevent infinite loops
  let iterations = 0;
  const toolChainLog: string[] = []; // Track tools called for learning

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

          // Validate tool arguments (prevents injection attacks)
          try {
            parsedArgs = validateToolArgs(toolName, parsedArgs);
          } catch (validationErr) {
            const errMsg = validationErr instanceof Error ? validationErr.message : String(validationErr);
            console.warn(`[Agent] Tool arg validation failed for ${toolName}: ${errMsg}`);

            // Return validation error as tool result instead of executing
            const toolMessage: ChatCompletionToolMessageParam = {
              role: "tool",
              tool_call_id: toolCall.id,
              content: JSON.stringify({ error: `Invalid arguments: ${errMsg}` }),
            };
            messages.push(toolMessage);
            callbacks.onToolResult(toolName, {
              data: [],
              totalCount: 0,
              error: `Invalid arguments: ${errMsg}`,
            });
            continue;
          }

          callbacks.onToolCall(toolName, parsedArgs);
          toolChainLog.push(toolName);

          // Execute the tool with validated arguments
          console.log(`[Agent] Executing tool: ${toolName}`, parsedArgs);
          const toolStart = Date.now();
          const result = await executeTool(toolName, JSON.stringify(parsedArgs));
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

        // Log interaction for the learning engine
        try {
          logInteraction({
            userQuery: userMessage,
            toolChain: toolChainLog,
            responseSummary: content.substring(0, 500),
          });
        } catch (learnErr) {
          console.warn("[Agent] Learning log failed:", learnErr);
        }

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
