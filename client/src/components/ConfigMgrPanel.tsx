import { useEffect, useMemo, useState } from "react";
import {
  Server,
  RefreshCw,
  Loader2,
  Cloud,
  HardDrive,
  ShieldCheck,
  ShieldAlert,
  HelpCircle,
  Layers,
  AlertTriangle,
  Database,
  Boxes,
  Rocket,
  AppWindow,
  Plug,
  CheckCircle2,
  XCircle,
  Zap,
  TerminalSquare,
  Play,
} from "lucide-react";
import { useConfigMgrStore } from "../stores/configMgrStore.ts";
import { DeviceDrillLink, UserDrillLink } from "./DrillLinks.tsx";
import ConfigMgrConnectWizard from "./ConfigMgrConnectWizard.tsx";
import type { ComanagedDeviceInfo } from "@intune-agent/shared";

const BRAND = "#D4A017"; // Intune (gold)
const CONFIGMGR = "#3B82F6"; // ConfigMgr (blue)

function StatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <div className="flex-1 min-w-[130px] bg-gray-900/60 border border-gray-800 rounded-lg p-3">
      <div className="flex items-center gap-2 text-gray-400">
        {icon}
        <span className="text-[11px] uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-1.5 text-2xl font-bold text-white">{value}</p>
      {hint && <p className="text-[10px] text-gray-500 mt-0.5">{hint}</p>}
    </div>
  );
}

function WorkloadBar({
  label,
  intune,
  configMgr,
}: {
  label: string;
  intune: number;
  configMgr: number;
}) {
  const total = intune + configMgr;
  const intunePct = total > 0 ? (intune / total) * 100 : 0;
  const configPct = total > 0 ? (configMgr / total) * 100 : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] mb-1">
        <span className="text-gray-300">{label}</span>
        <span className="text-gray-500">
          <span style={{ color: BRAND }}>{intune} Intune</span>
          {" · "}
          <span style={{ color: CONFIGMGR }}>{configMgr} ConfigMgr</span>
        </span>
      </div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-gray-800">
        <div
          className="h-full transition-all duration-500"
          style={{ width: `${intunePct}%`, background: BRAND }}
          title={`${intune} devices on Intune`}
        />
        <div
          className="h-full transition-all duration-500"
          style={{ width: `${configPct}%`, background: CONFIGMGR }}
          title={`${configMgr} devices on ConfigMgr`}
        />
      </div>
    </div>
  );
}

function relativeSync(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return "—";
  const mins = Math.floor((Date.now() - d) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function healthBadge(device: ComanagedDeviceInfo): React.ReactNode {
  const state = (device.clientHealthState?.state ?? "").toLowerCase();
  const blocked = device.clientInformation?.isBlocked === true;
  if (blocked)
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded-full">
        <ShieldAlert size={10} /> Blocked
      </span>
    );
  if (state === "healthy")
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded-full">
        <ShieldCheck size={10} /> Healthy
      </span>
    );
  if (state === "")
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-gray-500 bg-gray-700/30 px-1.5 py-0.5 rounded-full">
        <HelpCircle size={10} /> Unknown
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-yellow-400 bg-yellow-500/10 px-1.5 py-0.5 rounded-full">
      <ShieldAlert size={10} /> {device.clientHealthState?.state}
    </span>
  );
}

type Tab = "cloud" | "site";
type SiteResource = "collections" | "deployments" | "applications";
type SiteView = SiteResource | "cmpivot";

const CLIENT_ACTIONS: { value: string; label: string }[] = [
  { value: "refreshMachinePolicy", label: "Refresh machine policy" },
  { value: "refreshUserPolicy", label: "Refresh user policy" },
  { value: "wakeUpClient", label: "Wake up client" },
  { value: "appEvaluation", label: "Evaluate apps" },
  { value: "quickScan", label: "Defender quick scan" },
  { value: "fullScan", label: "Defender full scan" },
  { value: "windowsDefenderUpdateSignatures", label: "Update Defender signatures" },
];

