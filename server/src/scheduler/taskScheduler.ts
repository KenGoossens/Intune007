/**
 * Task Scheduler — Runs scheduled agent tasks at their configured intervals.
 *
 * Periodically checks for due tasks and executes them by calling the agent loop.
 * Results are stored in the task execution history.
 */

import { getDueTasks, recordExecution } from "./taskStore.js";
import { runAgentLoop } from "../agent/agent.js";
import { getActiveTenantId, switchTenant } from "../graph/tenantManager.js";
import type { ToolResult } from "../agent/executor.js";

const CHECK_INTERVAL_MS = 60_000; // Check for due tasks every 60 seconds
let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

/**
 * Start the task scheduler. Checks for due tasks every minute.
 */
export function startTaskScheduler(): void {
  if (timer) return;
  console.log("📋 Task Scheduler started — checking for due tasks every 60s");

  timer = setInterval(async () => {
    if (running) return; // Prevent overlapping runs
    running = true;

    // A schedule belongs to the tenant it was created for. Running it against
    // whichever tenant happens to be selected would answer about the wrong
    // customer, unattended. The selection is restored afterwards so a
    // background run does not move the UI out from under anyone.
    const selectedTenant = getActiveTenantId();

    try {
      const dueTasks = getDueTasks();
      for (const task of dueTasks) {
        if (task.tenantId && task.tenantId !== getActiveTenantId()) {
          const switched = switchTenant(task.tenantId);
          if (!switched.success) {
            console.warn(`[TaskScheduler] Skipping ${task.name}: its tenant is no longer connected`);
            continue;
          }
        }
        console.log(`[TaskScheduler] Running task: ${task.name} (${task.id})`);
        const startTime = Date.now();
        let result = "";
        let error: string | null = null;

        try {
          await runAgentLoop(task.prompt, [], {
            onToolCall(name: string) {
              console.log(`[TaskScheduler] Tool call: ${name}`);
            },
            onToolResult(_name: string, _result: ToolResult) {
              // Results are captured in the final response
            },
            onToken(content: string) {
              result += content;
            },
            onDone(fullResponse: string) {
              result = fullResponse;
            },
            onError(message: string) {
              error = message;
            },
          });
        } catch (err: unknown) {
          error = err instanceof Error ? err.message : String(err);
        }

        const durationMs = Date.now() - startTime;
        recordExecution(task.id, result || null, error, durationMs);
        console.log(
          `[TaskScheduler] Task ${task.name} completed in ${durationMs}ms${error ? ` (error: ${error})` : ""}`
        );
      }
    } catch (err: unknown) {
      console.error("[TaskScheduler] Error checking tasks:", err);
    } finally {
      if (selectedTenant && getActiveTenantId() !== selectedTenant) {
        switchTenant(selectedTenant);
      }
      running = false;
    }
  }, CHECK_INTERVAL_MS);
}

/**
 * Stop the task scheduler.
 */
export function stopTaskScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
    console.log("📋 Task Scheduler stopped");
  }
}
