import type { Alert, AlertCheckConfig, AlertCheckType } from "@intune-agent/shared";
import { DEFAULT_ALERT_CONFIGS } from "@intune-agent/shared";
import {
  checkNonCompliantDevices,
  checkPolicyConflicts,
  checkStaleDevices,
  checkFailedAppInstalls,
  checkCAPolicyIssues,
  checkNewEnrollments,
  checkHighRiskDevices,
  checkUpdateCompliance,
} from "./checks.js";
import { recordMetrics } from "../analytics/history.js";

type CheckFunction = () => Promise<Alert[]>;

const CHECK_FUNCTIONS: Record<AlertCheckType, CheckFunction> = {
  non_compliant_devices: checkNonCompliantDevices,
  policy_conflicts: checkPolicyConflicts,
  stale_devices: checkStaleDevices,
  failed_app_installs: checkFailedAppInstalls,
  ca_policy_issues: checkCAPolicyIssues,
  new_enrollments: checkNewEnrollments,
  high_risk_devices: checkHighRiskDevices,
  update_compliance: checkUpdateCompliance,
};

class AlertScheduler {
  private configs: AlertCheckConfig[];
  private alerts: Alert[] = [];
  private lastRunTimes: Map<AlertCheckType, Date> = new Map();
  private timers: Map<AlertCheckType, ReturnType<typeof setInterval>> = new Map();
  private running = false;

  constructor() {
    this.configs = [...DEFAULT_ALERT_CONFIGS];
  }

  /** Start all enabled alert checks on their configured intervals. */
  start(): void {
    if (this.running) return;
    this.running = true;
    console.log("\n🔔 Alert Scheduler starting...");

    for (const config of this.configs) {
      if (config.enabled) {
        this.scheduleCheck(config);
      }
    }

    // Run all checks immediately on startup
    this.runAllChecks();
  }

  /** Stop all scheduled checks. */
  stop(): void {
    this.running = false;
    for (const [type, timer] of this.timers.entries()) {
      clearInterval(timer);
      this.timers.delete(type);
    }
    console.log("🔔 Alert Scheduler stopped.");
  }

  /** Schedule an individual check to run at its configured interval. */
  private scheduleCheck(config: AlertCheckConfig): void {
    // Clear any existing timer for this check
    const existing = this.timers.get(config.type);
    if (existing) clearInterval(existing);

    const intervalMs = config.intervalMinutes * 60 * 1000;
    const timer = setInterval(() => {
      this.runCheck(config.type);
    }, intervalMs);

    this.timers.set(config.type, timer);
    console.log(
      `   ✔ ${config.label}: every ${config.intervalMinutes} min`
    );
  }

  /** Run all enabled checks immediately. */
  async runAllChecks(): Promise<void> {
    console.log("[Alerts] Running all checks...");
    const enabledChecks = this.configs.filter((c) => c.enabled);

    for (const config of enabledChecks) {
      await this.runCheck(config.type);
    }

    console.log(
      `[Alerts] All checks complete — ${this.alerts.length} active alert(s)\n`
    );

    // Record metrics for historical trending
    try {
      const metrics: Array<{ name: string; value: number }> = [];
      metrics.push({ name: "total_alerts", value: this.alerts.length });
      for (const alert of this.alerts) {
        metrics.push({ name: `alert_${alert.checkType}`, value: alert.count });
      }
      recordMetrics(metrics);
    } catch {
      // Don't let metric recording failures affect alert checks
    }
  }

  /** Run a single check by type. */
  async runCheck(type: AlertCheckType): Promise<void> {
    const checkFn = CHECK_FUNCTIONS[type];
    if (!checkFn) return;

    try {
      console.log(`[Alerts] Running check: ${type}...`);
      const startTime = Date.now();
      const newAlerts = await checkFn();
      const elapsed = Date.now() - startTime;

      // Remove old alerts of this type and add new ones
      this.alerts = this.alerts.filter((a) => a.checkType !== type);
      this.alerts.push(...newAlerts);
      this.lastRunTimes.set(type, new Date());

      console.log(
        `[Alerts] ${type}: ${newAlerts.length} alert(s) found in ${elapsed}ms`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[Alerts] Error running ${type}: ${msg}`);
    }
  }

  /** Get all current alerts, sorted by severity then timestamp. */
  getAlerts(): Alert[] {
    const severityOrder: Record<string, number> = {
      critical: 0,
      warning: 1,
      info: 2,
    };

    return [...this.alerts].sort((a, b) => {
      const sevDiff =
        (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3);
      if (sevDiff !== 0) return sevDiff;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });
  }

  /** Get current configurations. */
  getConfigs(): AlertCheckConfig[] {
    return [...this.configs];
  }

  /** Update a check's configuration. */
  updateConfig(
    type: AlertCheckType,
    updates: Partial<Pick<AlertCheckConfig, "enabled" | "intervalMinutes">>
  ): void {
    const config = this.configs.find((c) => c.type === type);
    if (!config) return;

    if (updates.enabled !== undefined) config.enabled = updates.enabled;
    if (updates.intervalMinutes !== undefined)
      config.intervalMinutes = updates.intervalMinutes;

    // Reschedule or stop
    const existing = this.timers.get(type);
    if (existing) clearInterval(existing);
    this.timers.delete(type);

    if (config.enabled && this.running) {
      this.scheduleCheck(config);
    }

    console.log(
      `[Alerts] Updated ${type}: enabled=${config.enabled}, interval=${config.intervalMinutes}min`
    );
  }

  /** Acknowledge an alert by ID. */
  acknowledgeAlert(alertId: string): boolean {
    const alert = this.alerts.find((a) => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      return true;
    }
    return false;
  }

  /** Dismiss (remove) an alert by ID. */
  dismissAlert(alertId: string): boolean {
    const idx = this.alerts.findIndex((a) => a.id === alertId);
    if (idx >= 0) {
      this.alerts.splice(idx, 1);
      return true;
    }
    return false;
  }

  /** Get last run times for all checks. */
  getLastRunTimes(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [type, time] of this.lastRunTimes.entries()) {
      result[type] = time.toISOString();
    }
    return result;
  }
}

// Singleton instance
export const alertScheduler = new AlertScheduler();
