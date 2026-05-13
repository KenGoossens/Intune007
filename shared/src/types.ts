// ─── Tenants ─────────────────────────────────────────────────────

export interface TenantInfo {
  tenantId: string;
  displayName: string;
  addedAt: string;
  lastUsedAt: string | null;
  isActive: boolean;
}

// ─── Delivery Optimization Simulator ─────────────────────────────

export type DOSiteType = "headquarters" | "branch" | "small_branch" | "roaming" | "guest";
export type DOIdentityModel = "ad_only" | "hybrid" | "aadj";
export type DODownloadMode = 0 | 1 | 2 | 3 | 99 | 100;

/** A single subnet that belongs to a site. */
export interface DOSubnet {
  cidr: string;
  description?: string;
}

/** One physical or logical location in the customer environment. */
export interface DOSite {
  id: string;
  name: string;
  type: DOSiteType;
  deviceCount: number;
  /** WAN bandwidth in Mbps (link to internet) */
  wanBandwidthMbps: number;
  /** Whether this site has a server-class device available to host MCC */
  hasMCCCandidate: boolean;
  /** Currently a ConfigMgr DP location */
  hasConfigMgrDP: boolean;
  /** Mapped ConfigMgr boundary group name (optional) */
  boundaryGroupName?: string;
  /** AD site name (optional) */
  adSiteName?: string;
  /** Subnets at this site */
  subnets: DOSubnet[];
}

/** Content that needs to be distributed each month. */
export interface DOContentProfile {
  /** Average GB of Windows updates per device per month */
  windowsUpdatesGBPerDevice: number;
  /** Average GB of M365 app updates per device per month */
  m365AppsGBPerDevice: number;
  /** Average GB of Win32 / Intune apps per device per month */
  intuneAppsGBPerDevice: number;
  /** Average GB of drivers/firmware per device per month */
  driversGBPerDevice: number;
}

/** Identity & management state of the environment. */
export interface DOEnvironmentProfile {
  identityModel: DOIdentityModel;
  /** 0-8 — how many ConfigMgr workloads are switched to Intune */
  intuneWorkloadCount: number;
  /** Total number of ConfigMgr DPs the customer wants to retire */
  configMgrDPCount: number;
  /** Whether co-management is enabled */
  coManagementEnabled: boolean;
}

/** Optional overrides to the heuristic model. */
export interface DOAssumptions {
  /** Estimated WAN cost in USD per GB (e.g. 0.05 for $0.05/GB) */
  wanCostPerGB: number;
  /** MCC cache hit rate (0-1) — Microsoft baseline ~0.85 */
  mccHitRate: number;
  /** Override the auto-computed peer hit rate (0-1) — undefined means auto */
  peerHitRateOverride?: number;
}

export interface DOSimulationInput {
  name: string;
  sites: DOSite[];
  content: DOContentProfile;
  environment: DOEnvironmentProfile;
  assumptions: DOAssumptions;
}

/** Per-site recommendation produced by the engine. */
export interface DOSiteRecommendation {
  siteId: string;
  siteName: string;
  /** Recommended DODownloadMode (0/1/2/3/99/100) */
  downloadMode: DODownloadMode;
  downloadModeName: string;
  /** Whether to deploy a Microsoft Connected Cache server here */
  deployMCC: boolean;
  /** Suggested MCC cache size in GB */
  mccCacheSizeGB?: number;
  /** Suggested DO Group ID (deterministic per subnet/site) */
  doGroupId: string;
  /** What DOGroupIdSource to use (subnet/AD site/etc.) */
  doGroupIdSource: number;
  /** Estimated peer hit rate at this site */
  peerHitRate: number;
  /** Estimated MCC hit rate at this site (0 if no MCC) */
  mccHitRate: number;
  /** Total content GB needed by this site per month (baseline) */
  monthlyContentGB: number;
  /** Estimated external WAN GB after DO + MCC */
  effectiveExternalGB: number;
  /** GB saved per month vs no DO and no MCC */
  monthlySavingsGB: number;
  /** Why these settings were chosen */
  reasoning: string[];
}

