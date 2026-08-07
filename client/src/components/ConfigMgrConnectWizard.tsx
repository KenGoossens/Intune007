import { useEffect, useState } from "react";
import {
  X,
  Loader2,
  Plug,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ShieldQuestion,
} from "lucide-react";
import { useConfigMgrStore, type ConfigMgrConnectionForm } from "../stores/configMgrStore.ts";
import type { ConfigMgrConnectionStatus } from "@intune-agent/shared";

const EMPTY_FORM: ConfigMgrConnectionForm = {
  adminServiceUrl: "",
  authMode: "azuread",
  resource: "",
  tenantId: "",
  clientId: "",
  clientSecret: "",
  bearerToken: "",
  allowInsecureTls: false,
};

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">
        {label}
      </span>
      {children}
      {hint && <span className="block text-[10px] text-gray-500 mt-0.5">{hint}</span>}
    </label>
  );
}

const inputCls =
  "mt-1 w-full bg-gray-950 border border-gray-700 rounded-md px-2.5 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-brand-500";

export default function ConfigMgrConnectWizard({ onClose }: { onClose: () => void }) {
  const { connectionConfig, fetchConnectionConfig, testConnection, saveConnection, disconnect } =
    useConfigMgrStore();

  const [form, setForm] = useState<ConfigMgrConnectionForm>(EMPTY_FORM);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<ConfigMgrConnectionStatus | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    fetchConnectionConfig();
  }, [fetchConnectionConfig]);

  // Prefill from the saved (masked) connection once it loads.
  useEffect(() => {
    if (connectionConfig && connectionConfig.source === "store") {
      setForm((f) => ({
        ...f,
        adminServiceUrl: connectionConfig.adminServiceUrl,
        authMode: connectionConfig.authMode,
        resource: connectionConfig.resource,
        tenantId: connectionConfig.tenantId,
        clientId: connectionConfig.clientId,
        allowInsecureTls: connectionConfig.allowInsecureTls,
      }));
      if (connectionConfig.tenantId || connectionConfig.clientId) setShowAdvanced(true);
    }
  }, [connectionConfig]);

  const update = <K extends keyof ConfigMgrConnectionForm>(
    key: K,
    value: ConfigMgrConnectionForm[K]
  ) => setForm((f) => ({ ...f, [key]: value }));

  const hasStoredSecret =
    connectionConfig?.source === "store" &&
    (form.authMode === "bearer"
      ? connectionConfig.hasBearerToken
      : connectionConfig.hasClientSecret);

  const validate = (): string | null => {
    if (!form.adminServiceUrl.trim()) return "Enter the AdminService URL.";
    try {
      const u = new URL(form.adminServiceUrl);
      if (u.protocol !== "https:") return "The AdminService URL must use HTTPS.";
    } catch {
      return "The AdminService URL is not a valid URL.";
    }
    if (form.authMode === "azuread" && !form.resource.trim())
      return "Azure AD auth needs a resource (the CMG server app's App ID URI or client ID).";
    if (form.authMode === "bearer" && !form.bearerToken && !hasStoredSecret)
      return "Enter a bearer token.";
    return null;
  };

  const handleTest = async () => {
    const err = validate();
    if (err) {
      setFormError(err);
      setTestResult(null);
      return;
    }
    setFormError(null);
    setTesting(true);
    setTestResult(null);
    try {
      const status = await testConnection(form);
      setTestResult(status);
    } catch (e) {
      setTestResult({
        configured: true,
        connected: false,
        authMode: form.authMode,
        error: e instanceof Error ? e.message : "Test failed",
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    const err = validate();
    if (err) {
      setFormError(err);
      return;
    }
    setFormError(null);
    setSaving(true);
    try {
      const result = await saveConnection(form);
      if (result.ok) onClose();
      else setFormError(result.error ?? "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    setSaving(true);
    try {
      await disconnect();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg bg-gray-900 border border-gray-700 rounded-xl shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <Plug size={16} className="text-brand-400" />
            <h2 className="text-sm font-semibold text-gray-200">
              Connect to Configuration Manager
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-800 text-gray-400"
            title="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-5 py-4 space-y-4">
          <p className="text-[12px] text-gray-500">
            Connect to your site's AdminService (read-only). Use an
            internet-reachable Cloud Management Gateway with Entra auth, or a
            bearer token. Settings are stored securely on the server — no file
            editing needed.
          </p>

          <Field
            label="AdminService URL"
            hint="e.g. https://smsprovider.contoso.com/AdminService or your CMG endpoint"
          >
            <input
              className={inputCls}
              placeholder="https://smsprovider.contoso.com/AdminService"
              value={form.adminServiceUrl}
              onChange={(e) => update("adminServiceUrl", e.target.value)}
            />
          </Field>

          <Field label="Authentication">
            <div className="mt-1 flex gap-2">
              {[
                { v: "azuread", label: "Azure AD (CMG)" },
                { v: "bearer", label: "Bearer token" },
              ].map((opt) => (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => update("authMode", opt.v)}
                  className={`flex-1 px-3 py-1.5 rounded-md text-xs border transition-colors ${
                    form.authMode === opt.v
                      ? "bg-brand-500/20 text-brand-300 border-brand-500/40"
                      : "text-gray-400 border-gray-700 hover:bg-gray-800"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </Field>

          {form.authMode === "azuread" && (
            <>
              <Field
                label="Resource (App ID URI)"
                hint="The CMG server app to request a token for, e.g. api://<server-app-id>"
              >
                <input
                  className={inputCls}
                  placeholder="api://<cmg-server-app-id>"
                  value={form.resource}
                  onChange={(e) => update("resource", e.target.value)}
                />
              </Field>

              <button
                type="button"
                onClick={() => setShowAdvanced((s) => !s)}
                className="text-[11px] text-brand-400 hover:underline"
              >
                {showAdvanced ? "Hide" : "Use a dedicated app registration (advanced)"}
              </button>

              {showAdvanced && (
                <div className="space-y-3 border-l-2 border-gray-800 pl-3">
                  <p className="text-[10px] text-gray-500">
                    Leave blank to reuse the app's main Azure AD registration.
                  </p>
                  <Field label="Tenant ID">
                    <input
                      className={inputCls}
                      placeholder="00000000-0000-0000-0000-000000000000"
                      value={form.tenantId}
                      onChange={(e) => update("tenantId", e.target.value)}
                    />
                  </Field>
                  <Field label="Client ID">
                    <input
                      className={inputCls}
                      placeholder="00000000-0000-0000-0000-000000000000"
                      value={form.clientId}
                      onChange={(e) => update("clientId", e.target.value)}
                    />
                  </Field>
                  <Field label="Client secret" hint={hasStoredSecret ? "A secret is stored — leave blank to keep it." : undefined}>
                    <input
                      type="password"
                      className={inputCls}
                      placeholder={hasStoredSecret ? "•••••••• (stored)" : ""}
                      value={form.clientSecret}
                      onChange={(e) => update("clientSecret", e.target.value)}
                    />
                  </Field>
                </div>
              )}
            </>
          )}

          {form.authMode === "bearer" && (
            <Field
              label="Bearer token"
              hint={hasStoredSecret ? "A token is stored — leave blank to keep it." : "Sent as Authorization: Bearer <token>"}
            >
              <input
                type="password"
                className={inputCls}
                placeholder={hasStoredSecret ? "•••••••• (stored)" : ""}
                value={form.bearerToken}
                onChange={(e) => update("bearerToken", e.target.value)}
              />
            </Field>
          )}

          <label className="flex items-start gap-2 text-[11px] text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={form.allowInsecureTls}
              onChange={(e) => update("allowInsecureTls", e.target.checked)}
            />
            <span>
              Allow self-signed / internal-CA certificate
              <span className="block text-[10px] text-yellow-500/80">
                Only enable for a trusted intranet SMS Provider — it disables TLS
                verification for these calls.
              </span>
            </span>
          </label>

          {/* Test result */}
          {testResult && (
            <div
              className={`flex items-start gap-2 text-xs rounded-lg px-3 py-2 border ${
                testResult.connected
                  ? "text-green-400 bg-green-500/10 border-green-500/30"
                  : "text-red-400 bg-red-500/10 border-red-500/30"
              }`}
            >
              {testResult.connected ? (
                <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
              ) : (
                <XCircle size={14} className="mt-0.5 shrink-0" />
              )}
              <span>
                {testResult.connected
                  ? `Connected to site ${testResult.siteCode || "—"}${
                      testResult.version ? ` · v${testResult.version}` : ""
                    }`
                  : `Not connected${testResult.error ? `: ${testResult.error}` : "."}`}
              </span>
            </div>
          )}

          {formError && (
            <div className="flex items-start gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>{formError}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-5 py-3.5 border-t border-gray-800">
          {connectionConfig?.source === "store" ? (
            <button
              onClick={handleDisconnect}
              disabled={saving}
              className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
            >
              Disconnect
            </button>
          ) : (
            <span className="flex items-center gap-1 text-[10px] text-gray-600">
              <ShieldQuestion size={12} /> Read-only access
            </span>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={handleTest}
              disabled={testing || saving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-gray-300 border border-gray-700 hover:bg-gray-800 disabled:opacity-50"
            >
              {testing ? <Loader2 size={13} className="animate-spin" /> : null}
              Test connection
            </button>
            <button
              onClick={handleSave}
              disabled={saving || testing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-brand-500 text-gray-900 hover:bg-brand-400 disabled:opacity-50"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : null}
              Save &amp; connect
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
