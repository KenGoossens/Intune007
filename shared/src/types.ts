// ─── Chat Messages ───────────────────────────────────────────────

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCalls?: ToolCallInfo[];
  toolCallId?: string;
}

export interface ToolCallInfo {
  id: string;
  name: string;
  arguments: string;
}

// ─── SSE Events ──────────────────────────────────────────────────

export type SSEEventType = "tool_call" | "tool_result" | "token" | "done" | "error";

export interface SSEToolCallEvent {
  type: "tool_call";
  name: string;
  arguments: Record<string, unknown>;
}

export interface SSEToolResultEvent {
  type: "tool_result";
  name: string;
  data: unknown[];
  totalCount?: number;
}

export interface SSETokenEvent {
  type: "token";
  content: string;
}

export interface SSEDoneEvent {
  type: "done";
  fullResponse: string;
}

export interface SSEErrorEvent {
  type: "error";
  message: string;
}

export type SSEEvent =
  | SSEToolCallEvent
  | SSEToolResultEvent
  | SSETokenEvent
  | SSEDoneEvent
  | SSEErrorEvent;

// ─── Data Panels ─────────────────────────────────────────────────

export type DataPanelType =
  | "devices"
  | "compliance_policies"
  | "compliance_status"
  | "device_configurations"
  | "device_configuration_states"
  | "mobile_apps"
  | "app_install_status"
  | "detected_apps"
  | "device_app_install_states"
  | "conditional_access"
  | "autopilot_devices"
  | "autopilot_profiles"
  | "device_details"
  | "remediation_scripts"
  | "policy_analysis";

export interface DataPanel {
  id: string;
  type: DataPanelType;
  title: string;
  data: unknown[];
  totalCount?: number;
  timestamp: Date;
}

// Tool name → DataPanel type mapping
export const TOOL_TO_PANEL_TYPE: Record<string, DataPanelType> = {
  get_managed_devices: "devices",
  get_device_details: "device_details",
  get_compliance_policies: "compliance_policies",
  get_compliance_status: "compliance_status",
  get_device_configurations: "device_configurations",
  get_device_configuration_states: "device_configuration_states",
  get_mobile_apps: "mobile_apps",
  get_app_install_status: "app_install_status",
  get_device_detected_apps: "detected_apps",
  get_device_app_install_states: "device_app_install_states",
  get_conditional_access_policies: "conditional_access",
  get_autopilot_devices: "autopilot_devices",
  get_autopilot_profiles: "autopilot_profiles",
  generate_remediation_script: "remediation_scripts",
  list_remediation_scripts: "remediation_scripts",
  analyze_policies: "policy_analysis",
};

export const TOOL_TO_PANEL_TITLE: Record<string, string> = {
  get_managed_devices: "Managed Devices",
  get_device_details: "Device Details",
  get_compliance_policies: "Compliance Policies",
  get_compliance_status: "Compliance Status Summary",
  get_device_configurations: "Device Configurations",
  get_device_configuration_states: "Device Configuration States",
  get_mobile_apps: "Mobile Apps",
  get_app_install_status: "App Install Status",
  get_device_detected_apps: "Detected Apps",
  get_device_app_install_states: "Managed App Install States",
  get_conditional_access_policies: "Conditional Access Policies",
  get_autopilot_devices: "Autopilot Devices",
  get_autopilot_profiles: "Autopilot Deployment Profiles",
  generate_remediation_script: "Generated Remediation Script",
  list_remediation_scripts: "Remediation Scripts",
  analyze_policies: "Policy Analysis",
};

// ─── Intune Entity Types (lean versions for display) ─────────────

export interface ManagedDeviceInfo {
  id: string;
  deviceName: string;
  operatingSystem: string;
  osVersion: string;
  complianceState: string;
  managementAgent: string;
  ownership: string;
  enrolledDateTime: string;
  lastSyncDateTime: string;
  userPrincipalName: string;
  model: string;
  manufacturer: string;
  serialNumber: string;
}

export interface CompliancePolicyInfo {
  id: string;
  displayName: string;
  description: string;
  platformType: string;
  createdDateTime: string;
  lastModifiedDateTime: string;
}

export interface ComplianceStatusInfo {
  compliantDeviceCount: number;
  nonCompliantDeviceCount: number;
  errorDeviceCount: number;
  conflictDeviceCount: number;
  unknownDeviceCount: number;
  notApplicableDeviceCount: number;
}

export interface DeviceConfigurationInfo {
  id: string;
  displayName: string;
  description: string;
  createdDateTime: string;
  lastModifiedDateTime: string;
  version: number;
}

