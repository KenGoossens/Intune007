import { useState, useEffect, useCallback } from "react";
import {
  Loader2, Monitor, Shield, Cpu, HardDrive, Wifi, Battery, User,
  Clock, CheckCircle2, XCircle, AlertTriangle, Info, Lock, Unlock,
  Smartphone, Server, Search, RefreshCw, Fingerprint, Globe,
  MemoryStick, ChevronDown, ChevronRight, Wrench, Zap, RotateCcw, Plane,
} from "lucide-react";
import { useNavigationStore } from "../stores/navigationStore.ts";

interface DeviceCard {
  identity: Record<string, unknown>;
  user: Record<string, unknown>;
  hardware: { manufacturer: string; model: string; chassisType: string; deviceType: string; processorArchitecture: string; ramGB: number | null; storage: { totalGB: number | null; freeGB: number | null; usedGB: number | null; freePercent: number | null }; productName: string; osEdition: string };
  os: Record<string, unknown>;
  network: Record<string, unknown>;
  security: { isEncrypted: boolean | null; jailBroken: string; activeMalware: number; remediatedMalware: number; threatState: string; tpmVersion: string; secureBoot: string; bitLockerStatus: string; securedCorePC: string; dfciManaged: boolean };
  battery: { levelPercent: number | null; healthPercent: number | null; chargeCycles: number | null };
  enrollment: { enrolledDateTime: string; lastSyncDateTime: string; syncAgeHours: number | null; enrollmentType: string; autopilotEnrolled: boolean; joinType: string; managementAgent: string; ownership: string; certExpiration: string; enrollmentProfileName: string; registrationState: string };
  compliance: { state: string; gracePeriodExpiration: string | null };
  stats: { detectedApps: number; configProfiles: { compliant: number; conflict: number; error: number; total: number } };
}