function CloudTab() {
  const { summary, isLoading, error, fetchSummary, runClientAction } = useConfigMgrStore();
  const [pending, setPending] = useState<{ deviceId: string; deviceName: string; action: string } | null>(null);
  const [actionMsg, setActionMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!summary) fetchSummary();
  }, [summary, fetchSummary]);

  const healthTotal = useMemo(() => {
    if (!summary) return 0;
    const h = summary.clientHealth;
    return h.healthy + h.unhealthy + h.unknown;
  }, [summary]);

  return (
    <>
        {error && (
          <div className="flex items-start gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {isLoading && !summary && (
          <div className="flex items-center justify-center gap-2 text-gray-500 py-16">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-sm">Loading co-management data…</span>
          </div>
        )}

        {!isLoading && !error && summary && summary.totalComanaged === 0 && (
          <div className="text-center text-gray-500 py-16">
            <Server size={28} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm">No co-managed devices found.</p>
            <p className="text-[11px] mt-1">
              This tenant has no devices reporting through both Configuration
              Manager and Intune.
            </p>
          </div>
        )}

        {summary && summary.totalComanaged > 0 && (
          <>
            {/* Stat cards */}
            <div className="flex flex-wrap gap-3">
              <StatCard
                icon={<Cloud size={13} />}
                label="Co-managed"
                value={summary.totalComanaged}
                hint="ConfigMgr + Intune"
              />
              <StatCard
                icon={<HardDrive size={13} />}
                label="ConfigMgr only"
                value={summary.totalConfigMgrOnly}
                hint="Not yet co-managed"
              />
              <StatCard
                icon={<Layers size={13} />}
                label="Eligible"
                value={summary.totalEligible}
                hint="In eligibility feed"
              />
              <StatCard
                icon={<ShieldCheck size={13} />}
                label="Healthy clients"
                value={
                  healthTotal > 0
                    ? `${Math.round(
                        (summary.clientHealth.healthy / healthTotal) * 100
                      )}%`
                    : "—"
                }
                hint={`${summary.clientHealth.unhealthy} unhealthy · ${summary.clientHealth.unknown} unknown`}
              />
            </div>

            {/* Workload split */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  Workload authority
                </h3>
                <div className="flex items-center gap-3 text-[10px] text-gray-500">
                  <span className="flex items-center gap-1">
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-sm"
                      style={{ background: BRAND }}
                    />
                    Intune
                  </span>
                  <span className="flex items-center gap-1">
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-sm"
                      style={{ background: CONFIGMGR }}
                    />
                    ConfigMgr
                  </span>
                </div>
              </div>
              <div className="space-y-2.5 bg-gray-900/40 border border-gray-800 rounded-lg p-3.5">
                {summary.workloadSplit.map((w) => (
                  <WorkloadBar
                    key={w.workload}
                    label={w.label}
                    intune={w.intune}
                    configMgr={w.configMgr}
                  />
                ))}
              </div>
            </section>

            {/* Eligibility funnel */}
            {summary.eligibilityFunnel.length > 0 && (
              <section>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                  Eligibility funnel
                </h3>
                <div className="flex flex-wrap gap-2">
                  {summary.eligibilityFunnel.map((f) => (
                    <div
                      key={f.status}
                      className="bg-gray-900/60 border border-gray-800 rounded-lg px-3 py-2"
                    >
                      <p className="text-lg font-bold text-white leading-none">
                        {f.count}
                      </p>
                      <p className="text-[10px] text-gray-500 mt-1">
                        {f.status}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Co-managed device table */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  Co-managed devices ({summary.devices.length})
                </h3>
                {summary.clientHealth.unhealthy > 0 && (
                  <span className="text-[10px] text-yellow-400 flex items-center gap-1">
                    <ShieldAlert size={11} />
                    {summary.clientHealth.unhealthy} client(s) need attention
                  </span>
                )}
              </div>
              <div className="border border-gray-800 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-900/80 text-gray-500 text-left">
                      <th className="px-3 py-2 font-medium">Device</th>
                      <th className="px-3 py-2 font-medium">User</th>
                      <th className="px-3 py-2 font-medium">OS</th>
                      <th className="px-3 py-2 font-medium">Client</th>
                      <th className="px-3 py-2 font-medium">Compliance</th>
                      <th className="px-3 py-2 font-medium">Last sync</th>
                      <th className="px-3 py-2 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.devices.slice(0, 200).map((d) => (
                      <tr
                        key={d.id}
                        className="border-t border-gray-800/60 hover:bg-gray-800/30"
                      >
                        <td className="px-3 py-2">
                          <DeviceDrillLink name={d.deviceName} />
                        </td>
                        <td className="px-3 py-2 text-gray-400">
                          {d.userPrincipalName ? (
                            <UserDrillLink upn={d.userPrincipalName} />
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-3 py-2 text-gray-400">
                          {d.operatingSystem} {d.osVersion}
                        </td>
                        <td className="px-3 py-2">{healthBadge(d)}</td>
                        <td className="px-3 py-2 text-gray-400 capitalize">
                          {d.complianceState || "—"}
                        </td>
                        <td className="px-3 py-2 text-gray-500">
                          {relativeSync(d.lastSyncDateTime)}
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value=""
                            onChange={(e) => {
                              if (e.target.value)
                                setPending({
                                  deviceId: d.id,
                                  deviceName: d.deviceName,
                                  action: e.target.value,
                                });
                              e.currentTarget.value = "";
                            }}
                            className="bg-gray-950 border border-gray-700 rounded px-1.5 py-1 text-[11px] text-gray-300 focus:outline-none focus:border-brand-500"
                            title="Trigger a ConfigMgr client action"
                          >
                            <option value="">Action…</option>
                            {CLIENT_ACTIONS.map((a) => (
                              <option key={a.value} value={a.value}>
                                {a.label}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <p className="text-[10px] text-gray-600 text-center pt-1">
              Read-only view · data from Microsoft Graph ·{" "}
              {new Date(summary.generatedAt).toLocaleString()}
            </p>
          </>
        )}

        {actionMsg && (
          <div
            className={`fixed bottom-4 right-4 z-50 text-xs rounded-lg px-3 py-2 border shadow-lg ${
              actionMsg.kind === "ok"
                ? "text-green-300 bg-green-900/80 border-green-600/40"
                : "text-red-300 bg-red-900/80 border-red-600/40"
            }`}
          >
            {actionMsg.text}
          </div>
        )}

        {pending && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-sm bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-5 space-y-4">
              <div className="flex items-center gap-2 text-gray-200">
                <Zap size={16} className="text-brand-400" />
                <h3 className="text-sm font-semibold">Trigger client action</h3>
              </div>
              <p className="text-[13px] text-gray-400">
                Run{" "}
                <strong className="text-gray-200">
                  {CLIENT_ACTIONS.find((a) => a.value === pending.action)?.label ||
                    pending.action}
                </strong>{" "}
                on <strong className="text-gray-200">{pending.deviceName}</strong>? This
                triggers an action on the ConfigMgr client at its next check-in.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setPending(null)}
                  disabled={running}
                  className="px-3 py-1.5 rounded-md text-xs text-gray-300 border border-gray-700 hover:bg-gray-800 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    setRunning(true);
                    const res = await runClientAction(pending.deviceId, pending.action);
                    setRunning(false);
                    setActionMsg(
                      res.ok
                        ? { kind: "ok", text: res.message || "Action triggered." }
                        : { kind: "err", text: res.error || "Action failed." }
                    );
                    setPending(null);
                    setTimeout(() => setActionMsg(null), 6000);
                  }}
                  disabled={running}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-brand-500 text-gray-900 hover:bg-brand-400 disabled:opacity-50"
                >
                  {running ? <Loader2 size={13} className="animate-spin" /> : null}
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )}
    </>
  );
}

// ─── Site (on-prem AdminService) view ────────────────

const RESOURCE_META: Record<
  SiteResource,
  { label: string; icon: React.ReactNode }
> = {
  collections: { label: "Collections", icon: <Boxes size={13} /> },
  deployments: { label: "Deployments", icon: <Rocket size={13} /> },
  applications: { label: "Applications", icon: <AppWindow size={13} /> },
};

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function CmPivotView() {
  const { cmpivotRows, cmpivotStatus, cmpivotLoading, cmpivotError, runCmpivot } =
    useConfigMgrStore();
  const [deviceName, setDeviceName] = useState("");
  const [query, setQuery] = useState("OS | project Caption, Version, BuildNumber");

  const columns = useMemo(() => {
    const set = new Set<string>();
    for (const row of cmpivotRows.slice(0, 50)) Object.keys(row).forEach((k) => set.add(k));
    return Array.from(set);
  }, [cmpivotRows]);

  const canRun = deviceName.trim().length > 0 && query.trim().length > 0 && !cmpivotLoading;

  return (
    <div className="space-y-3">
      <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg px-3 py-2 text-[11px] text-yellow-500/90 flex items-start gap-2">
        <TerminalSquare size={13} className="mt-0.5 shrink-0" />
        <span>
          CMPivot runs a real-time query on the target device. This action is audited.
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <input
          className="col-span-1 bg-gray-950 border border-gray-700 rounded-md px-2.5 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-brand-500"
          placeholder="Device name"
          value={deviceName}
          onChange={(e) => setDeviceName(e.target.value)}
        />
        <input
          className="col-span-2 bg-gray-950 border border-gray-700 rounded-md px-2.5 py-1.5 text-sm text-gray-200 font-mono focus:outline-none focus:border-brand-500"
          placeholder="CMPivot query, e.g. OS | project Caption, Version"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canRun) runCmpivot({ deviceName, query });
          }}
        />
      </div>
      <button
        onClick={() => runCmpivot({ deviceName, query })}
        disabled={!canRun}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-brand-500 text-gray-900 hover:bg-brand-400 disabled:opacity-50"
      >
        {cmpivotLoading ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
        Run query
      </button>

      {cmpivotError && (
        <div className="flex items-start gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{cmpivotError}</span>
        </div>
      )}

      {cmpivotLoading && (
        <div className="flex items-center justify-center gap-2 text-gray-500 py-8">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-sm">Querying device… (this can take a moment)</span>
        </div>
      )}

      {!cmpivotLoading && cmpivotRows.length > 0 && (
        <div className="border border-gray-800 rounded-lg overflow-auto max-h-[50vh]">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-900/80 text-gray-500 text-left">
                {columns.map((c) => (
                  <th key={c} className="px-3 py-2 font-medium whitespace-nowrap">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cmpivotRows.slice(0, 500).map((row, i) => (
                <tr key={i} className="border-t border-gray-800/60 hover:bg-gray-800/30">
                  {columns.map((c) => (
                    <td key={c} className="px-3 py-2 text-gray-300 whitespace-nowrap">
                      {formatCell(row[c])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!cmpivotLoading && !cmpivotError && cmpivotStatus && cmpivotRows.length === 0 && (
        <p className="text-center text-gray-500 text-xs py-6">
          {cmpivotStatus === "timeout"
            ? "The device didn't respond in time."
            : "Query returned no rows."}
        </p>
      )}
    </div>
  );
}

function SiteTab() {
  const {
    connection,
    connectionLoading,
    fetchConnection,
    collections,
    deployments,
    applications,
    siteLoading,
    siteError,
    fetchSite,
  } = useConfigMgrStore();
  const [resource, setResource] = useState<SiteView>("collections");
  const [wizardOpen, setWizardOpen] = useState(false);

  useEffect(() => {
    if (!connection) fetchConnection();
  }, [connection, fetchConnection]);

  useEffect(() => {
    if (connection?.connected && resource !== "cmpivot") fetchSite(resource);
  }, [connection?.connected, resource, fetchSite]);

  if (connectionLoading && !connection) {
    return (
      <div className="flex items-center justify-center gap-2 text-gray-500 py-16">
        <Loader2 size={16} className="animate-spin" />
        <span className="text-sm">Checking AdminService connection…</span>
      </div>
    );
  }

  if (connection && !connection.configured) {
    return (
      <div className="max-w-xl mx-auto text-center py-12 space-y-4">
        <div className="flex flex-col items-center gap-2 text-gray-300">
          <Database size={28} className="text-brand-400/70" />
          <h3 className="font-semibold text-sm">
            Connect to your Configuration Manager site
          </h3>
        </div>
        <p className="text-[13px] text-gray-500 max-w-md mx-auto">
          Link the on-prem AdminService to browse collections, deployments and
          applications. Read-only — nothing is changed in ConfigMgr.
        </p>
        <button
          onClick={() => setWizardOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-brand-500 text-gray-900 hover:bg-brand-400"
        >
          <Plug size={15} /> Connect to site…
        </button>
        {wizardOpen && (
          <ConfigMgrConnectWizard onClose={() => setWizardOpen(false)} />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        {connection?.connected ? (
          <div className="flex items-center gap-2 text-xs text-green-400 bg-green-500/10 border border-green-500/30 rounded-lg px-3 py-2 flex-1">
            <CheckCircle2 size={14} className="shrink-0" />
            <span>
              Connected to site <strong>{connection.siteCode || "—"}</strong>
              {connection.siteName ? ` (${connection.siteName})` : ""}
              {connection.version ? ` · v${connection.version}` : ""} · auth:{" "}
              {connection.authMode}
            </span>
          </div>
        ) : (
          <div className="flex items-start gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 flex-1">
            <XCircle size={14} className="mt-0.5 shrink-0" />
            <span>
              AdminService configured but not reachable
              {connection?.error ? `: ${connection.error}` : "."}
            </span>
          </div>
        )}
        <button
          onClick={() => setWizardOpen(true)}
          className="text-[11px] text-brand-400 hover:underline shrink-0 pt-1.5"
        >
          Reconfigure
        </button>
      </div>

      {connection?.connected && (
        <>
          <div className="flex items-center gap-1.5">
            {(Object.keys(RESOURCE_META) as SiteResource[]).map((r) => (
              <button
                key={r}
                onClick={() => setResource(r)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors ${
                  resource === r
                    ? "bg-brand-500/20 text-brand-300 border border-brand-500/40"
                    : "text-gray-400 hover:bg-gray-800 border border-transparent"
                }`}
              >
                {RESOURCE_META[r].icon}
                {RESOURCE_META[r].label}
              </button>
            ))}
            <button
              onClick={() => setResource("cmpivot")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors ${
                resource === "cmpivot"
                  ? "bg-brand-500/20 text-brand-300 border border-brand-500/40"
                  : "text-gray-400 hover:bg-gray-800 border border-transparent"
              }`}
            >
              <TerminalSquare size={13} />
              CMPivot
            </button>
          </div>

          {siteError && (
            <div className="flex items-start gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>{siteError}</span>
            </div>
          )}

          {resource === "cmpivot" ? (
            <CmPivotView />
          ) : siteLoading[resource] ? (
            <div className="flex items-center justify-center gap-2 text-gray-500 py-12">
              <Loader2 size={16} className="animate-spin" />
              <span className="text-sm">Loading {resource}…</span>
            </div>
          ) : (
            <div className="border border-gray-800 rounded-lg overflow-hidden">
              {resource === "collections" && (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-900/80 text-gray-500 text-left">
                      <th className="px-3 py-2 font-medium">Name</th>
                      <th className="px-3 py-2 font-medium">Type</th>
                      <th className="px-3 py-2 font-medium">Members</th>
                      <th className="px-3 py-2 font-medium">Limiting collection</th>
                    </tr>
                  </thead>
                  <tbody>
                    {collections.map((c) => (
                      <tr
                        key={c.collectionId}
                        className="border-t border-gray-800/60 hover:bg-gray-800/30"
                      >
                        <td className="px-3 py-2 text-gray-200">{c.name}</td>
                        <td className="px-3 py-2 text-gray-400">{c.collectionType}</td>
                        <td className="px-3 py-2 text-gray-300">{c.memberCount}</td>
                        <td className="px-3 py-2 text-gray-500">
                          {c.limitToCollectionName || "—"}
                        </td>
                      </tr>
                    ))}
                    {collections.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-3 py-6 text-center text-gray-600">
                          No collections returned.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}

              {resource === "deployments" && (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-900/80 text-gray-500 text-left">
                      <th className="px-3 py-2 font-medium">Software</th>
                      <th className="px-3 py-2 font-medium">Collection</th>
                      <th className="px-3 py-2 font-medium">Intent</th>
                      <th className="px-3 py-2 font-medium">Type</th>
                      <th className="px-3 py-2 font-medium">Success</th>
                      <th className="px-3 py-2 font-medium">Errors</th>
                      <th className="px-3 py-2 font-medium">In progress</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deployments.map((d) => (
                      <tr
                        key={d.deploymentId}
                        className="border-t border-gray-800/60 hover:bg-gray-800/30"
                      >
                        <td className="px-3 py-2 text-gray-200">{d.softwareName}</td>
                        <td className="px-3 py-2 text-gray-400">{d.collectionName}</td>
                        <td className="px-3 py-2 text-gray-400">{d.intent}</td>
                        <td className="px-3 py-2 text-gray-400">{d.featureType}</td>
                        <td className="px-3 py-2 text-green-400">{d.success}</td>
                        <td
                          className={`px-3 py-2 ${d.errors > 0 ? "text-red-400" : "text-gray-500"}`}
                        >
                          {d.errors}
                        </td>
                        <td className="px-3 py-2 text-gray-400">{d.inProgress}</td>
                      </tr>
                    ))}
                    {deployments.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-3 py-6 text-center text-gray-600">
                          No deployments returned.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}

              {resource === "applications" && (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-900/80 text-gray-500 text-left">
                      <th className="px-3 py-2 font-medium">Name</th>
                      <th className="px-3 py-2 font-medium">Publisher</th>
                      <th className="px-3 py-2 font-medium">Version</th>
                      <th className="px-3 py-2 font-medium">Deployments</th>
                      <th className="px-3 py-2 font-medium">Installs</th>
                      <th className="px-3 py-2 font-medium">Deployed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {applications.map((a) => (
                      <tr
                        key={a.ciId}
                        className="border-t border-gray-800/60 hover:bg-gray-800/30"
                      >
                        <td className="px-3 py-2 text-gray-200">{a.name}</td>
                        <td className="px-3 py-2 text-gray-400">
                          {a.manufacturer || "—"}
                        </td>
                        <td className="px-3 py-2 text-gray-400">{a.version || "—"}</td>
                        <td className="px-3 py-2 text-gray-300">
                          {a.numberOfDeployments}
                        </td>
                        <td className="px-3 py-2 text-gray-300">
                          {a.numberOfDevicesWithApp}
                        </td>
                        <td className="px-3 py-2">
                          {a.isDeployed ? (
                            <CheckCircle2 size={13} className="text-green-400" />
                          ) : (
                            <span className="text-gray-600">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {applications.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-3 py-6 text-center text-gray-600">
                          No applications returned.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          )}

          <p className="text-[10px] text-gray-600 text-center pt-1">
            Read-only view · data from the ConfigMgr AdminService
          </p>
        </>
      )}

      {wizardOpen && (
        <ConfigMgrConnectWizard onClose={() => setWizardOpen(false)} />
      )}
    </div>
  );
}

// ─── Panel shell with tabs ────────────────────────────
export default function ConfigMgrPanel() {
  const { isLoading, fetchSummary, fetchConnection } = useConfigMgrStore();
  const [tab, setTab] = useState<Tab>("cloud");

  const handleRefresh = () => {
    if (tab === "cloud") fetchSummary();
    else fetchConnection();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <Server size={16} className="text-brand-400" />
          <h2 className="text-sm font-semibold text-gray-300">
            Configuration Manager
          </h2>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isLoading}
          className="p-1.5 rounded hover:bg-gray-800 text-gray-400 disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 px-4 pt-3 border-b border-gray-800">
        <button
          onClick={() => setTab("cloud")}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs rounded-t-md border-b-2 transition-colors ${
            tab === "cloud"
              ? "border-brand-500 text-brand-300"
              : "border-transparent text-gray-400 hover:text-gray-300"
          }`}
        >
          <Cloud size={13} /> Co-management (cloud)
        </button>
        <button
          onClick={() => setTab("site")}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs rounded-t-md border-b-2 transition-colors ${
            tab === "site"
              ? "border-brand-500 text-brand-300"
              : "border-transparent text-gray-400 hover:text-gray-300"
          }`}
        >
          <Database size={13} /> Site (on-prem)
        </button>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-5">
        {tab === "cloud" ? <CloudTab /> : <SiteTab />}
      </div>
    </div>
  );
}
