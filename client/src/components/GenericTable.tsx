import DeviceLink from "./DeviceLink.tsx";
import {
  PolicyDrillLink,
  AppDrillLink,
  GroupDrillLink,
  UserDrillLink,
  ComplianceStateDrillLink,
} from "./DrillLinks.tsx";

interface Column {
  key: string;
  label: string;
}

interface GenericTableProps {
  data: Record<string, unknown>[];
  columns: Column[];
}

// Columns that contain device names — rendered as clickable links
const DEVICE_NAME_KEYS = new Set(["deviceName", "device_name", "DeviceName", "managedDeviceName"]);
// Columns that contain policy / profile names
const POLICY_NAME_KEYS = new Set(["displayName"]);
// Columns with known policy-type context (helps disambiguate displayName)
const POLICY_CONTEXT_KEYS = new Set([
  "compliance_policies", "device_configurations", "conditional_access",
  "update_rings", "autopilot_profiles",
]);
// Columns that contain app names
const APP_NAME_KEYS = new Set(["appName"]);
// Columns that contain user UPNs
const USER_UPN_KEYS = new Set(["userPrincipalName", "userDisplayName"]);
// Columns that contain compliance state
const STATE_KEYS = new Set(["state", "complianceState", "updateStatus", "installState", "enrollmentState"]);
// Columns that contain group names
const GROUP_NAME_KEYS = new Set(["groupDisplayName"]);

/**
 * Detect if a row is about a policy (vs a device or app).
 * If the row has fields like "description", "version" and no "operatingSystem", it's likely a policy.
 */
function isPolicyRow(row: Record<string, unknown>): boolean {
  return (
    ("description" in row || "lastModifiedDateTime" in row) &&
    !("operatingSystem" in row) &&
    !("osVersion" in row) &&
    !("serialNumber" in row)
  );
}

/** Detect if a row is about an app */
function isAppRow(row: Record<string, unknown>): boolean {
  return "publisher" in row && ("appType" in row || "installState" in row || "version" in row);
}

/** Detect if a row is about a group */
function isGroupRow(row: Record<string, unknown>): boolean {
  return "securityEnabled" in row || "membershipRuleProcessingState" in row || "mailEnabled" in row;
}

export default function GenericTable({ data, columns }: GenericTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-700">
            {columns.map((col) => (
              <th
                key={col.key}
                className="text-left py-2 px-2 text-gray-400 font-medium whitespace-nowrap"
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr
              key={(row.id as string) || i}
              className="border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors"
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className="py-2 px-2 text-gray-300 max-w-xs truncate"
                  title={String(row[col.key] ?? "")}
                >
                  {renderCell(col.key, row[col.key], row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Smart cell renderer — detects data type and renders the appropriate interactive link.
 */
function renderCell(key: string, value: unknown, row: Record<string, unknown>): React.ReactNode {
  if (value == null || value === "") return "—";
  const strVal = String(value);

  // Device names → Device Card
  if (DEVICE_NAME_KEYS.has(key)) {
    return <DeviceLink name={strVal} className="text-xs" />;
  }

  // Compliance state → Security Posture drill-down
  if (STATE_KEYS.has(key)) {
    if (key === "complianceState") {
      return <ComplianceStateDrillLink state={strVal} className="text-xs" />;
    }
    return renderStateBadge(strVal);
  }

  // User UPNs → Query Builder (find their devices)
  if (USER_UPN_KEYS.has(key) && strVal.includes("@")) {
    return <UserDrillLink upn={strVal} className="text-xs" />;
  }

  // displayName — context-dependent: policy, app, or group
  if (POLICY_NAME_KEYS.has(key)) {
    if (isGroupRow(row)) {
      return <GroupDrillLink name={strVal} className="text-xs" />;
    }
    if (isAppRow(row)) {
      return <AppDrillLink name={strVal} className="text-xs" />;
    }
    if (isPolicyRow(row)) {
      return <PolicyDrillLink name={strVal} className="text-xs" />;
    }
  }

  // App names
  if (APP_NAME_KEYS.has(key)) {
    return <AppDrillLink name={strVal} className="text-xs" />;
  }

  // Group names
  if (GROUP_NAME_KEYS.has(key)) {
    return <GroupDrillLink name={strVal} className="text-xs" />;
  }

  // Dates
  if (key.includes("DateTime") || key.includes("Date") || key.endsWith("_at")) {
    return formatDate(value);
  }

  return strVal;
}

function renderStateBadge(state: string) {
  const lower = state.toLowerCase();
  let colorClass = "bg-gray-500/20 text-gray-400";

  if (lower === "enabled" || lower === "active") {
    colorClass = "bg-green-500/20 text-green-400";
  } else if (lower === "disabled" || lower === "inactive") {
    colorClass = "bg-red-500/20 text-red-400";
  } else if (lower.includes("report")) {
    colorClass = "bg-blue-500/20 text-blue-400";
  }

  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
      {state}
    </span>
  );
}

function formatDate(value: unknown): string {
  if (!value) return "—";
  try {
    const d = new Date(String(value));
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return String(value);
  }
}
