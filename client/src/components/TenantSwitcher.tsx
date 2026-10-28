import { useEffect, useRef, useState } from "react";
import { Building2, ChevronDown, Plus, Check, Trash2, Loader2, X, ExternalLink, Pencil } from "lucide-react";
import { useTenantStore } from "../stores/tenantStore";

interface ConsentMessage {
  source: "intune007-tenant-consent";
  payload: {
    ok: boolean;
    message: string;
    tenant?: { tenantId: string; displayName: string };
  };
}

export default function TenantSwitcher() {
  const { tenants, loading, fetchTenants, switchTenant, disconnectTenant, beginConsent, renameTenant, addConsentedTenant } = useTenantStore();
  const [open, setOpen] = useState(false);
  const [showConnect, setShowConnect] = useState(false);
  const [tenantInput, setTenantInput] = useState("");
  const [friendlyInput, setFriendlyInput] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<Window | null>(null);

  useEffect(() => {
    fetchTenants();
  }, [fetchTenants]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Listen for consent callback messages from the popup
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const data = event.data as ConsentMessage | undefined;
      if (!data || data.source !== "intune007-tenant-consent") return;
      setConnecting(false);
      if (data.payload.ok && data.payload.tenant) {
        setStatusMsg({ kind: "ok", text: `Connected: ${data.payload.tenant.displayName}` });
        setShowConnect(false);
        setTenantInput("");
        fetchTenants();
      } else {
        setStatusMsg({ kind: "err", text: data.payload.message });
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [fetchTenants]);

  // Fallback: poll for new tenants while a popup is open (in case postMessage is blocked).
  useEffect(() => {
    if (!connecting) return;
    const interval = setInterval(() => {
      void fetchTenants();
      if (popupRef.current?.closed) {
        setConnecting(false);
        clearInterval(interval);
        // Consent can succeed while the redirect back here does not — a
        // blocked redirect, a popup closed on the "approved" screen, a server
        // restart that forgot the state token. The grant is real either way,
        // so ask the directory instead of throwing the consent away and
        // making someone approve 50 permissions a second time.
        void recoverMissedConsent();
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [connecting, fetchTenants]);

  async function recoverMissedConsent() {
    const target = tenantInput.trim();
    if (!target) return; // Nothing to probe: the admin picked the tenant at sign-in.
    const before = useTenantStore.getState().tenants.length;
    await fetchTenants();
    if (useTenantStore.getState().tenants.length > before) return; // The callback worked.

    try {
      const tenant = await addConsentedTenant(target, friendlyInput.trim() || undefined);
      setStatusMsg({
        kind: "ok",
        text: `Connected: ${tenant.friendlyName || tenant.displayName}. The consent window did not report back, so this was confirmed directly with the directory.`,
      });
      setShowConnect(false);
    } catch {
      // Consent genuinely did not complete, or was declined. The dialog stays
      // open with whatever was typed, so it can simply be retried.
    }
  }

  const active = tenants.find((t) => t.isActive);

  async function handleConnect() {
    setStatusMsg(null);
    try {
      const target = tenantInput.trim() || "common";
      const { url } = await beginConsent(target, friendlyInput.trim() || undefined);
      const popup = window.open(url, "intune007-consent", "width=600,height=720,noopener=no");
      if (!popup) {
        setStatusMsg({ kind: "err", text: "Popup blocked. Please allow popups for this site." });
        return;
      }
      popupRef.current = popup;
      setConnecting(true);
    } catch (err) {
      setStatusMsg({ kind: "err", text: err instanceof Error ? err.message : "Failed to start consent flow" });
    }
  }

  async function handleRename(tenantId: string) {
    const next = renameInput.trim();
    try {
      // An empty box clears the name rather than storing "", so the tenant
      // falls back to its directory name instead of becoming unnameable.
      await renameTenant(tenantId, next || null);
      setRenamingId(null);
    } catch (err) {
      setStatusMsg({ kind: "err", text: err instanceof Error ? err.message : "Rename failed" });
    }
  }

  async function handleSwitch(tenantId: string) {
    if (active?.tenantId === tenantId) {
      setOpen(false);
      return;
    }
    try {
      await switchTenant(tenantId);
      setOpen(false);
    } catch (err) {
      setStatusMsg({ kind: "err", text: err instanceof Error ? err.message : "Switch failed" });
    }
  }

  async function handleDisconnect(tenantId: string, displayName: string) {
    if (!window.confirm(`Disconnect ${displayName}? This removes it from the local list. Admin consent in the tenant remains until revoked there.`)) {
      return;
    }
    try {
      await disconnectTenant(tenantId);
    } catch (err) {
      setStatusMsg({ kind: "err", text: err instanceof Error ? err.message : "Disconnect failed" });
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md text-[12px] text-gray-300 bg-gray-800/60 hover:bg-gray-800 border border-gray-700/60 transition-colors"
        title={active?.tenantId}
      >
        <span className="flex items-center gap-1.5 min-w-0">
          <Building2 size={12} className="text-brand-400 shrink-0" />
          <span className="truncate font-medium">{(active?.friendlyName || active?.displayName) ?? (loading ? "Loading…" : "No tenant")}</span>
        </span>
        <ChevronDown size={12} className={`shrink-0 text-gray-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 mt-1 bg-gray-900 border border-gray-700 rounded-md shadow-xl z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-800">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Tenants</p>
          </div>
          <ul className="max-h-64 overflow-y-auto">
            {tenants.length === 0 && !loading && (
              <li className="px-3 py-3 text-[12px] text-gray-500 italic">No tenants connected</li>
            )}
            {tenants.map((t) => (
              <li key={t.tenantId} className="group flex items-center hover:bg-gray-800/80">
                {renamingId === t.tenantId ? (
                  <form
                    className="flex-1 flex items-center gap-1.5 px-3 py-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void handleRename(t.tenantId);
                    }}
                  >
                    <input
                      autoFocus
                      value={renameInput}
                      onChange={(e) => setRenameInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Escape" && setRenamingId(null)}
                      maxLength={64}
                      placeholder="Friendly name"
                      className="flex-1 min-w-0 px-2 py-1 bg-gray-800 border border-gray-600 rounded text-[11px] text-gray-200 focus:border-brand-500 focus:outline-none"
                    />
                    <button type="submit" className="text-[10px] text-brand-400 hover:underline">
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setRenamingId(null)}
                      className="text-[10px] text-gray-500 hover:text-gray-300"
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  <>
                    <button
                      onClick={() => handleSwitch(t.tenantId)}
                      className="flex-1 flex items-center gap-2 px-3 py-2 text-left text-[12px] min-w-0"
                    >
                      <span className="w-3 shrink-0">
                        {t.isActive && <Check size={12} className="text-brand-400" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate font-medium ${t.isActive ? "text-brand-400" : "text-gray-200"}`}>
                          {t.friendlyName || t.displayName}
                        </span>
                        {/* With a friendly name set, the directory name is the
                            useful second line — the GUID is not what anyone
                            recognises a tenant by. */}
                        <span className="block truncate text-[10px] text-gray-500">
                          {t.friendlyName ? t.displayName : t.tenantId}
                        </span>
                      </span>
                    </button>
                    <button
                      onClick={() => {
                        setRenamingId(t.tenantId);
                        setRenameInput(t.friendlyName ?? "");
                      }}
                      className="p-2 text-gray-600 hover:text-brand-400 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Rename tenant"
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      onClick={() => handleDisconnect(t.tenantId, t.friendlyName || t.displayName)}
                      className="p-2 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Disconnect tenant"
                    >
                      <Trash2 size={12} />
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
          <button
            onClick={() => {
              setShowConnect(true);
              setOpen(false);
              setStatusMsg(null);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-brand-400 hover:bg-gray-800 border-t border-gray-800 font-medium"
          >
            <Plus size={12} />
            Connect tenant…
          </button>
        </div>
      )}

      {/* Connect modal */}
      {showConnect && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-lg max-w-md w-full p-5 shadow-2xl">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-sm font-bold text-white">Connect a tenant</h3>
                <p className="text-[11px] text-gray-500 mt-0.5">A Global Admin in the target tenant must grant consent.</p>
              </div>
              <button
                onClick={() => {
                  setShowConnect(false);
                  setConnecting(false);
                  setStatusMsg(null);
                }}
                className="text-gray-500 hover:text-gray-300"
              >
                <X size={16} />
              </button>
            </div>

            <label className="block text-[11px] text-gray-400 mb-1">Tenant ID or domain (optional)</label>
            <input
              type="text"
              value={tenantInput}
              onChange={(e) => setTenantInput(e.target.value)}
              placeholder="contoso.onmicrosoft.com — or leave blank to choose at sign-in"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-[12px] text-gray-200 placeholder-gray-600 focus:border-brand-500 focus:outline-none font-mono"
              disabled={connecting}
            />
            <p className="text-[10px] text-gray-600 mt-1">Leave blank to use Azure AD's tenant picker.</p>

            <label className="block text-[11px] text-gray-400 mb-1 mt-3">Friendly name (optional)</label>
            <input
              type="text"
              value={friendlyInput}
              onChange={(e) => setFriendlyInput(e.target.value)}
              placeholder="Mauvlan"
              maxLength={64}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-[12px] text-gray-200 placeholder-gray-600 focus:border-brand-500 focus:outline-none"
              disabled={connecting}
            />
            <p className="text-[10px] text-gray-600 mt-1">
              What you'll call this tenant in a prompt — "how many devices in Mauvlan?"
            </p>

            {statusMsg && (
              <div
                className={`mt-3 px-3 py-2 rounded text-[11px] whitespace-pre-line ${
                  statusMsg.kind === "ok" ? "bg-emerald-900/40 text-emerald-300 border border-emerald-800/60" : "bg-red-900/40 text-red-300 border border-red-800/60"
                }`}
              >
                {statusMsg.text}
              </div>
            )}

            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => {
                  setShowConnect(false);
                  setConnecting(false);
                }}
                className="px-3 py-1.5 text-[12px] text-gray-400 hover:text-gray-200"
                disabled={connecting}
              >
                Cancel
              </button>
              <button
                onClick={handleConnect}
                disabled={connecting}
                className="px-3 py-1.5 text-[12px] bg-brand-600 hover:bg-brand-500 text-black font-semibold rounded flex items-center gap-1.5 disabled:opacity-50"
              >
                {connecting ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    Waiting for consent…
                  </>
                ) : (
                  <>
                    <ExternalLink size={12} />
                    Open admin consent
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating status toast for switch/disconnect errors */}
      {statusMsg && !showConnect && (
        <div className="fixed bottom-4 left-4 z-50 max-w-sm">
          <div
            className={`px-3 py-2 rounded shadow-lg text-[11px] flex items-start gap-2 ${
              statusMsg.kind === "ok" ? "bg-emerald-900 text-emerald-100 border border-emerald-700" : "bg-red-900 text-red-100 border border-red-700"
            }`}
          >
            <span className="flex-1 whitespace-pre-line">{statusMsg.text}</span>
            <button onClick={() => setStatusMsg(null)} className="text-current opacity-70 hover:opacity-100">
              <X size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