export interface DOReadinessScore {
  total: number;
  identityScore: number;
  workloadScore: number;
  configMgrScore: number;
  networkScore: number;
  blockers: string[];
}

export interface DOSavingsSummary {
  /** Baseline = no DO, no MCC, all from CDN over WAN */
  baselineMonthlyGB: number;
  /** With DO peer-to-peer only */
  doOnlyMonthlyGB: number;
  /** With DO + Microsoft Connected Cache */
  doPlusMCCMonthlyGB: number;
  /** Estimated monthly cost savings in USD */
  monthlyCostSavingsUSD: number;
  /** Estimated annual cost savings in USD */
  annualCostSavingsUSD: number;
}

export interface DOMigrationPhase {
  order: number;
  title: string;
  description: string;
  estimatedDurationWeeks: number;
  prerequisites: string[];
  actions: string[];
}

export interface DOSimulationResult {
  simulationId: string;
  name: string;
  generatedAt: string;
  input: DOSimulationInput;
  perSite: DOSiteRecommendation[];
  savings: DOSavingsSummary;
  readiness: DOReadinessScore;
  migrationPlan: DOMigrationPhase[];
  /** Mermaid graph definition representing the proposed architecture */
  architectureMermaid: string;
  /** Number of MCC servers recommended in total */
  totalMCCServers: number;
  /** Ready-to-deploy Intune Configuration Profiles, one per site */
  intuneProfiles: DOIntuneProfile[];
}

/** Intune Configuration Profile (Settings Catalog) JSON ready for deployment. */
export interface DOIntuneProfile {
  displayName: string;
  description: string;
  /** OMA-URI / Settings Catalog payload */
  settings: Array<{
    omaUri: string;
    name: string;
    description: string;
    dataType: "int" | "string" | "bool";
    value: number | string | boolean;
  }>;
}

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

export type SSEEventType = "tool_call" | "tool_result" | "token" | "done" | "error" | "script_approval";

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

/** Sent when a script requires user approval before deployment */
export interface SSEScriptApprovalEvent {
  type: "script_approval";
  approvalId: string;
  displayName: string;
  description: string;
  detectionScript: string;
  remediationScript: string;
  runAsAccount: "system" | "user";
  validation: {
    syntaxErrors: string[];
    pesterResults: { name: string; passed: boolean; message?: string }[];
    summary: string;
  };
}

export type SSEEvent =
  | SSEToolCallEvent
  | SSEToolResultEvent
  | SSETokenEvent
  | SSEDoneEvent
  | SSEErrorEvent
  | SSEScriptApprovalEvent;

// ─── Data Panels ─────────────────────────────────────────────────

export type DataPanelType =
  | "devices"
  | "compliance_policies"
  | "compliance_status"
  | "device_configurations"
  | "device_configuration_states"
  | "device_policy_states"
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
  | "tenants"
  | "do_simulation";

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
  get_policies_assigned_to_group: "compliance_policies",
  get_policies_assigned_to_device: "device_policy_states",
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
  get_app_health: "mobile_apps",  check_autopilot_readiness: "autopilot_devices",
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
  // ─── Delivery Optimization Simulator ───────────────
  create_do_simulation: "do_simulation",
  analyze_do_simulation: "do_simulation",
  analyze_current_tenant_for_do: "do_simulation",
  generate_do_intune_profile: "do_simulation",
  list_do_simulations: "do_simulation",
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
  get_policies_assigned_to_group: "Policies Assigned to Group",
  get_policies_assigned_to_device: "Device Policy Assignments",
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
  create_do_simulation: "DO Simulation",
  analyze_do_simulation: "DO Simulation Analysis",
  analyze_current_tenant_for_do: "DO Tenant Analysis",
  generate_do_intune_profile: "Intune DO Profile",
  list_do_simulations: "Saved DO Simulations",
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
  policies: ["analyze_policies", "assign_policy", "update_conditional_access_policy", "get_policies_assigned_to_group", "get_policies_assigned_to_device"],
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
  doSimulator: [
    "create_do_simulation", "analyze_do_simulation",
    "analyze_current_tenant_for_do", "generate_do_intune_profile",
    "list_do_simulations",
  ],
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
