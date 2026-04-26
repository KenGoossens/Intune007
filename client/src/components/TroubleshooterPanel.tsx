import { useState, useRef, useEffect, useCallback } from "react";
import {
  Loader2,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  Circle,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Stethoscope,
  Clock,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useNavigationStore } from "../stores/navigationStore.ts";

type StepStatus = "pending" | "running" | "pass" | "fail" | "warning" | "info" | "error";

interface DiagnosticFinding {
  status: "pass" | "fail" | "warning" | "info";
  message: string;
  details?: unknown;
}

interface DiagnosticStep {
  id: string;
  name: string;
  description: string;
  status: StepStatus;
  findings: DiagnosticFinding[];
  durationMs?: number;
  error?: string;
}

interface DiagnosticResult {
  deviceName: string;
  deviceId: string;
  problem: string;
  startedAt: string;
  completedAt: string;
  totalDurationMs: number;
  steps: DiagnosticStep[];
  diagnosis: string;
  recommendedActions: string[];
}

const STEP_STATUS_CONFIG: Record<StepStatus, { icon: React.ReactNode; color: string; lineColor: string }> = {
  pending: {
    icon: <Circle size={16} />,
    color: "text-gray-600",
    lineColor: "bg-gray-700",
  },
  running: {
    icon: <Loader2 size={16} className="animate-spin" />,
    color: "text-brand-400",
    lineColor: "bg-brand-500/30",
  },
  pass: {
    icon: <CheckCircle2 size={16} />,
    color: "text-green-400",
    lineColor: "bg-green-500/30",
  },
  fail: {
    icon: <XCircle size={16} />,
    color: "text-red-400",
    lineColor: "bg-red-500/30",
  },
  warning: {
    icon: <AlertTriangle size={16} />,
    color: "text-yellow-400",
    lineColor: "bg-yellow-500/30",
  },
  info: {
    icon: <Info size={16} />,
    color: "text-blue-400",
    lineColor: "bg-blue-500/30",
  },
  error: {
    icon: <XCircle size={16} />,
    color: "text-red-400",
    lineColor: "bg-red-500/30",
  },
};

const FINDING_ICONS: Record<string, React.ReactNode> = {
  pass: <CheckCircle2 size={11} className="text-green-400 shrink-0 mt-0.5" />,
  fail: <XCircle size={11} className="text-red-400 shrink-0 mt-0.5" />,
  warning: <AlertTriangle size={11} className="text-yellow-400 shrink-0 mt-0.5" />,
  info: <Info size={11} className="text-blue-400 shrink-0 mt-0.5" />,
};

