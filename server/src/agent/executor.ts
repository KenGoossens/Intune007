import { getManagedDevices, getDeviceDetails } from "../graph/devices.js";
import {
  syncDevice,
  restartDevice,
  lockDevice,
  resetPasscode,
  retireDevice,
  wipeDevice,
} from "../graph/deviceActions.js";
import {
  getCompliancePolicies,
  getComplianceStatus,
} from "../graph/compliance.js";
import { getDeviceConfigurations, getDeviceConfigurationStates } from "../graph/configurations.js";
import { getMobileApps, getAppInstallStatus, getDeviceDetectedApps, getDeviceManagedAppStatuses } from "../graph/apps.js";
import { getConditionalAccessPolicies } from "../graph/conditionalAccess.js";
import {
  getAutopilotDevices,
  getAutopilotProfiles,
} from "../graph/autopilot.js";
import { listRemediationScripts } from "../graph/remediation.js";
import {
  getGroups,
  getGroupMembers,
  createGroup,
  addGroupMember,
} from "../graph/groups.js";
import {
  getSecurityAlerts,
  getBitLockerKeys,
  getDeviceThreatSummary,
} from "../graph/security.js";
import {
  getAuditEvents,
  getSignInLogs,
  getDirectoryAuditLogs,
} from "../graph/logs.js";
import {
  createCompliancePolicy,
  assignCompliancePolicy,
  assignConfigurationProfile,
  updateConditionalAccessPolicy,
} from "../graph/policyManagement.js";
import {
  getUpdateRings,
  getUpdateComplianceSummary,
} from "../graph/windowsUpdate.js";
import { getDailyTrend, getAvailableMetrics } from "../analytics/history.js";
import { saveNote, searchNotes } from "../agent/memory.js";
import {
  createTask,
  listTasks,
  updateTask,
  deleteTask,
} from "../scheduler/taskStore.js";
import {
  listConfiguredTenants,
  switchTenant,
} from "../graph/tenantManager.js";
import { generateReport } from "../reportGenerator/engine.js";
import { computeFleetRiskScores } from "../riskScoring/scorer.js";
import { runForecast } from "../forecast/engine.js";
import { takeSnapshot, listSnapshots, compareWithSnapshot } from "../baselines/manager.js";
import { runDiagnostics } from "../troubleshooter/engine.js";
import { onboardAutopilotDevice, getHardwareHashCollectionScript } from "../autopilot/onboarding.js";
import { deployHashCollector, processCollectedHashes } from "../autopilot/hashCollector.js";
import { generateRemediationScript, generateAlertRemediation } from "../remediation/scriptGenerator.js";
import { deployToIntune } from "../remediation/deployer.js";
import { analyzePolicies } from "../policyAnalyzer/analyzer.js";
import { sanitizeOData, isValidUUID, scanPowerShellScript, sanitizeErrorMessage, sanitizeODataFilter, requiresConfirmation, createConfirmationToken, validateConfirmationToken, auditLog } from "../security.js";
import { getLearningStats, recordCorrection } from "./learningEngine.js";
import { findAndUploadIcon, fixAllMissingIcons, scanAppIcons } from "../graph/appIcons.js";
import { removeApp, renameApp, bulkRenameApps } from "../graph/appManagement.js";
import { runCVEScan, getCVEs, getCVEStats, updateCVEStatus } from "../cve/monitor.js";
import { computeSecurityPosture } from "../routes/securityPosture.js";
import { getAppHealthData } from "../routes/appHealth.js";
import { checkAutopilotReadinessCore, ingestAutopilotCsv } from "../routes/autopilotReadiness.js";
import { buildDeviceTimeline } from "../routes/deviceTimeline.js";

export interface ToolResult {
  data: unknown[];
  totalCount?: number;
  error?: string;
}

/**
 * Poll device status after an action with adaptive backoff:
 *   0-10 min:  every 30 seconds (aggressive — device likely online)
 *   10-20 min: every 60 seconds (moderate)
 *   20-40 min: every 2 minutes (slowing down)
 *   40-60 min: every 5 minutes (device may be offline)
 *
 * Stops immediately when lastSyncDateTime changes (device responded).
 * Total timeout: 60 minutes.
 */
