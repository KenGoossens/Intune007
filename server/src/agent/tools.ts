import type { ChatCompletionTool } from "openai/resources/chat/completions.js";
import { DESTRUCTIVE_TOOLS } from "../security.js";

/**
 * Tool definitions for Azure OpenAI function calling.
 * Each tool maps to a Microsoft Graph API query for Intune data.
 */
export const agentTools: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_managed_devices",
      description:
        "List Intune managed devices. Returns device name, OS, compliance state, ownership, last sync time, and user. Use OData filter to narrow results (e.g., filter by OS, compliance state, user).",
      parameters: {
        type: "object",
        properties: {
          filter: {
            type: "string",
            description:
              "OData $filter expression. Examples: \"operatingSystem eq 'Windows'\", \"complianceState eq 'noncompliant'\", \"contains(deviceName,'LAP')\"",
          },
          top: {
            type: "number",
            description: "Maximum number of devices to return (default: 50, max: 100)",
          },
          select: {
            type: "string",
            description:
              "Comma-separated list of properties to return. Leave empty for default fields.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_device_details",
      description:
        "Get detailed information about a single managed device by its device ID.",
      parameters: {
        type: "object",
        properties: {
          deviceId: {
            type: "string",
            description: "The unique ID of the managed device",
          },
        },
        required: ["deviceId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_compliance_policies",
      description:
        "List device compliance policies configured in Intune. Returns policy name, platform, and dates.",
      parameters: {
        type: "object",
        properties: {
          filter: {
            type: "string",
            description: "OData $filter expression to filter compliance policies",
          },
          top: {
            type: "number",
            description: "Maximum number of policies to return (default: 50)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_compliance_status",
      description:
        "Get the overall device compliance status summary across all devices. Returns counts of compliant, non-compliant, error, conflict, unknown, and not-applicable devices.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_device_configurations",
      description:
        "List device configuration profiles in Intune. Returns profile name, description, version, and dates.",
      parameters: {
        type: "object",
        properties: {
          filter: {
            type: "string",
            description: "OData $filter expression to filter configuration profiles",
          },
          top: {
            type: "number",
            description: "Maximum number of profiles to return (default: 50)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_mobile_apps",
      description:
        "List mobile apps managed in Intune. Returns app name, publisher, description, and dates.",
      parameters: {
        type: "object",
        properties: {
          filter: {
            type: "string",
            description: "OData $filter expression to filter apps",
          },
          top: {
            type: "number",
            description: "Maximum number of apps to return (default: 50)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_app_install_status",
      description:
        "Get the installation status of a specific app across devices. Requires the app ID.",
      parameters: {
        type: "object",
        properties: {
          appId: {
            type: "string",
            description: "The unique ID of the mobile app",
          },
          top: {
            type: "number",
            description: "Maximum number of statuses to return (default: 50)",
          },
        },
        required: ["appId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_device_detected_apps",
      description:
        "Get all software actually installed/detected on a specific managed device. This is the PRIMARY tool for answering 'how many apps are installed on this device' or 'what software is on this device'. Returns the full list of detected applications with names and versions. USE THIS TOOL when the user asks about installed apps, software, or applications on a device. Requires the device ID — use get_managed_devices first to find it by name.",
      parameters: {
        type: "object",
        properties: {
          deviceId: {
            type: "string",
            description: "The unique ID of the managed device",
          },
          top: {
            type: "number",
            description: "Maximum number of apps to return (default: 50)",
          },
        },
        required: ["deviceId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_device_app_install_states",
      description:
        "Get Intune-managed app assignment and deployment status for a specific device. This checks which apps were ASSIGNED to the device through Intune and their deployment state (installed/pending/failed). NOTE: This does NOT show all installed software — only Intune-assigned apps. To see ALL software on the device, use get_device_detected_apps instead. Requires the device ID.",
      parameters: {
        type: "object",
        properties: {
          deviceId: {
            type: "string",
            description: "The unique ID of the managed device",
          },
        },
        required: ["deviceId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_conditional_access_policies",
      description:
        "List Conditional Access policies. Returns policy name, state (enabled/disabled/report-only), and dates.",
      parameters: {
        type: "object",
        properties: {
          filter: {
            type: "string",
            description: "OData $filter expression to filter CA policies",
          },
          top: {
            type: "number",
            description: "Maximum number of policies to return (default: 50)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_autopilot_devices",
      description:
        "List Windows Autopilot device identities. Returns serial number, model, manufacturer, group tag, and enrollment state. (Beta API)",
      parameters: {
        type: "object",
        properties: {
          filter: {
            type: "string",
            description: "OData $filter expression to filter Autopilot devices",
          },
          top: {
            type: "number",
            description: "Maximum number of devices to return (default: 50)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_device_configuration_states",
      description:
        "Get the configuration profile states for a specific managed device. Shows which configuration profiles are assigned/applied to the device, their state (compliant, not applicable, error, conflict), and setting counts. Requires the device ID — use get_managed_devices first to find the device ID by name.",
      parameters: {
        type: "object",
        properties: {
          deviceId: {
            type: "string",
            description: "The unique ID of the managed device (use get_managed_devices to find it)",
          },
        },
        required: ["deviceId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_autopilot_profiles",
      description:
        "List Windows Autopilot deployment profiles. Returns profile name, description, language, and dates. (Beta API)",
      parameters: {
        type: "object",
        properties: {
          filter: {
            type: "string",
            description: "OData $filter expression to filter deployment profiles",
          },
          top: {
            type: "number",
            description: "Maximum number of profiles to return (default: 50)",
          },
        },
        required: [],
      },
    },
  },
  // ─── Device Actions ─────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "sync_device",
      description:
        "Force a managed device to sync with Intune immediately. Use this when a device needs to pick up new policies, apps, or configuration changes right away.",
      parameters: {
        type: "object",
        properties: {
          deviceId: {
            type: "string",
            description: "The unique ID of the managed device. Use get_managed_devices to find it first.",
          },
        },
        required: ["deviceId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "restart_device",
      description:
        "Remotely restart a managed device. The device will reboot on its next check-in.",
      parameters: {
        type: "object",
        properties: {
          deviceId: {
            type: "string",
            description: "The unique ID of the managed device.",
          },
        },
        required: ["deviceId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "lock_device",
      description:
        "Remotely lock a managed device. Useful for lost or stolen devices.",
      parameters: {
        type: "object",
        properties: {
          deviceId: {
            type: "string",
            description: "The unique ID of the managed device.",
          },
        },
        required: ["deviceId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "reset_passcode",
      description:
        "Reset the passcode/PIN on a managed device. Generates a new temporary passcode.",
      parameters: {
        type: "object",
        properties: {
          deviceId: {
            type: "string",
            description: "The unique ID of the managed device.",
          },
        },
        required: ["deviceId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "retire_device",
      description:
        "DESTRUCTIVE — Retire a managed device. Removes all corporate data, apps, and policies but keeps personal data. Always confirm with the user before executing this action.",
      parameters: {
        type: "object",
        properties: {
          deviceId: {
            type: "string",
            description: "The unique ID of the managed device.",
          },
        },
        required: ["deviceId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "wipe_device",
      description:
        "DESTRUCTIVE — Factory reset a managed device. ALL data on the device will be permanently deleted. This is irreversible. Always confirm with the user before executing this action.",
      parameters: {
        type: "object",
        properties: {
          deviceId: {
            type: "string",
            description: "The unique ID of the managed device.",
          },
          keepEnrollmentData: {
            type: "boolean",
            description: "Whether to keep the enrollment data after wipe (default: false)",
          },
          keepUserData: {
            type: "boolean",
            description: "Whether to keep user data after wipe (default: false)",
          },
        },
        required: ["deviceId"],
      },
    },
  },
  // ─── Remediation Tools ──────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "generate_remediation_script",
      description:
        "Generate a PowerShell Proactive Remediation script pair (detection + remediation) using AI. Describe the problem or what you want to fix, and this tool will generate both scripts. Use this when the user asks to create a script, fix an issue, remediate a problem, or automate a fix.",
      parameters: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description:
              "Description of what the remediation should detect and fix. Be specific about the problem, affected OS settings, registry keys, services, etc.",
          },
          alertType: {
            type: "string",
            description:
              "Optional: the alert type this remediation is for (non_compliant_devices, policy_conflicts, stale_devices, failed_app_installs)",
          },
        },
        required: ["prompt"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "deploy_remediation_script",
      description:
        "Deploy a previously generated remediation script to Intune as a Proactive Remediation (deviceHealthScript). This creates the script in Intune but does NOT assign it to any devices/groups yet. Use generate_remediation_script first, then this tool to deploy it.",
      parameters: {
        type: "object",
        properties: {
          displayName: {
            type: "string",
            description: "Display name for the Proactive Remediation",
          },
          description: {
            type: "string",
            description: "Description of what the remediation does",
          },
          detectionScript: {
            type: "string",
            description: "The PowerShell detection script content",
          },
          remediationScript: {
            type: "string",
            description: "The PowerShell remediation script content",
          },
          runAsAccount: {
            type: "string",
            enum: ["system", "user"],
            description: "Run as System or User context (default: system)",
          },
        },
        required: [
          "displayName",
          "description",
          "detectionScript",
          "remediationScript",
        ],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_remediation_scripts",
      description:
        "List existing Proactive Remediation scripts (deviceHealthScripts) configured in Intune. Shows script name, description, publisher, and dates.",
      parameters: {
        type: "object",
        properties: {
          top: {
            type: "number",
            description: "Maximum number of scripts to return (default: 50)",
          },
        },
        required: [],
      },
    },
  },
  // ─── Policy Analyzer Tool ───────────────────────────────────────
  {
    type: "function",
    function: {
      name: "analyze_policies",
      description:
        "Run a comprehensive policy analysis across the Intune tenant. Checks compliance policies, configuration profiles, Conditional Access policies, device health, and app management for security gaps, misconfigurations, and best practice violations. Returns a health score (0-100), findings grouped by severity, and environment stats. Use this when the user asks about policy health, security posture, best practice review, or wants an overall assessment of their Intune environment.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  // ─── Group Management Tools ─────────────────────────────────────
  {
    type: "function",
    function: {
      name: "get_groups",
      description:
        "List Azure AD / Entra ID groups. Returns group name, description, type (security/M365), membership rule, and dates. Use filter for OData queries or search for name-based lookup.",
      parameters: {
        type: "object",
        properties: {
          filter: {
            type: "string",
            description: "OData $filter expression. Examples: \"securityEnabled eq true\", \"displayName eq 'My Group'\"",
          },
          search: {
            type: "string",
            description: "Search groups by display name (partial match). Use this instead of filter for name searches.",
          },
          top: {
            type: "number",
            description: "Maximum number of groups to return (default: 50)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_group_members",
      description:
        "List members of a specific Azure AD group. Returns member name, type (user/device), UPN, and device info if applicable.",
      parameters: {
        type: "object",
        properties: {
          groupId: {
            type: "string",
            description: "The unique ID of the group. Use get_groups to find it first.",
          },
          top: {
            type: "number",
            description: "Maximum number of members to return (default: 50)",
          },
        },
        required: ["groupId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_group",
      description:
        "Create a new Azure AD security group. Useful for organizing devices/users for policy and app targeting.",
      parameters: {
        type: "object",
        properties: {
          displayName: {
            type: "string",
            description: "Display name for the new group",
          },
          description: {
            type: "string",
            description: "Description of the group's purpose",
          },
        },
        required: ["displayName", "description"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_group_member",
      description:
        "Add a user or device to an Azure AD group. Requires the group ID and the member's directory object ID.",
      parameters: {
        type: "object",
        properties: {
          groupId: {
            type: "string",
            description: "The unique ID of the target group",
          },
          memberId: {
            type: "string",
            description: "The directory object ID of the user or device to add",
          },
        },
        required: ["groupId", "memberId"],
      },
    },
  },
  // ─── Security & Threat Intelligence Tools ──────────────────────
  {
    type: "function",
    function: {
      name: "get_security_alerts",
      description:
        "Get security alerts from Microsoft 365 Defender / Security Center. Returns alert title, severity, status, category, and timestamps. Use filter to narrow by severity or status.",
      parameters: {
        type: "object",
        properties: {
          filter: {
            type: "string",
            description: "OData $filter expression. Examples: \"severity eq 'high'\", \"status eq 'new'\"",
          },
          top: {
            type: "number",
            description: "Maximum number of alerts to return (default: 50)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_bitlocker_keys",
      description:
        "Get BitLocker recovery keys. Can filter by device ID to find keys for a specific device. Returns key ID, device ID, and volume type. The actual recovery key value requires a separate call.",
      parameters: {
        type: "object",
        properties: {
          deviceId: {
            type: "string",
            description: "Optional device ID to filter recovery keys for a specific device",
          },
          top: {
            type: "number",
            description: "Maximum number of keys to return (default: 50)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_device_threat_summary",
      description:
        "Get an overall threat and device summary including enrollment counts, OS distribution, and exchange access state summary.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  // ─── Log Collection Tools ─────────────────────────────────────
  {
    type: "function",
    function: {
      name: "get_audit_logs",
      description:
        "Get Intune audit events — shows admin actions like policy changes, device actions, app assignments. Use filter to narrow by date or activity type.",
      parameters: {
        type: "object",
        properties: {
          filter: {
            type: "string",
            description: "OData $filter expression. Example: \"activityDateTime gt 2024-01-01T00:00:00Z\"",
          },
          top: {
            type: "number",
            description: "Maximum number of events to return (default: 50)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_sign_in_logs",
      description:
        "Get Azure AD sign-in logs — shows user and device sign-in activity including success/failure, location, app used, and device details.",
      parameters: {
        type: "object",
        properties: {
          filter: {
            type: "string",
            description: "OData $filter expression. Example: \"userPrincipalName eq 'user@contoso.com'\", \"status/errorCode ne 0\"",
          },
          top: {
            type: "number",
            description: "Maximum number of sign-ins to return (default: 50)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_directory_audit_logs",
      description:
        "Get Azure AD directory audit logs — shows tenant-level admin actions like group changes, role assignments, and policy modifications.",
      parameters: {
        type: "object",
        properties: {
          filter: {
            type: "string",
            description: "OData $filter expression. Example: \"category eq 'GroupManagement'\"",
          },
          top: {
            type: "number",
            description: "Maximum number of audit entries to return (default: 50)",
          },
        },
        required: [],
      },
    },
  },
  // ─── Policy Management Tools ──────────────────────────────────
  {
    type: "function",
    function: {
      name: "create_compliance_policy",
      description:
        "Create a new Intune device compliance policy. Provide the full policy body including @odata.type for the platform (e.g., #microsoft.graph.windows10CompliancePolicy). Always confirm the policy details with the user before creating.",
      parameters: {
        type: "object",
        properties: {
          displayName: {
            type: "string",
            description: "Display name for the compliance policy",
          },
          description: {
            type: "string",
            description: "Description of the policy",
          },
          platform: {
            type: "string",
            enum: ["windows10", "ios", "android", "macOS"],
            description: "Target platform for the policy",
          },
          policyBody: {
            type: "string",
            description: "JSON string of the full policy body including platform-specific settings. Must include @odata.type.",
          },
        },
        required: ["displayName", "platform", "policyBody"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "assign_policy",
      description:
        "Assign a compliance policy or configuration profile to one or more Azure AD groups.",
      parameters: {
        type: "object",
        properties: {
          policyId: {
            type: "string",
            description: "The ID of the compliance policy or configuration profile",
          },
          policyType: {
            type: "string",
            enum: ["compliance", "configuration"],
            description: "Type of policy being assigned",
          },
          groupIds: {
            type: "string",
            description: "Comma-separated list of Azure AD group IDs to assign the policy to",
          },
        },
        required: ["policyId", "policyType", "groupIds"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_conditional_access_policy",
      description:
        "Update a Conditional Access policy — can enable, disable, or set to report-only mode. Always confirm with the user before changing CA policies.",
      parameters: {
        type: "object",
        properties: {
          policyId: {
            type: "string",
            description: "The ID of the Conditional Access policy",
          },
          state: {
            type: "string",
            enum: ["enabled", "disabled", "enabledForReportingButNotEnforced"],
            description: "New state for the policy",
          },
        },
        required: ["policyId", "state"],
      },
    },
  },
  // ─── Windows Update Tools ─────────────────────────────────────
  {
    type: "function",
    function: {
      name: "get_policies_assigned_to_group",
      description:
        "Get all policies (compliance, configuration, remediation, app protection, conditional access) assigned to a specific Azure AD group. Use get_groups first to find the group ID.",
      parameters: {
        type: "object",
        properties: {
          groupId: {
            type: "string",
            description: "The unique ID of the Azure AD group. Use get_groups to find it.",
          },
        },
        required: ["groupId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_policies_assigned_to_device",
      description:
        "Get all policies (compliance and configuration profiles) currently assigned to a specific managed device. Shows the policy state (compliant, conflict, error, notApplicable). Use get_managed_devices to find the device ID first.",
      parameters: {
        type: "object",
        properties: {
          deviceId: {
            type: "string",
            description: "The unique ID of the managed device. Use get_managed_devices to find it.",
          },
        },
        required: ["deviceId"],
      },
    },
  },
  // ─── Windows Update Tools (continued) ─────────────────────────
  {
    type: "function",
    function: {
      name: "get_update_rings",
      description:
        "List Windows Update for Business configuration profiles (update rings). Shows deferral periods, delivery optimization mode, and update settings.",
      parameters: {
        type: "object",
        properties: {
          top: {
            type: "number",
            description: "Maximum number of update rings to return (default: 50)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_update_compliance",
      description:
        "Get the overall Windows Update compliance summary across all devices. Shows counts of compliant, non-compliant, error, and unknown devices for software updates.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  // ─── Historical Trending Tools ────────────────────────────────
  {
    type: "function",
    function: {
      name: "get_compliance_trend",
      description:
        "Get historical compliance trend data over time. Returns daily aggregated counts of compliant vs non-compliant devices. Use this when the user asks about trends, historical data, or 'how has compliance changed'.",
      parameters: {
        type: "object",
        properties: {
          metricName: {
            type: "string",
            description: "Metric to trend. Options: compliant_devices, non_compliant_devices, total_devices, stale_devices, total_alerts",
          },
          days: {
            type: "number",
            description: "Number of days of history to return (default: 30, max: 90)",
          },
        },
        required: ["metricName"],
      },
    },
  },
  // ─── Agent Memory Tools ───────────────────────────────────────
  {
    type: "function",
    function: {
      name: "save_note",
      description:
        "Save a note to the agent's persistent memory. Use this when the user asks you to remember something about their environment, preferences, or operational notes. Notes persist across conversations.",
      parameters: {
        type: "object",
        properties: {
          content: {
            type: "string",
            description: "The note content to save",
          },
          category: {
            type: "string",
            description: "Category for the note (e.g., 'tenant', 'preference', 'procedure', 'general')",
          },
        },
        required: ["content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "recall_notes",
      description:
        "Search the agent's persistent memory for previously saved notes. Use this when the user references something they asked you to remember, or when you need context about the tenant.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Keyword or phrase to search for in saved notes",
          },
        },
        required: ["query"],
      },
    },
  },
  // ─── Scheduled Task Tools ─────────────────────────────────────
  {
    type: "function",
    function: {
      name: "create_scheduled_task",
      description:
        "Create a recurring scheduled task that runs an agent query automatically. Use this when the user asks for periodic reports, scheduled checks, or automated monitoring.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Descriptive name for the task",
          },
          prompt: {
            type: "string",
            description: "The agent query/prompt to execute on schedule",
          },
          schedule: {
            type: "string",
            enum: ["hourly", "daily", "weekly"],
            description: "How often to run the task (default: daily)",
          },
        },
        required: ["name", "prompt"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_scheduled_tasks",
      description:
        "List all configured scheduled tasks with their status, last run time, and schedule.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "manage_scheduled_task",
      description:
        "Enable, disable, or delete a scheduled task.",
      parameters: {
        type: "object",
        properties: {
          taskId: {
            type: "string",
            description: "The ID of the task to manage",
          },
          action: {
            type: "string",
            enum: ["enable", "disable", "delete"],
            description: "Action to perform on the task",
          },
        },
        required: ["taskId", "action"],
      },
    },
  },
  // ─── Multi-Tenant Tools ───────────────────────────────────────
  {
    type: "function",
    function: {
      name: "list_tenants",
      description:
        "List all configured Intune tenants and show which one is currently active.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "switch_tenant",
      description:
        "Switch the active tenant for subsequent Graph API queries. All tools will operate against the selected tenant.",
      parameters: {
        type: "object",
        properties: {
          tenantId: {
            type: "string",
            description: "The tenant ID to switch to. Use list_tenants to see available tenants.",
          },
        },
        required: ["tenantId"],
      },
    },
  },
  // ─── Advanced Features Tools ──────────────────────────────────
  {
    type: "function",
    function: {
      name: "generate_report",
      description:
        "Generate a targeted Intune report that directly answers the user's specific question. Uses AI planning to determine which data sources to fetch (with filters), then generates a data-rich report focused on what the user actually asked. Reports are styled appropriately: executive (KPIs, management-ready), technical (configs, device states), operational (action items, priorities), comparative (trends, deltas), or investigative (deep dives). Use this for any request involving 'report', 'summary', 'overview', 'analysis', 'breakdown', or when the user needs formatted output about their environment.",
      parameters: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description: "The user's report request — be specific. Include any mentioned devices, groups, OS platforms, date ranges, or focus areas. Good: 'Compliance report for Windows devices that are non-compliant, showing which policies they violate'. Bad: 'compliance report'.",
          },
        },
        required: ["prompt"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_device_risk_scores",
      description:
        "Compute risk scores (0-100) for all managed devices based on compliance, sync age, encryption, OS version, and config conflicts. Returns fleet average, risk distribution, and per-device scores with factor breakdown.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_device_card",
      description:
        "Get a comprehensive device information card with 50+ properties including hardware (RAM, storage, CPU), security (encryption, TPM, secure boot, BitLocker), network (WiFi/Ethernet MAC, IP), enrollment details, and compliance status. Use this for detailed device information.",
      parameters: {
        type: "object",
        properties: {
          deviceName: {
            type: "string",
            description: "The device name to look up",
          },
        },
        required: ["deviceName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_security_posture",
      description:
        "Get the overall security posture of the Intune environment including compliance rate, encryption rate, stale device rate, per-device breakdown, and historical trends. Use this when the user asks about security posture, security health, or overall security status.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_app_health",
      description:
        "Get app deployment health — shows all managed apps, which devices they're detected on, deployment rate, and per-device details. Use this when the user asks about app deployments, app install status, or which apps are on which devices.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_autopilot_readiness",
      description:
        "Check if a device is ready for Autopilot deployment by serial number. Verifies registration, profile assignment, group tag, and enrollment state. Returns a readiness score.",
      parameters: {
        type: "object",
        properties: {
          serialNumber: {
            type: "string",
            description: "The serial number of the device to check",
          },
        },
        required: ["serialNumber"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "onboard_autopilot_device",
      description:
        "Full automated Autopilot onboarding pipeline: imports the hardware hash into Intune, sets a group tag for dynamic group targeting, adds the device to a deployment group, and verifies profile assignment. Use this when a user wants to register and prepare a new device for Autopilot. Requires the serial number and Base64-encoded hardware hash. If the user doesn't have the hardware hash, offer to provide the PowerShell collection script first.",
      parameters: {
        type: "object",
        properties: {
          serialNumber: {
            type: "string",
            description: "The device serial number",
          },
          hardwareHash: {
            type: "string",
            description: "Base64-encoded hardware hash from Get-WindowsAutopilotInfo or OEM",
          },
          groupTag: {
            type: "string",
            description: "Group tag for dynamic group targeting (e.g., 'Sales-Dept', 'Kiosk-Mode')",
          },
          assignedUserUpn: {
            type: "string",
            description: "UPN of the user to pre-assign to the device (optional)",
          },
          targetGroupId: {
            type: "string",
            description: "Azure AD group ID to add the device to for profile targeting (optional)",
          },
        },
        required: ["serialNumber", "hardwareHash"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_autopilot_collection_script",
      description:
        "Get the PowerShell script that collects a device's hardware hash for Autopilot registration. If an ingestUrl is provided (Azure Function or Intune007 API), the script will automatically upload the hash. Otherwise it saves to CSV for manual import. Provide this when the user needs to collect the hardware hash from a bare-metal or unmanaged device.",
      parameters: {
        type: "object",
        properties: {
          ingestUrl: {
            type: "string",
            description: "Optional URL of the Azure Function or Intune007 API endpoint to auto-upload the hash to (e.g., https://my-func.azurewebsites.net/api/autopilot/ingest)",
          },
          apiKey: {
            type: "string",
            description: "API key for the ingest endpoint (required if ingestUrl is set)",
          },
          groupTag: {
            type: "string",
            description: "Group tag to include in the upload",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "deploy_hash_collector",
      description:
        "Deploy an automated hardware hash collector as a Proactive Remediation to a group of ALREADY ENROLLED Intune devices. This is for converting existing managed devices to Autopilot. The script runs on each device, collects the hardware hash, and reports it back. Use process_collected_hashes afterward to import the collected hashes into Autopilot.",
      parameters: {
        type: "object",
        properties: {
          targetGroupId: {
            type: "string",
            description: "Azure AD group ID containing the enrolled devices to collect hashes from",
          },
          displayName: {
            type: "string",
            description: "Custom name for the Proactive Remediation script (default: 'Intune007 — Autopilot Hash Collector')",
          },
          scheduleIntervalMinutes: {
            type: "number",
            description: "How often the script should run in minutes",
          },
        },
        required: ["targetGroupId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "process_collected_hashes",
      description:
        "Process hardware hashes that were collected by the deployed hash collector (Proactive Remediation). Polls the run states to find devices that reported their hash, then optionally auto-imports each one into Autopilot. Use this after deploy_hash_collector.",
      parameters: {
        type: "object",
        properties: {
          scriptId: {
            type: "string",
            description: "The Proactive Remediation script ID (from deploy_hash_collector response)",
          },
          groupTag: {
            type: "string",
            description: "Group tag to set on imported devices",
          },
          targetGroupId: {
            type: "string",
            description: "Azure AD group to add imported devices to",
          },
          autoImport: {
            type: "boolean",
            description: "Whether to automatically import collected hashes into Autopilot (default: true)",
          },
        },
        required: ["scriptId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ingest_autopilot_csv",
      description:
        "Import hardware hashes from CSV data (the standard format from Get-WindowsAutopilotInfo). The CSV should have columns: Device Serial Number, Windows Product ID, Hardware Hash. Each device will be automatically imported into Autopilot.",
      parameters: {
        type: "object",
        properties: {
          csvData: {
            type: "string",
            description: "The full CSV text content with headers and data rows",
          },
          groupTag: {
            type: "string",
            description: "Group tag to set on imported devices",
          },
          targetGroupId: {
            type: "string",
            description: "Azure AD group to add imported devices to",
          },
        },
        required: ["csvData"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_device_timeline",
      description:
        "Get the lifecycle timeline of a device showing enrollment, compliance changes, config profile assignments, admin actions, and sync events in chronological order.",
      parameters: {
        type: "object",
        properties: {
          deviceName: {
            type: "string",
            description: "The device name to get the timeline for",
          },
        },
        required: ["deviceName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_compliance_forecast",
      description:
        "Run a 'what-if' compliance forecast — predict how many devices would fail if a new requirement is applied. Use this when the user asks questions like 'what if I require encryption?', 'how many devices would fail if I enforce BitLocker?', 'what happens if I require compliance?', 'what if I need all devices synced within 7 days?'. Requirement options: 'encryption' (BitLocker/FileVault), 'compliant' (current compliance), 'synced_7days', 'synced_14days', 'corporate' (company-owned only), 'windows' (Windows devices only).",
      parameters: {
        type: "object",
        properties: {
          requirement: {
            type: "string",
            description: "The requirement to forecast. Options: encryption, compliant, synced_7days, synced_14days, corporate, windows",
          },
        },
        required: ["requirement"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "manage_config_baseline",
      description:
        "Take a snapshot of the current Intune configuration (policies, profiles, CA rules) or compare current state against a saved snapshot to detect drift. Use action 'snapshot' to save, 'list' to list snapshots, 'compare' to detect drift.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["snapshot", "list", "compare"],
            description: "Action to perform",
          },
          name: {
            type: "string",
            description: "Name for the snapshot (required for 'snapshot' action)",
          },
          snapshotId: {
            type: "number",
            description: "ID of the snapshot to compare against (required for 'compare' action)",
          },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_troubleshooter",
      description:
        "Run an automated 7-step diagnostic on a device: resolve device, check compliance, config profiles, app installs, group membership, sync status, and AI root cause analysis. Use this when a user reports a device issue.",
      parameters: {
        type: "object",
        properties: {
          deviceName: {
            type: "string",
            description: "The device name or ID to diagnose",
          },
          problem: {
            type: "string",
            description: "Description of the problem (optional, defaults to general health check)",
          },
        },
        required: ["deviceName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_learning_stats",
      description:
        "Get statistics about what the agent has learned from past interactions: total interactions logged, feedback scores, number of learned exemplar patterns, corrections, and top tool chain patterns. Use this when the user asks how the agent is improving or what it has learned.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "record_learning",
      description:
        "Record a lesson or correction that the agent should remember for future interactions. Use this when you realize you made a mistake or found a better approach. The lesson will be used to avoid the same mistake in the future.",
      parameters: {
        type: "object",
        properties: {
          originalQuery: {
            type: "string",
            description: "The original user query that led to the issue",
          },
          lesson: {
            type: "string",
            description: "What to do differently next time (e.g., 'Use get_device_detected_apps instead of get_app_install_status for installed software questions')",
          },
        },
        required: ["originalQuery", "lesson"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fix_app_icon",
      description:
        "Search the internet for an app icon and upload it to the Intune app. Use this when the user asks to find, fix, or refresh an app icon/logo. You can provide either the app ID or just the app name — if only the name is given, the tool will search Intune for the matching app automatically. Set force=true to replace an existing icon.",
      parameters: {
        type: "object",
        properties: {
          appId: {
            type: "string",
            description: "The Intune app ID (GUID). Optional — if not provided, the tool will search by appName.",
          },
          appName: {
            type: "string",
            description: "The display name of the app (used to search Intune and to find the icon online)",
          },
          publisher: {
            type: "string",
            description: "The app publisher (helps find the right icon domain)",
          },
          force: {
            type: "boolean",
            description: "If true, replaces the existing icon even if one is already set. Use for refreshing outdated icons.",
          },
        },
        required: ["appName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "scan_app_icons",
      description:
        "Scan all managed apps and report which ones have icons and which are missing icons. This is READ-ONLY — it does NOT modify anything. Use this when the user asks how many apps have missing icons/logos, or wants to see which apps need icons. Returns lists of apps with and without icons.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fix_all_missing_icons",
      description:
        "Scan ALL managed apps in Intune for missing icons and automatically search and upload icons for each one. This is a bulk operation — use it when the user asks to fix all missing app icons at once. Returns a summary of how many icons were found and uploaded.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remove_app",
      description:
        "Remove an app from Intune. This follows the correct sequence: first removes ALL group assignments, then deletes the app. DESTRUCTIVE ACTION — always confirm with the user before executing. Show the app name and ask for explicit confirmation. Requires the Intune app ID (GUID).",
      parameters: {
        type: "object",
        properties: {
          appId: {
            type: "string",
            description: "The Intune app ID (GUID) to remove",
          },
          appName: {
            type: "string",
            description: "The display name of the app (for confirmation logging)",
          },
        },
        required: ["appId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "rename_app",
      description:
        "Rename a single app in Intune. Provide the app ID (or name to search for) and the new display name.",
      parameters: {
        type: "object",
        properties: {
          appId: {
            type: "string",
            description: "The Intune app ID (GUID). Optional if appName is provided.",
          },
          appName: {
            type: "string",
            description: "Current app name to search for (used if appId is not provided)",
          },
          newName: {
            type: "string",
            description: "The new display name for the app",
          },
        },
        required: ["newName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "bulk_rename_apps",
      description:
        "Find-and-replace text in app names across ALL managed apps in Intune. Loops through every app, finds those containing the search text, and replaces it. Example: replace '1120_firstname_' with '' to clean up naming prefixes. Always confirm with the user before executing — show how many apps will be affected.",
      parameters: {
        type: "object",
        properties: {
          search: {
            type: "string",
            description: "The text to search for in app display names",
          },
          replace: {
            type: "string",
            description: "The text to replace it with (use empty string to remove)",
          },
        },
        required: ["search", "replace"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_cve_status",
      description:
        "Get the current CVE vulnerability monitoring status — how many CVEs are tracked, how many are new/critical/exploited, when the last scan ran. Use this when the user asks about vulnerabilities, CVEs, security threats, or patch status.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_cve_list",
      description:
        "Get the list of tracked CVE vulnerabilities relevant to this Intune environment. Can filter by status (new, reviewed, remediated, dismissed) and severity (critical, high, medium, low). Returns CVE details including remediation suggestions.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            description: "Filter by status: new, reviewed, remediated, dismissed",
          },
          severity: {
            type: "string",
            description: "Filter by severity: critical, high, medium, low",
          },
          limit: {
            type: "number",
            description: "Maximum number of CVEs to return (default 20)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "scan_cves",
      description:
        "Trigger a manual CVE vulnerability scan. Fetches latest CVEs from NVD (NIST) and CISA Known Exploited Vulnerabilities catalog, matches them against your Intune devices and apps, scores relevance, and generates AI remediation suggestions. Use when the user asks to check for new vulnerabilities or wants a fresh scan.",
      parameters: {
        type: "object",
        properties: {
          daysBack: {
            type: "number",
            description: "How many days back to check for CVEs (default 7)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_cve_status",
      description:
        "Update the status of a CVE vulnerability. Mark it as reviewed (acknowledged), remediated (fixed), or dismissed (not applicable). Use after the user has addressed a CVE.",
      parameters: {
        type: "object",
        properties: {
          cveId: {
            type: "string",
            description: "The CVE ID (e.g., CVE-2024-1234)",
          },
          status: {
            type: "string",
            description: "New status: reviewed, remediated, or dismissed",
          },
        },
        required: ["cveId", "status"],
      },
    },
  },
  // ─── Delivery Optimization Simulator ──────────────────────────
  {
    type: "function",
    function: {
      name: "create_do_simulation",
      description:
        "Run a Delivery Optimization simulation that models moving from ConfigMgr distribution points to Intune App Distribution + Microsoft Connected Cache. Takes a topology description (sites with device counts, WAN bandwidth, MCC candidate servers, ConfigMgr DPs, subnets) and a content profile, and produces per-site DO mode recommendations, MCC placement, bandwidth savings, a cloud-native readiness score, and a phased migration plan. Use this whenever the user asks about DO planning, MCC, retiring DPs, moving to Intune App Distribution, or comparing on-prem vs cloud content delivery.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Friendly name for this simulation (e.g. 'Q2 retire-DP plan')" },
          sites: {
            type: "array",
            description: "Array of sites in the environment. At minimum each site needs name, deviceCount, wanBandwidthMbps.",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                type: { type: "string", description: "headquarters | branch | small_branch | roaming | guest" },
                deviceCount: { type: "number" },
                wanBandwidthMbps: { type: "number" },
                hasMCCCandidate: { type: "boolean", description: "Site has a Windows/Linux server-class device available to host an MCC node" },
                hasConfigMgrDP: { type: "boolean", description: "Site currently hosts a ConfigMgr distribution point" },
                boundaryGroupName: { type: "string" },
                adSiteName: { type: "string" },
                subnets: {
                  type: "array",
                  items: { type: "object", properties: { cidr: { type: "string" } }, required: ["cidr"] },
                },
              },
              required: ["name", "deviceCount", "wanBandwidthMbps"],
            },
          },
          content: {
            type: "object",
            description: "Average monthly content delivered per device (in GB). Defaults applied if omitted.",
            properties: {
              windowsUpdatesGBPerDevice: { type: "number" },
              m365AppsGBPerDevice: { type: "number" },
              intuneAppsGBPerDevice: { type: "number" },
              driversGBPerDevice: { type: "number" },
            },
          },
          environment: {
            type: "object",
            properties: {
              identityModel: { type: "string", description: "ad_only | hybrid | aadj" },
              intuneWorkloadCount: { type: "number", description: "Number of ConfigMgr workloads (0-8) switched to Intune" },
              configMgrDPCount: { type: "number" },
              coManagementEnabled: { type: "boolean" },
            },
          },
          assumptions: {
            type: "object",
            properties: {
              wanCostPerGB: { type: "number" },
              mccHitRate: { type: "number" },
              peerHitRateOverride: { type: "number" },
            },
          },
          save: { type: "boolean", description: "Persist this simulation for later retrieval" },
        },
        required: ["sites"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "analyze_current_tenant_for_do",
      description:
        "Inspect the currently-connected Intune tenant and pre-fill a DO simulation input. Reads device join types, management agents and OS mix to infer the identity model and how many ConfigMgr workloads have already moved to Intune. The result is a starting-point simulation input with one aggregated 'site' that the admin can split into real locations. Use this as the first step when the user wants a DO recommendation but hasn't described their topology.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "analyze_do_simulation",
      description:
        "Re-fetch a previously-saved DO simulation by id (returns full result with per-site recommendations, savings, readiness, migration plan, and Mermaid architecture diagram). Use after create_do_simulation if the user wants to revisit results.",
      parameters: {
        type: "object",
        properties: {
          simulationId: { type: "string" },
        },
        required: ["simulationId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_do_simulations",
      description: "List all saved DO simulations with their headline savings and readiness scores.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_do_intune_profile",
      description:
        "Generate Intune Configuration Profile JSON (Settings Catalog / OMA-URI) containing the recommended Delivery Optimization settings for a saved simulation. One profile is produced per site. The result is JSON the admin can drop into Intune (or deploy via the existing Intune deploy flow with a confirmation token).",
      parameters: {
        type: "object",
        properties: {
          simulationId: { type: "string" },
        },
        required: ["simulationId"],
      },
    },
  },
  // ─── Configuration Manager (co-management) ────────────────────
  {
    type: "function",
    function: {
      name: "get_comanagement_summary",
      description:
        "Get an overview of Configuration Manager co-management for the tenant. Returns how many devices are co-managed (managed by both ConfigMgr and Intune), the per-workload split showing how many devices route each of the 8 co-management workloads (compliance policies, device configuration, endpoint protection, resource access, client apps, Office apps, Windows Update, inventory) to Intune vs ConfigMgr, a ConfigMgr client-health breakdown, and the co-management eligibility funnel. Use this whenever the user asks about co-management status/adoption, the workload slider, or how far along the ConfigMgr-to-Intune migration is.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_comanaged_devices",
      description:
        "List devices that are co-managed by both Configuration Manager and Intune. Returns device name, OS, compliance state, user, last sync, and the per-device co-management workload assignments and ConfigMgr client health. Use when the user wants to see the actual co-managed device inventory.",
      parameters: {
        type: "object",
        properties: {
          top: { type: "number", description: "Maximum number of devices to return (default: 1000)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_comanagement_eligible_devices",
      description:
        "List devices from the co-management eligibility feed, optionally filtered by eligibility status. Status values: 'comanaged', 'eligible', 'eligibleButNotAzureAdJoined', 'needsOsUpdate', 'ineligible', 'scheduledForEnrollment'. Use to find ConfigMgr devices that could be onboarded to co-management or that are blocked by a prerequisite (e.g. needs an OS update or Entra join).",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            description:
              "Optional eligibility status filter: comanaged | eligible | eligibleButNotAzureAdJoined | needsOsUpdate | ineligible | scheduledForEnrollment",
          },
          top: { type: "number", description: "Maximum number of devices to return (default: 1000)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_configmgr_client_health",
      description:
        "List co-managed devices whose Configuration Manager client is unhealthy or blocked (client health state is anything other than healthy, or the client is blocked). Use when the user asks which ConfigMgr clients are broken, unhealthy, or need attention.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  // ─── Configuration Manager (on-prem AdminService, read-only) ──
  {
    type: "function",
    function: {
      name: "get_configmgr_connection_status",
      description:
        "Check whether the on-prem Configuration Manager AdminService connector is configured and reachable. Returns configured/connected flags, the site code, site name and version when connected, or a clear reason when not. Use this first when the user asks about ConfigMgr collections, deployments, applications, or 'is Config Manager connected'.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_configmgr_collections",
      description:
        "List Configuration Manager collections (device and user collections) from the on-prem AdminService. Returns collection name, ID, member count, type, and limiting collection. Requires the AdminService connector to be configured. Use when the user asks about ConfigMgr collections or collection membership counts.",
      parameters: {
        type: "object",
        properties: {
          filter: {
            type: "string",
            description:
              "Optional OData $filter over SMS_Collection (e.g. \"startswith(Name,'All')\" or \"CollectionType eq 2\" for device collections).",
          },
          top: { type: "number", description: "Maximum collections to return (default: 100)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_configmgr_deployments",
      description:
        "List Configuration Manager deployment summaries from the on-prem AdminService. Returns the deployed software name, target collection, intent (Required/Available), feature type (Application, Task Sequence, Software Update, etc.), and success/error/in-progress counts. Requires the AdminService connector to be configured. Use when the user asks about ConfigMgr deployments or deployment status/success rates.",
      parameters: {
        type: "object",
        properties: {
          filter: {
            type: "string",
            description:
              "Optional OData $filter over SMS_DeploymentSummary (e.g. \"NumberErrors gt 0\" for failing deployments).",
          },
          top: { type: "number", description: "Maximum deployments to return (default: 100)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_configmgr_applications",
      description:
        "List Configuration Manager applications (latest revision) from the on-prem AdminService. Returns app name, publisher, version, number of deployments, install count, and whether it is deployed. Requires the AdminService connector to be configured. Use when the user asks about ConfigMgr applications or app catalog.",
      parameters: {
        type: "object",
        properties: {
          nameContains: {
            type: "string",
            description: "Optional case-sensitive substring to filter application display names.",
          },
          top: { type: "number", description: "Maximum applications to return (default: 100)" },
        },
        required: [],
      },
    },
  },
  // ─── Configuration Manager write actions (confirmation-gated) ─
  {
    type: "function",
    function: {
      name: "trigger_configmgr_client_action",
      description:
        "DESTRUCTIVE — Trigger an action on the Configuration Manager client of a co-managed device via Graph (co-management / tenant attach). Actions: 'refreshMachinePolicy', 'refreshUserPolicy', 'wakeUpClient', 'appEvaluation', 'quickScan', 'fullScan', 'windowsDefenderUpdateSignatures'. Use for requests like 'refresh ConfigMgr machine policy on <device>' or 'run a ConfigMgr Defender quick scan'. Requires a confirmation token and the DeviceManagementManagedDevices.PrivilegedOperations.All permission.",
      parameters: {
        type: "object",
        properties: {
          deviceId: { type: "string", description: "The Intune managed device ID (GUID) of the co-managed device." },
          action: {
            type: "string",
            description:
              "One of: refreshMachinePolicy, refreshUserPolicy, wakeUpClient, appEvaluation, quickScan, fullScan, windowsDefenderUpdateSignatures",
          },
        },
        required: ["deviceId", "action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_cmpivot_query",
      description:
        "DESTRUCTIVE — Run a real-time CMPivot query against a single device through the ConfigMgr AdminService and return the results. CMPivot uses a KQL-like syntax (e.g. 'OS | project Caption, Version', 'Service | where Name == \"wuauserv\"', 'InstalledSoftware | summarize count() by Publisher'). Requires the AdminService connector to be connected and a confirmation token. Provide either a ConfigMgr resourceId or a deviceName.",
      parameters: {
        type: "object",
        properties: {
          deviceName: { type: "string", description: "Device name to run the query on (resolved to a ConfigMgr ResourceID)." },
          resourceId: { type: "number", description: "ConfigMgr ResourceID of the target device (alternative to deviceName)." },
          query: { type: "string", description: "The CMPivot query to run (KQL-like syntax)." },
        },
        required: ["query"],
      },
    },
  },
];

// Inject confirmationToken into all destructive tool definitions
for (const tool of agentTools) {
  if (DESTRUCTIVE_TOOLS.has(tool.function.name)) {
    const params = tool.function.parameters as Record<string, unknown>;
    const props = params.properties as Record<string, unknown>;
    props.confirmationToken = {
      type: "string",
      description:
        "Server-issued confirmation token. Required for destructive actions. " +
        "If you call this tool without a token, you will receive one. " +
        "Then call the tool again with this token to confirm execution.",
    };
  }
}
