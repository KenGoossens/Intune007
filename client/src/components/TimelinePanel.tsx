import { useState, useEffect, useRef } from "react";
import { useActivityStore } from "../stores/activityStore.ts";
import { Loader2, Clock, Monitor, ShieldCheck, Settings, FileText, Zap } from "lucide-react";
import { useNavigationStore } from "../stores/navigationStore.ts";

interface TimelineEvent { date: string; event: string; category: string; details?: unknown; }
interface TimelineResult { device: { id: string; deviceName: string; os: string; user: string; model: string }; timeline: TimelineEvent[]; totalEvents: number; }

const CAT_STYLES: Record<string, { icon: React.ReactNode; color: string }> = {
  enrollment: { icon: <Zap size={12} />, color: "text-green-400" },
  compliance: { icon: <ShieldCheck size={12} />, color: "text-blue-400" },
  configuration: { icon: <Settings size={12} />, color: "text-purple-400" },
  audit: { icon: <FileText size={12} />, color: "text-yellow-400" },
  sync: { icon: <Monitor size={12} />, color: "text-brand-400" },
  status: { icon: <Monitor size={12} />, color: "text-gray-400" },
};

export default function TimelinePanel() {
  const [deviceName, setDeviceName] = useState("");
  const [result, setResult] = useState<TimelineResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const autoRunRef = useRef(false);

  // Auto-fill and auto-run when navigated from another panel
  const pendingNav = useNavigationStore((s) => s.pendingNavigation);
  const clearNavigation = useNavigationStore((s) => s.clearNavigation);

  useEffect(() => {
    if (pendingNav?.panel === "timeline" && pendingNav.deviceName && !isLoading) {
      setDeviceName(pendingNav.deviceName);
      clearNavigation();
      autoRunRef.current = true;
    }
  }, [pendingNav, clearNavigation, isLoading]);

  useEffect(() => {
    if (autoRunRef.current && deviceName && !isLoading) {
      autoRunRef.current = false;
      loadTimeline(deviceName);
    }
  }, [deviceName]);

  const loadTimeline = async (name: string) => {
    if (!name.trim() || isLoading) return;
    setIsLoading(true); useActivityStore.getState().addActivity("timeline"); setResult(null);
    try {
      const res = await fetch("/api/device-timeline", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceName: name.trim() }),
      });
      if (!res.ok) throw new Error("Device not found");
      setResult(await res.json());
    } catch { /* */ } finally { setIsLoading(false); useActivityStore.getState().removeActivity("timeline"); }
  };

  const fetch_timeline = () => loadTimeline(deviceName);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-800">
        <Clock size={16} className="text-brand-400" />
        <h2 className="text-sm font-semibold text-gray-200">Device Lifecycle Timeline</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        <div className="flex gap-2">
          <input value={deviceName} onChange={(e) => setDeviceName(e.target.value)} placeholder="Device name"
            className="flex-1 bg-gray-800 text-white text-sm rounded-lg px-3 py-2 border border-gray-700 focus:border-brand-500 focus:outline-none placeholder-gray-500"
            onKeyDown={(e) => e.key === "Enter" && fetch_timeline()} />
          <button onClick={fetch_timeline} disabled={!deviceName.trim() || isLoading}
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm px-4 py-2 rounded-lg transition-colors">
            {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Clock size={14} />} Load
          </button>
        </div>

        {result && (
          <div>
            <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg px-4 py-3 mb-4">
              <p className="text-sm font-medium text-gray-200">{result.device.deviceName}</p>
              <p className="text-xs text-gray-500">{result.device.os} · {result.device.model} · {result.device.user}</p>
            </div>

            <p className="text-xs text-gray-400 mb-3">{result.totalEvents} events</p>

            <div className="relative">
              {result.timeline.map((ev, i) => {
                const cat = CAT_STYLES[ev.category] || CAT_STYLES.status;
                const isLast = i === result.timeline.length - 1;
                return (
                  <div key={i} className="relative flex gap-3 pb-4">
                    {!isLast && <div className="absolute left-[7px] top-5 w-0.5 h-[calc(100%-12px)] bg-gray-700" />}
                    <div className={`shrink-0 mt-1 ${cat.color}`}>{cat.icon}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-200">{ev.event}</p>
                      <p className="text-[10px] text-gray-600 mt-0.5">{new Date(ev.date).toLocaleString()} · {ev.category}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