async function pollDeviceStatus(
  deviceId: string,
  initialDelayMs: number = 5000
): Promise<{
  responded: boolean;
  lastSyncDateTime: string;
  complianceState: string;
  deviceName: string;
  message: string;
  pollCount: number;
  elapsedMs: number;
}> {
  const TOTAL_TIMEOUT = 60 * 60 * 1000; // 60 minutes
  const startTime = Date.now();

  // Get pre-action state
  let preSyncTime = "";
  let deviceName = "";
  try {
    const pre = await getDeviceDetails(deviceId);
    preSyncTime = String(pre.lastSyncDateTime || "");
    deviceName = String(pre.deviceName || "");
  } catch { /* skip */ }

  // Initial delay before first check
  await new Promise((resolve) => setTimeout(resolve, initialDelayMs));

  let pollCount = 0;

  while (Date.now() - startTime < TOTAL_TIMEOUT) {
    pollCount++;
    const elapsed = Date.now() - startTime;

    // Check device status
    try {
      const post = await getDeviceDetails(deviceId);
      const postSyncTime = String(post.lastSyncDateTime || "");
      deviceName = String(post.deviceName || deviceName);

      if (postSyncTime !== preSyncTime && postSyncTime > preSyncTime) {
        console.log(`[DeviceAction] ${deviceName} responded after ${Math.round(elapsed / 1000)}s (${pollCount} polls)`);
        return {
          responded: true,
          lastSyncDateTime: postSyncTime,
          complianceState: String(post.complianceState || "unknown"),
          deviceName,
          message: `Device responded after ${formatDuration(elapsed)}! Last sync updated to ${new Date(postSyncTime).toLocaleString()}.`,
          pollCount,
          elapsedMs: elapsed,
        };
      }
    } catch {
      // Device might be rebooting — keep polling
    }

    // Adaptive backoff: determine wait time based on elapsed time
    let waitMs: number;
    if (elapsed < 10 * 60 * 1000) {
      waitMs = 30 * 1000;       // 0-10 min: every 30s
    } else if (elapsed < 20 * 60 * 1000) {
      waitMs = 60 * 1000;       // 10-20 min: every 60s
    } else if (elapsed < 40 * 60 * 1000) {
      waitMs = 2 * 60 * 1000;   // 20-40 min: every 2 min
    } else {
      waitMs = 5 * 60 * 1000;   // 40-60 min: every 5 min
    }

    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  // Timeout reached
  const elapsed = Date.now() - startTime;
  console.log(`[DeviceAction] ${deviceName} did not respond within ${Math.round(elapsed / 60000)} min (${pollCount} polls)`);
  return {
    responded: false,
    lastSyncDateTime: preSyncTime,
    complianceState: "unknown",
    deviceName,
    message: `Device did not respond within 60 minutes (checked ${pollCount} times). The action is queued and will execute when the device next connects. Last known sync: ${preSyncTime ? new Date(preSyncTime).toLocaleString() : "unknown"}.`,
    pollCount,
    elapsedMs: elapsed,
  };
}

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} seconds`;
  const minutes = Math.floor(seconds / 60);
  const remainSec = seconds % 60;
  if (minutes < 60) return remainSec > 0 ? `${minutes}m ${remainSec}s` : `${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  const remainMin = minutes % 60;
  return `${hours}h ${remainMin}m`;
}

/**
 * Dispatches a tool call to the corresponding Graph API function.
 * Returns the data array and total count, or an error message.
 *
 * Security layers:
 * 1. Destructive action confirmation gate (two-step token flow)
 * 2. OData filter sanitization
 * 3. Structured audit logging
 */
