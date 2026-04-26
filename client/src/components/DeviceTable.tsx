import DeviceLink from "./DeviceLink.tsx";
import { UserDrillLink, ComplianceStateDrillLink, TroubleshootDrillLink, TimelineDrillLink } from "./DrillLinks.tsx";

interface Column {
  key: string;
  label: string;
}

interface DeviceTableProps {
  data: Record<string, unknown>[];
  columns: Column[];
}

const COMPLIANCE_COLORS: Record<string, string> = {
  compliant: "bg-green-500/20 text-green-400",
  noncompliant: "bg-red-500/20 text-red-400",
  unknown: "bg-gray-500/20 text-gray-400",
  notapplicable: "bg-gray-500/20 text-gray-500",
  ingraceperiod: "bg-yellow-500/20 text-yellow-400",
  configmanager: "bg-blue-500/20 text-blue-400",
};

export default function DeviceTable({ data, columns }: DeviceTableProps) {
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
            <th className="text-left py-2 px-2 text-gray-400 font-medium whitespace-nowrap">Actions</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr
              key={(row.id as string) || i}
              className="border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors"
            >
              {columns.map((col) => (
                <td key={col.key} className="py-2 px-2 text-gray-300 whitespace-nowrap">
                  {col.key === "deviceName" && row[col.key]
                    ? <DeviceLink name={String(row[col.key])} className="text-xs" />
                    : col.key === "complianceState"
                    ? <ComplianceStateDrillLink state={String(row[col.key] ?? "")} className="text-xs" />
                    : col.key === "userPrincipalName" && row[col.key] && String(row[col.key]).includes("@")
                    ? <UserDrillLink upn={String(row[col.key])} className="text-xs" />
                    : col.key.includes("DateTime") || col.key.includes("Date")
                      ? formatDate(row[col.key])
                      : String(row[col.key] ?? "—")}
                </td>
              ))}
              {/* Action links */}
              <td className="py-2 px-2 whitespace-nowrap">
                {row.deviceName ? (
                  <span className="flex items-center gap-2">
                    <TroubleshootDrillLink deviceName={String(row.deviceName)} className="text-[10px]" />
                    <TimelineDrillLink deviceName={String(row.deviceName)} className="text-[10px]" />
                  </span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderComplianceBadge(state: string) {
  const lower = state.toLowerCase();
  const colorClass = COMPLIANCE_COLORS[lower] || "bg-gray-500/20 text-gray-400";
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
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(value);
  }
}