export default function TroubleshooterPanel() {
  const [deviceName, setDeviceName] = useState("");
  const [problem, setProblem] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [steps, setSteps] = useState<DiagnosticStep[]>([]);
  const [result, setResult] = useState<DiagnosticResult | null>(null);
  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const autoRunRef = useRef(false);

  // Auto-fill and auto-run when navigated from another panel
  const pendingNav = useNavigationStore((s) => s.pendingNavigation);
  const clearNavigation = useNavigationStore((s) => s.clearNavigation);

  useEffect(() => {
    if (pendingNav?.panel === "troubleshooter" && pendingNav.deviceName && !isRunning) {
      setDeviceName(pendingNav.deviceName);
      clearNavigation();
      autoRunRef.current = true;
    }
  }, [pendingNav, clearNavigation, isRunning]);

  // Trigger auto-run after state update
  useEffect(() => {
    if (autoRunRef.current && deviceName && !isRunning) {
      autoRunRef.current = false;
      startDiagnosisFor(deviceName, problem);
    }
  }, [deviceName]);

  // Auto-scroll to bottom as steps update
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [steps, result]);

  const startDiagnosisFor = async (name: string, prob: string) => {
    if (!name.trim() || isRunning) return;

    setIsRunning(true);
    setSteps([]);
    setResult(null);
    setError(null);
    setExpandedStep(null);

    try {
      const res = await fetch("/api/troubleshooter/diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceName: name.trim(),
          problem: prob.trim() || "General health check",
        }),
      });


      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events from buffer
        const events = buffer.split("\n\n");
        buffer = events.pop() || ""; // Keep incomplete event in buffer

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
              const step = parsed as DiagnosticStep;
              setSteps((prev) => {
                const idx = prev.findIndex((s) => s.id === step.id);
                if (idx >= 0) {
                  const updated = [...prev];
                  updated[idx] = step;
                  return updated;
                }
                return [...prev, step];
              });
              // Auto-expand the running step
              if (step.status === "running") {
                setExpandedStep(step.id);
              }
            } else if (eventType === "done") {
              setResult(parsed as DiagnosticResult);
            } else if (eventType === "error") {
              setError(parsed.message || "Unknown error");
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRunning(false);
    }
  };

  const startDiagnosis = () => startDiagnosisFor(deviceName, problem);

  const hasStarted = steps.length > 0;

  const collectLogs = async () => {
    if (!result?.deviceId) return;
    try {
      const res = await fetch("/api/diagnostic-logs/collect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: result.deviceId }),
      });
      const data = await res.json();
      if (data.success) {
        alert("Log collection request sent! The device will upload logs on its next check-in. Check the Logs tab or Intune portal for the results.");
      } else {
        alert(`Failed: ${data.error}`);
      }
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-800">
        <Stethoscope size={16} className="text-brand-400" />
        <h2 className="text-sm font-semibold text-gray-200">Device Troubleshooter</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Input form */}
        <div className="px-5 py-4 border-b border-gray-800">
          <div className="space-y-2.5">
            <div>
              <label className="text-xs text-gray-400 font-medium mb-1 block">Device Name or ID</label>
              <input
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                placeholder="e.g. NB-LAPTOP-01"
                disabled={isRunning}
                className="w-full bg-gray-800 text-white text-sm rounded-lg px-3 py-2 border border-gray-700 focus:border-brand-500 focus:outline-none placeholder-gray-500 disabled:opacity-50"
                onKeyDown={(e) => e.key === "Enter" && startDiagnosis()}
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 font-medium mb-1 block">Problem Description <span className="text-gray-600">(optional)</span></label>
              <input
                value={problem}
                onChange={(e) => setProblem(e.target.value)}
                placeholder="e.g. Cannot install Teams or Device not syncing"
                disabled={isRunning}
                className="w-full bg-gray-800 text-white text-sm rounded-lg px-3 py-2 border border-gray-700 focus:border-brand-500 focus:outline-none placeholder-gray-500 disabled:opacity-50"
                onKeyDown={(e) => e.key === "Enter" && startDiagnosis()}
              />
            </div>
            <button
              onClick={startDiagnosis}
              disabled={isRunning || !deviceName.trim()}
              className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm px-4 py-2 rounded-lg transition-colors"
            >
              {isRunning ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Diagnosing...
                </>
              ) : (
                <>
                  <Search size={14} />
                  Start Diagnosis
                </>
              )}
            </button>
          </div>
        </div>

        {/* Empty state */}
        {!hasStarted && !error && (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500 px-8">
            <Stethoscope size={48} className="mb-4 text-gray-600" />
            <h3 className="text-lg font-medium text-gray-400 mb-2">Automated Device Diagnostics</h3>
            <p className="text-sm text-center max-w-sm text-gray-500">
              Enter a device name and describe the issue. The troubleshooter will automatically check compliance, configuration profiles, app installs, group membership, sync status, and generate an AI root cause analysis.
            </p>
          </div>
        )}

        {/* Timeline */}
        {hasStarted && (
          <div className="px-5 py-4">
            <div className="relative">
              {steps.map((step, i) => {
                const config = STEP_STATUS_CONFIG[step.status];
                const isExpanded = expandedStep === step.id;
                const isLast = i === steps.length - 1 && !result;

                return (
                  <div key={step.id} className="relative flex gap-3 pb-4">
                    {/* Timeline line */}
                    {!isLast && (
                      <div
                        className={`absolute left-[7px] top-6 w-0.5 ${config.lineColor}`}
                        style={{ height: "calc(100% - 8px)" }}
                      />
                    )}

                    {/* Status icon */}
                    <div className={`shrink-0 mt-0.5 ${config.color}`}>
                      {config.icon}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <button
                        onClick={() => setExpandedStep(isExpanded ? null : step.id)}
                        className="w-full text-left flex items-center gap-2"
                      >
                        <span className="text-sm font-medium text-gray-200">{step.name}</span>
                        {step.durationMs != null && (
                          <span className="text-[10px] text-gray-600 flex items-center gap-0.5">
                            <Clock size={9} />
                            {(step.durationMs / 1000).toFixed(1)}s
                          </span>
                        )}
                        <span className="ml-auto text-gray-600">
                          {step.findings.length > 0 && (
                            isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />
                          )}
                        </span>
                      </button>

                      <p className="text-[11px] text-gray-500 mt-0.5">{step.description}</p>

                      {step.error && (
                        <p className="text-[11px] text-red-400 mt-1">{step.error}</p>
                      )}

                      {/* Findings */}
                      {isExpanded && step.findings.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {step.findings.map((finding, fi) => (
                            <div key={fi} className="flex items-start gap-1.5">
                              {FINDING_ICONS[finding.status]}
                              <span className="text-[11px] text-gray-400 leading-relaxed">
                                {finding.message}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* AI Diagnosis Result */}
        {result && (
          <div className="px-5 pb-5">
            <div className="bg-gray-800/60 border border-gray-700/50 rounded-xl overflow-hidden">
              {/* Diagnosis header */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-700/50">
                <Sparkles size={14} className="text-brand-400" />
                <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                  AI Root Cause Analysis
                </h3>
                <span className="text-[10px] text-gray-600 ml-auto flex items-center gap-1">
                  <Clock size={9} />
                  {(result.totalDurationMs / 1000).toFixed(1)}s total
                </span>
              </div>

              {/* Diagnosis text */}
              <div className="px-4 py-3">
                <div className="text-[13px] text-gray-300 leading-relaxed chat-markdown">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{result.diagnosis}</ReactMarkdown>
                </div>
              </div>

              {/* Recommended Actions */}
              {result.recommendedActions.length > 0 && (
                <div className="px-4 pb-4">
                  <p className="text-xs font-semibold text-gray-400 mb-2">Recommended Actions</p>
                  <ol className="space-y-1.5">
                    {result.recommendedActions.map((action, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-[10px] font-bold text-brand-400 bg-brand-500/10 w-5 h-5 rounded flex items-center justify-center shrink-0 mt-0.5">
                          {i + 1}
                        </span>
                        <span className="text-xs text-gray-300 leading-relaxed">{action}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Collect Logs action */}
              {result.deviceId && (
                <div className="px-4 pb-4">
                  <button
                    onClick={collectLogs}
                    className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs px-3 py-2 rounded-lg transition-colors"
                  >
                    <Stethoscope size={13} />
                    Collect Device Diagnostic Logs
                  </button>
                  <p className="text-[10px] text-gray-600 mt-1">Triggers log collection from the device. Device must be online.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="px-5 py-4">
            <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
              <XCircle size={16} />
              <span>{error}</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
