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
import { generateRemediationScript, generateAlertRemediation } from "../remediation/scriptGenerator.js";
import { deployToIntune } from "../remediation/deployer.js";
import { analyzePolicies } from "../policyAnalyzer/analyzer.js";

export interface ToolResult {
  data: unknown[];
  totalCount?: number;
  error?: string;
}

/**
 * Dispatches a tool call to the corresponding Graph API function.
 * Returns the data array and total count, or an error message.
 */
export async function executeTool(
  toolName: string,
  argsJson: string
): Promise<ToolResult> {
  try {
    const args = JSON.parse(argsJson || "{}");

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

      // ─── Device Actions ────────────────────────────────────────

      case "sync_device": {
        const result = await syncDevice(args.deviceId);
        return { data: [result], totalCount: 1 };
      }

      case "restart_device": {
        const result = await restartDevice(args.deviceId);
        return { data: [result], totalCount: 1 };
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
        const policyBody = JSON.parse(args.policyBody || "{}");
        policyBody.displayName = args.displayName;
        if (args.description) policyBody.description = args.description;
        const result = await createCompliancePolicy(policyBody);
        return { data: [result], totalCount: 1 };
      }

      case "assign_policy": {
        const groupIds = (args.groupIds as string).split(",").map((g: string) => g.trim());
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

      default:
        return {
          data: [],
          error: `Unknown tool: ${toolName}`,
        };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Tool execution error [${toolName}]:`, message);
    return {
      data: [],
      error: `Error executing ${toolName}: ${message}`,
    };
  }
}
