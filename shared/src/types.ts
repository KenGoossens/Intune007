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
  | "policy_analysis"
  | "device_action"
  | "groups"
  | "group_members"
  | "security_alerts"
  | "bitlocker_keys"
  | "device_threat_summary"
  | "audit_logs"
  | "sign_in_logs"
  | "directory_audit_logs"
  | "update_rings"
  | "update_compliance"
  | "compliance_trend"
  | "agent_notes"
  | "scheduled_tasks"
  | "tenants";

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
  deploy_remediation_script: "remediation_scripts",
  list_remediation_scripts: "remediation_scripts",
  analyze_policies: "policy_analysis",
  sync_device: "device_action",
  restart_device: "device_action",
  lock_device: "device_action",
  reset_passcode: "device_action",
  retire_device: "device_action",
  wipe_device: "device_action",
  get_groups: "groups",
  get_group_members: "group_members",
  create_group: "groups",
  add_group_member: "groups",
  get_security_alerts: "security_alerts",
  get_bitlocker_keys: "bitlocker_keys",
  get_device_threat_summary: "device_threat_summary",
  get_audit_logs: "audit_logs",
  get_sign_in_logs: "sign_in_logs",
  get_directory_audit_logs: "directory_audit_logs",
  create_compliance_policy: "compliance_policies",
  assign_policy: "compliance_policies",
  update_conditional_access_policy: "conditional_access",
  get_update_rings: "update_rings",
  get_update_compliance: "update_compliance",
  get_compliance_trend: "compliance_trend",
  save_note: "agent_notes",
  recall_notes: "agent_notes",
  create_scheduled_task: "scheduled_tasks",
  list_scheduled_tasks: "scheduled_tasks",
  manage_scheduled_task: "scheduled_tasks",
  list_tenants: "tenants",
  switch_tenant: "tenants",
  generate_report: "devices",
  get_device_risk_scores: "devices",
  get_device_card: "device_details",
  get_security_posture: "security_alerts",
  get_app_health: "mobile_apps",
  check_autopilot_readiness: "autopilot_devices",
  onboard_autopilot_device: "autopilot_devices",
  get_autopilot_collection_script: "autopilot_devices",
  deploy_hash_collector: "autopilot_devices",
  process_collected_hashes: "autopilot_devices",
  ingest_autopilot_csv: "autopilot_devices",
  get_device_timeline: "device_details",
  run_compliance_forecast: "compliance_policies",
  manage_config_baseline: "device_configurations",
  run_troubleshooter: "device_details",
  get_learning_stats: "agent_notes",
  record_learning: "agent_notes",
  fix_app_icon: "mobile_apps",
  scan_app_icons: "mobile_apps",
  fix_all_missing_icons: "mobile_apps",
  remove_app: "mobile_apps",
  rename_app: "mobile_apps",
  bulk_rename_apps: "mobile_apps",
  get_cve_status: "security_alerts",
  get_cve_list: "security_alerts",
  scan_cves: "security_alerts",
  update_cve_status: "security_alerts",
};

