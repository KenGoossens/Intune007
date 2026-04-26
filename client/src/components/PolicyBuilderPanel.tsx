import { useState, useEffect } from "react";
import {
  Loader2,
  Upload,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronRight,
  Sparkles,
  ShieldCheck,
  Settings,
  FileCode,
} from "lucide-react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import {
  usePolicyBuilderStore,
  type GeneratedPolicy,
  type PolicyDeployResult,
} from "../stores/policyBuilderStore.ts";
import { useNavigationStore } from "../stores/navigationStore.ts";

const PLATFORM_LABELS: Record<string, string> = {
  windows10: "Windows 10/11",
  ios: "iOS / iPadOS",
  android: "Android",
  macOS: "macOS",
};

const POLICY_TYPE_LABELS: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  compliance: {
    label: "Compliance Policy",
    icon: <ShieldCheck size={13} />,
    color: "bg-blue-500/20 text-blue-400",
  },
  configuration: {
    label: "Configuration Profile",
    icon: <Settings size={13} />,
    color: "bg-purple-500/20 text-purple-400",
  },
};

export default function PolicyBuilderPanel() {
  const {
    currentPolicy,
    generatedPolicies,
    isGenerating,
    isDeploying,
    deployResult,
    generatePolicy,
    deployPolicy,
    setCurrentPolicy,
  } = usePolicyBuilderStore();

  const [prompt, setPrompt] = useState("");
  const [benchmark, setBenchmark] = useState("cis_l1");

  // Auto-fill prompt from cross-panel navigation
  const pendingNav = useNavigationStore((s) => s.pendingNavigation);
  const clearNavigation = useNavigationStore((s) => s.clearNavigation);

  useEffect(() => {
    if (pendingNav?.panel === "policyBuilder" && pendingNav.query) {
      setPrompt(pendingNav.query);
      clearNavigation();
    }
  }, [pendingNav, clearNavigation]);

  const handleGenerate = () => {
    if (!prompt.trim() || isGenerating) return;
    generatePolicy(prompt.trim(), benchmark);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-800">
        <Sparkles size={16} className="text-brand-400" />
        <h2 className="text-sm font-semibold text-gray-300">Policy Builder</h2>
        <span className="text-[10px] bg-brand-600/20 text-brand-400 px-1.5 py-0.5 rounded">
          AI-Powered
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* Benchmark selector */}
        <div>
          <label className="text-xs text-gray-400 font-medium mb-1.5 block">
            Security Benchmark
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { id: "cis_l1", label: "CIS Level 1", desc: "Practical security for most organizations" },
              { id: "cis_l2", label: "CIS Level 2", desc: "Strict hardening for high-security environments" },
              { id: "nist_800_171", label: "NIST 800-171", desc: "Controlled Unclassified Information (CUI)" },
              { id: "iso_27001", label: "ISO 27001", desc: "International information security standard" },
              { id: "hipaa", label: "HIPAA", desc: "Healthcare — protecting ePHI" },
              { id: "essential_eight", label: "Essential Eight", desc: "Australian Cyber Security Centre (ACSC)" },
              { id: "zero_trust", label: "Zero Trust", desc: "Microsoft Zero Trust — maximum security" },
              { id: "custom", label: "Custom", desc: "Your own requirements, best-practice defaults" },
            ].map((b) => (
              <button
                key={b.id}
                onClick={() => setBenchmark(b.id)}
                className={`text-left px-2.5 py-2 rounded-lg border transition-colors ${
                  benchmark === b.id
                    ? "bg-brand-600/15 border-brand-500/30 text-brand-400"
                    : "bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-600"
                }`}
              >
                <p className="text-[11px] font-medium">{b.label}</p>
                <p className="text-[9px] text-gray-500 mt-0.5">{b.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Prompt input */}
        <div>
          <label className="text-xs text-gray-400 font-medium mb-1.5 block">
            Describe the policy you need in plain English
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder='e.g. "Require BitLocker encryption, a minimum 8-character password, and block USB storage on all Windows devices"'
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
                Generating policy...
              </>
            ) : (
              <>
                <Sparkles size={14} />
                Generate Policy
              </>
            )}
          </button>
        </div>

        {/* Quick templates */}
        <div>
          <p className="text-xs text-gray-500 mb-2">Quick templates:</p>
          <div className="flex flex-wrap gap-1.5">
            {[
              "Require BitLocker and a minimum 8-char password on Windows",
              "Block USB storage and require firewall on Windows 11",
              "Require device encryption and a 6-digit passcode on iOS",
              "Block rooted/jailbroken devices on Android",
              "Require FileVault encryption on macOS",
              "Enforce Windows Defender real-time protection",
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

        {/* Generated policy preview */}
        {currentPolicy && (
          <PolicyPreview
            policy={currentPolicy}
            isDeploying={isDeploying}
            deployResult={deployResult}
            onDeploy={() => deployPolicy(currentPolicy)}
          />
        )}

        {/* History */}
        {generatedPolicies.length > 1 && (
          <div>
            <p className="text-xs text-gray-500 mb-2">
              Previously generated ({generatedPolicies.length - 1}):
            </p>
            <div className="space-y-1.5">
              {generatedPolicies.slice(1).map((policy, i) => {
                const typeInfo = POLICY_TYPE_LABELS[policy.policyType] || POLICY_TYPE_LABELS.compliance;
                return (
                  <button
                    key={i}
                    onClick={() => setCurrentPolicy(policy)}
                    className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-750 border border-gray-700 transition-colors"
                  >
                    <span className={`${typeInfo.color} p-1 rounded`}>{typeInfo.icon}</span>
                    <div className="min-w-0 flex-1">
                      <span className="text-xs text-gray-300 truncate block">
                        {policy.displayName}
                      </span>
                      <span className="text-[10px] text-gray-500">
                        {PLATFORM_LABELS[policy.platform] || policy.platform} · {typeInfo.label}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Policy Preview Component ─────────────────────────────────── */

function PolicyPreview({
  policy,
  isDeploying,
  deployResult,
  onDeploy,
}: {
  policy: GeneratedPolicy;
  isDeploying: boolean;
  deployResult: PolicyDeployResult | null;
  onDeploy: () => void;
}) {
  const [showSettings, setShowSettings] = useState(true);
  const [showJson, setShowJson] = useState(false);

  const typeInfo = POLICY_TYPE_LABELS[policy.policyType] || POLICY_TYPE_LABELS.compliance;

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-700 bg-gray-800/80">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-200">
              {policy.displayName}
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">{policy.description}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 ${typeInfo.color}`}>
              {typeInfo.icon}
              {typeInfo.label}
            </span>
            <span className="text-[10px] bg-gray-700 text-gray-400 px-2 py-0.5 rounded-full">
              {PLATFORM_LABELS[policy.platform] || policy.platform}
            </span>
          </div>
        </div>
        {policy.explanation && (
          <p className="text-xs text-gray-500 mt-2 leading-relaxed">
            {policy.explanation}
          </p>
        )}
      </div>

      {/* Settings Summary */}
      <div className="border-b border-gray-700">
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="w-full flex items-center gap-2 px-4 py-2 text-xs text-gray-400 hover:text-gray-300 transition-colors"
        >
          {showSettings ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <span className="font-medium">Policy Settings</span>
          <span className="text-[10px] bg-brand-500/20 text-brand-400 px-1.5 py-0.5 rounded">
            {policy.settingsSummary.length} setting{policy.settingsSummary.length !== 1 ? "s" : ""}
          </span>
        </button>
        {showSettings && (
          <div className="px-4 pb-3">
            <div className="bg-gray-900/50 rounded-lg border border-gray-700/50 divide-y divide-gray-700/50">
              {policy.settingsSummary.map((s, i) => (
                <div key={i} className="flex items-start gap-3 px-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-200">{s.setting}</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">{s.description}</p>
                  </div>
                  <span className="text-[11px] font-mono bg-gray-800 text-green-400 px-2 py-0.5 rounded shrink-0">
                    {s.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* JSON Body */}
      <div className="border-b border-gray-700">
        <button
          onClick={() => setShowJson(!showJson)}
          className="w-full flex items-center gap-2 px-4 py-2 text-xs text-gray-400 hover:text-gray-300 transition-colors"
        >
          {showJson ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <span className="font-medium">Graph API Body</span>
          <span className="text-[10px] bg-gray-600/30 text-gray-400 px-1.5 py-0.5 rounded">
            JSON
          </span>
        </button>
        {showJson && (
          <div className="mx-3 mb-3">
            <SyntaxHighlighter
              language="json"
              style={oneDark}
              customStyle={{
                margin: 0,
                borderRadius: "8px",
                fontSize: "0.75rem",
                border: "1px solid #374151",
              }}
            >
              {JSON.stringify(policy.fullBody, null, 2)}
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
                <div>
                  <span className="block">
                    Policy deployed to Intune!
                  </span>
                  <span className="text-xs text-gray-500">
                    ID: {deployResult.policyId}
                  </span>
                </div>
              </>
            ) : (
              <>
                <XCircle size={16} />
                <span>Deploy failed: {deployResult.error}</span>
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
                Deploy to Intune
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
