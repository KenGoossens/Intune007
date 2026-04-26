/**
 * Interactive link components for cross-panel navigation.
 * Every data item that can be drilled into gets its own link component.
 */

import { Monitor, Shield, AppWindow, Users, KeyRound, Wrench, Search } from "lucide-react";
import { useNavigationStore } from "../stores/navigationStore.ts";

/** Clickable device name → opens Device Card */
export function DeviceDrillLink({ name, className }: { name: string; className?: string }) {
  const navigateTo = useNavigationStore((s) => s.navigateTo);
  return (
    <button
      onClick={() => navigateTo("deviceCard", { deviceName: name })}
      className={`inline-flex items-center gap-1 text-brand-400 hover:text-brand-300 hover:underline transition-colors ${className || ""}`}
      title={`View device card for ${name}`}
    >
      <Monitor size={11} className="shrink-0" />
      {name}
    </button>
  );
}

/** Clickable policy name → asks agent to find this policy */
export function PolicyDrillLink({ name, className }: { name: string; className?: string }) {
  const navigateTo = useNavigationStore((s) => s.navigateTo);
  // Extract a short searchable fragment — take the most meaningful part
  const searchTerm = extractSearchTerm(name);
  return (
    <button
      onClick={() => navigateTo("data", { query: `Show me the configuration profile that contains "${searchTerm}" in its name` })}
      className={`inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300 hover:underline transition-colors ${className || ""}`}
      title={`View policy: ${name}`}
    >
      <Shield size={11} className="shrink-0" />
      {name}
    </button>
  );
}

/** Clickable app name → opens App Health filtered */
export function AppDrillLink({ name, className }: { name: string; className?: string }) {
  const navigateTo = useNavigationStore((s) => s.navigateTo);
  return (
    <button
      onClick={() => navigateTo("appHealth", { query: name })}
      className={`inline-flex items-center gap-1 text-purple-400 hover:text-purple-300 hover:underline transition-colors ${className || ""}`}
      title={`View app health: ${name}`}
    >
      <AppWindow size={11} className="shrink-0" />
      {name}
    </button>
  );
}

/** Clickable group name → sends query to agent */
export function GroupDrillLink({ name, className }: { name: string; className?: string }) {
  const navigateTo = useNavigationStore((s) => s.navigateTo);
  return (
    <button
      onClick={() => navigateTo("queryBuilder", { query: `group members of "${name}"` })}
      className={`inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 hover:underline transition-colors ${className || ""}`}
      title={`View group: ${name}`}
    >
      <Users size={11} className="shrink-0" />
      {name}
    </button>
  );
}

/** Clickable user UPN → opens Device Card (finds their device) */
export function UserDrillLink({ upn, className }: { upn: string; className?: string }) {
  const navigateTo = useNavigationStore((s) => s.navigateTo);
  return (
    <button
      onClick={() => navigateTo("queryBuilder", { query: `devices for user ${upn}` })}
      className={`inline-flex items-center gap-1 text-amber-400 hover:text-amber-300 hover:underline transition-colors ${className || ""}`}
      title={`Find devices for ${upn}`}
    >
      <Users size={11} className="shrink-0" />
      {upn}
    </button>
  );
}

/** Clickable compliance state → opens Security Posture filtered */
export function ComplianceStateDrillLink({ state, className }: { state: string; className?: string }) {
  const navigateTo = useNavigationStore((s) => s.navigateTo);
  const lower = state.toLowerCase();
  const color = lower === "compliant" ? "text-green-400 hover:text-green-300"
    : lower === "noncompliant" ? "text-red-400 hover:text-red-300"
    : "text-yellow-400 hover:text-yellow-300";
  return (
    <button
      onClick={() => navigateTo("securityPosture", { filter: state })}
      className={`inline-flex items-center gap-1 ${color} hover:underline transition-colors ${className || ""}`}
      title={`View ${state} devices`}
    >
      <Shield size={11} className="shrink-0" />
      {state}
    </button>
  );
}

/** Clickable troubleshooter → opens troubleshooter with device pre-filled */
export function TroubleshootDrillLink({ deviceName, className }: { deviceName: string; className?: string }) {
  const navigateTo = useNavigationStore((s) => s.navigateTo);
  return (
    <button
      onClick={() => navigateTo("troubleshooter", { deviceName })}
      className={`inline-flex items-center gap-1 text-orange-400 hover:text-orange-300 hover:underline transition-colors ${className || ""}`}
      title={`Troubleshoot ${deviceName}`}
    >
      <Wrench size={11} className="shrink-0" />
      Troubleshoot
    </button>
  );
}

/** Clickable "View Timeline" link */
export function TimelineDrillLink({ deviceName, className }: { deviceName: string; className?: string }) {
  const navigateTo = useNavigationStore((s) => s.navigateTo);
  return (
    <button
      onClick={() => navigateTo("timeline", { deviceName })}
      className={`inline-flex items-center gap-1 text-sky-400 hover:text-sky-300 hover:underline transition-colors ${className || ""}`}
      title={`View timeline for ${deviceName}`}
    >
      <Search size={11} className="shrink-0" />
      Timeline
    </button>
  );
}

/**
 * Extract the most meaningful search fragment from a policy/profile name.
 * Strips common prefixes like "1120_firstname_" and special chars that
 * break OData contains() queries.
 */
function extractSearchTerm(name: string): string {
  let term = name
    // Strip numbered prefixes like "1120_firstname_"
    .replace(/^\d+_[a-zA-Z]+_/, "")
    // Strip leading/trailing whitespace
    .trim();

  // If the cleaned term is still long, take the first few meaningful words
  if (term.length > 60) {
    term = term.split(/[\s_]+/).slice(0, 5).join(" ");
  }

  // Remove chars that break OData: + ' "
  term = term.replace(/[+'"]/g, "");

  return term || name;
}
