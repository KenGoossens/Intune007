import { useEffect, useMemo, useRef, useState } from "react";
import {
  Network, PlayCircle, Plus, Trash2, Upload, Sparkles, Save, Loader2,
  Building2, Cloud, ServerCog, Wifi, AlertTriangle, CheckCircle2, FileJson,
  ChevronDown, ChevronRight, Download, Copy, ImageDown,
} from "lucide-react";
import { useDOSimulatorStore } from "../stores/doSimulatorStore";
import type {
  DOSiteRecommendation,
  DOSimulationResult,
  DOSiteType,
} from "@intune-agent/shared";

const SITE_TYPES: { value: DOSiteType; label: string }[] = [
  { value: "headquarters", label: "Headquarters" },
  { value: "branch", label: "Branch office" },
  { value: "small_branch", label: "Small branch" },
  { value: "roaming", label: "Roaming users" },
  { value: "guest", label: "Guest network" },
];

export default function DOSimulatorPanel() {
  const {
    input, result, list, profiles, loading, error, prefillNotes,
    setInput, updateContent, updateEnvironment, updateAssumptions,
    addSite, updateSite, removeSite, importSitesCsv,
    prefillFromTenant, runSimulation, fetchList, loadSimulation,
    deleteSimulation, generateProfiles,
  } = useDOSimulatorStore();

  const [csvOpen, setCsvOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [savedOpen, setSavedOpen] = useState(false);
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const lastResultId = useRef<string | null>(null);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  // Auto-scroll to results when a new simulation finishes
  useEffect(() => {
    if (result && result.simulationId !== lastResultId.current) {
      lastResultId.current = result.simulationId;
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [result]);

  const totalDevices = useMemo(
    () => input.sites.reduce((acc, s) => acc + (s.deviceCount || 0), 0),
    [input.sites]
  );

  const canRun = !loading && input.sites.length > 0;

  async function handleRun(save: boolean) {
    await runSimulation(save);
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-950 text-gray-200">
      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Header */}
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2 text-white">
              <Network className="text-brand-400" size={24} />
              Delivery Optimization Simulator
            </h1>
            <p className="text-sm text-gray-400 mt-1 max-w-3xl">
              Model the move from ConfigMgr DPs to Intune App Distribution + Microsoft Connected Cache.
              Describe your sites, content profile and identity model — get back per-site DO mode recommendations,
              MCC placement, projected WAN savings and a phased migration plan.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => prefillFromTenant()}
              disabled={loading}
              className="px-3 py-2 rounded text-xs font-semibold bg-gray-800 hover:bg-gray-700 text-gray-100 flex items-center gap-1.5 disabled:opacity-50"
              title="Pre-fill identity model and content profile from the connected tenant"
            >
              <Sparkles size={12} />
              Pre-fill from tenant
            </button>
            <button
              onClick={() => handleRun(false)}
              disabled={!canRun}
              className="px-3 py-2 rounded text-xs font-semibold bg-gray-800 hover:bg-gray-700 text-gray-100 flex items-center gap-1.5 disabled:opacity-50"
              title={input.sites.length === 0 ? "Add at least one site first" : "Run the simulation"}
            >
              {loading ? <Loader2 size={12} className="animate-spin" /> : <PlayCircle size={12} />}
              Run simulation
            </button>
            <button
              onClick={() => handleRun(true)}
              disabled={!canRun}
              className="px-3 py-2 rounded text-xs font-semibold bg-brand-600 hover:bg-brand-500 text-black flex items-center gap-1.5 disabled:opacity-50"
              title={input.sites.length === 0 ? "Add at least one site first" : "Run and save the simulation"}
            >
              <Save size={12} />
              Run & save
            </button>
          </div>
        </header>

        {prefillNotes.length > 0 && (
          <div className="bg-gray-900 border border-brand-700/50 rounded-lg p-3 text-xs text-gray-300 space-y-1">
            <p className="font-semibold text-brand-400">Tenant analysis notes</p>
            {prefillNotes.map((n, i) => (
              <p key={i} className="text-gray-400">• {n}</p>
            ))}
          </div>
        )}

        {error && (
          <div className="bg-red-900/40 border border-red-800 rounded-lg p-3 text-xs text-red-200">
            {error}
          </div>
        )}

        {/* Saved simulations */}
        <section className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
          <button
            onClick={() => setSavedOpen((o) => !o)}
            className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-800/50"
          >
            <span className="text-sm font-semibold flex items-center gap-2">
              <Save size={14} className="text-brand-400" />
              Saved simulations
              <span className="text-xs text-gray-500 font-normal">({list.length})</span>
            </span>
            {savedOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          {savedOpen && (
            <div className="px-4 pb-4">
              {list.length === 0 ? (
                <p className="text-xs text-gray-500 italic">No saved simulations yet — run one and click "Save".</p>
              ) : (
                <ul className="space-y-1">
                  {list.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-2 px-2 py-1.5 hover:bg-gray-800/60 rounded">
                      <button
                        onClick={() => loadSimulation(s.id)}
                        className="flex-1 text-left text-xs"
                      >
                        <span className="font-medium text-gray-200">{s.name}</span>
                        <span className="text-gray-500 ml-2">{new Date(s.createdAt).toLocaleString()}</span>
                        <span className="text-emerald-400 ml-2">{Math.round(s.totalSavingsGB)} GB saved/mo</span>
                        <span className="text-brand-400 ml-2">readiness {s.readinessScore}/100</span>
                      </button>
                      <button
                        onClick={() => deleteSimulation(s.id)}
                        className="text-gray-600 hover:text-red-400"
                        title="Delete"
                      >
                        <Trash2 size={12} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>

        {/* Form */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* General + content + environment + assumptions (left column) */}
          <div className="lg:col-span-1 space-y-4">
            <Card title="Simulation">
              <Field label="Name">
                <input
                  type="text"
                  value={input.name}
                  onChange={(e) => setInput({ name: e.target.value })}
                  className={inputCls}
                />
              </Field>
              <p className="text-[11px] text-gray-500">{totalDevices.toLocaleString()} devices across {input.sites.length} site(s)</p>
            </Card>

            <Card title="Content profile (GB / device / month)">
              <Field label="Windows updates">
                <NumInput
                  value={input.content.windowsUpdatesGBPerDevice}
                  onChange={(v) => updateContent({ windowsUpdatesGBPerDevice: v })}
                />
              </Field>
              <Field label="M365 apps">
                <NumInput
                  value={input.content.m365AppsGBPerDevice}
                  onChange={(v) => updateContent({ m365AppsGBPerDevice: v })}
                />
              </Field>
              <Field label="Intune / Win32 apps">
                <NumInput
                  value={input.content.intuneAppsGBPerDevice}
                  onChange={(v) => updateContent({ intuneAppsGBPerDevice: v })}
                />
              </Field>
              <Field label="Drivers / firmware">
                <NumInput
                  value={input.content.driversGBPerDevice}
                  onChange={(v) => updateContent({ driversGBPerDevice: v })}
                />
              </Field>
            </Card>

            <Card title="Environment">
              <Field label="Identity model">
                <select
                  value={input.environment.identityModel}
                  onChange={(e) => updateEnvironment({ identityModel: e.target.value as never })}
                  className={inputCls}
                >
                  <option value="ad_only">AD-joined only</option>
                  <option value="hybrid">Hybrid AAD-joined</option>
                  <option value="aadj">Entra-joined (AAD-joined)</option>
                </select>
              </Field>
              <Field label="ConfigMgr workloads in Intune (0-8)">
                <NumInput
                  value={input.environment.intuneWorkloadCount}
                  onChange={(v) => updateEnvironment({ intuneWorkloadCount: Math.max(0, Math.min(8, v)) })}
                />
              </Field>
              <Field label="ConfigMgr DPs to retire">
                <NumInput
                  value={input.environment.configMgrDPCount}
                  onChange={(v) => updateEnvironment({ configMgrDPCount: Math.max(0, v) })}
                />
              </Field>
              <Field label="Co-management enabled">
                <input
                  type="checkbox"
                  checked={input.environment.coManagementEnabled}
                  onChange={(e) => updateEnvironment({ coManagementEnabled: e.target.checked })}
                  className="ml-1"
                />
              </Field>
            </Card>

            <Card title="Assumptions">
              <Field label="WAN cost (USD/GB)">
                <NumInput
                  value={input.assumptions.wanCostPerGB}
                  step={0.01}
                  onChange={(v) => updateAssumptions({ wanCostPerGB: v })}
                />
              </Field>
              <Field label="MCC hit rate (0-1)">
                <NumInput
                  value={input.assumptions.mccHitRate}
                  step={0.05}
                  onChange={(v) => updateAssumptions({ mccHitRate: Math.max(0, Math.min(1, v)) })}
                />
              </Field>
            </Card>
          </div>

          {/* Sites (right two columns) */}
          <div className="lg:col-span-2 space-y-3">
            <Card
              title="Sites"
              actions={
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCsvOpen((o) => !o)}
                    className="text-xs text-gray-400 hover:text-gray-200 flex items-center gap-1"
                  >
                    <Upload size={12} /> CSV
                  </button>
                  <button
                    onClick={addSite}
                    className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1"
                  >
                    <Plus size={12} /> Add site
                  </button>
                </div>
              }
            >
              {csvOpen && (
                <div className="mb-3 p-3 bg-gray-950 border border-gray-800 rounded">
                  <p className="text-[11px] text-gray-400 mb-1">
                    Header columns: <code className="text-brand-400">name, deviceCount, wanBandwidthMbps, hasMCCCandidate, hasConfigMgrDP, subnets, adSiteName, boundaryGroupName, type</code>
                    <br />Subnets are <code>;</code>-separated (e.g. <code>10.1.0.0/24;10.1.1.0/24</code>).
                  </p>
                  <textarea
                    value={csvText}
                    onChange={(e) => setCsvText(e.target.value)}
                    rows={5}
                    placeholder="name,deviceCount,wanBandwidthMbps,hasMCCCandidate,hasConfigMgrDP,subnets,adSiteName&#10;HQ,250,1000,true,true,10.0.0.0/22,Brussels-HQ"
                    className="w-full text-[11px] font-mono bg-gray-900 border border-gray-700 rounded p-2 text-gray-200"
                  />
                  <div className="mt-2 flex justify-end gap-2">
                    <button
                      onClick={() => setCsvOpen(false)}
                      className="text-xs text-gray-400 hover:text-gray-200"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={async () => {
                        await importSitesCsv(csvText);
                        setCsvText("");
                        setCsvOpen(false);
                      }}
                      className="text-xs px-3 py-1 bg-brand-600 hover:bg-brand-500 text-black font-semibold rounded"
                    >
                      Import
                    </button>
                  </div>
                </div>
              )}

              {input.sites.length === 0 ? (
                <p className="text-xs text-gray-500 italic">No sites yet. Click "Add site", import a CSV, or "Pre-fill from tenant".</p>
              ) : (
                <div className="space-y-2">
                  {input.sites.map((site) => (
                    <div key={site.id} className="bg-gray-950 border border-gray-800 rounded p-3 grid grid-cols-12 gap-2 items-center">
                      <input
                        type="text"
                        value={site.name}
                        onChange={(e) => updateSite(site.id, { name: e.target.value })}
                        className="col-span-3 px-2 py-1 bg-gray-900 border border-gray-700 rounded text-xs"
                      />
                      <select
                        value={site.type}
                        onChange={(e) => updateSite(site.id, { type: e.target.value as DOSiteType })}
                        className="col-span-2 px-2 py-1 bg-gray-900 border border-gray-700 rounded text-xs"
                      >
                        {SITE_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                      <label className="col-span-2 text-[10px] text-gray-500">
                        Devices
                        <NumInput
                          value={site.deviceCount}
                          onChange={(v) => updateSite(site.id, { deviceCount: v })}
                          className="mt-0.5"
                        />
                      </label>
                      <label className="col-span-2 text-[10px] text-gray-500">
                        WAN Mbps
                        <NumInput
                          value={site.wanBandwidthMbps}
                          onChange={(v) => updateSite(site.id, { wanBandwidthMbps: v })}
                          className="mt-0.5"
                        />
                      </label>
                      <label className="col-span-1 text-[10px] text-gray-500 flex flex-col items-start">
                        MCC?
                        <input
                          type="checkbox"
                          checked={site.hasMCCCandidate}
                          onChange={(e) => updateSite(site.id, { hasMCCCandidate: e.target.checked })}
                          className="mt-1"
                        />
                      </label>
                      <label className="col-span-1 text-[10px] text-gray-500 flex flex-col items-start">
                        DP?
                        <input
                          type="checkbox"
                          checked={site.hasConfigMgrDP}
                          onChange={(e) => updateSite(site.id, { hasConfigMgrDP: e.target.checked })}
                          className="mt-1"
                        />
                      </label>
                      <button
                        onClick={() => removeSite(site.id)}
                        className="col-span-1 text-gray-600 hover:text-red-400 justify-self-end"
                        title="Remove"
                      >
                        <Trash2 size={12} />
                      </button>
                      <div className="col-span-12">
                        <input
                          type="text"
                          placeholder="Subnets (semicolon-separated, e.g. 10.0.0.0/24;10.0.1.0/24)"
                          value={site.subnets.map((s) => s.cidr).join(";")}
                          onChange={(e) =>
                            updateSite(site.id, {
                              subnets: e.target.value
                                .split(/[;|]/)
                                .map((s) => s.trim())
                                .filter(Boolean)
                                .map((cidr) => ({ cidr })),
                            })
                          }
                          className="w-full px-2 py-1 bg-gray-900 border border-gray-700 rounded text-[11px] font-mono text-gray-300"
                        />
                      </div>
                      <div className="col-span-12 grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          placeholder="AD site name (optional)"
                          value={site.adSiteName || ""}
                          onChange={(e) => updateSite(site.id, { adSiteName: e.target.value || undefined })}
                          className="px-2 py-1 bg-gray-900 border border-gray-700 rounded text-[11px] text-gray-300"
                        />
                        <input
                          type="text"
                          placeholder="ConfigMgr boundary group (optional)"
                          value={site.boundaryGroupName || ""}
                          onChange={(e) => updateSite(site.id, { boundaryGroupName: e.target.value || undefined })}
                          className="px-2 py-1 bg-gray-900 border border-gray-700 rounded text-[11px] text-gray-300"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => handleRun(false)}
                disabled={!canRun}
                className="px-4 py-2 rounded text-xs font-semibold bg-gray-800 hover:bg-gray-700 text-gray-100 flex items-center gap-1.5 disabled:opacity-50"
              >
                {loading ? <Loader2 size={12} className="animate-spin" /> : <PlayCircle size={12} />}
                Run simulation
              </button>
              <button
                onClick={() => handleRun(true)}
                disabled={!canRun}
                className="px-4 py-2 rounded text-xs font-semibold bg-brand-600 hover:bg-brand-500 text-black flex items-center gap-1.5 disabled:opacity-50"
              >
                <Save size={12} />
                Run & save
              </button>
            </div>
          </div>
        </section>

        {/* Results */}
        <div ref={resultsRef}>
          {loading && !result && (
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 text-center">
              <Loader2 size={20} className="animate-spin text-brand-400 mx-auto mb-2" />
              <p className="text-sm text-gray-300">Running simulation…</p>
              <p className="text-[11px] text-gray-500 mt-1">Computing per-site DO modes, MCC placement, savings and migration plan.</p>
            </div>
          )}
          {!loading && !result && (
            <div className="bg-gray-900 border border-dashed border-gray-800 rounded-lg p-6 text-center">
              <PlayCircle size={20} className="text-gray-600 mx-auto mb-2" />
              <p className="text-sm text-gray-400">No simulation yet</p>
              <p className="text-[11px] text-gray-500 mt-1">
                {input.sites.length === 0
                  ? "Add at least one site (or click Pre-fill from tenant), then click Run simulation."
                  : "Click Run simulation above to see per-site DO recommendations, MCC placement, WAN savings and your migration plan."}
              </p>
            </div>
          )}
          {result && (
            <ResultView result={result} profiles={profiles} onGenerateProfiles={generateProfiles} loading={loading} />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────

function ResultView({
  result, profiles, onGenerateProfiles, loading,
}: {
  result: DOSimulationResult;
  profiles: DOSimulatorPanelProfiles;
  onGenerateProfiles: () => void;
  loading: boolean;
}) {
  const { savings, readiness, perSite, migrationPlan, totalMCCServers } = result;
  return (
    <section className="space-y-4">
      <div className="border-t border-gray-800 pt-4">
        <h2 className="text-lg font-bold text-white mb-3">Results — {result.name}</h2>
      </div>

      {/* Headline KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Cloud-native readiness" value={`${readiness.total}/100`} accent />
        <Kpi label="Monthly WAN saved" value={`${Math.round(savings.baselineMonthlyGB - savings.doPlusMCCMonthlyGB)} GB`} />
        <Kpi label="Annual cost saved" value={`$${savings.annualCostSavingsUSD.toLocaleString()}`} />
        <Kpi label="MCC nodes recommended" value={String(totalMCCServers)} />
      </div>

      {/* Readiness blockers */}
      {readiness.blockers.length > 0 && (
        <Card title="Top blockers to cloud-native">
          <ul className="space-y-1.5">
            {readiness.blockers.map((b, i) => (
              <li key={i} className="text-xs text-gray-300 flex items-start gap-2">
                <AlertTriangle size={12} className="text-yellow-400 mt-0.5 shrink-0" />
                {b}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Savings chart (simple SVG) */}
      <Card title="Bandwidth model — monthly external WAN GB">
        <SavingsChart
          baseline={savings.baselineMonthlyGB}
          doOnly={savings.doOnlyMonthlyGB}
          doPlusMCC={savings.doPlusMCCMonthlyGB}
        />
      </Card>

      {/* Per-site recommendations */}
      <Card title="Per-site recommendations">
        <div className="space-y-2">
          {perSite.map((rec) => (
            <SiteRecCard key={rec.siteId} rec={rec} />
          ))}
        </div>
      </Card>

      {/* Network topology image */}
      <NetworkTopologyCard result={result} />

      {/* Migration plan */}
      <Card title="Migration plan">
        <ol className="space-y-3">
          {migrationPlan.map((p) => (
            <li key={p.order} className="bg-gray-950 border border-gray-800 rounded p-3">
              <div className="flex items-start justify-between gap-2 mb-1">
                <h4 className="text-sm font-semibold text-brand-400">
                  {p.order}. {p.title}
                </h4>
                <span className="text-[10px] text-gray-500">~{p.estimatedDurationWeeks} weeks</span>
              </div>
              <p className="text-xs text-gray-400 mb-2">{p.description}</p>
              {p.prerequisites.length > 0 && (
                <p className="text-[11px] text-gray-500">
                  <span className="font-semibold">Prereqs:</span> {p.prerequisites.join(" · ")}
                </p>
              )}
              <ul className="mt-2 space-y-0.5">
                {p.actions.map((a, i) => (
                  <li key={i} className="text-[11px] text-gray-300 flex items-start gap-1.5">
                    <CheckCircle2 size={10} className="text-emerald-400 mt-0.5 shrink-0" /> {a}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </Card>

      {/* Intune profiles */}
      <Card
        title="Intune Configuration Profiles — paste into Settings Catalog / OMA-URI"
        actions={
          <div className="flex items-center gap-2">
            {profiles && profiles.length > 0 && (
              <button
                onClick={() => downloadJson(`${slugify(result.name)}-intune-profiles.json`, profiles)}
                className="text-xs px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-200 font-semibold rounded flex items-center gap-1.5"
                title="Download all profiles as one JSON file"
              >
                <Download size={12} /> Download all
              </button>
            )}
            <button
              onClick={onGenerateProfiles}
              disabled={loading}
              className="text-xs px-3 py-1 bg-brand-600 hover:bg-brand-500 text-black font-semibold rounded flex items-center gap-1.5 disabled:opacity-50"
            >
              <FileJson size={12} />
              {profiles && profiles.length > 0 ? "Regenerate" : "Generate profiles"}
            </button>
          </div>
        }
      >
        {!profiles || profiles.length === 0 ? (
          <p className="text-xs text-gray-500">
            One Intune Configuration Profile per site is generated automatically with each simulation. If nothing is shown,
            click "Generate profiles".
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-[11px] text-gray-500">
              Each profile sets the Delivery Optimization CSP values devices need so they know whether to peer on the LAN,
              query an MCC server, or fall back to the internet. Open Intune → <em>Devices → Configuration → Create profile</em> →
              Windows 10/11 → Templates → Custom (or Settings Catalog → Delivery Optimization), and paste the OMA-URI / setting values.
            </p>
            {profiles.map((p, i) => (
              <details key={i} className="bg-gray-950 border border-gray-800 rounded" open={i === 0}>
                <summary className="px-3 py-2 cursor-pointer text-xs font-semibold text-gray-200 flex items-center justify-between">
                  <span>{p.displayName}</span>
                  <span className="text-[10px] text-gray-500">{p.settings.length} setting(s)</span>
                </summary>
                <div className="px-3 pb-3">
                  <p className="text-[11px] text-gray-500 mb-2">{p.description}</p>
                  <pre className="p-2 bg-black/40 border border-gray-800 rounded text-[10px] font-mono text-gray-300 overflow-x-auto max-h-72">
                    {JSON.stringify(p, null, 2)}
                  </pre>
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => navigator.clipboard.writeText(JSON.stringify(p, null, 2))}
                      className="text-[10px] text-brand-400 hover:text-brand-300 flex items-center gap-1"
                    >
                      <Copy size={10} /> Copy JSON
                    </button>
                    <button
                      onClick={() => downloadJson(`${slugify(p.displayName)}.json`, p)}
                      className="text-[10px] text-brand-400 hover:text-brand-300 flex items-center gap-1"
                    >
                      <Download size={10} /> Download
                    </button>
                  </div>
                </div>
              </details>
            ))}
          </div>
        )}
      </Card>
    </section>
  );
}

type DOSimulatorPanelProfiles = ReturnType<typeof useDOSimulatorStore.getState>["profiles"];

function SiteRecCard({ rec }: { rec: DOSiteRecommendation }) {
  const Icon = rec.deployMCC ? ServerCog : rec.downloadMode === 100 ? Wifi : rec.downloadMode === 3 ? Cloud : Building2;
  return (
    <div className="bg-gray-950 border border-gray-800 rounded p-3">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2">
          <Icon size={14} className="text-brand-400" />
          <h4 className="text-sm font-semibold text-white">{rec.siteName}</h4>
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded ${rec.deployMCC ? "bg-amber-900/60 text-amber-300" : "bg-gray-800 text-gray-400"}`}>
          {rec.downloadModeName}
        </span>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 text-[11px] text-gray-400 mb-2">
        <Stat label="Peer hit" value={`${Math.round(rec.peerHitRate * 100)}%`} />
        <Stat label="MCC hit" value={`${Math.round(rec.mccHitRate * 100)}%`} />
        <Stat label="Monthly content" value={`${rec.monthlyContentGB} GB`} />
        <Stat label="External WAN" value={`${rec.effectiveExternalGB} GB`} good={rec.effectiveExternalGB < rec.monthlyContentGB / 2} />
        <Stat label="Saved" value={`${rec.monthlySavingsGB} GB`} good />
      </div>
      <ul className="space-y-0.5">
        {rec.reasoning.map((r, i) => (
          <li key={i} className="text-[11px] text-gray-500">• {r}</li>
        ))}
      </ul>
      {rec.deployMCC && (
        <p className="mt-2 text-[11px] text-amber-300 flex items-center gap-1.5">
          <ServerCog size={11} /> Deploy MCC node — ~{rec.mccCacheSizeGB} GB cache
        </p>
      )}
    </div>
  );
}

function SavingsChart({ baseline, doOnly, doPlusMCC }: { baseline: number; doOnly: number; doPlusMCC: number }) {
  const max = Math.max(baseline, 1);
  const pct = (v: number) => Math.max(2, Math.round((v / max) * 100));
  const bars = [
    { label: "Today (no DO, no MCC)", value: baseline, color: "bg-red-500/70", text: "text-red-200" },
    { label: "DO peer-to-peer only", value: doOnly, color: "bg-yellow-500/70", text: "text-yellow-100" },
    { label: "DO + Microsoft Connected Cache", value: doPlusMCC, color: "bg-emerald-500/70", text: "text-emerald-100" },
  ];
  return (
    <div className="space-y-2">
      {bars.map((b) => (
        <div key={b.label} className="space-y-1">
          <div className="flex justify-between text-[11px]">
            <span className="text-gray-400">{b.label}</span>
            <span className={`font-semibold ${b.text}`}>{Math.round(b.value)} GB / month</span>
          </div>
          <div className="w-full h-3 bg-gray-900 rounded">
            <div className={`h-3 rounded ${b.color} transition-all`} style={{ width: `${pct(b.value)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function NetworkTopologyCard({ result }: { result: DOSimulationResult }) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  function downloadSvg(): void {
    const svg = svgRef.current;
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([
      '<?xml version="1.0" encoding="UTF-8"?>\n',
      xml,
    ], { type: "image/svg+xml" });
    triggerDownload(blob, `${slugify(result.name)}-topology.svg`);
  }

  function downloadPng(): void {
    const svg = svgRef.current;
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const scale = 2; // 2x for retina
      const vb = svg.viewBox.baseVal;
      const w = (vb && vb.width) || svg.clientWidth;
      const h = (vb && vb.height) || svg.clientHeight;
      const canvas = document.createElement("canvas");
      canvas.width = w * scale;
      canvas.height = h * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        return;
      }
      ctx.fillStyle = "#0b1220";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (blob) triggerDownload(blob, `${slugify(result.name)}-topology.png`);
        URL.revokeObjectURL(url);
      }, "image/png");
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  }

  return (
    <Card
      title="Network topology — where the Microsoft Connected Cache should live"
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={downloadSvg}
            className="text-[11px] text-brand-400 hover:text-brand-300 flex items-center gap-1"
            title="Download as SVG"
          >
            <Download size={11} /> SVG
          </button>
          <button
            onClick={downloadPng}
            className="text-[11px] text-brand-400 hover:text-brand-300 flex items-center gap-1"
            title="Download as PNG"
          >
            <ImageDown size={11} /> PNG
          </button>
        </div>
      }
    >
      <NetworkTopology result={result} svgRef={svgRef} />
      <details className="mt-3">
        <summary className="text-[11px] text-gray-500 cursor-pointer hover:text-gray-300">View Mermaid source</summary>
        <pre className="mt-2 p-3 bg-gray-950 border border-gray-800 rounded text-[10px] font-mono text-gray-300 overflow-x-auto">
          {result.architectureMermaid}
        </pre>
        <button
          onClick={() => navigator.clipboard.writeText(result.architectureMermaid)}
          className="mt-1 text-[10px] text-brand-400 hover:text-brand-300 flex items-center gap-1"
        >
          <Copy size={10} /> Copy Mermaid
        </button>
      </details>
    </Card>
  );
}

/**
 * Proper network topology diagram:
 *   - Microsoft cloud (M365 / Windows Update / MCC origin) at the top
 *   - Internet boundary line
 *   - One "site" container per row (wraps after 4) with:
 *       - WAN router on top
 *       - Optional MCC server inside the site
 *       - Device cluster with peer arrows when DO peering is enabled
 *   - Color-coded by recommended download mode
 *   - Legend at the bottom
 */
function NetworkTopology({
  result,
  svgRef,
}: {
  result: DOSimulationResult;
  svgRef: React.MutableRefObject<SVGSVGElement | null>;
}) {
  const sites = result.perSite;

  // Layout
  const perRow = Math.min(4, Math.max(1, sites.length));
  const rows = Math.max(1, Math.ceil(sites.length / perRow));
  const siteW = 230;
  const siteH = 220;
  const gap = 24;
  const cloudW = 320;
  const cloudH = 70;
  const topBand = 130;       // cloud + internet line
  const bottomBand = 70;     // legend
  const innerW = perRow * siteW + (perRow - 1) * gap;
  const padX = 40;
  const w = Math.max(innerW + padX * 2, cloudW + 200);
  const h = topBand + rows * (siteH + gap) + bottomBand;
  const cloudX = (w - cloudW) / 2;
  const internetY = topBand - 8;

  // Per-mode color
  function modeColor(mode: number): { fill: string; stroke: string; pill: string } {
    if (mode === 100) return { fill: "#3b1a1a", stroke: "#ef4444", pill: "#7f1d1d" };       // Internet only
    if (mode === 3) return { fill: "#1f2937", stroke: "#9ca3af", pill: "#374151" };          // Group
    if (mode === 1 || mode === 2) return { fill: "#0b3a2c", stroke: "#10b981", pill: "#065f46" }; // LAN
    if (mode === 99) return { fill: "#312e81", stroke: "#818cf8", pill: "#3730a3" };         // Bypass
    return { fill: "#1f2937", stroke: "#6b7280", pill: "#374151" };
  }

  return (
    <div className="overflow-x-auto bg-[#0b1220] rounded-lg border border-gray-800 p-3">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${w} ${h}`}
        xmlns="http://www.w3.org/2000/svg"
        className="w-full"
        style={{ minWidth: 720, maxWidth: "100%" }}
      >
        {/* background */}
        <rect width={w} height={h} fill="#0b1220" />

        {/* Cloud (Microsoft origin) */}
        <g transform={`translate(${cloudX}, 16)`}>
          <rect width={cloudW} height={cloudH} rx="14" fill="#0b3552" stroke="#3b82f6" strokeWidth="1.5" />
          <text x={cloudW / 2} y={26} textAnchor="middle" fill="#dbeafe" fontSize="13" fontWeight="700">
            Microsoft cloud
          </text>
          <text x={cloudW / 2} y={46} textAnchor="middle" fill="#93c5fd" fontSize="10">
            Windows Update · M365 · Intune Win32 · MCC origin
          </text>
          <text x={cloudW / 2} y={60} textAnchor="middle" fill="#60a5fa" fontSize="9">
            tsfe.trafficmanager.net  ·  *.delivery.mp.microsoft.com
          </text>
        </g>

        {/* Internet boundary */}
        <line x1={20} y1={internetY} x2={w - 20} y2={internetY} stroke="#475569" strokeDasharray="6,6" />
        <text x={w - 24} y={internetY - 4} textAnchor="end" fill="#94a3b8" fontSize="10" fontStyle="italic">
          ─ ─ ─  Internet boundary  ─ ─ ─
        </text>

        {/* Sites */}
        {sites.map((rec, i) => {
          const inputSite = result.input.sites.find((s) => s.id === rec.siteId);
          const deviceCount = inputSite?.deviceCount ?? 0;
          const wanMbps = inputSite?.wanBandwidthMbps ?? 0;
          const row = Math.floor(i / perRow);
          const col = i % perRow;
          const colsThisRow = Math.min(perRow, sites.length - row * perRow);
          const rowInnerW = colsThisRow * siteW + (colsThisRow - 1) * gap;
          const xStart = (w - rowInnerW) / 2;
          const x = xStart + col * (siteW + gap);
          const y = topBand + row * (siteH + gap);
          const color = modeColor(rec.downloadMode);
          const peeringEnabled = rec.downloadMode === 1 || rec.downloadMode === 2 || rec.downloadMode === 3;

          // Connection from cloud down to site
          const cloudAnchorX = w / 2;
          const cloudAnchorY = 16 + cloudH;
          const siteTopX = x + siteW / 2;
          const siteTopY = y;
          const midY = (cloudAnchorY + siteTopY) / 2;
          const path = `M ${cloudAnchorX} ${cloudAnchorY} C ${cloudAnchorX} ${midY}, ${siteTopX} ${midY}, ${siteTopX} ${siteTopY}`;

          return (
            <g key={rec.siteId}>
              {/* link from cloud to site */}
              <path d={path} stroke={color.stroke} strokeWidth="1.5" fill="none" opacity="0.65" />
              {/* Mode pill on the link */}
              <g transform={`translate(${siteTopX - 60}, ${siteTopY - 26})`}>
                <rect width="120" height="18" rx="9" fill={color.pill} stroke={color.stroke} />
                <text x="60" y="13" textAnchor="middle" fill="#f9fafb" fontSize="10" fontWeight="600">
                  {truncate(rec.downloadModeName, 22)}
                </text>
              </g>

              {/* Site box */}
              <g transform={`translate(${x}, ${y})`}>
                <rect width={siteW} height={siteH} rx="10" fill={color.fill} stroke={color.stroke} strokeWidth="1.5" />
                {/* Title bar */}
                <rect width={siteW} height="28" rx="10" fill={color.pill} />
                <rect y="20" width={siteW} height="10" fill={color.pill} />
                <text x="12" y="19" fill="#f9fafb" fontSize="12" fontWeight="700">
                  {truncate(rec.siteName, 22)}
                </text>
                <text x={siteW - 12} y="19" textAnchor="end" fill="#e5e7eb" fontSize="10">
                  {deviceCount.toLocaleString()} dev
                </text>

                {/* WAN router */}
                <g transform="translate(12, 40)">
                  <rect width="34" height="22" rx="4" fill="#1f2937" stroke="#9ca3af" />
                  <text x="17" y="15" textAnchor="middle" fill="#e5e7eb" fontSize="9" fontWeight="600">WAN</text>
                </g>
                <text x="50" y="55" fill="#cbd5e1" fontSize="9">
                  {wanMbps} Mbps
                </text>

                {/* MCC server (if recommended) */}
                {rec.deployMCC && (
                  <>
                    <line x1="29" y1="62" x2="29" y2="84" stroke="#facc15" strokeWidth="1.5" />
                    <g transform="translate(12, 84)">
                      <rect width={siteW - 24} height="38" rx="6" fill="#3f2a05" stroke="#facc15" strokeWidth="1.5" />
                      <g transform="translate(8, 8)">
                        <rect width="20" height="22" rx="2" fill="#854d0e" stroke="#facc15" />
                        <line x1="3" y1="6" x2="17" y2="6" stroke="#facc15" />
                        <line x1="3" y1="11" x2="17" y2="11" stroke="#facc15" />
                        <line x1="3" y1="16" x2="17" y2="16" stroke="#facc15" />
                      </g>
                      <text x="36" y="16" fill="#fef3c7" fontSize="10" fontWeight="700">
                        MCC server
                      </text>
                      <text x="36" y="29" fill="#fde68a" fontSize="9">
                        ~{rec.mccCacheSizeGB} GB cache · ~{Math.round(rec.mccHitRate * 100)}% hit
                      </text>
                    </g>
                  </>
                )}

                {/* Devices row */}
                <g transform={`translate(12, ${rec.deployMCC ? 132 : 84})`}>
                  <text x="0" y="0" fill="#cbd5e1" fontSize="9" fontWeight="600">
                    Devices
                  </text>
                  {/* Draw 6 device icons (or fewer if site is tiny) */}
                  {Array.from({ length: Math.min(6, Math.max(2, Math.ceil(deviceCount / 50))) }).map((_, di, arr) => {
                    const dx = di * 32;
                    return (
                      <g key={di} transform={`translate(${dx}, 8)`}>
                        <rect width="22" height="16" rx="2" fill="#0f172a" stroke="#94a3b8" />
                        <rect x="2" y="2" width="18" height="11" fill="#1e293b" />
                        <rect x="6" y="17" width="10" height="2" fill="#94a3b8" />
                        {/* Peer arrows (only when DO peering is enabled and not the last device) */}
                        {peeringEnabled && di < arr.length - 1 && (
                          <path
                            d="M 22 8 L 32 8"
                            stroke={color.stroke}
                            strokeWidth="1.5"
                            markerEnd="url(#arrow)"
                          />
                        )}
                      </g>
                    );
                  })}
                </g>

                {/* Footer caption */}
                <text x="12" y={siteH - 30} fill="#cbd5e1" fontSize="9">
                  Peer hit ~{Math.round(rec.peerHitRate * 100)}%
                </text>
                <text x="12" y={siteH - 16} fill="#cbd5e1" fontSize="9">
                  External WAN: {rec.effectiveExternalGB} GB/mo
                </text>
                <text x={siteW - 12} y={siteH - 16} textAnchor="end" fill="#34d399" fontSize="9" fontWeight="600">
                  saved {rec.monthlySavingsGB} GB
                </text>
              </g>
            </g>
          );
        })}

        {/* Arrow marker for peer links */}
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
          </marker>
        </defs>

        {/* Legend */}
        <g transform={`translate(${(w - 600) / 2}, ${h - 50})`}>
          <LegendDot x={0}   color="#10b981" label="LAN peers (modes 1/2)" />
          <LegendDot x={170} color="#9ca3af" label="Group peers (mode 3)" />
          <LegendDot x={320} color="#ef4444" label="Internet only (mode 100)" />
          <LegendDot x={490} color="#facc15" label="MCC server" square />
        </g>
      </svg>
    </div>
  );
}

function LegendDot({ x, color, label, square }: { x: number; color: string; label: string; square?: boolean }) {
  return (
    <g transform={`translate(${x}, 0)`}>
      {square ? (
        <rect width="12" height="12" rx="2" fill={color} opacity="0.85" />
      ) : (
        <circle cx="6" cy="6" r="6" fill={color} opacity="0.85" />
      )}
      <text x="18" y="10" fill="#e5e7eb" fontSize="10">{label}</text>
    </g>
  );
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "simulation";
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Tiny UI primitives ─────────────────────────────────────────

const inputCls =
  "w-full px-2 py-1 bg-gray-900 border border-gray-700 rounded text-xs text-gray-200 focus:border-brand-500 focus:outline-none";

function Card({ title, children, actions }: { title: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">{title}</h3>
        {actions}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-[11px] text-gray-400">
      <span className="block mb-0.5">{label}</span>
      {children}
    </label>
  );
}

function NumInput({
  value, onChange, step = 1, className = "",
}: { value: number; onChange: (v: number) => void; step?: number; className?: string }) {
  return (
    <input
      type="number"
      step={step}
      value={Number.isFinite(value) ? value : 0}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      className={`${inputCls} ${className}`}
    />
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`p-3 rounded-lg border ${accent ? "bg-brand-600/10 border-brand-600/40" : "bg-gray-900 border-gray-800"}`}>
      <p className="text-[10px] uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`text-xl font-bold ${accent ? "text-brand-400" : "text-white"} mt-1`}>{value}</p>
    </div>
  );
}

function Stat({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div>
      <p className="text-[10px] text-gray-500">{label}</p>
      <p className={`text-xs font-semibold ${good ? "text-emerald-400" : "text-gray-200"}`}>{value}</p>
    </div>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function downloadJson(filename: string, obj: unknown): void {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