function StatusBadge({ value, good, warn }: { value: string | boolean | null | undefined; good?: string[]; warn?: string[] }) {
  const str = String(value ?? "unknown").toLowerCase();
  const isGood = value === true || (good && good.some(g => str.includes(g)));
  const isWarn = value === false || (warn && warn.some(w => str.includes(w)));
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${isGood ? "bg-green-500/15 text-green-400" : isWarn ? "bg-red-500/15 text-red-400" : "bg-gray-700/50 text-gray-400"}`}>
      {isGood ? <CheckCircle2 size={10} /> : isWarn ? <XCircle size={10} /> : <Info size={10} />}
      {String(value ?? "Unknown")}
    </span>
  );
}

function StorageBar({ total, used, free }: { total: number | null; used: number | null; free: number | null }) {
  if (!total || !used) return <span className="text-xs text-gray-500">N/A</span>;
  const pct = Math.round((used / total) * 100);
  return (
    <div>
      <div className="flex justify-between text-[10px] text-gray-500 mb-1">
        <span>{used} GB used</span><span>{free} GB free of {total} GB</span>
      </div>
      <div className="h-2 rounded-full bg-gray-700 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${pct > 90 ? "bg-red-500" : pct > 70 ? "bg-yellow-500" : "bg-brand-500"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function BatteryIndicator({ level, health, cycles }: { level: number | null; health: number | null; cycles: number | null }) {
  // Battery data from Graph API is a stale snapshot from last check-in — often inaccurate.
  // Only show if we have charge cycles (indicates the device genuinely reported battery data).
  const hasCycles = cycles != null && cycles > 0;
  if (!hasCycles) return null;

  const hasLevel = level != null && level > 0;
  const hasHealth = health != null && health > 0;

  return (
    <div className="flex items-center gap-3">
      {hasLevel && (
        <div className="flex items-center gap-1.5">
          <Battery size={16} className={level! > 50 ? "text-green-400" : level! > 20 ? "text-yellow-400" : "text-red-400"} />
          <span className="text-sm font-bold text-white">{level}%</span>
          <span className="text-[9px] text-gray-600">(last check-in)</span>
        </div>
      )}
      {hasHealth && <span className="text-[10px] text-gray-500">Health: {health}%</span>}
      <span className="text-[10px] text-gray-500">{cycles} cycles</span>
    </div>
  );
}

function InfoRow({ label, value, icon }: { label: string; value: unknown; icon?: React.ReactNode }) {
  if (value === null || value === undefined || value === "" || value === "unknown" || value === "Unknown") return null;
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-gray-700/20 last:border-0">
      <span className="text-[11px] text-gray-500 flex items-center gap-1.5">{icon}{label}</span>
      <span className="text-[11px] text-gray-200 font-medium text-right max-w-[60%] truncate">{String(value)}</span>
    </div>
  );
}

/** Quick action buttons for the device card hero section */
function DeviceActions({ deviceId, deviceName, autopilotEnrolled, serialNumber }: {
  deviceId: string; deviceName: string; autopilotEnrolled: boolean; serialNumber: string;
}) {
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<{ action: string; ok: boolean; msg: string } | null>(null);
  const navigateTo = useNavigationStore((s) => s.navigateTo);

  const callAgent = async (action: string, prompt: string) => {
    setActionLoading(action);
    setActionResult(null);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt, history: [] }),
      });
      const data = await res.json();
      setActionResult({ action, ok: !data.error, msg: (data.response || "Done").substring(0, 200) });
    } catch {
      setActionResult({ action, ok: false, msg: "Request failed" });
    } finally {
      setActionLoading(null);
    }
  };

  const prepareAutopilot = async () => {
    setActionLoading("autopilot");
    setActionResult(null);
    try {
      const res = await fetch("/api/autopilot-readiness/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serialNumber, deviceName }),
      });
      const data = await res.json();
      const score = data.readinessScore ?? 0;
      const checks = (data.checks || []) as Array<{ step: string; status: string; detail: string }>;
      const failedChecks = checks.filter((c) => c.status === "fail");

      if (score >= 80 && failedChecks.length === 0) {
        setActionResult({ action: "autopilot", ok: true, msg: `Autopilot ready! Score: ${score}%. All checks passed.` });
      } else {
        const remRes = await fetch("/api/autopilot-readiness/remediate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ serialNumber }),
        });
        const remData = await remRes.json();
        const fixed = (remData.steps || []).filter((s: { status: string }) => s.status === "fixed").length;
        const manual = (remData.steps || []).filter((s: { status: string }) => s.status === "manual_required").length;

        if (fixed > 0 && manual === 0) {
          setActionResult({ action: "autopilot", ok: true, msg: `Autopilot prepared! ${fixed} issue(s) fixed. Score: ${remData.postCheckScore ?? score}%` });
        } else if (fixed > 0) {
          setActionResult({ action: "autopilot", ok: true, msg: `${fixed} fixed, ${manual} need manual action. Check Autopilot Readiness for details.` });
        } else if (!remData.deviceFound) {
          setActionResult({ action: "autopilot", ok: false, msg: "Device not registered in Autopilot. Use the agent to deploy a hash collector first." });
        } else {
          setActionResult({ action: "autopilot", ok: false, msg: `${manual} issue(s) need manual action. ${(remData.summary || "").substring(0, 100)}` });
        }
      }
    } catch {
      setActionResult({ action: "autopilot", ok: false, msg: "Autopilot check failed" });
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-1.5">
        <button onClick={() => callAgent("sync", `sync device ${deviceName}`)} disabled={!!actionLoading}
          className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-medium rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-colors disabled:opacity-50">
          {actionLoading === "sync" ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />} Sync
        </button>
        <button onClick={() => callAgent("restart", `restart device ${deviceName}`)} disabled={!!actionLoading}
          className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-medium rounded-lg bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 hover:bg-yellow-500/20 transition-colors disabled:opacity-50">
          {actionLoading === "restart" ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />} Restart
        </button>
        <button onClick={() => navigateTo("troubleshooter", { deviceName })}
          className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-medium rounded-lg bg-orange-500/10 text-orange-400 border border-orange-500/20 hover:bg-orange-500/20 transition-colors">
          <Wrench size={11} /> Troubleshoot
        </button>
        <button onClick={() => navigateTo("timeline", { deviceName })}
          className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-medium rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20 hover:bg-sky-500/20 transition-colors">
          <Clock size={11} /> Timeline
        </button>
        <button onClick={prepareAutopilot} disabled={!!actionLoading}
          className={`flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-medium rounded-lg border transition-colors disabled:opacity-50 ${
            autopilotEnrolled ? "bg-green-500/10 text-green-400 border-green-500/20 hover:bg-green-500/20" : "bg-purple-500/10 text-purple-400 border-purple-500/20 hover:bg-purple-500/20"
          }`}>
          {actionLoading === "autopilot" ? <Loader2 size={11} className="animate-spin" /> : <Plane size={11} />}
          {autopilotEnrolled ? "Autopilot ✓" : "Prepare Autopilot"}
        </button>
      </div>
      {actionResult && (
        <div className={`mt-2 px-3 py-1.5 rounded-lg text-[10px] ${actionResult.ok ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"}`}>
          {actionResult.msg}
        </div>
      )}
    </div>
  );
}

