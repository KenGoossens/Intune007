/**
 * Rate-Aware Request Queue for Microsoft Graph API
 *
 * Manages API calls with priority-based scheduling and rate limiting.
 * Prevents 429 (Too Many Requests) errors at scale.
 *
 * Priorities:
 *   P0 — User-initiated actions (sync, restart, wipe) → immediate
 *   P1 — Agent tool calls → next available slot
 *   P2 — Background sync (delta, alerts) → remaining budget
 *   P3 — Bulk operations (icon scan, app health) → throttled
 */

import { getGraphClient } from "../graph/client.js";
import type { Client } from "@microsoft/microsoft-graph-client";

export enum RequestPriority {
  IMMEDIATE = 0,  // User actions: bypass queue
  AGENT = 1,      // Agent tool calls
  BACKGROUND = 2, // Delta sync, alert checks
  BULK = 3,       // Bulk operations
}

interface QueuedRequest<T> {
  id: string;
  priority: RequestPriority;
  execute: (client: Client) => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
  enqueuedAt: number;
}

// ─── Rate tracking ──────────────────────────────────────────────

/** Sliding window rate tracker */
interface RateWindow {
  timestamps: number[];
  windowMs: number;
  maxRequests: number;
}

const rateWindow: RateWindow = {
  timestamps: [],
  windowMs: 10 * 60 * 1000, // 10-minute window
  maxRequests: 9000,         // Leave 10% buffer below 10K limit
};

let retryAfterUntil = 0; // Timestamp when Retry-After expires
let consecutiveThrottles = 0;

function canMakeRequest(): boolean {
  if (Date.now() < retryAfterUntil) return false;

  // Clean old timestamps
  const cutoff = Date.now() - rateWindow.windowMs;
  rateWindow.timestamps = rateWindow.timestamps.filter((t) => t > cutoff);

  return rateWindow.timestamps.length < rateWindow.maxRequests;
}

function recordRequest(): void {
  rateWindow.timestamps.push(Date.now());
}

function recordThrottle(retryAfterSeconds: number): void {
  consecutiveThrottles++;
  const backoff = Math.min(retryAfterSeconds * 1000, 60000) * (1 + Math.random() * 0.5);
  retryAfterUntil = Date.now() + backoff;
  console.log(`[RateQueue] Throttled! Retry-After: ${retryAfterSeconds}s, backoff: ${Math.round(backoff / 1000)}s (consecutive: ${consecutiveThrottles})`);
}

function recordSuccess(): void {
  consecutiveThrottles = 0;
}

// ─── Request Queue ──────────────────────────────────────────────

const queue: QueuedRequest<unknown>[] = [];
let isProcessing = false;

/**
 * Enqueue a Graph API request with priority.
 * Returns a promise that resolves when the request completes.
 */
export function enqueueRequest<T>(
  priority: RequestPriority,
  execute: (client: Client) => Promise<T>,
  id?: string
): Promise<T> {
  // P0 (IMMEDIATE): bypass queue entirely
  if (priority === RequestPriority.IMMEDIATE) {
    recordRequest();
    const client = getGraphClient();
    return execute(client).then(
      (result) => { recordSuccess(); return result; },
      (err) => { handleError(err); throw err; }
    );
  }

  return new Promise<T>((resolve, reject) => {
    queue.push({
      id: id || `req-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      priority,
      execute: execute as (client: Client) => Promise<unknown>,
      resolve: resolve as (value: unknown) => void,
      reject,
      enqueuedAt: Date.now(),
    });

    // Sort by priority, then by enqueue time
    queue.sort((a, b) => a.priority - b.priority || a.enqueuedAt - b.enqueuedAt);

    processQueue();
  });
}

async function processQueue(): Promise<void> {
  if (isProcessing) return;
  isProcessing = true;

  const client = getGraphClient();

  while (queue.length > 0) {
    // Wait if throttled
    if (!canMakeRequest()) {
      const waitMs = Math.max(retryAfterUntil - Date.now(), 1000);
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }

    const request = queue.shift()!;

    try {
      recordRequest();
      const result = await request.execute(client);
      recordSuccess();
      request.resolve(result);
    } catch (err: unknown) {
      handleError(err);

      // Check if it's a 429 — re-queue the request
      if (is429Error(err)) {
        const retryAfter = getRetryAfter(err);
        recordThrottle(retryAfter);
        // Put it back at the front of its priority level
        queue.unshift(request);
        queue.sort((a, b) => a.priority - b.priority || a.enqueuedAt - b.enqueuedAt);
      } else {
        request.reject(err);
      }
    }

    // Small delay between requests to avoid bursts
    const delay = consecutiveThrottles > 0
      ? 200 * Math.min(consecutiveThrottles, 5) // 200ms-1s if recently throttled
      : 50;                                       // 50ms normal
    await new Promise((r) => setTimeout(r, delay));
  }

  isProcessing = false;
}

function handleError(err: unknown): void {
  if (is429Error(err)) {
    const retryAfter = getRetryAfter(err);
    recordThrottle(retryAfter);
  }
}

function is429Error(err: unknown): boolean {
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    return e.statusCode === 429 || e.code === "TooManyRequests";
  }
  return false;
}

function getRetryAfter(err: unknown): number {
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    const headers = e.headers as Record<string, string> | undefined;
    if (headers?.["retry-after"]) {
      return parseInt(headers["retry-after"], 10) || 30;
    }
  }
  return 30; // Default: 30 seconds
}

// ─── Stats ──────────────────────────────────────────────────────

export function getQueueStats(): {
  queueLength: number;
  requestsInWindow: number;
  budgetRemaining: number;
  isThrottled: boolean;
  throttledUntil: string | null;
} {
  const cutoff = Date.now() - rateWindow.windowMs;
  const active = rateWindow.timestamps.filter((t) => t > cutoff).length;

  return {
    queueLength: queue.length,
    requestsInWindow: active,
    budgetRemaining: rateWindow.maxRequests - active,
    isThrottled: Date.now() < retryAfterUntil,
    throttledUntil: retryAfterUntil > Date.now()
      ? new Date(retryAfterUntil).toISOString()
      : null,
  };
}