export const TOOL_TO_PANEL_TITLE: Record<string, string> = {
  get_managed_devices: "Managed Devices",
  get_device_details: "Device Details",
  get_compliance_policies: "Compliance Policies",
  get_compliance_status: "Compliance Status Summary",
  get_device_configurations: "Device Configurations",
  get_device_configuration_states: "Configuration Assignment Status",
  get_mobile_apps: "Mobile Apps",
  get_app_install_status: "App Install Status",
  get_device_detected_apps: "Detected Apps",
  get_device_app_install_states: "Managed App Install States",
  get_conditional_access_policies: "Conditional Access Policies",
  get_autopilot_devices: "Autopilot Devices",
  get_autopilot_profiles: "Autopilot Deployment Profiles",
  generate_remediation_script: "Generated Remediation Script",
  deploy_remediation_script: "Deployed Remediation Script",
  list_remediation_scripts: "Proactive Remediations",
  analyze_policies: "Policy Analysis",
  sync_device: "Device Sync",
  restart_device: "Device Restart",
  lock_device: "Device Lock",
  reset_passcode: "Passcode Reset",
  retire_device: "Device Retire",
  wipe_device: "Device Wipe",
  get_groups: "Azure AD Groups",
  get_group_members: "Group Members",
  create_group: "Created Group",
  add_group_member: "Group Membership Update",
  get_security_alerts: "Security Alerts",
  get_bitlocker_keys: "BitLocker Recovery Keys",
  get_device_threat_summary: "Device Threat Summary",
  get_audit_logs: "Intune Audit Logs",
  get_sign_in_logs: "Sign-In Logs",
  get_directory_audit_logs: "Directory Audit Logs",
  create_compliance_policy: "Created Compliance Policy",
  assign_policy: "Policy Assignment",
  update_conditional_access_policy: "Conditional Access Policy Update",
  get_update_rings: "Windows Update Rings",
  get_update_compliance: "Update Compliance Summary",
  get_compliance_trend: "Compliance Trend",
  save_note: "Saved Note",
  recall_notes: "Recalled Notes",
  create_scheduled_task: "Scheduled Task Created",
  list_scheduled_tasks: "Scheduled Tasks",
  manage_scheduled_task: "Task Management",
  list_tenants: "Configured Tenants",
  switch_tenant: "Tenant Switch",
  generate_report: "Generated Report",
  get_device_risk_scores: "Device Risk Scores",
  get_device_card: "Device Card",
  get_security_posture: "Security Posture",
  get_app_health: "Application Health",
  check_autopilot_readiness: "Autopilot Readiness Check",
  onboard_autopilot_device: "Autopilot Onboarding",
  get_autopilot_collection_script: "Hardware Hash Collection Script",
  deploy_hash_collector: "Hash Collector Deployment",
  process_collected_hashes: "Collected Hardware Hashes",
  ingest_autopilot_csv: "Autopilot CSV Import",
  get_device_timeline: "Device Timeline",
  run_compliance_forecast: "Compliance Forecast",
  manage_config_baseline: "Configuration Baseline",
  run_troubleshooter: "Device Troubleshooter",
  get_learning_stats: "Agent Learning Stats",
  record_learning: "Lesson Recorded",
  fix_app_icon: "App Icon Update",
  scan_app_icons: "App Icon Scan",
  fix_all_missing_icons: "Missing Icons Fix",
  remove_app: "App Removal",
  rename_app: "App Renamed",
  bulk_rename_apps: "Bulk App Rename",
  get_cve_status: "CVE Monitor Status",
  get_cve_list: "CVE Vulnerabilities",
  scan_cves: "CVE Scan Results",
  update_cve_status: "CVE Status Update",
};

/**
 * Fallback: converts a tool name like "check_autopilot_readiness"
 * into a clean title like "Autopilot Readiness Check".
 * Used when a tool isn't in the TOOL_TO_PANEL_TITLE map.
 */
