import { getManagedDevices, getDeviceDetails } from "../graph/devices.js";
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
