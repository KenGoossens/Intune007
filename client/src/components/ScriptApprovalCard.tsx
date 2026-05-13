import { CheckCircle, XCircle, AlertTriangle, Shield, ShieldCheck, ShieldX, Clock, SkipForward } from "lucide-react";
import type { ScriptValidation, ValidationPhase } from "../stores/remediationStore.ts";

interface ScriptApprovalCardProps {
  validation: ScriptValidation;
  approvalId: string;
  displayName: string;
  isDeploying: boolean;
  onApprove: (approvalId: string) => void;
  onReject: (approvalId: string) => void;
}

/**
 * Card component that shows script quality validation results
 * and provides approve/reject buttons for user-gated deployment.
 */
export default function ScriptApprovalCard({
  validation,
  approvalId,
  displayName,
  isDeploying,
  onApprove,
  onReject,
}: ScriptApprovalCardProps) {
  const passedTests = validation.pesterResults.filter((r) => r.passed);
  const failedTests = validation.pesterResults.filter((r) => !r.passed);

  return (
    <div className="mt-3 rounded-lg border border-gray-700 bg-gray-800/50 p-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        {validation.valid ? (
          <ShieldCheck size={18} className="text-green-400" />
        ) : (
          <ShieldX size={18} className="text-red-400" />
        )}
        <h4 className="text-sm font-semibold text-gray-200">
          Quality Validation
        </h4>
        <span
          className={`ml-auto text-xs px-2 py-0.5 rounded-full ${
            validation.valid
              ? "bg-green-900/40 text-green-300"
              : "bg-red-900/40 text-red-300"
          }`}
        >
          {validation.valid ? "PASSED" : "FAILED"}
        </span>
      </div>

      {/* Summary */}
      <p className="text-xs text-gray-400 mb-3">{validation.summary}</p>

      {/* Pipeline Phases */}
      {validation.phases && validation.phases.length > 0 && (
        <div className="mb-3 rounded-md border border-gray-700 bg-gray-900/40 p-3">
          <div className="text-xs font-medium text-gray-300 mb-2">Validation Pipeline</div>
          <div className="space-y-2">
            {validation.phases.map((phase, i) => (
              <PhaseRow key={i} phase={phase} index={i} isLast={i === validation.phases!.length - 1} />
            ))}
          </div>
        </div>
      )}

      {/* Syntax Errors */}
      {validation.syntaxErrors.length > 0 && (
        <div className="mb-3">
          <div className="flex items-center gap-1.5 mb-1">
            <XCircle size={13} className="text-red-400" />
            <span className="text-xs font-medium text-red-300">
              Syntax Errors ({validation.syntaxErrors.length})
            </span>
          </div>
          <ul className="space-y-0.5 ml-5">
            {validation.syntaxErrors.map((err, i) => (
              <li key={i} className="text-xs text-red-200 font-mono">
                {err}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Pester Test Results */}
      {validation.pesterResults.length > 0 && (
        <div className="mb-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Shield size={13} className="text-gray-400" />
            <span className="text-xs font-medium text-gray-300">
              Structural Tests ({passedTests.length}/{validation.pesterResults.length} passed)
            </span>
          </div>
          <ul className="space-y-0.5 ml-5">
            {validation.pesterResults.map((test, i) => (
              <li key={i} className="flex items-center gap-1.5 text-xs">
                {test.passed ? (
                  <CheckCircle size={11} className="text-green-400 shrink-0" />
                ) : (
                  <XCircle size={11} className="text-red-400 shrink-0" />
                )}
                <span className={test.passed ? "text-gray-300" : "text-red-200"}>
                  {test.name}
                </span>
                {test.message && !test.passed && (
                  <span className="text-gray-500 ml-1 truncate">— {test.message}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Approval Buttons */}
      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-700">
        {validation.valid ? (
          <>
            <button
              onClick={() => onApprove(approvalId)}
              disabled={isDeploying}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-green-700 hover:bg-green-600 text-white text-xs font-medium transition-colors disabled:opacity-50"
            >
              <CheckCircle size={13} />
              Approve & Deploy
            </button>
            <button
              onClick={() => onReject(approvalId)}
              disabled={isDeploying}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-medium transition-colors disabled:opacity-50"
            >
              <XCircle size={13} />
              Reject
            </button>
            <span className="ml-auto text-xs text-gray-500">
              Review scripts above before approving deployment to Intune
            </span>
          </>
        ) : (
          <>
            <div className="flex items-center gap-1.5 text-xs text-amber-300">
              <AlertTriangle size={13} />
              <span>Script has quality issues — deployment blocked</span>
            </div>
            <button
              onClick={() => onReject(approvalId)}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-medium transition-colors"
            >
              <XCircle size={13} />
              Dismiss
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function PhaseRow({ phase, index, isLast }: { phase: ValidationPhase; index: number; isLast: boolean }) {
  const statusIcon = {
    passed: <CheckCircle size={14} className="text-green-400 shrink-0" />,
    failed: <XCircle size={14} className="text-red-400 shrink-0" />,
    skipped: <SkipForward size={14} className="text-gray-500 shrink-0" />,
    warning: <AlertTriangle size={14} className="text-amber-400 shrink-0" />,
    pending: <Clock size={14} className="text-blue-400 shrink-0" />,
  };

  const statusColor = {
    passed: "text-green-300",
    failed: "text-red-300",
    skipped: "text-gray-500",
    warning: "text-amber-300",
    pending: "text-blue-300",
  };

  const icon = statusIcon[phase.status as keyof typeof statusIcon] || statusIcon.passed;
  const color = statusColor[phase.status as keyof typeof statusColor] || statusColor.passed;

  return (
    <div className="flex items-start gap-2">
      {/* Step connector */}
      <div className="flex flex-col items-center">
        {icon}
        {!isLast && <div className="w-px h-3 bg-gray-700 mt-0.5" />}
      </div>
      {/* Phase info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium ${color}`}>
            {index + 1}. {phase.name}
          </span>
          {phase.duration != null && phase.duration > 0 && (
            <span className="text-[10px] text-gray-500">{phase.duration}ms</span>
          )}
        </div>
        {phase.details && (
          <p className="text-[11px] text-gray-500 mt-0.5 truncate">{phase.details}</p>
        )}
      </div>
    </div>
  );
}