export interface MobileAppInfo {
  id: string;
  displayName: string;
  description: string;
  publisher: string;
  createdDateTime: string;
  lastModifiedDateTime: string;
}

export interface ConditionalAccessPolicyInfo {
  id: string;
  displayName: string;
  state: string;
  createdDateTime: string;
  modifiedDateTime: string;
}

export interface AutopilotDeviceInfo {
  id: string;
  serialNumber: string;
  model: string;
  manufacturer: string;
  groupTag: string;
  purchaseOrderIdentifier: string;
  enrollmentState: string;
  lastContactedDateTime: string;
}

export interface AutopilotProfileInfo {
  id: string;
  displayName: string;
  description: string;
  language: string;
  createdDateTime: string;
  lastModifiedDateTime: string;
}

// ─── API Request/Response ────────────────────────────────────────

export interface ChatRequest {
  message: string;
  history: ChatMessage[];
}

// ─── Alerting Service ────────────────────────────────────────────

export type AlertSeverity = "critical" | "warning" | "info";

export type AlertCheckType =
  | "non_compliant_devices"
  | "policy_conflicts"
  | "stale_devices"
  | "failed_app_installs"
  | "ca_policy_issues"
  | "new_enrollments";

export interface Alert {
  id: string;
  checkType: AlertCheckType;
  severity: AlertSeverity;
  title: string;
  message: string;
  details: unknown[];
  count: number;
  timestamp: Date;
  acknowledged: boolean;
}

export interface AlertCheckConfig {
  type: AlertCheckType;
  enabled: boolean;
  intervalMinutes: number;
  label: string;
  description: string;
}

export const DEFAULT_ALERT_CONFIGS: AlertCheckConfig[] = [
  {
    type: "non_compliant_devices",
    enabled: true,
    intervalMinutes: 15,
    label: "Non-Compliant Devices",
    description: "Alert when devices fall out of compliance",
  },
  {
    type: "policy_conflicts",
    enabled: true,
    intervalMinutes: 30,
    label: "Policy Conflicts",
    description: "Detect devices with conflicting configuration profiles",
  },
  {
    type: "stale_devices",
    enabled: true,
    intervalMinutes: 60,
    label: "Stale Devices",
    description: "Devices that haven't synced in over 7 days",
  },
  {
    type: "failed_app_installs",
    enabled: true,
    intervalMinutes: 30,
    label: "Failed App Installs",
    description: "Apps that failed to install on devices",
  },
  {
    type: "ca_policy_issues",
    enabled: true,
    intervalMinutes: 60,
    label: "CA Policy Issues",
    description: "Conditional Access policies in report-only or disabled state",
  },
  {
    type: "new_enrollments",
    enabled: true,
    intervalMinutes: 15,
    label: "New Enrollments",
    description: "Alert on newly enrolled devices (last 24 hours)",
  },
];

export interface AlertsResponse {
  alerts: Alert[];
  configs: AlertCheckConfig[];
  lastRunTimes: Record<string, string>;
}

// ─── Analytics ───────────────────────────────────────────────────

export interface AnalyticsToolCall {
  name: string;
  durationMs: number;
  resultCount: number;
  error?: string;
}

export interface AnalyticsEntry {
  id: string;
  timestamp: string;
  userMessage: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
  totalDurationMs: number;
  iterations: number;
  toolCalls: AnalyticsToolCall[];
  model: string;
  error?: string;
}

export interface AnalyticsSummary {
  totalRequests: number;
  totalTokens: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalCost: number;
  avgResponseMs: number;
  avgTokensPerRequest: number;
  totalToolCalls: number;
  entries: AnalyticsEntry[];
}

// ─── Policy Analyzer ─────────────────────────────────────────────

export type PolicyFindingSeverity = "critical" | "warning" | "info" | "good";

export type PolicyFindingCategory =
  | "compliance"
  | "configuration"
  | "conditional_access"
  | "device_health"
  | "app_management"
  | "security";

export interface PolicyFinding {
  id: string;
  severity: PolicyFindingSeverity;
  category: PolicyFindingCategory;
  title: string;
  description: string;
  recommendation: string;
  affectedItems: string[];
  details: Record<string, unknown>;
}

export interface PolicyAnalysisResult {
  timestamp: string;
  durationMs: number;
  score: number; // 0–100 overall health score
  findings: PolicyFinding[];
  summary: {
    critical: number;
    warning: number;
    info: number;
    good: number;
  };
  stats: {
    totalDevices: number;
    compliantDevices: number;
    nonCompliantDevices: number;
    compliancePolicies: number;
    configurationProfiles: number;
    conditionalAccessPolicies: number;
    managedApps: number;
    staleDevices: number;
  };
}
