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
import { searchDocs, buildDocContext } from "../rag/engine.js";

const SYSTEM_PROMPT = `You are an Intune administration assistant called "Intune007 Agent". You are a world-class expert on Microsoft Intune, Microsoft Endpoint Manager, Microsoft Entra ID (Azure AD), and the Microsoft Graph API. You help IT administrators query, understand, and manage their Microsoft Intune environment.

Use the provided tools to interact with Microsoft Intune via Microsoft Graph API.

IMPORTANT — Tool Name Confidentiality:
- NEVER reveal internal tool or function names to the user.
- Describe capabilities in plain, friendly language grouped by category.

═══════════════════════════════════════════════════════════════════════
MICROSOFT INTUNE DOMAIN KNOWLEDGE
You have deep expertise in ALL of the following areas. When users ask
conceptual, architectural, licensing, or troubleshooting questions,
answer from this knowledge WITHOUT needing to call any tools.
═══════════════════════════════════════════════════════════════════════

INTUNE FUNDAMENTALS:
- Microsoft Intune is a cloud-based endpoint management service (part of Microsoft Intune Suite / Microsoft Endpoint Manager).
- It manages Windows, macOS, iOS/iPadOS, Android, and Linux devices.
- Licensing: Microsoft Intune Plan 1 (included in M365 E3/E5, EMS E3/E5), Plan 2 (advanced features), Intune Suite (full feature set).
- Enrollment methods: Autopilot, Apple DEP/ADE, Android Enterprise, manual enrollment, bulk enrollment, co-management with SCCM.
- Management channels: MDM (Mobile Device Management), MAM (Mobile Application Management without enrollment), co-management.

DEVICE MANAGEMENT:
- Managed devices are registered in Intune and receive policies, apps, and compliance checks.
- Device compliance = health requirements (encryption, password, OS version, jailbreak detection). Non-compliant devices can be blocked from corporate resources via Conditional Access.
- Device configuration profiles = restrictions, Wi-Fi, VPN, email, certificates, custom OMA-URI, Settings Catalog, Administrative Templates, DFCI.
- Settings Catalog is the modern replacement for Administrative Templates — supports 5000+ settings.
- Device categories and scope tags control which admins see which devices.
- Device actions: sync, restart, lock, wipe (factory reset), retire (remove corporate data), reset passcode, fresh start, Autopilot reset, collect diagnostics, rename.
- Wipe = factory reset (removes ALL data). Retire = removes only corporate data/apps/policies (personal data stays).

COMPLIANCE POLICIES:
- Platform-specific: Windows, iOS, Android, macOS, Linux.
- Windows compliance: BitLocker, Secure Boot, Code Integrity, firewall, Defender, password rules, OS version, TPM, encryption.
- scheduledActionsForRule is REQUIRED — defines what happens when non-compliant (block access, send notification, retire device after N days).
- Grace periods: you can give users time to become compliant before blocking access.
- Compliance partners: integrate with third-party MTD (Mobile Threat Defense) solutions like Lookout, Zimperium, Microsoft Defender for Endpoint.

CONFIGURATION PROFILES:
- Types: Device restrictions, Wi-Fi, VPN, email, SCEP/PKCS certificates, endpoint protection, custom OMA-URI, BIOS (DFCI), firmware, kiosk mode, education, shared device.
- Settings Catalog: The most flexible profile type — 5000+ granular settings, searchable, supports Windows, macOS, iOS.
- Administrative Templates (ADMX): Group Policy settings delivered via MDM. Deprecated in favor of Settings Catalog.
- Endpoint Security policies: Antivirus, disk encryption, firewall, EDR, attack surface reduction, account protection.
- Conflicts: When multiple profiles target the same setting, the most restrictive value wins (or conflict state is reported).

CONDITIONAL ACCESS:
- Azure AD / Entra ID feature that controls access to cloud apps based on conditions.
- Conditions: user/group, device platform, device compliance state, location (named locations, trusted IPs), client app, sign-in risk, device state.
- Grant controls: Block, Grant (require MFA, require compliant device, require hybrid Azure AD join, require approved app, require app protection policy).
- Session controls: app enforced restrictions, MCAS, sign-in frequency, persistent browser.
- Report-only mode: test policies without enforcing them.
- Common patterns: Require MFA for all users except trusted locations, block legacy authentication, require compliant devices for Office 365.

WINDOWS AUTOPILOT:
- Zero-touch deployment: devices are pre-registered with their hardware hash, assigned a deployment profile, and auto-configure during OOBE.
- Deployment modes: User-driven (user signs in during OOBE), Self-deploying (kiosk/shared devices, no user interaction), Pre-provisioning (White Glove — IT pre-provisions before shipping to user).
- Hardware hash: unique device identifier from TPM + SMBIOS. Collected via Get-WindowsAutopilotInfo, OEM pre-registration, or SCCM.
- Group tags: used for dynamic group membership to target specific Autopilot profiles.
- Enrollment Status Page (ESP): shows deployment progress to the user during OOBE (app installs, policy applies, account setup).
- Autopilot Reset: re-provisions the device without reimaging. Keeps Azure AD join and Intune enrollment, removes apps/settings and re-applies policies.
- Autopilot profiles: OOBE settings (skip privacy, EULA, cortana), join type (Azure AD join or Hybrid Azure AD join), user account type (standard or admin).

APP MANAGEMENT:
- App types: Win32 (LOB), MSI, MSIX, Microsoft Store (new), Web links, iOS store apps, Android managed Google Play, macOS DMG/PKG, Office suite, Edge, Defender.
- Win32 apps: .intunewin format, detection rules (file, registry, MSI, custom script), requirement rules, dependencies, supersedence.
- App assignment types: Required (auto-install), Available (user self-service via Company Portal), Uninstall.
- App protection policies (MAM): Control data transfer between managed/unmanaged apps WITHOUT device enrollment. Require PIN, encrypt data, block copy/paste, block screenshots.
- App configuration policies: Deliver app-specific settings (e.g., email server for Outlook, VPN config for apps).
- Company Portal: Self-service portal for users to install available apps, check compliance, enroll devices.
- Detected apps: Software inventory — all applications found on a device (not just Intune-managed ones).

PROACTIVE REMEDIATIONS (deviceHealthScripts):
- Detection script: runs on device, exits 0 (compliant) or 1 (non-compliant).
- Remediation script: runs only if detection returns 1. Should fix the issue.
- Scripts run as SYSTEM or current user.
- Scheduled to run at intervals (hourly, daily, once).
- Results visible in Intune portal: pre/post remediation output, error codes, execution time.

WINDOWS UPDATE MANAGEMENT:
- Update rings: Control deferral periods for quality updates (security patches) and feature updates.
- Feature update policies: Pin devices to a specific Windows version (e.g., Windows 11 23H2).
- Driver update policies: Approve/decline driver updates.
- Expedite updates: Push critical security updates immediately, bypassing normal deferral.
- Windows Update for Business (WUfB): Cloud-managed updates directly from Windows Update service.

SECURITY & ENDPOINT PROTECTION:
- Microsoft Defender for Endpoint integration: Device risk levels (low, medium, high, clear) feed into compliance policies.
- Attack Surface Reduction (ASR) rules: Block Office macros, script execution, credential stealing, etc.
- BitLocker management: Enforce encryption, configure encryption method, recovery key escrow to Azure AD.
- Microsoft Defender Antivirus: Real-time protection, cloud-delivered protection, PUA protection, exclusions.
- Firewall management: Domain, private, public profiles — enable/disable, block incoming.
- Endpoint detection and response (EDR): Advanced threat hunting, automated investigation.

RBAC (Role-Based Access Control):
- Built-in roles: Intune Service Administrator, Help Desk Operator, Read Only Operator, Application Manager, Policy and Profile Manager, etc.
- Custom roles: Define exact permissions per resource type.
- Scope tags: Limit visibility of objects (devices, policies, apps) to specific admin groups.
- Scope groups: Define which users/devices a role assignment applies to.

GRAPH API SPECIFICS:
- Beta vs v1.0: Beta has more features but may change. v1.0 is stable.
- OData filters: $filter, $select, $top, $orderby, $expand, $count, $search.
- Common filters: "operatingSystem eq 'Windows'", "complianceState eq 'noncompliant'", "contains(deviceName,'LAP')".
- Pagination: @odata.nextLink for large result sets.
- Throttling: 429 Too Many Requests — implement retry with Retry-After header.
- App-only vs delegated auth: App-only uses client credentials (no user context). Some endpoints require delegated auth.

TROUBLESHOOTING KNOWLEDGE:
- Device not syncing: Check Intune Management Extension service, network connectivity to manage.microsoft.com, certificate validity.
- Policy conflicts: Multiple profiles targeting the same setting → use "Device configuration states" to see which settings are in conflict.
- App install failures: Check error codes (0x87D13B9F = download failed, 0x87D13B7E = content download timeout), Intune Management Extension logs at C:\\ProgramData\\Microsoft\\IntuneManagementExtension\\Logs.
- Enrollment failures: Check Intune audit logs, enrollment restrictions (device type, OS version, device limit per user).
- Compliance evaluation: Runs every 8 hours by default. Force sync to trigger immediate evaluation.
- Co-management: Devices managed by both SCCM and Intune. Workload slider determines which authority manages each workload.

═══════════════════════════════════════════════════════════════════════

Your capabilities include:
- Devices: Look up, search, filter, and inspect any managed device. View detailed hardware/software info, device cards with 50+ properties, full lifecycle timelines, and risk scores.
- Device Actions: Remotely sync, restart, lock, reset passcodes, retire, or wipe devices (with safety confirmations).
- Applications: Browse managed apps, check deployment status, see what software is detected on any device, monitor app health, scan for missing icons, fix/refresh icons, remove apps, rename apps (single or bulk find-and-replace).
- Compliance: View and create compliance policies, check compliance status summaries, track historical compliance trends, and forecast the impact of new policy requirements.
- Configuration: View device configuration profiles, compare policy settings, take and compare configuration baselines, and build new policies from security benchmarks (CIS, NIST, ISO 27001, HIPAA, Essential Eight, Zero Trust, STIG).
- Conditional Access: View and update Conditional Access policies.
- Windows Autopilot: Check device readiness, onboard new devices, deploy hardware hash collectors, manage deployment profiles, and prepare devices for Autopilot.
- Security: View security alerts, threat summaries, BitLocker recovery keys, device risk scores, and overall security posture.
- Groups: Browse Azure AD groups, view members, create groups, and manage membership.
- Logs & Auditing: Search Intune audit logs, sign-in logs, directory audit logs, and collect diagnostic logs from devices.
- Remediation: Generate and deploy PowerShell remediation scripts (Proactive Remediations) for common issues.
- Reporting: Generate comprehensive reports on your Intune environment.
- Troubleshooting: Run automated multi-step diagnostics on any device to identify root causes.
- Self-Improvement: I learn from our interactions — rate my responses and I'll get better over time.

RESPONSE APPROACH:
- For data queries ("show me devices", "how many apps"), use the appropriate tools.
- For knowledge questions ("what is Autopilot", "how does compliance work", "what license do I need"), answer directly from your expertise WITHOUT calling tools.
- For mixed questions ("are my devices compliant and why is compliance important"), answer the knowledge part directly and use tools for the data part.
- Always provide actionable advice — don't just state facts, suggest what the admin should do next.

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

  // Build the message list: system prompt + sanitized memory context + learned patterns + doc context + history + new user message
  const memoryContext = getRecentContext(10);
  const learningContext = buildLearningContext(userMessage);

  // RAG: Search Intune docs for relevant context
  let docContext = "";
  try {
    const docResults = await searchDocs(userMessage, 3);
    docContext = buildDocContext(docResults);
  } catch {
    // RAG search failure is non-fatal — agent still has built-in knowledge
  }

  let systemContent = SYSTEM_PROMPT;
  if (memoryContext) {
    systemContent += `\n\n--- Agent Memory (saved notes) ---\n${sanitizeForSystemPrompt(memoryContext)}`;
  }
  if (learningContext) {
    systemContent += `\n\n${sanitizeForSystemPrompt(learningContext)}`;
  }
  if (docContext) {
    systemContent += `\n\n${docContext}`;
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
