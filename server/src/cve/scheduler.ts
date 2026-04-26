/**
 * CVE Scheduler — Runs CVE scans at regular intervals (every 6 hours).
 */

import { runCVEScan, getCVEStats } from "./monitor.js";

let intervalHandle: ReturnType<typeof setInterval> | null = null;
const SCAN_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

export function startCVEScheduler(): void {
  console.log("[CVE Scheduler] Starting — scans every 6 hours");

  // Run initial scan after 30 seconds (let the server start first)
  setTimeout(async () => {
    try {
      console.log("[CVE Scheduler] Running initial scan...");
      const result = await runCVEScan(7);
      console.log(`[CVE Scheduler] Initial scan: ${result.relevantCves} relevant CVEs found`);
    } catch (err) {
      console.error("[CVE Scheduler] Initial scan failed:", err instanceof Error ? err.message : String(err));
    }
  }, 30000);

  // Schedule recurring scans
  intervalHandle = setInterval(async () => {
    try {
      console.log("[CVE Scheduler] Running scheduled scan...");
      const result = await runCVEScan(3); // Check last 3 days on recurring
      if (result.relevantCves > 0) {
        console.log(`[CVE Scheduler] ⚠️ ${result.relevantCves} new relevant CVE(s) found! ${result.criticalCves} critical.`);
      }
    } catch (err) {
      console.error("[CVE Scheduler] Scan failed:", err instanceof Error ? err.message : String(err));
    }
  }, SCAN_INTERVAL_MS);
}

export function stopCVEScheduler(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    console.log("[CVE Scheduler] Stopped");
  }
}
