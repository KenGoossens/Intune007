import { useState, useEffect, useRef } from "react";
import {
  Wrench,
  Loader2,
  Play,
  Upload,
  CheckCircle,
  XCircle,
  FileCode,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Clock,
} from "lucide-react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import {
  useRemediationStore,
  type GeneratedScript,
} from "../stores/remediationStore.ts";
import { useNavigationStore } from "../stores/navigationStore.ts";

export default function RemediationPanel() {
  const {
    currentScript,
    generatedScripts,
    isGenerating,
    isDeploying,
    deployResult,
    existingScripts,
    isLoadingExisting,
    generateScript,
    deployScript,
    fetchExistingScripts,
    setCurrentScript,
  } = useRemediationStore();

  const [prompt, setPrompt] = useState("");
  const [activeTab, setActiveTab] = useState<"generate" | "existing">(
    "generate"
  );

  // Auto-fill prompt from cross-panel navigation
  const pendingNav = useNavigationStore((s) => s.pendingNavigation);
  const clearNavigation = useNavigationStore((s) => s.clearNavigation);

  useEffect(() => {
    if (pendingNav?.panel === "remediation" && pendingNav.query) {
      setPrompt(pendingNav.query);
      setActiveTab("generate");
      clearNavigation();
    }
  }, [pendingNav, clearNavigation]);

  useEffect(() => {
    fetchExistingScripts();
  }, [fetchExistingScripts]);

  const handleGenerate = () => {
    if (!prompt.trim() || isGenerating) return;
    generateScript(prompt.trim());
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <Wrench size={16} className="text-brand-400" />
          <h2 className="text-sm font-semibold text-gray-300">Remediation</h2>
        </div>
        <div className="flex bg-gray-800 rounded-lg p-0.5 text-xs">
          <button
            onClick={() => setActiveTab("generate")}
            className={`px-2.5 py-1 rounded-md transition-colors ${
              activeTab === "generate"
                ? "bg-gray-700 text-white"
                : "text-gray-400 hover:text-gray-300"
            }`}
          >
            <Sparkles size={12} className="inline mr-1" />
            Generate
          </button>
          <button
            onClick={() => setActiveTab("existing")}
            className={`px-2.5 py-1 rounded-md transition-colors ${
              activeTab === "existing"
                ? "bg-gray-700 text-white"
                : "text-gray-400 hover:text-gray-300"
            }`}
          >
            <FileCode size={12} className="inline mr-1" />
            Existing ({existingScripts.length})
          </button>
        </div>
      </div>

      {activeTab === "generate" ? (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Prompt input */}
          <div>
            <label className="text-xs text-gray-400 font-medium mb-1.5 block">
              Describe the remediation you need
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder='e.g. "Ensure BitLocker is enabled on all Windows devices" or "Fix Windows Update service not running"'
              rows={3}
              className="w-full bg-gray-800 text-white text-sm rounded-lg px-3 py-2 border border-gray-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 placeholder-gray-500 resize-none"
            />
            <button
              onClick={handleGenerate}
              disabled={isGenerating || !prompt.trim()}
              className="mt-2 flex items-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm px-4 py-2 rounded-lg transition-colors"
            >
              {isGenerating ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles size={14} />
                  Generate Scripts
                </>
              )}
            </button>
          </div>

          {/* Quick templates */}
          <div>
            <p className="text-xs text-gray-500 mb-2">Quick templates:</p>
            <div className="flex flex-wrap gap-1.5">
              {[
                "Enable BitLocker encryption",
                "Ensure Windows Firewall is enabled",
                "Fix Windows Update service",
                "Clear Intune app cache and re-sync",
                "Restart Intune Management Extension",
                "Enable Windows Defender real-time protection",
              ].map((template) => (
                <button
                  key={template}
                  onClick={() => setPrompt(template)}
                  className="text-[10px] px-2 py-1 rounded-md bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 border border-gray-700 transition-colors"
                >
                  {template}
                </button>
              ))}
            </div>
          </div>

          {/* Current script preview */}
          {currentScript && (
            <ScriptPreview
              script={currentScript}
              isDeploying={isDeploying}
              deployResult={deployResult}
              onDeploy={() => deployScript(currentScript)}
            />
          )}

          {/* History */}
          {generatedScripts.length > 1 && (
            <div>
              <p className="text-xs text-gray-500 mb-2">
                Previously generated ({generatedScripts.length - 1}):
              </p>
              <div className="space-y-1.5">
                {generatedScripts.slice(1).map((script, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentScript(script)}
                    className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-750 border border-gray-700 transition-colors"
                  >
                    <FileCode size={13} className="text-gray-500 shrink-0" />
                    <span className="text-xs text-gray-300 truncate">
                      {script.displayName}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4">
          {isLoadingExisting ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 size={24} className="animate-spin text-gray-500" />
            </div>
          ) : existingScripts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <FileCode size={32} className="mb-2" />
              <p className="text-sm">No Proactive Remediations found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {existingScripts.map((script) => (
                <div
                  key={script.id as string}
                  className="px-3 py-2.5 rounded-lg bg-gray-800 border border-gray-700"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <FileCode size={13} className="text-brand-400" />
                    <span className="text-sm font-medium text-gray-200">
                      {script.displayName as string}
                    </span>
                  </div>
                  {script.description ? (
                    <p className="text-xs text-gray-400 mb-1">
                      {script.description as string}
                    </p>
                  ) : null}
                  <div className="flex items-center gap-3 text-[10px] text-gray-500">
                    <span>Publisher: {(script.publisher as string) || "—"}</span>
                    <span className="flex items-center gap-1">
                      <Clock size={10} />
                      {script.lastModifiedDateTime
                        ? new Date(
                            script.lastModifiedDateTime as string
                          ).toLocaleDateString()
                        : "—"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ScriptPreview({
  script,
  isDeploying,
  deployResult,
  onDeploy,
}: {
  script: GeneratedScript;
  isDeploying: boolean;
  deployResult: { success: boolean; scriptId: string; error?: string } | null;
  onDeploy: () => void;
}) {
  const [showDetection, setShowDetection] = useState(true);
  const [showRemediation, setShowRemediation] = useState(true);

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-700 bg-gray-800/80">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-200">
              {script.displayName}
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {script.description}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] bg-gray-700 text-gray-400 px-2 py-0.5 rounded-full">
              {script.runAsAccount}
            </span>
          </div>
        </div>
        {script.explanation && (
          <p className="text-xs text-gray-500 mt-2 leading-relaxed">
            {script.explanation}
          </p>
        )}
      </div>

      {/* Detection Script */}
      <div className="border-b border-gray-700">
        <button
          onClick={() => setShowDetection(!showDetection)}
          className="w-full flex items-center gap-2 px-4 py-2 text-xs text-gray-400 hover:text-gray-300 transition-colors"
        >
          {showDetection ? (
            <ChevronDown size={12} />
          ) : (
            <ChevronRight size={12} />
          )}
          <span className="font-medium">Detection Script</span>
          <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">
            exit 0 = OK, exit 1 = needs fix
          </span>
        </button>
        {showDetection && (
          <div className="mx-3 mb-3">
            <SyntaxHighlighter
              language="powershell"
              style={oneDark}
              customStyle={{
                margin: 0,
                borderRadius: "8px",
                fontSize: "0.75rem",
                border: "1px solid #374151",
              }}
            >
              {script.detectionScript}
            </SyntaxHighlighter>
          </div>
        )}
      </div>

      {/* Remediation Script */}
      <div className="border-b border-gray-700">
        <button
          onClick={() => setShowRemediation(!showRemediation)}
          className="w-full flex items-center gap-2 px-4 py-2 text-xs text-gray-400 hover:text-gray-300 transition-colors"
        >
          {showRemediation ? (
            <ChevronDown size={12} />
          ) : (
            <ChevronRight size={12} />
          )}
          <span className="font-medium">Remediation Script</span>
          <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">
            runs when detection fails
          </span>
        </button>
        {showRemediation && (
          <div className="mx-3 mb-3">
            <SyntaxHighlighter
              language="powershell"
              style={oneDark}
              customStyle={{
                margin: 0,
                borderRadius: "8px",
                fontSize: "0.75rem",
                border: "1px solid #374151",
              }}
            >
              {script.remediationScript}
            </SyntaxHighlighter>
          </div>
        )}
      </div>

      {/* Deploy action */}
      <div className="px-4 py-3">
        {deployResult ? (
          <div
            className={`flex items-center gap-2 text-sm ${
              deployResult.success ? "text-green-400" : "text-red-400"
            }`}
          >
            {deployResult.success ? (
              <>
                <CheckCircle size={16} />
                <span>
                  Deployed to Intune! Script ID: {deployResult.scriptId}
                </span>
              </>
            ) : (
              <>
                <XCircle size={16} />
                <span>
                  Deploy failed: {deployResult.error}
                </span>
              </>
            )}
          </div>
        ) : (
          <button
            onClick={onDeploy}
            disabled={isDeploying}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm px-4 py-2 rounded-lg transition-colors"
          >
            {isDeploying ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Deploying to Intune...
              </>
            ) : (
              <>
                <Upload size={14} />
                Deploy to Intune as Proactive Remediation
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
