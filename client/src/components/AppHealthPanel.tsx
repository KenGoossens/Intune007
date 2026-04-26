import { useEffect, useState, useCallback } from "react";
import { Loader2, AppWindow, RefreshCw, CheckCircle2, XCircle, AlertTriangle, ChevronDown, ChevronRight, Monitor, Trash2, ImagePlus, Wrench, Search, Minus } from "lucide-react";
import DeviceLink from "./DeviceLink.tsx";
import { TroubleshootDrillLink } from "./DrillLinks.tsx";

interface AppDeviceInfo { deviceName: string; version: string; }
interface AppHealthItem { appId: string; displayName: string; publisher: string; appType?: string; iconBase64?: string | null; iconType?: string; detectedOnDevices: number; totalDevices: number; deploymentRate: number; devices?: AppDeviceInfo[]; }
interface AppHealthData { generatedAt: string; totalManagedApps: number; totalDevices: number; totalDetectedApps: number; appsDetectedOnDevices: number; apps: AppHealthItem[]; }

export default function AppHealthPanel() {
  const [data, setData] = useState<AppHealthData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedApp, setExpandedApp] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "detected" | "undetected">("all");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ id: string; text: string; ok: boolean } | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try { const res = await fetch("/api/app-health"); setData(await res.json()); }
    catch { /* ignore */ } finally { setIsLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDelete = async (appId: string, appName: string) => {
    setActionLoading(appId);
    setDeleteConfirm(null);
    try {
      const res = await fetch(`/api/app-health/${appId}`, { method: "DELETE" });
      const result = await res.json();
      if (result.success) {
        setActionMessage({ id: appId, text: `"${appName}" removed from Intune.`, ok: true });
        // Refresh after short delay
        setTimeout(() => { fetchData(); setActionMessage(null); }, 1500);
      } else {
        setActionMessage({ id: appId, text: result.summary || "Removal failed.", ok: false });
      }
    } catch {
      setActionMessage({ id: appId, text: "Network error during removal.", ok: false });
    } finally {
      setActionLoading(null);
    }
  };

  const [iconSteps, setIconSteps] = useState<Array<{ step: string; status: string; detail: string }>>([]);
  const [iconFixTarget, setIconFixTarget] = useState<string | null>(null);

  const handleFixIcon = async (appId: string, appName: string, publisher?: string, force?: boolean) => {
    setActionLoading(appId);
    setIconFixTarget(appId);
    setIconSteps([]);
    setExpandedApp(appId);

    try {
      const res = await fetch("/api/app-health/fix-icon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId, appName, publisher, force: !!force }),
      });

      if (!res.ok || !res.body) {
        setActionMessage({ id: appId, text: "Request failed.", ok: false });
        return;
      }

      // Read SSE stream
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        for (const eventBlock of events) {
          const lines = eventBlock.trim().split("\n");
          let eventType = "";
          let data = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) eventType = line.slice(7);
            else if (line.startsWith("data: ")) data = line.slice(6);
          }
          if (!eventType || !data) continue;
          try {
            const parsed = JSON.parse(data);
            if (eventType === "step") {
              setIconSteps((prev) => {
                const idx = prev.findIndex((s) => s.step === parsed.step);
                if (idx >= 0) {
                  const updated = [...prev];
                  updated[idx] = parsed;
                  return updated;
                }
                return [...prev, parsed];
              });
            } else if (eventType === "done") {
              setActionMessage({ id: appId, text: parsed.message, ok: parsed.success });
              if (parsed.success) setTimeout(fetchData, 1500);
            }
          } catch { /* skip */ }
        }
      }
    } catch {
      setActionMessage({ id: appId, text: "Network error.", ok: false });
    } finally {
      setActionLoading(null);
      setTimeout(() => setIconFixTarget(null), 5000);
    }
  };

  if (isLoading && !data) return <div className="flex items-center justify-center h-full"><Loader2 size={24} className="animate-spin text-gray-500" /></div>;
  if (!data) return null;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <AppWindow size={16} className="text-brand-400" />
          <h2 className="text-sm font-semibold text-gray-200">App Deployment Health</h2>
        </div>
        <button onClick={fetchData} disabled={isLoading} className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors">
          {isLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Refresh
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-3 gap-3 px-5 py-4">
          <button onClick={() => setFilter("all")} className={`border rounded-lg p-3 text-center transition-all ${filter === "all" ? "bg-gray-700/50 border-brand-500/40 ring-1 ring-brand-500/30" : "bg-gray-800/50 border-gray-700/50 hover:border-gray-600"}`}>
            <p className="text-xl font-bold text-white">{data.totalManagedApps}</p><p className="text-[10px] text-gray-500">All Apps</p>
          </button>
          <button onClick={() => setFilter("detected")} className={`border rounded-lg p-3 text-center transition-all ${filter === "detected" ? "bg-green-500/10 border-green-500/40 ring-1 ring-green-500/30" : "bg-green-500/5 border-green-500/20 hover:border-green-500/40"}`}>
            <p className="text-xl font-bold text-green-400">{data.appsDetectedOnDevices}</p><p className="text-[10px] text-gray-500">Detected</p>
          </button>
          <button onClick={() => setFilter("undetected")} className={`border rounded-lg p-3 text-center transition-all ${filter === "undetected" ? "bg-red-500/10 border-red-500/40 ring-1 ring-red-500/30" : "bg-gray-800/50 border-gray-700/50 hover:border-gray-600"}`}>
            <p className="text-xl font-bold text-gray-400">{data.totalManagedApps - data.appsDetectedOnDevices}</p><p className="text-[10px] text-gray-500">Not Detected</p>
          </button>
        </div>
        <div className="px-5 pb-4 space-y-1.5">
          {data.apps
            .filter((app) => {
              if (filter === "detected") return app.detectedOnDevices > 0;
              if (filter === "undetected") return app.detectedOnDevices === 0;
              return true;
            })
            .map((app) => {
            const isDetected = app.detectedOnDevices > 0;
            const isExpanded = expandedApp === app.appId;
            const isDeleting = actionLoading === app.appId;
            const msg = actionMessage?.id === app.appId ? actionMessage : null;
            return (
            <div key={app.appId} className={`rounded-lg bg-gray-800/30 border overflow-hidden transition-all ${deleteConfirm === app.appId ? "border-red-500/50" : "border-gray-700/30"}`}>
              <div className="flex items-center">
                <button
                  onClick={() => setExpandedApp(isExpanded ? null : app.appId)}
                  className="flex-1 flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-800/50 transition-colors"
                >
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 overflow-hidden" style={{ background: isDetected ? "rgba(34,197,94,0.1)" : "rgba(107,114,128,0.1)" }}>
                  {app.iconBase64 ? (
                    <img
                      src={`data:${app.iconType || "image/png"};base64,${app.iconBase64}`}
                      alt=""
                      className="w-7 h-7 object-contain rounded"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; (e.target as HTMLImageElement).parentElement!.innerHTML = '<span class="text-gray-500">📦</span>'; }}
                    />
                  ) : isDetected ? (
                    <CheckCircle2 size={14} className="text-green-400" />
                  ) : (
                    <AppWindow size={14} className="text-gray-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-200 truncate">{app.displayName}</p>
                  <p className="text-[10px] text-gray-500">{app.publisher || "—"}{app.appType ? ` · ${app.appType}` : ""}</p>
                </div>
                <div className="text-right shrink-0 flex items-center gap-2">
                  {isDetected ? (
                    <>
                      <div>
                        <p className="text-sm font-bold text-green-400">{app.deploymentRate}%</p>
                        <p className="text-[10px] text-gray-600">{app.detectedOnDevices}/{app.totalDevices} devices</p>
                      </div>
                      <span className="text-gray-600">{isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</span>
                    </>
                  ) : (
                    <p className="text-[10px] text-gray-600">Not detected</p>
                  )}
                </div>
              </button>

              {/* Action buttons */}
              <div className="flex items-center gap-1 pr-2 shrink-0">
                <button
                  onClick={(e) => { e.stopPropagation(); handleFixIcon(app.appId, app.displayName, app.publisher, !!app.iconBase64); }}
                  disabled={isDeleting}
                  className="p-1.5 text-gray-600 hover:text-blue-400 hover:bg-blue-500/10 rounded transition-colors"
                  title={app.iconBase64 ? "Refresh icon from internet" : "Find & upload icon"}
                >
                  <ImagePlus size={13} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setDeleteConfirm(deleteConfirm === app.appId ? null : app.appId); }}
                  disabled={isDeleting}
                  className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                  title="Remove app from Intune"
                >
                  {isDeleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                </button>
              </div>
              </div>

              {/* Delete confirmation */}
              {deleteConfirm === app.appId && (
                <div className="px-3 py-2 border-t border-red-500/30 bg-red-500/5 flex items-center gap-2">
                  <AlertTriangle size={13} className="text-red-400 shrink-0" />
                  <span className="text-[11px] text-red-300 flex-1">Remove <strong>{app.displayName}</strong>? All assignments will be cleared first.</span>
                  <button onClick={() => handleDelete(app.appId, app.displayName)} className="px-2 py-1 text-[10px] font-medium bg-red-600 hover:bg-red-700 text-white rounded transition-colors">Yes, remove</button>
                  <button onClick={() => setDeleteConfirm(null)} className="px-2 py-1 text-[10px] text-gray-400 hover:text-white transition-colors">Cancel</button>
                </div>
              )}

              {/* Action result message */}
              {msg && (
                <div className={`px-3 py-1.5 border-t text-[11px] ${msg.ok ? "border-green-500/30 bg-green-500/5 text-green-400" : "border-red-500/30 bg-red-500/5 text-red-400"}`}>
                  {msg.text}
                </div>
              )}

              {/* Icon fix progress */}
              {isExpanded && iconFixTarget === app.appId && iconSteps.length > 0 && (
                <div className="px-3 py-2 border-t border-gray-700/30">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">Icon Search Progress</p>
                  <div className="space-y-1">
                    {iconSteps.map((s, i) => (
                      <div key={i} className={`flex items-center gap-2 px-2 py-1 rounded bg-gray-800/40 ${s.status === "skipped" ? "opacity-40" : ""}`}>
                        <span className="shrink-0">
                          {s.status === "running" ? <Loader2 size={11} className="animate-spin text-brand-400" />
                            : s.status === "success" ? <CheckCircle2 size={11} className="text-green-400" />
                            : s.status === "skipped" ? <Minus size={11} className="text-gray-500" />
                            : <XCircle size={11} className="text-red-400" />}
                        </span>
                        <span className="text-[10px] text-gray-400 w-32 truncate shrink-0">{s.step.replace("search_", "")}</span>
                        <span className="text-[10px] text-gray-500 flex-1 truncate">{s.detail}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Expanded device list */}
              {isExpanded && app.devices && app.devices.length > 0 && (
                <div className="px-3 pb-3 border-t border-gray-700/30">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-2 mb-1.5 px-1">
                    Installed on {app.devices.length} device(s)
                  </p>
                  <div className="space-y-1">
                    {app.devices.map((d, i) => (
                      <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded bg-gray-800/40">
                        <DeviceLink name={d.deviceName} className="text-[11px] flex-1" />
                        {d.version && <span className="text-[10px] text-gray-500 font-mono">v{d.version}</span>}
                        <TroubleshootDrillLink deviceName={d.deviceName} className="text-[9px]" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {isExpanded && (!app.devices || app.devices.length === 0) && isDetected && (
                <div className="px-4 py-2 border-t border-gray-700/30">
                  <p className="text-[10px] text-gray-500">Device details not available</p>
                </div>
              )}
            </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