export function formatToolTitle(toolName: string): string {
  if (TOOL_TO_PANEL_TITLE[toolName]) return TOOL_TO_PANEL_TITLE[toolName];

  // Remove common prefixes
  let cleaned = toolName
    .replace(/^(get|list|check|run|create|manage|deploy|process|ingest|generate)_/, "");

  // Convert underscores to spaces and title-case each word
  return cleaned
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ─── Panel → Tool mapping (used to disable tools when panels are toggled off) ──
export const PANEL_TO_TOOLS: Record<string, string[]> = {
  alerts: ["get_security_alerts"],
  data: [
    "get_managed_devices", "get_device_details", "get_compliance_policies",
    "get_compliance_status", "get_device_configurations", "get_device_configuration_states",
    "get_mobile_apps", "get_app_install_status", "get_device_detected_apps",
    "get_device_app_install_states", "get_conditional_access_policies",
    "get_autopilot_devices", "get_autopilot_profiles", "get_groups", "get_group_members",
    "create_group", "add_group_member", "get_bitlocker_keys", "get_device_threat_summary",
    "get_audit_logs", "get_sign_in_logs", "get_directory_audit_logs",
    "get_update_rings", "get_update_compliance", "get_compliance_trend",
    "list_tenants", "switch_tenant",
  ],
  deviceCard: ["get_device_card"],
  queryBuilder: [],
  reportGenerator: ["generate_report"],
  policies: ["analyze_policies", "assign_policy", "update_conditional_access_policy"],
  policyBuilder: ["create_compliance_policy"],
  policyDiff: [],
  remediation: [
    "generate_remediation_script", "deploy_remediation_script", "list_remediation_scripts",
    "sync_device", "restart_device", "lock_device", "reset_passcode", "retire_device", "wipe_device",
  ],
  troubleshooter: ["run_troubleshooter"],
  logs: [],
  insights: ["save_note", "recall_notes", "record_learning", "get_learning_stats"],
  riskScores: ["get_device_risk_scores"],
  forecast: ["run_compliance_forecast"],
  securityPosture: ["get_security_posture"],
  cveMonitor: ["get_cve_status", "get_cve_list", "scan_cves", "update_cve_status"],
  appHealth: [
    "get_app_health", "scan_app_icons", "fix_app_icon", "fix_all_missing_icons",
    "remove_app", "rename_app", "bulk_rename_apps",
  ],
  autopilotReadiness: [
    "check_autopilot_readiness", "onboard_autopilot_device",
    "get_autopilot_collection_script", "deploy_hash_collector",
    "process_collected_hashes", "ingest_autopilot_csv",
  ],
  baselines: ["manage_config_baseline"],
  timeline: ["get_device_timeline"],
  tasks: ["create_scheduled_task", "list_scheduled_tasks", "manage_scheduled_task"],
  analytics: [],
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
  // Beta fields
  isEncrypted?: boolean;
  joinType?: string;
  skuFamily?: string;
  totalStorageSpaceInBytes?: number;
  freeStorageSpaceInBytes?: number;
  autopilotEnrolled?: boolean;
  azureADDeviceId?: string;
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

// ─── Device Actions ──────────────────────────────────────────────

export interface DeviceActionResult {
  success: boolean;
  action: string;
  deviceId: string;
  message: string;
  timestamp: string;
}

// ─── Groups ──────────────────────────────────────────────────────

export interface GroupInfo {
  id: string;
  displayName: string;
  description: string;
  groupTypes: string[];
  membershipRule: string | null;
  membershipRuleProcessingState: string | null;
  securityEnabled: boolean;
  mailEnabled: boolean;
  mail: string | null;
  createdDateTime: string;
}

export interface GroupMember {
  id: string;
  displayName: string;
  userPrincipalName?: string;
  deviceId?: string;
  operatingSystem?: string;
  odataType: string;
}

// ─── Security ────────────────────────────────────────────────────

export interface SecurityAlertInfo {
  id: string;
  title: string;
  severity: string;
  status: string;
  category: string;
  description: string;
  createdDateTime: string;
  lastUpdateDateTime: string;
}

export interface BitLockerKeyInfo {
  id: string;
  createdDateTime: string;
  deviceId: string;
  volumeType: string;
  key?: string;
}

// ─── Logs ────────────────────────────────────────────────────────

export interface AuditEventInfo {
  id: string;
  displayName: string;
  componentName: string;
  activity: string;
  activityDateTime: string;
  activityType: string;
  actor: Record<string, unknown>;
  resources: Record<string, unknown>[];
}

export interface SignInLogInfo {
  id: string;
  userDisplayName: string;
  userPrincipalName: string;
  appDisplayName: string;
  ipAddress: string;
  clientAppUsed: string;
  status: Record<string, unknown>;
  createdDateTime: string;
  location: Record<string, unknown>;
  deviceDetail: Record<string, unknown>;
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
  | "new_enrollments"
  | "high_risk_devices"
  | "update_compliance";

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
  {
    type: "high_risk_devices",
    enabled: true,
    intervalMinutes: 30,
    label: "High Risk Devices",
    description: "Devices with high/critical security alerts from Defender",
  },
  {
    type: "update_compliance",
    enabled: true,
    intervalMinutes: 60,
    label: "Update Compliance",
    description: "Devices not compliant with Windows Update policies",
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
