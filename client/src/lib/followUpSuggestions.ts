/**
 * Tool-aware follow-up suggestion engine.
 *
 * After the agent answers, we surface a few "next logical step" prompts based
 * on which tools were actually used in the last turn. This keeps suggestions
 * grounded in the agent's real capabilities (the 73 tools) and creates a
 * natural trail through the app — purely client-side, so it adds zero LLM
 * cost or latency.
 */

/**
 * Map of tool name → follow-up prompts that make sense after that tool runs.
 * Suggestions are intentionally read-only / non-destructive so a single click
 * is always safe. "this device" / "this group" resolve from conversation
 * context, which is sent to the agent on every request.
 */
const TOOL_FOLLOW_UPS: Record<string, string[]> = {
  // ─── Devices ────────────────────────────────────────────────────
  get_managed_devices: [
    "Show me only the non-compliant devices",
    "What's the security posture of my fleet?",
    "Show device risk scores",
    "Which devices haven't synced in the last week?",
  ],
  get_device_details: [
    "Show the timeline for this device",
    "What policies are applied to this device?",
    "Troubleshoot this device",
    "What apps are installed on this device?",
  ],
  get_device_card: [
    "Show the timeline for this device",
    "Troubleshoot this device",
    "What policies are applied to this device?",
    "What apps are installed on this device?",
  ],
  get_device_timeline: [
    "Troubleshoot this device",
    "Show the full device card",
    "What policies are applied to this device?",
  ],
  get_device_risk_scores: [
    "Show the overall security posture",
    "Troubleshoot the highest-risk device",
    "What is making these devices risky?",
  ],

  // ─── Compliance ─────────────────────────────────────────────────
  get_compliance_status: [
    "Show me the non-compliant devices",
    "What is causing the compliance failures?",
    "Show the compliance trend over time",
    "Forecast compliance if I require encryption",
  ],
  get_compliance_policies: [
    "Which devices are non-compliant?",
    "Analyze my policy health",
    "Show the compliance trend over time",
  ],
  get_compliance_trend: [
    "Show me the currently non-compliant devices",
    "Forecast compliance if I require encryption",
  ],
  run_compliance_forecast: [
    "Build a compliance policy for this requirement",
    "Show current compliance status",
  ],

  // ─── Configuration & policies ───────────────────────────────────
  get_device_configurations: [
    "Analyze my policy health",
    "Are there any policy conflicts?",
  ],
  get_device_configuration_states: [
    "Troubleshoot this device",
    "Analyze my policy health",
  ],
  analyze_policies: [
    "Show me the policy conflicts",
    "How do I remediate these issues?",
    "Build a Windows compliance policy with CIS L1 benchmark",
    "Compare two of these policies",
  ],
  get_policies_assigned_to_group: [
    "Analyze my policy health",
    "Show the members of this group",
  ],
  get_policies_assigned_to_device: [
    "Troubleshoot this device",
    "Analyze my policy health",
  ],

  // ─── Apps ───────────────────────────────────────────────────────
  get_mobile_apps: [
    "Show overall app deployment health",
    "Which apps have missing icons?",
    "Which apps failed to install?",
  ],
  get_app_health: [
    "Which apps have missing icons?",
    "Scan for missing app icons",
    "Which apps failed to install?",
  ],
  get_app_install_status: [
    "Show overall app deployment health",
    "Which devices failed this app install?",
  ],
  get_device_detected_apps: [
    "Show overall app deployment health",
    "What's the install status of this app?",
  ],
  get_device_app_install_states: [
    "Show overall app deployment health",
    "Troubleshoot this device",
  ],
  scan_app_icons: [
    "Fix all missing app icons",
    "Show overall app deployment health",
  ],

  // ─── Security ───────────────────────────────────────────────────
  get_security_posture: [
    "Show me the high-risk devices",
    "Show device risk scores",
    "Are there any security alerts?",
    "Which devices aren't encrypted?",
  ],
  get_security_alerts: [
    "Show me the affected devices",
    "What's the overall security posture?",
    "Are there CVEs linked to these alerts?",
  ],
  get_bitlocker_keys: [
    "Which devices aren't encrypted?",
    "Show the security posture",
  ],
  get_device_threat_summary: [
    "Show me the high-risk devices",
    "Are there any new CVEs affecting my devices?",
  ],

  // ─── CVEs ───────────────────────────────────────────────────────
  get_cve_status: [
    "Show me the critical vulnerabilities",
    "Which CVEs are actively exploited?",
    "Scan for new CVEs now",
  ],
  get_cve_list: [
    "Show me only the critical vulnerabilities",
    "Which of these are actively exploited?",
    "Generate a remediation script for the top CVE",
  ],
  scan_cves: [
    "Show me the critical vulnerabilities",
    "Which CVEs are actively exploited?",
  ],

  // ─── Autopilot ──────────────────────────────────────────────────
  get_autopilot_devices: [
    "Check Autopilot readiness",
    "Show me the Autopilot profiles",
    "How do I register a new device?",
  ],
  get_autopilot_profiles: [
    "List all Autopilot registered devices",
    "Check Autopilot readiness",
  ],
  check_autopilot_readiness: [
    "List Autopilot registered devices",
    "How do I collect a hardware hash?",
  ],

  // ─── Remediation ────────────────────────────────────────────────
  generate_remediation_script: [
    "List existing remediation scripts",
    "Analyze my policy health",
  ],
  list_remediation_scripts: [
    "Generate a remediation script for disk cleanup",
    "Analyze my policy health",
  ],
  run_troubleshooter: [
    "Show this device's timeline",
    "Generate a remediation script for this issue",
    "What policies are applied to this device?",
  ],

  // ─── Updates ────────────────────────────────────────────────────
  get_update_compliance: [
    "Which devices are behind on updates?",
    "Show the compliance trend",
    "Show me the update rings",
  ],
  get_update_rings: [
    "Which devices are behind on updates?",
    "Show update compliance",
  ],

  // ─── Groups ─────────────────────────────────────────────────────
  get_groups: [
    "What policies are assigned to this group?",
    "Show the members of this group",
  ],
  get_group_members: [
    "What policies are assigned to this group?",
    "Show device risk scores",
  ],

  // ─── Conditional Access ─────────────────────────────────────────
  get_conditional_access_policies: [
    "Which CA policies aren't enforcing?",
    "How do I set up Conditional Access for MFA?",
  ],

  // ─── Logs ───────────────────────────────────────────────────────
  get_audit_logs: [
    "Show recent risky sign-ins",
    "Show me recent device actions",
  ],
  get_sign_in_logs: [
    "Show risky sign-ins only",
    "Show the directory audit logs",
  ],
  get_directory_audit_logs: [
    "Show recent sign-in activity",
    "Show me recent device actions",
  ],

  // ─── Reports & insights ─────────────────────────────────────────
  generate_report: [
    "Show the security posture",
    "Show device risk scores",
    "Are there any new CVEs affecting my devices?",
  ],

  // ─── Delivery Optimization ──────────────────────────────────────
  analyze_current_tenant_for_do: [
    "Generate a Delivery Optimization profile",
    "List my Delivery Optimization simulations",
  ],
  create_do_simulation: [
    "Analyze the results of this simulation",
    "Generate a Delivery Optimization profile",
  ],
  analyze_do_simulation: [
    "Generate a Delivery Optimization profile",
    "Analyze my current tenant for Delivery Optimization",
  ],
  list_do_simulations: [
    "Analyze my current tenant for Delivery Optimization",
  ],
};

