import type { ChatCompletionTool } from "openai/resources/chat/completions.js";

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
        "Get all apps detected/found on a specific managed device. Shows what software is actually installed on the device (detected by Intune agent). Requires the device ID — use get_managed_devices first to find it by name.",
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
        "Get the install states of Intune-managed (assigned) apps for a specific device. Shows which managed apps are installed, pending, or failed on the device. This answers 'how many apps are assigned to this device'. Requires the device ID — use get_managed_devices first to find it by name.",
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
];
