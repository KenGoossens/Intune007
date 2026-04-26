import {
  Monitor,
  ShieldCheck,
  Settings,
  AppWindow,
  KeyRound,
  Laptop,
  Clock,
  X,
  Users,
  ShieldAlert,
  FileText,
  Zap,
  RefreshCw,
  Brain,
  CalendarClock,
  Building,
} from "lucide-react";
import { useChatStore } from "../stores/chatStore.ts";
import type { DataPanel as DataPanelType } from "@intune-agent/shared";
import DeviceTable from "./DeviceTable.tsx";
import GenericTable from "./GenericTable.tsx";
import ComplianceStatusCard from "./ComplianceStatusCard.tsx";

const PANEL_ICONS: Record<string, React.ReactNode> = {
  devices: <Monitor size={16} />,
  device_details: <Monitor size={16} />,
  compliance_policies: <ShieldCheck size={16} />,
  compliance_status: <ShieldCheck size={16} />,
  device_configurations: <Settings size={16} />,
  mobile_apps: <AppWindow size={16} />,
  app_install_status: <AppWindow size={16} />,
  conditional_access: <KeyRound size={16} />,
  autopilot_devices: <Laptop size={16} />,
  autopilot_profiles: <Laptop size={16} />,
  device_action: <Zap size={16} />,
  groups: <Users size={16} />,
  group_members: <Users size={16} />,
  security_alerts: <ShieldAlert size={16} />,
  bitlocker_keys: <KeyRound size={16} />,
  device_threat_summary: <ShieldAlert size={16} />,
  audit_logs: <FileText size={16} />,
  sign_in_logs: <FileText size={16} />,
  directory_audit_logs: <FileText size={16} />,
  update_rings: <RefreshCw size={16} />,
  update_compliance: <RefreshCw size={16} />,
  compliance_trend: <Monitor size={16} />,
  agent_notes: <Brain size={16} />,
  scheduled_tasks: <CalendarClock size={16} />,
  tenants: <Building size={16} />,
};

export default function DataPanel() {
  const { dataPanels, clearPanels } = useChatStore();

  if (dataPanels.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500">
        <Monitor size={48} className="mb-4 text-gray-600" />
        <h3 className="text-lg font-medium text-gray-400 mb-1">Data Panels</h3>
        <p className="text-sm text-center max-w-xs">
          Query results will appear here as the agent fetches data from Intune.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <h2 className="text-sm font-semibold text-gray-300">
          Query Results ({dataPanels.length})
        </h2>
        <button
          onClick={clearPanels}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          Clear all
        </button>
      </div>

      {/* Panels stack */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {dataPanels.map((panel) => (
          <PanelCard key={panel.id} panel={panel} />
        ))}
      </div>
    </div>
  );
}

function PanelCard({ panel }: { panel: DataPanelType }) {
  const icon = PANEL_ICONS[panel.type] || <Monitor size={16} />;
  const removePanel = useChatStore((s) => s.removePanel);

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
      {/* Card header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-700 bg-gray-800/80">
        <div className="flex items-center gap-2">
          <span className="text-brand-400">{icon}</span>
          <span className="text-sm font-medium text-gray-200">
            {panel.title}
          </span>
          {panel.totalCount !== undefined && (
            <span className="text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded-full">
              {panel.totalCount} total
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Clock size={12} />
          {new Date(panel.timestamp).toLocaleTimeString()}
          <button
            onClick={() => removePanel(panel.id)}
            className="p-0.5 text-gray-600 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors ml-1"
            title="Dismiss this card"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Card body */}
      <div className="p-3 overflow-x-auto">
        {renderPanelContent(panel)}
      </div>
    </div>
  );
}