/**
 * General suggestions used when no tools ran (e.g. a knowledge question) or to
 * top up when a tool has few specific follow-ups.
 */
const DEFAULT_FOLLOW_UPS: string[] = [
  "How many managed devices do I have?",
  "What's the security posture of my fleet?",
  "Are there any new CVEs affecting my devices?",
  "Analyze my policy health",
];

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/[?.!]+$/, "");
}

export interface FollowUpOptions {
  /** A prompt to exclude from suggestions (e.g. the user's last message). */
  exclude?: string;
  /** Maximum number of suggestions to return. Defaults to 4. */
  max?: number;
}

/**
 * Compute follow-up prompts based on the tools used in the most recent turn.
 *
 * @param toolNames Tool names called during the last agent turn (in order).
 * @returns A deduplicated, capped list of natural-language follow-up prompts.
 */
export function getFollowUpSuggestions(
  toolNames: string[],
  options: FollowUpOptions = {}
): string[] {
  const max = options.max ?? 4;
  const excluded = options.exclude ? normalize(options.exclude) : null;

  const result: string[] = [];
  const seen = new Set<string>();
  if (excluded) seen.add(excluded);

  const push = (prompt: string) => {
    const key = normalize(prompt);
    if (seen.has(key)) return;
    seen.add(key);
    result.push(prompt);
  };

  // Collect follow-ups from each tool that ran, preserving order.
  for (const name of toolNames) {
    const followUps = TOOL_FOLLOW_UPS[name];
    if (!followUps) continue;
    for (const prompt of followUps) {
      if (result.length >= max) break;
      push(prompt);
    }
    if (result.length >= max) break;
  }

  // Top up with general suggestions if we came up short (e.g. no tools ran,
  // or the tools that ran had no specific follow-ups).
  if (result.length < Math.min(max, 3)) {
    for (const prompt of DEFAULT_FOLLOW_UPS) {
      if (result.length >= max) break;
      push(prompt);
    }
  }

  return result.slice(0, max);
}