export async function executeTool(
  toolName: string,
  argsJson: string
): Promise<ToolResult> {
  const startTime = Date.now();
  try {
    const args = JSON.parse(argsJson || "{}");

    // ── Destructive action gate ──────────────────────────────
    if (requiresConfirmation(toolName)) {
      // If the agent provides a confirmationToken, validate it
      if (args.confirmationToken) {
        const validation = validateConfirmationToken(args.confirmationToken, toolName);
        if (!validation.valid) {
          auditLog({ timestamp: new Date().toISOString(), toolName, args: { ...args, confirmationToken: "[redacted]" }, isDestructive: true, confirmed: false, result: "blocked", error: validation.error });
          return { data: [], error: validation.error };
        }
        // Token valid — proceed with execution below
        auditLog({ timestamp: new Date().toISOString(), toolName, args: { ...args, confirmationToken: "[redacted]" }, isDestructive: true, confirmed: true, result: "success", durationMs: Date.now() - startTime });
      } else {
        // No token — generate one and return it to the agent
        const desc = `${toolName} with args: ${JSON.stringify(args).substring(0, 200)}`;
        const confirmation = createConfirmationToken(toolName, args, desc);
        auditLog({ timestamp: new Date().toISOString(), toolName, args, isDestructive: true, confirmed: false, result: "blocked", error: "Awaiting confirmation" });
        return {
          data: [{
            requiresConfirmation: true,
            confirmationToken: confirmation.token,
            message: `⚠️ DESTRUCTIVE ACTION REQUIRES CONFIRMATION: ${toolName}. To proceed, call this tool again with the confirmationToken parameter set to: ${confirmation.token}`,
            description: desc,
            expiresIn: "5 minutes",
          }],
          totalCount: 0,
        };
      }
    }

    // ── OData filter sanitization ────────────────────────────
    if (args.filter && typeof args.filter === "string") {
      args.filter = sanitizeODataFilter(args.filter);
    }

    switch (toolName) {
      case "get_managed_devices": {
        const result = await getManagedDevices({
          filter: args.filter,
          top: args.top,
          select: args.select,
        });
        return { data: result.items, totalCount: result.totalCount };
      }

      case "get_device_details": {
        const device = await getDeviceDetails(args.deviceId);
        return { data: [device], totalCount: 1 };
      }

      // ─── Device Actions (with post-action status monitoring) ────

      case "sync_device": {
        const result = await syncDevice(args.deviceId);
        // Adaptive polling: 30s intervals for 10min, then 1min, 2min, 5min — up to 1 hour
        const syncCheck = await pollDeviceStatus(args.deviceId, 5000);
        return { data: [{
          ...result,
          postCheck: syncCheck,
        }], totalCount: 1 };
      }

      case "restart_device": {
        const result = await restartDevice(args.deviceId);
        // Longer initial delay for restart (device needs time to begin reboot)
        const restartCheck = await pollDeviceStatus(args.deviceId, 15000);
        return { data: [{
          ...result,
          postCheck: restartCheck,
        }], totalCount: 1 };
      }

      case "lock_device": {
        const result = await lockDevice(args.deviceId);
        return { data: [result], totalCount: 1 };
      }

      case "reset_passcode": {
        const result = await resetPasscode(args.deviceId);
        return { data: [result], totalCount: 1 };
      }

      case "retire_device": {
        const result = await retireDevice(args.deviceId);
        return { data: [result], totalCount: 1 };
      }

      case "wipe_device": {
        const result = await wipeDevice(args.deviceId, {
          keepEnrollmentData: args.keepEnrollmentData,
          keepUserData: args.keepUserData,
        });
        return { data: [result], totalCount: 1 };
      }

      case "get_compliance_policies": {
        const result = await getCompliancePolicies({
          filter: args.filter,
          top: args.top,
        });
        return { data: result.items, totalCount: result.totalCount };
      }

      case "get_compliance_status": {
        const status = await getComplianceStatus();
        return { data: [status], totalCount: 1 };
      }

      case "get_device_configurations": {
        const result = await getDeviceConfigurations({
          filter: args.filter,
          top: args.top,
        });
        return { data: result.items, totalCount: result.totalCount };
      }

      case "get_device_configuration_states": {
        const result = await getDeviceConfigurationStates(args.deviceId);
        return { data: result.items, totalCount: result.totalCount };
      }

      case "get_mobile_apps": {
        const result = await getMobileApps({
          filter: args.filter,
          top: args.top,
        });
        return { data: result.items, totalCount: result.totalCount };
      }

      case "get_app_install_status": {
        const result = await getAppInstallStatus(args.appId, {
          top: args.top,
        });
        return { data: result.items, totalCount: result.totalCount };
      }

      case "get_device_detected_apps": {
        const result = await getDeviceDetectedApps(args.deviceId, {
          top: args.top,
        });
        return { data: result.items, totalCount: result.totalCount };
      }

      case "get_device_app_install_states": {
        const result = await getDeviceManagedAppStatuses(args.deviceId);
        return { data: result.items, totalCount: result.totalCount };
      }

      case "get_conditional_access_policies": {
        const result = await getConditionalAccessPolicies({
          filter: args.filter,
          top: args.top,
        });
        return { data: result.items, totalCount: result.totalCount };
      }

      case "get_autopilot_devices": {
        const result = await getAutopilotDevices({
          filter: args.filter,
          top: args.top,
        });
        return { data: result.items, totalCount: result.totalCount };
      }

      case "get_autopilot_profiles": {
        const result = await getAutopilotProfiles({
          filter: args.filter,
          top: args.top,
        });
        return { data: result.items, totalCount: result.totalCount };
      }

      case "generate_remediation_script": {
        const script = args.alertType
          ? await generateAlertRemediation(args.alertType, [])
          : await generateRemediationScript(args.prompt);
        return {
          data: [
            {
              displayName: script.displayName,
              description: script.description,
              detectionScript: script.detectionScript,
              remediationScript: script.remediationScript,
              runAsAccount: script.runAsAccount,
              explanation: script.explanation,
            },
          ],
          totalCount: 1,
        };
      }

      case "deploy_remediation_script": {
        // Security: scan PowerShell scripts for dangerous patterns before deploying
        const detectionIssues = scanPowerShellScript(String(args.detectionScript || ""));
        const remediationIssues = scanPowerShellScript(String(args.remediationScript || ""));
        const allIssues = [...detectionIssues, ...remediationIssues];
        if (allIssues.length > 0) {
          return {
            data: [],
            error: `Script blocked by security scan: ${allIssues.join("; ")}`,
          };
        }
        const result = await deployToIntune({
          displayName: args.displayName,
          description: args.description,
          detectionScript: args.detectionScript,
          remediationScript: args.remediationScript,
          runAsAccount: args.runAsAccount || "system",
          explanation: "",
        });
        return {
          data: [result],
          totalCount: 1,
        };
      }

      case "list_remediation_scripts": {
        const result = await listRemediationScripts({ top: args.top });
        return { data: result.items, totalCount: result.totalCount };
      }

      case "analyze_policies": {
        const result = await analyzePolicies();
        return {
          data: [{
            score: result.score,
            summary: result.summary,
            stats: result.stats,
            findings: result.findings.map((f: { severity: string; category: string; title: string; description: string; recommendation: string; affectedItems: string[] }) => ({
              severity: f.severity,
              category: f.category,
              title: f.title,
              description: f.description,
              recommendation: f.recommendation,
              affectedItemCount: f.affectedItems.length,
            })),
          }],
          totalCount: 1,
        };
      }

      // ─── Group Management ──────────────────────────────────────

      case "get_groups": {
        const result = await getGroups({
          filter: args.filter,
          search: args.search,
          top: args.top,
        });
        return { data: result.items, totalCount: result.totalCount };
      }

      case "get_group_members": {
        const result = await getGroupMembers(args.groupId, {
          top: args.top,
        });
        return { data: result.items, totalCount: result.totalCount };
      }

      case "create_group": {
        const result = await createGroup({
          displayName: args.displayName,
          description: args.description,
        });
        return { data: [result], totalCount: 1 };
      }

      case "add_group_member": {
        const result = await addGroupMember(args.groupId, args.memberId);
        return { data: [result], totalCount: 1 };
      }

      // ─── Security & Threat Intelligence ────────────────────────

      case "get_security_alerts": {
        const result = await getSecurityAlerts({
          filter: args.filter,
          top: args.top,
        });
        return { data: result.items, totalCount: result.totalCount };
      }

      case "get_bitlocker_keys": {
        const result = await getBitLockerKeys({
          deviceId: args.deviceId,
          top: args.top,
        });
        return { data: result.items, totalCount: result.totalCount };
      }

      case "get_device_threat_summary": {
        const result = await getDeviceThreatSummary();
        return { data: [result], totalCount: 1 };
      }

      // ─── Log Collection ────────────────────────────────────────

      case "get_audit_logs": {
        const result = await getAuditEvents({
          filter: args.filter,
          top: args.top,
        });
        return { data: result.items, totalCount: result.totalCount };
      }

      case "get_sign_in_logs": {
        const result = await getSignInLogs({
          filter: args.filter,
          top: args.top,
        });
        return { data: result.items, totalCount: result.totalCount };
      }

      case "get_directory_audit_logs": {
        const result = await getDirectoryAuditLogs({
          filter: args.filter,
          top: args.top,
        });
        return { data: result.items, totalCount: result.totalCount };
      }

      // ─── Policy Management ─────────────────────────────────────

      case "create_compliance_policy": {
        const policyBody = JSON.parse(String(args.policyBody || "{}"));
        // Security: block arbitrary @odata.type overrides from user input
        delete policyBody["@odata.bind"];
        policyBody.displayName = args.displayName;
        if (args.description) policyBody.description = args.description;
        const result = await createCompliancePolicy(policyBody);
        return { data: [result], totalCount: 1 };
      }

      case "assign_policy": {
        const groupIds = (args.groupIds as string).split(",").map((g: string) => g.trim());
        // Security: validate all group IDs are proper UUIDs
        for (const gid of groupIds) {
          if (!isValidUUID(gid)) {
            return { data: [], error: `Invalid group ID: "${gid.substring(0, 40)}" — must be a valid UUID` };
          }
        }
        if (args.policyType === "compliance") {
          await assignCompliancePolicy(args.policyId, groupIds);
        } else {
          await assignConfigurationProfile(args.policyId, groupIds);
        }
        return {
          data: [{
            success: true,
            policyId: args.policyId,
            policyType: args.policyType,
            assignedGroups: groupIds,
            message: `Policy assigned to ${groupIds.length} group(s) successfully.`,
          }],
          totalCount: 1,
        };
      }

      case "update_conditional_access_policy": {
        const result = await updateConditionalAccessPolicy(args.policyId, {
          state: args.state,
        });
        return { data: [result], totalCount: 1 };
      }

      // ─── Windows Update ────────────────────────────────────────

      case "get_update_rings": {
        const result = await getUpdateRings({ top: args.top });
        return { data: result.items, totalCount: result.totalCount };
      }

      case "get_update_compliance": {
        const result = await getUpdateComplianceSummary();
        return { data: [result], totalCount: 1 };
      }

      // ─── Historical Trending ───────────────────────────────────

      case "get_compliance_trend": {
        const days = Math.min(args.days || 30, 90);
        const metricName = args.metricName || "compliant_devices";
        const trend = getDailyTrend(metricName, days);
        if (trend.length === 0) {
          const available = getAvailableMetrics();
          return {
            data: [{
              message: "No trend data available yet. Data is collected periodically as alert checks run.",
              availableMetrics: available,
            }],
            totalCount: 0,
          };
        }
        return { data: trend, totalCount: trend.length };
      }

      // ─── Agent Memory ──────────────────────────────────────────

      case "save_note": {
        const note = saveNote(args.content, args.category || "general");
        return { data: [note], totalCount: 1 };
      }

      case "recall_notes": {
        const notes = searchNotes(args.query);
        return { data: notes, totalCount: notes.length };
      }

      // ─── Scheduled Tasks ───────────────────────────────────────

      case "create_scheduled_task": {
        const scheduleMap: Record<string, number> = {
          hourly: 60,
          daily: 1440,
          weekly: 10080,
        };
        const task = createTask({
          name: args.name,
          prompt: args.prompt,
          schedule: args.schedule || "daily",
          intervalMinutes: scheduleMap[args.schedule || "daily"] || 1440,
        });
        return { data: [task], totalCount: 1 };
      }

      case "list_scheduled_tasks": {
        const tasks = listTasks();
        return { data: tasks, totalCount: tasks.length };
      }

      case "manage_scheduled_task": {
        if (args.action === "delete") {
          const deleted = deleteTask(args.taskId);
          return {
            data: [{ success: deleted, message: deleted ? "Task deleted." : "Task not found." }],
            totalCount: 1,
          };
        }
        const updated = updateTask(args.taskId, {
          enabled: args.action === "enable",
        });
        return {
          data: [updated || { error: "Task not found." }],
          totalCount: 1,
        };
      }

      // ─── Multi-Tenant ──────────────────────────────────────────

      case "list_tenants": {
        const tenants = listConfiguredTenants();
        return { data: tenants, totalCount: tenants.length };
      }

      case "switch_tenant": {
        const result = switchTenant(args.tenantId);
        return { data: [result], totalCount: 1 };
      }

      // ─── Advanced Features ─────────────────────────────────

      case "generate_report": {
        const report = await generateReport(args.prompt);
        return { data: [{ title: report.title, markdown: report.markdown, dataSources: report.dataSources, durationMs: report.durationMs }], totalCount: 1 };
      }

      case "get_device_risk_scores": {
        const scores = await computeFleetRiskScores();
        return { data: [{ averageRiskScore: scores.averageRiskScore, distribution: scores.distribution, totalDevices: scores.totalDevices, topRisks: scores.topRisks.slice(0, 5) }], totalCount: 1 };
      }

      case "get_device_card": {
        // Fetch rich device card via the API route logic
        const devices = await getManagedDevices({ filter: `deviceName eq '${sanitizeOData(String(args.deviceName))}'`, top: 1 });
        if (devices.items.length === 0) return { data: [], error: `Device '${args.deviceName}' not found` };
        const device = await getDeviceDetails(String(devices.items[0].id));
        return { data: [device], totalCount: 1 };
      }

      case "get_security_posture": {
        const posture = await computeSecurityPosture();
        const c = posture.current as Record<string, unknown>;
        return { data: [{ complianceRate: c.complianceRate, encryptionRate: c.encryptionRate, staleRate: c.staleRate, totalDevices: c.totalDevices, compliant: c.compliantDevices, nonCompliant: c.nonCompliantDevices, encrypted: c.encryptedDevices, stale: c.staleDevices }], totalCount: 1 };
      }

      case "get_app_health": {
        const health = await getAppHealthData();
        return { data: [{ totalApps: health.totalManagedApps, totalDevices: health.totalDevices, detectedApps: health.totalDetectedApps, appsOnDevices: health.appsDetectedOnDevices, apps: ((health.apps as Array<Record<string, unknown>>) || []).slice(0, 10).map((a: Record<string, unknown>) => ({ name: a.displayName, type: a.appType, detectedOn: a.detectedOnDevices, rate: a.deploymentRate })) }], totalCount: 1 };
      }

      case "check_autopilot_readiness": {
        const readiness = await checkAutopilotReadinessCore({ serialNumber: args.serialNumber as string });
        return { data: [readiness], totalCount: 1 };
      }

      case "onboard_autopilot_device": {
        const result = await onboardAutopilotDevice(
          args.serialNumber,
          args.hardwareHash,
          {
            groupTag: args.groupTag,
            assignedUserUpn: args.assignedUserUpn,
            targetGroupId: args.targetGroupId,
          }
        );
        return { data: [result], totalCount: 1 };
      }

      case "get_autopilot_collection_script": {
        const script = getHardwareHashCollectionScript(args.ingestUrl, args.apiKey, args.groupTag);
        return { data: [{ script, instructions: "Run this PowerShell script on the target device as Administrator to collect the hardware hash. If an ingestUrl was provided, the script will automatically upload the hash. Otherwise, the user should paste the serial number and hardware hash into the onboard_autopilot_device tool." }], totalCount: 1 };
      }

      case "deploy_hash_collector": {
        const result = await deployHashCollector(args.targetGroupId, {
          displayName: args.displayName,
          scheduleIntervalMinutes: args.scheduleIntervalMinutes,
        });
        return { data: [result], totalCount: 1 };
      }

      case "process_collected_hashes": {
        const result = await processCollectedHashes(args.scriptId, {
          groupTag: args.groupTag,
          targetGroupId: args.targetGroupId,
          autoImport: args.autoImport,
        });
        return { data: [{ ...result, collectedCount: result.collected.length, importedCount: result.imported.length }], totalCount: 1 };
      }

      case "ingest_autopilot_csv": {
        const csvResult = await ingestAutopilotCsv(String(args.csvData), { groupTag: args.groupTag as string, targetGroupId: args.targetGroupId as string });
        return { data: [csvResult], totalCount: 1 };
      }

      case "get_device_timeline": {
        const timeline = await buildDeviceTimeline({ deviceName: args.deviceName as string });
        const events = (timeline.timeline || []) as Array<Record<string, unknown>>;
        const tlDevice = timeline.device || {} as Record<string, unknown>;
        const flatEvents = events.map((e: Record<string, unknown>) => ({
          deviceName: (tlDevice as Record<string, unknown>).deviceName || args.deviceName,
          date: e.date,
          event: e.event,
          category: e.category,
        }));
        return { data: flatEvents.length > 0 ? flatEvents : [{ deviceName: (tlDevice as Record<string, unknown>).deviceName || args.deviceName, event: "No timeline events found", category: "info", date: new Date().toISOString() }], totalCount: timeline.totalEvents || flatEvents.length };
      }

      case "run_compliance_forecast": {
        const forecast = await runForecast(args.requirement);
        return { data: [{ requirement: forecast.requirement, totalDevices: forecast.totalDevices, wouldPass: forecast.wouldPass, wouldFail: forecast.wouldFail, wouldFailPercent: forecast.wouldFailPercent }], totalCount: 1 };
      }

      case "manage_config_baseline": {
        if (args.action === "snapshot") {
          const snapshot = await takeSnapshot(args.name || "Agent Snapshot");
          return { data: [snapshot], totalCount: 1 };
        } else if (args.action === "list") {
          const snapshots = listSnapshots();
          return { data: snapshots, totalCount: snapshots.length };
        } else if (args.action === "compare" && args.snapshotId) {
          const drift = await compareWithSnapshot(args.snapshotId);
          return { data: [drift], totalCount: 1 };
        }
        return { data: [], error: "Invalid action. Use: snapshot, list, or compare" };
      }

      case "run_troubleshooter": {
        const result = await runDiagnostics(
          args.deviceName,
          args.problem || "General health check",
          () => {} // no-op callback for non-streaming
        );
        return { data: [{ deviceName: result.deviceName, problem: result.problem, totalDurationMs: result.totalDurationMs, steps: result.steps.map(s => ({ name: s.name, status: s.status, findings: s.findings.map(f => f.message) })), diagnosis: result.diagnosis, recommendedActions: result.recommendedActions }], totalCount: 1 };
      }

      case "get_learning_stats": {
        const stats = getLearningStats();
        return { data: [stats], totalCount: 1 };
      }

      case "record_learning": {
        recordCorrection({
          originalQuery: args.originalQuery,
          correctedQuery: args.originalQuery,
          lesson: args.lesson,
        });
        return { data: [{ success: true, message: `Lesson recorded: ${args.lesson}` }], totalCount: 1 };
      }

      case "fix_app_icon": {
        // If no appId provided, search by name
        let appId = args.appId as string | undefined;
        let publisher = args.publisher as string | undefined;
        if (!appId) {
          const apps = await getMobileApps({ filter: `contains(displayName,'${sanitizeOData(String(args.appName))}')`, top: 5 });
          if (apps.items.length === 0) {
            return { data: [{ success: false, message: `No app found matching "${args.appName}" in Intune.` }], totalCount: 1 };
          }
          const match = apps.items[0];
          appId = String(match.id);
          if (!publisher && match.publisher) publisher = String(match.publisher);
        }
        const result = await findAndUploadIcon(
          appId,
          String(args.appName),
          publisher,
          !!args.force
        );
        return { data: [result], totalCount: 1 };
      }

      case "scan_app_icons": {
        const scan = await scanAppIcons();
        // Return missing icons as rows for the data panel
        const rows = scan.missingIcons.map((a) => ({
          displayName: a.displayName,
          publisher: a.publisher,
          appType: a.appType,
          icon: "❌ Missing",
        }));
        return {
          data: rows.length > 0 ? rows : [{ displayName: "All apps have icons!", publisher: "", appType: "", icon: "✅" }],
          totalCount: scan.totalApps,
        };
      }

      case "fix_all_missing_icons": {
        const result = await fixAllMissingIcons();
        return { data: [{ totalApps: result.totalApps, appsWithoutIcons: result.appsWithoutIcons, iconsFound: result.iconsFound, iconsUploaded: result.iconsUploaded, details: result.results.map(r => `${r.appName}: ${r.message}`) }], totalCount: 1 };
      }

      case "remove_app": {
        const result = await removeApp(args.appId);
        return { data: [result], totalCount: 1 };
      }

      case "rename_app": {
        // Resolve app ID by name if not provided
        let appId = args.appId as string | undefined;
        if (!appId && args.appName) {
          const apps = await getMobileApps({ filter: `contains(displayName,'${sanitizeOData(String(args.appName))}')`, top: 5 });
          if (apps.items.length === 0) {
            return { data: [{ success: false, error: `No app found matching "${args.appName}"` }], totalCount: 1 };
          }
          appId = String(apps.items[0].id);
        }
        if (!appId) return { data: [{ success: false, error: "Provide either appId or appName" }], totalCount: 1 };
        const result = await renameApp(appId, String(args.newName));
        return { data: [result], totalCount: 1 };
      }

      case "bulk_rename_apps": {
        const result = await bulkRenameApps(String(args.search), String(args.replace));
        // Flatten: each renamed app as its own row for the data panel
        const rows = result.results.map((r) => ({
          oldName: r.oldName,
          newName: r.newName,
          status: r.success ? "✅ Renamed" : "❌ Failed",
          error: r.error || "",
        }));
        return {
          data: rows.length > 0 ? rows : [{ oldName: "—", newName: "—", status: `No apps found containing "${args.search}"`, error: "" }],
          totalCount: result.matchedApps,
        };
      }

      case "get_cve_status": {
        const stats = getCVEStats();
        return { data: [stats], totalCount: 1 };
      }

      case "get_cve_list": {
        const cves = getCVEs({ status: args.status, severity: args.severity, limit: args.limit || 20 });
        const rows = cves.map((c) => ({
          cveId: c.cveId,
          severity: c.severity,
          cvssScore: c.cvssScore,
          title: c.title,
          relevance: `${c.relevanceScore}%`,
          devices: c.affectedDeviceCount,
          exploited: c.isExploited ? "⚠️ YES" : "No",
          remediation: c.remediation?.substring(0, 100) || "—",
          type: c.remediationType || "—",
          status: c.status,
        }));
        return { data: rows.length > 0 ? rows : [{ cveId: "No CVEs found", severity: "", remediation: "Run a scan first" }], totalCount: rows.length };
      }

      case "scan_cves": {
        const result = await runCVEScan(args.daysBack || 7);
        const rows = result.newCves.map((c) => ({
          cveId: c.cveId,
          severity: c.severity,
          cvssScore: c.cvssScore,
          relevance: `${c.relevanceScore}%`,
          devices: c.affectedDeviceCount,
          exploited: c.isExploited ? "⚠️ ACTIVELY EXPLOITED" : "No",
          remediation: c.remediation?.substring(0, 150) || "—",
        }));
        return { data: rows.length > 0 ? rows : [{ cveId: "No new relevant CVEs found", severity: "—", remediation: "All clear!" }], totalCount: result.totalCvesFound };
      }

      case "update_cve_status": {
        updateCVEStatus(args.cveId, args.status);
        return { data: [{ cveId: args.cveId, status: args.status, message: `CVE ${args.cveId} marked as ${args.status}` }], totalCount: 1 };
      }

      default:
        return {
          data: [],
          error: `Unknown tool: ${toolName}`,
        };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Tool execution error [${toolName}]:`, message);
    auditLog({
      timestamp: new Date().toISOString(), toolName,
      args: {}, isDestructive: requiresConfirmation(toolName),
      confirmed: false, result: "error", error: sanitizeErrorMessage(message),
      durationMs: Date.now() - startTime,
    });
    return {
      data: [],
      error: `Error executing ${toolName}: ${sanitizeErrorMessage(message)}`,
    };
  }
}