function Section({ title, icon, children, defaultOpen = true }: { title: string; icon: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-700/40 rounded-xl overflow-hidden mb-3">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 px-4 py-2.5 bg-gray-800/40 hover:bg-gray-800/60 transition-colors text-left">
        <span className="text-brand-400">{icon}</span>
        <span className="text-xs font-semibold text-gray-200 flex-1">{title}</span>
        <span className="text-gray-600">{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</span>
      </button>
      {open && <div className="px-4 py-2">{children}</div>}
    </div>
  );
}

// Drill-down data types
interface DetectedApp { displayName: string; version: string; sizeInByte?: number; }
interface ProfileState { displayName: string; state: string; platformType?: string; settingCount?: number; version?: number; }
interface ComplianceState { displayName: string; state: string; }

export default function DeviceCardPanel() {
  const [deviceName, setDeviceName] = useState("");
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [card, setCard] = useState<DeviceCard | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Drill-down states
  const [showApps, setShowApps] = useState(false);
  const [apps, setApps] = useState<DetectedApp[] | null>(null);
  const [appsLoading, setAppsLoading] = useState(false);
  const [showProfiles, setShowProfiles] = useState(false);
  const [profiles, setProfiles] = useState<ProfileState[] | null>(null);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [showCompliance, setShowCompliance] = useState(false);
  const [complianceDetails, setComplianceDetails] = useState<ComplianceState[] | null>(null);
  const [complianceLoading, setComplianceLoading] = useState(false);
  const [appFilter, setAppFilter] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { deviceCardTarget, clearDeviceCardTarget } = useNavigationStore();

  // Auto-search when navigated from another panel
  useEffect(() => {
    if (deviceCardTarget) {
      setDeviceName(deviceCardTarget);
      clearDeviceCardTarget();
    }
  }, [deviceCardTarget, clearDeviceCardTarget]);

  // Trigger search when deviceName changes from navigation
  useEffect(() => {
    if (deviceName && !card && !isLoading) {
      searchDevice();
    }
  }, [deviceName]); // eslint-disable-line react-hooks/exhaustive-deps

  const searchDevice = useCallback(async () => {
    if (!deviceName.trim()) return;
    setIsLoading(true); setError(null); setCard(null); setDeviceId(null);
    // Reset drill-downs
    setShowApps(false); setApps(null); setShowProfiles(false); setProfiles(null);
    setShowCompliance(false); setComplianceDetails(null); setAppFilter("");
    try {
      const searchRes = await fetch(`/api/device-card/search/${encodeURIComponent(deviceName.trim())}`);
      if (!searchRes.ok && searchRes.status === 404) { setError("Device not found"); return; }
      const data = await searchRes.json();
      if (data.error) throw new Error(data.error);
      setCard(data);
      setDeviceId(data.deviceId || null);
    } catch {
      try {
        const res = await fetch(`/api/device-card/${deviceName.trim()}`);
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setCard(data);
        setDeviceId(data.deviceId || deviceName.trim());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Device not found");
      }
    } finally { setIsLoading(false); }
  }, [deviceName]);

  const loadApps = async () => {
    if (!deviceId || appsLoading) return;
    setShowApps(!showApps);
    if (apps) return; // already loaded
    setAppsLoading(true);
    try {
      const res = await fetch(`/api/device-card/${deviceId}/apps`);
      const data = await res.json();
      setApps(data.items || []);
    } catch { setApps([]); }
    finally { setAppsLoading(false); }
  };

  const loadProfiles = async () => {
    if (!deviceId || profilesLoading) return;
    setShowProfiles(!showProfiles);
    if (profiles) return;
    setProfilesLoading(true);
    try {
      const res = await fetch(`/api/device-card/${deviceId}/profiles`);
      const data = await res.json();
      setProfiles(data.items || []);
    } catch { setProfiles([]); }
    finally { setProfilesLoading(false); }
  };

  const loadCompliance = async () => {
    if (!deviceId || complianceLoading) return;
    setShowCompliance(!showCompliance);
    if (complianceDetails) return;
    setComplianceLoading(true);
    try {
      const res = await fetch(`/api/device-card/${deviceId}/compliance`);
      const data = await res.json();
      setComplianceDetails(data.items || []);
    } catch { setComplianceDetails([]); }
    finally { setComplianceLoading(false); }
  };

  const formatDate = (d: unknown) => d ? new Date(String(d)).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
  const formatSyncAge = (hours: number | null) => {
    if (hours == null) return "Unknown";
    if (hours < 1) return "Just now";
    if (hours < 24) return `${hours}h ago`;
    return `${Math.round(hours / 24)}d ago`;
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-800">
        <Monitor size={16} className="text-brand-400" />
        <h2 className="text-sm font-semibold text-gray-200">Device Card</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Search */}
        <div className="px-5 py-4 border-b border-gray-800">
          <div className="flex gap-2">
            <input value={deviceName} onChange={(e) => setDeviceName(e.target.value)} placeholder="Enter device name or ID"
              className="flex-1 bg-gray-800 text-white text-sm rounded-lg px-3 py-2 border border-gray-700 focus:border-brand-500 focus:outline-none placeholder-gray-500"
              onKeyDown={(e) => e.key === "Enter" && searchDevice()} />
            <button onClick={searchDevice} disabled={!deviceName.trim() || isLoading}
              className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm px-4 py-2 rounded-lg transition-colors">
              {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            </button>
          </div>
        </div>

        {error && <div className="mx-5 mt-4 text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">{error}</div>}

        {!card && !isLoading && !error && (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500">
            <Monitor size={48} className="mb-4 text-gray-600" />
            <h3 className="text-lg font-medium text-gray-400 mb-2">Device Information Card</h3>
            <p className="text-sm text-center max-w-sm">Search for a device to view comprehensive hardware, security, compliance, and enrollment details.</p>
          </div>
        )}

        {card && (
          <div className="px-5 py-4">
            {/* Hero header */}
            <div className="bg-gradient-to-r from-brand-600/10 to-gray-800/30 border border-brand-500/20 rounded-xl p-5 mb-4">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 bg-brand-600/20 rounded-xl flex items-center justify-center shrink-0">
                  {card.hardware.chassisType === "laptop" ? <Monitor size={24} className="text-brand-400" /> :
                   card.hardware.chassisType === "phone" || card.hardware.chassisType === "tablet" ? <Smartphone size={24} className="text-brand-400" /> :
                   card.hardware.chassisType === "desktop" ? <Server size={24} className="text-brand-400" /> :
                   <Monitor size={24} className="text-brand-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-bold text-white">{String(card.identity.deviceName)}</h3>
                  <p className="text-sm text-gray-400">{card.hardware.manufacturer} {card.hardware.model}</p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <StatusBadge value={card.compliance.state} good={["compliant"]} warn={["noncompliant", "error", "conflict"]} />
                    <StatusBadge value={card.security.isEncrypted ? "Encrypted" : card.security.isEncrypted === false ? "Not Encrypted" : "Unknown"} good={["encrypted"]} warn={["not encrypted"]} />
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/15 text-blue-400">
                      <Clock size={10} /> {formatSyncAge(card.enrollment.syncAgeHours)}
                    </span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-gray-500">{card.os.operatingSystem as string}</p>
                  <p className="text-sm font-mono text-gray-300">{card.os.osVersion as string}</p>
                  {card.hardware.processorArchitecture && <p className="text-[10px] text-gray-600 mt-1">{card.hardware.processorArchitecture}</p>}
                </div>
              </div>

              {/* Quick action bar */}
              <DeviceActions deviceId={String(card.identity.id)} deviceName={String(card.identity.deviceName)} autopilotEnrolled={card.enrollment.autopilotEnrolled} serialNumber={String(card.identity.serialNumber || "")} />

              {/* Quick stats row — clickable */}
              <div className="grid grid-cols-4 gap-3 mt-4">
                <button onClick={loadApps} className="bg-gray-800/50 hover:bg-gray-800/80 rounded-lg p-2 text-center transition-colors cursor-pointer group">
                  <p className="text-lg font-bold text-white group-hover:text-brand-400">{card.stats.detectedApps}</p>
                  <p className="text-[9px] text-gray-500 group-hover:text-gray-300">Apps ▾</p>
                </button>
                <button onClick={loadProfiles} className="bg-gray-800/50 hover:bg-gray-800/80 rounded-lg p-2 text-center transition-colors cursor-pointer group">
                  <p className="text-lg font-bold text-white group-hover:text-brand-400">{card.stats.configProfiles.total}</p>
                  <p className="text-[9px] text-gray-500 group-hover:text-gray-300">Profiles ▾</p>
                </button>
                <button onClick={loadCompliance} className="bg-gray-800/50 hover:bg-gray-800/80 rounded-lg p-2 text-center transition-colors cursor-pointer group">
                  <p className={`text-lg font-bold ${card.compliance.state === "compliant" ? "text-green-400" : "text-red-400"}`}>{card.compliance.state === "compliant" ? "✓" : "✗"}</p>
                  <p className="text-[9px] text-gray-500 group-hover:text-gray-300">Compliance ▾</p>
                </button>
                <div className="bg-gray-800/50 rounded-lg p-2 text-center">
                  <p className="text-lg font-bold text-white">{card.hardware.ramGB ? `${card.hardware.ramGB}` : "—"}</p>
                  <p className="text-[9px] text-gray-500">RAM (GB)</p>
                </div>
              </div>

              {/* Battery + Config Profile summary — inline in hero card */}
              <div className="flex items-center gap-4 mt-3 flex-wrap">
                <BatteryIndicator level={card.battery.levelPercent} health={card.battery.healthPercent} cycles={card.battery.chargeCycles} />
                {card.stats.configProfiles.total > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-500">Profiles:</span>
                    {card.stats.configProfiles.compliant > 0 && <span className="text-[10px] text-green-400">✓ {card.stats.configProfiles.compliant}</span>}
                    {card.stats.configProfiles.conflict > 0 && <span className="text-[10px] text-red-400">⚠ {card.stats.configProfiles.conflict}</span>}
                    {card.stats.configProfiles.error > 0 && <span className="text-[10px] text-yellow-400">✕ {card.stats.configProfiles.error}</span>}
                  </div>
                )}
                {card.hardware.storage.totalGB && (
                  <div className="flex items-center gap-1.5">
                    <HardDrive size={11} className="text-gray-500" />
                    <span className="text-[10px] text-gray-400">{card.hardware.storage.freeGB}GB free / {card.hardware.storage.totalGB}GB</span>
                  </div>
                )}
                {card.enrollment.ownership && (
                  <span className="text-[10px] text-gray-500">{card.enrollment.ownership}</span>
                )}
              </div>

              {/* Drill-down: Detected Apps */}
              {showApps && (
                <div className="mt-3 bg-gray-800/30 border border-gray-700/40 rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700/30">
                    <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Detected Apps ({apps?.length ?? "..."})</p>
                    {apps && apps.length > 10 && (
                      <input value={appFilter} onChange={(e) => setAppFilter(e.target.value)} placeholder="Filter apps..."
                        className="bg-gray-800 text-gray-300 text-[10px] rounded px-2 py-1 border border-gray-700 focus:border-brand-500 focus:outline-none w-32" />
                    )}
                  </div>
                  {appsLoading ? (
                    <div className="flex items-center justify-center py-4"><Loader2 size={14} className="animate-spin text-gray-500" /></div>
                  ) : apps && apps.length > 0 ? (
                    <div className="max-h-64 overflow-y-auto divide-y divide-gray-700/20">
                      {apps.filter((a) => !appFilter || a.displayName.toLowerCase().includes(appFilter.toLowerCase())).map((app, i) => (
                        <div key={i} className="flex items-center justify-between px-3 py-1.5 hover:bg-gray-800/40">
                          <span className="text-[11px] text-gray-300 truncate flex-1">{app.displayName}</span>
                          <span className="text-[10px] text-gray-500 font-mono ml-2">{app.version || "—"}</span>
                          {app.sizeInByte ? <span className="text-[10px] text-gray-600 ml-2">{Math.round((app.sizeInByte as number) / 1048576)}MB</span> : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-gray-500 px-3 py-3">No detected apps</p>
                  )}
                </div>
              )}

              {/* Drill-down: Config Profiles */}
              {showProfiles && (
                <div className="mt-3 bg-gray-800/30 border border-gray-700/40 rounded-lg overflow-hidden">
                  <div className="px-3 py-2 border-b border-gray-700/30">
                    <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Configuration Profiles ({profiles?.length ?? "..."})</p>
                  </div>
                  {profilesLoading ? (
                    <div className="flex items-center justify-center py-4"><Loader2 size={14} className="animate-spin text-gray-500" /></div>
                  ) : profiles && profiles.length > 0 ? (
                    <div className="max-h-48 overflow-y-auto divide-y divide-gray-700/20">
                      {profiles.map((p, i) => (
                        <div key={i} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-800/40">
                          {String(p.state).toLowerCase() === "compliant" ? <CheckCircle2 size={12} className="text-green-400 shrink-0" /> :
                           String(p.state).toLowerCase() === "conflict" ? <XCircle size={12} className="text-red-400 shrink-0" /> :
                           String(p.state).toLowerCase() === "error" ? <AlertTriangle size={12} className="text-yellow-400 shrink-0" /> :
                           <Info size={12} className="text-gray-500 shrink-0" />}
                          <span className="text-[11px] text-gray-300 truncate flex-1">{p.displayName || "Unknown profile"}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${String(p.state).toLowerCase() === "compliant" ? "bg-green-500/15 text-green-400" : String(p.state).toLowerCase() === "conflict" ? "bg-red-500/15 text-red-400" : "bg-gray-700 text-gray-400"}`}>{p.state}</span>
                          {p.settingCount != null && <span className="text-[10px] text-gray-600">{p.settingCount} settings</span>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-gray-500 px-3 py-3">No configuration profiles assigned</p>
                  )}
                </div>
              )}

              {/* Drill-down: Compliance Policies */}
              {showCompliance && (
                <div className="mt-3 bg-gray-800/30 border border-gray-700/40 rounded-lg overflow-hidden">
                  <div className="px-3 py-2 border-b border-gray-700/30">
                    <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Compliance Policies ({complianceDetails?.length ?? "..."})</p>
                  </div>
                  {complianceLoading ? (
                    <div className="flex items-center justify-center py-4"><Loader2 size={14} className="animate-spin text-gray-500" /></div>
                  ) : complianceDetails && complianceDetails.length > 0 ? (
                    <div className="max-h-48 overflow-y-auto divide-y divide-gray-700/20">
                      {complianceDetails.map((c, i) => (
                        <div key={i} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-800/40">
                          {String(c.state).toLowerCase() === "compliant" ? <CheckCircle2 size={12} className="text-green-400 shrink-0" /> :
                           String(c.state).toLowerCase() === "noncompliant" ? <XCircle size={12} className="text-red-400 shrink-0" /> :
                           <Info size={12} className="text-gray-500 shrink-0" />}
                          <span className="text-[11px] text-gray-300 truncate flex-1">{c.displayName || "Unknown policy"}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${String(c.state).toLowerCase() === "compliant" ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"}`}>{c.state}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-gray-500 px-3 py-3">No compliance policy states found</p>
                  )}
                </div>
              )}
            </div>

            {/* User info bar */}
            <div className="flex items-center gap-3 bg-gray-800/30 border border-gray-700/40 rounded-lg px-4 py-2.5 mb-4">
              <User size={14} className="text-gray-500" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-200">{card.user.displayName as string || card.user.userPrincipalName as string || "No user"}</p>
                <p className="text-[10px] text-gray-500">{card.user.emailAddress as string || card.user.userPrincipalName as string}</p>
              </div>
              <span className="text-[10px] text-gray-600 px-2 py-0.5 rounded bg-gray-800">{card.enrollment.ownership}</span>
            </div>

            {/* Sections */}
            <Section title="Hardware & Storage" icon={<Cpu size={14} />}>
              <InfoRow label="Manufacturer" value={card.hardware.manufacturer} />
              <InfoRow label="Model" value={card.hardware.model} />
              <InfoRow label="Product Name" value={card.hardware.productName} />
              <InfoRow label="Chassis" value={card.hardware.chassisType} />
              <InfoRow label="Architecture" value={card.hardware.processorArchitecture} />
              <InfoRow label="RAM" value={card.hardware.ramGB ? `${card.hardware.ramGB} GB` : null} icon={<MemoryStick size={10} />} />
              <InfoRow label="OS Edition" value={card.hardware.osEdition} />
              <div className="mt-2">
                <StorageBar total={card.hardware.storage.totalGB} used={card.hardware.storage.usedGB} free={card.hardware.storage.freeGB} />
              </div>
            </Section>

            <Section title="Security" icon={<Shield size={14} />}>
              <InfoRow label="Encryption" value={card.security.isEncrypted ? "Encrypted" : card.security.isEncrypted === false ? "Not Encrypted" : "Unknown"} icon={card.security.isEncrypted ? <Lock size={10} /> : <Unlock size={10} />} />
              <InfoRow label="BitLocker" value={card.security.bitLockerStatus} />
              <InfoRow label="Secure Boot" value={card.security.secureBoot} />
              <InfoRow label="Secured-Core PC" value={card.security.securedCorePC} />
              <InfoRow label="TPM" value={card.security.tpmVersion} />
              <InfoRow label="DFCI Managed" value={card.security.dfciManaged ? "Yes" : "No"} />
              <InfoRow label="Active Malware" value={card.security.activeMalware > 0 ? card.security.activeMalware : null} />
              <InfoRow label="Remediated Malware" value={card.security.remediatedMalware > 0 ? card.security.remediatedMalware : null} />
              <InfoRow label="Threat State" value={card.security.threatState} />
              <InfoRow label="Jailbroken" value={card.security.jailBroken !== "" ? card.security.jailBroken : null} />
            </Section>

            <Section title="Network" icon={<Wifi size={14} />} defaultOpen={false}>
              <InfoRow label="WiFi MAC" value={card.network.wiFiMacAddress as string} icon={<Wifi size={10} />} />
              <InfoRow label="Ethernet MAC" value={card.network.ethernetMacAddress as string} icon={<Globe size={10} />} />
              <InfoRow label="IP Address" value={card.network.ipAddress as string} />
              <InfoRow label="Subnet" value={card.network.subnetAddress as string} />
              <InfoRow label="Phone" value={card.network.phoneNumber as string} />
              <InfoRow label="Carrier" value={card.network.subscriberCarrier as string} />
            </Section>

            <Section title="Enrollment & Management" icon={<Fingerprint size={14} />} defaultOpen={false}>
              <InfoRow label="Enrolled" value={formatDate(card.enrollment.enrolledDateTime)} />
              <InfoRow label="Last Sync" value={formatDate(card.enrollment.lastSyncDateTime)} />
              <InfoRow label="Enrollment Type" value={card.enrollment.enrollmentType} />
              <InfoRow label="Enrollment Profile" value={card.enrollment.enrollmentProfileName} />
              <InfoRow label="Autopilot" value={card.enrollment.autopilotEnrolled ? "Yes" : "No"} />
              <InfoRow label="Join Type" value={card.enrollment.joinType} />
              <InfoRow label="Management Agent" value={card.enrollment.managementAgent} />
              <InfoRow label="Registration State" value={card.enrollment.registrationState} />
              <InfoRow label="Cert Expiry" value={formatDate(card.enrollment.certExpiration)} />
            </Section>

            <Section title="Identity" icon={<Monitor size={14} />} defaultOpen={false}>
              <InfoRow label="Device Name" value={card.identity.deviceName as string} />
              <InfoRow label="Serial Number" value={card.identity.serialNumber as string} />
              <InfoRow label="Azure AD Device ID" value={card.identity.azureADDeviceId as string} />
              <InfoRow label="IMEI" value={card.identity.imei as string} />
              <InfoRow label="MEID" value={card.identity.meid as string} />
              <InfoRow label="Category" value={card.identity.deviceCategory as string} />
              {Boolean(card.identity.notes) && <div className="mt-2 bg-gray-800/30 rounded p-2"><p className="text-[10px] text-gray-500 mb-0.5">Notes</p><p className="text-xs text-gray-300">{String(card.identity.notes)}</p></div>}
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}