function renderPanelContent(panel: DataPanelType) {
  if (!panel.data || panel.data.length === 0) {
    return (
      <p className="text-sm text-gray-500 py-4 text-center">No data returned</p>
    );
  }

  switch (panel.type) {
    case "devices":
      return (
        <DeviceTable
          data={panel.data as Record<string, unknown>[]}
          columns={[
            { key: "deviceName", label: "Device Name" },
            { key: "operatingSystem", label: "OS" },
            { key: "osVersion", label: "Version" },
            { key: "complianceState", label: "Compliance" },
            { key: "managedDeviceOwnerType", label: "Ownership" },
            { key: "userPrincipalName", label: "User" },
            { key: "lastSyncDateTime", label: "Last Sync" },
          ]}
        />
      );

    case "compliance_status":
      return <ComplianceStatusCard data={panel.data[0] as Record<string, number>} />;

    case "compliance_policies":
      return (
        <GenericTable
          data={panel.data as Record<string, unknown>[]}
          columns={[
            { key: "displayName", label: "Policy Name" },
            { key: "description", label: "Description" },
            { key: "createdDateTime", label: "Created" },
            { key: "lastModifiedDateTime", label: "Modified" },
          ]}
        />
      );

    case "device_configurations":
      return (
        <GenericTable
          data={panel.data as Record<string, unknown>[]}
          columns={[
            { key: "displayName", label: "Profile Name" },
            { key: "description", label: "Description" },
            { key: "version", label: "Version" },
            { key: "lastModifiedDateTime", label: "Modified" },
          ]}
        />
      );

    case "mobile_apps":
      return (
        <GenericTable
          data={panel.data as Record<string, unknown>[]}
          columns={[
            { key: "displayName", label: "App Name" },
            { key: "publisher", label: "Publisher" },
            { key: "createdDateTime", label: "Created" },
            { key: "lastModifiedDateTime", label: "Modified" },
          ]}
        />
      );

    case "conditional_access":
      return (
        <GenericTable
          data={panel.data as Record<string, unknown>[]}
          columns={[
            { key: "displayName", label: "Policy Name" },
            { key: "state", label: "State" },
            { key: "createdDateTime", label: "Created" },
            { key: "modifiedDateTime", label: "Modified" },
          ]}
        />
      );

    case "autopilot_devices":
      return (
        <GenericTable
          data={panel.data as Record<string, unknown>[]}
          columns={[
            { key: "serialNumber", label: "Serial Number" },
            { key: "model", label: "Model" },
            { key: "manufacturer", label: "Manufacturer" },
            { key: "groupTag", label: "Group Tag" },
            { key: "enrollmentState", label: "Enrollment" },
            { key: "lastContactedDateTime", label: "Last Contact" },
          ]}
        />
      );

    case "autopilot_profiles":
      return (
        <GenericTable
          data={panel.data as Record<string, unknown>[]}
          columns={[
            { key: "displayName", label: "Profile Name" },
            { key: "description", label: "Description" },
            { key: "language", label: "Language" },
            { key: "lastModifiedDateTime", label: "Modified" },
          ]}
        />
      );

    case "detected_apps":
      return (
        <GenericTable
          data={panel.data as Record<string, unknown>[]}
          columns={[
            { key: "displayName", label: "App Name" },
            { key: "version", label: "Version" },
            { key: "sizeInByte", label: "Size" },
            { key: "deviceCount", label: "Devices" },
          ]}
        />
      );

    case "device_configuration_states":
      return (
        <GenericTable
          data={panel.data as Record<string, unknown>[]}
          columns={[
            { key: "displayName", label: "Profile Name" },
            { key: "state", label: "State" },
            { key: "platformType", label: "Platform" },
            { key: "version", label: "Version" },
            { key: "settingCount", label: "Settings" },
          ]}
        />
      );

    case "device_app_install_states":
      return (
        <GenericTable
          data={panel.data as Record<string, unknown>[]}
          columns={[
            { key: "appName", label: "App Name" },
            { key: "publisher", label: "Publisher" },
            { key: "installState", label: "Install State" },
            { key: "lastSyncDateTime", label: "Last Sync" },
            { key: "errorCode", label: "Error Code" },
          ]}
        />
      );

    // ─── Device Actions ────────────────────────────────────────
    case "device_action":
      return (
        <GenericTable
          data={panel.data as Record<string, unknown>[]}
          columns={[
            { key: "action", label: "Action" },
            { key: "success", label: "Status" },
            { key: "message", label: "Message" },
            { key: "deviceId", label: "Device ID" },
            { key: "timestamp", label: "Timestamp" },
          ]}
        />
      );

    // ─── Groups ────────────────────────────────────────────────
    case "groups":
      return (
        <GenericTable
          data={panel.data as Record<string, unknown>[]}
          columns={[
            { key: "displayName", label: "Group Name" },
            { key: "description", label: "Description" },
            { key: "securityEnabled", label: "Security" },
            { key: "mailEnabled", label: "Mail" },
            { key: "membershipRuleProcessingState", label: "Dynamic" },
            { key: "createdDateTime", label: "Created" },
          ]}
        />
      );

    case "group_members":
      return (
        <GenericTable
          data={panel.data as Record<string, unknown>[]}
          columns={[
            { key: "displayName", label: "Name" },
            { key: "odataType", label: "Type" },
            { key: "userPrincipalName", label: "UPN" },
            { key: "operatingSystem", label: "OS" },
          ]}
        />
      );

    // ─── Security ──────────────────────────────────────────────
    case "security_alerts":
      return (
        <GenericTable
          data={panel.data as Record<string, unknown>[]}
          columns={[
            { key: "title", label: "Alert" },
            { key: "severity", label: "Severity" },
            { key: "status", label: "Status" },
            { key: "category", label: "Category" },
            { key: "createdDateTime", label: "Created" },
          ]}
        />
      );

    case "bitlocker_keys":
      return (
        <GenericTable
          data={panel.data as Record<string, unknown>[]}
          columns={[
            { key: "id", label: "Key ID" },
            { key: "deviceId", label: "Device ID" },
            { key: "volumeType", label: "Volume" },
            { key: "createdDateTime", label: "Created" },
          ]}
        />
      );

    // ─── Logs ──────────────────────────────────────────────────
    case "audit_logs":
      return (
        <GenericTable
          data={panel.data as Record<string, unknown>[]}
          columns={[
            { key: "displayName", label: "Event" },
            { key: "componentName", label: "Component" },
            { key: "activity", label: "Activity" },
            { key: "activityDateTime", label: "Date" },
          ]}
        />
      );

    case "sign_in_logs":
      return (
        <GenericTable
          data={panel.data as Record<string, unknown>[]}
          columns={[
            { key: "userDisplayName", label: "User" },
            { key: "appDisplayName", label: "App" },
            { key: "ipAddress", label: "IP" },
            { key: "clientAppUsed", label: "Client" },
            { key: "createdDateTime", label: "Date" },
          ]}
        />
      );

    // ─── Windows Update ────────────────────────────────────────
    case "update_rings":
      return (
        <GenericTable
          data={panel.data as Record<string, unknown>[]}
          columns={[
            { key: "displayName", label: "Ring Name" },
            { key: "qualityUpdatesDeferralPeriodInDays", label: "Quality Deferral" },
            { key: "featureUpdatesDeferralPeriodInDays", label: "Feature Deferral" },
            { key: "automaticUpdateMode", label: "Update Mode" },
            { key: "lastModifiedDateTime", label: "Modified" },
          ]}
        />
      );

    case "update_compliance": {
      // The data contains a summary object — check if it has a devices array
      const compData = panel.data[0] as Record<string, unknown> | undefined;
      const devicesList = (compData?.devices || []) as Record<string, unknown>[];
      if (devicesList.length > 0) {
        return (
          <GenericTable
            data={devicesList}
            columns={[
              { key: "deviceName", label: "Device Name" },
              { key: "userPrincipalName", label: "User" },
              { key: "osVersion", label: "OS Version" },
              { key: "updateStatus", label: "Update Status" },
              { key: "complianceState", label: "Compliance" },
              { key: "lastSyncDateTime", label: "Last Sync" },
            ]}
          />
        );
      }
      return (
        <GenericTable
          data={panel.data as Record<string, unknown>[]}
          columns={inferColumns(panel.data as Record<string, unknown>[])}
        />
      );
    }

    default:
      return (
        <GenericTable
          data={panel.data as Record<string, unknown>[]}
          columns={inferColumns(panel.data as Record<string, unknown>[])}
        />
      );
  }
}

function inferColumns(
  data: Record<string, unknown>[]
): { key: string; label: string }[] {
  if (!data.length) return [];
  const first = data[0];
  return Object.keys(first)
    .filter((k) => !k.startsWith("@") && k !== "id")
    .slice(0, 6)
    .map((k) => ({
      key: k,
      label: k
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (c) => c.toUpperCase())
        .trim(),
    }));
}
