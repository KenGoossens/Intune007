import { ShieldCheck, ShieldAlert, ShieldX, AlertTriangle, HelpCircle, MinusCircle } from "lucide-react";

interface ComplianceStatusCardProps {
  data: Record<string, number>;
}

export default function ComplianceStatusCard({ data }: ComplianceStatusCardProps) {
  const items = [
    {
      label: "Compliant",
      count: data.compliantDeviceCount ?? 0,
      icon: <ShieldCheck size={20} />,
      color: "text-green-400",
      bg: "bg-green-500/10",
    },
    {
      label: "Non-Compliant",
      count: data.nonCompliantDeviceCount ?? 0,
      icon: <ShieldAlert size={20} />,
      color: "text-red-400",
      bg: "bg-red-500/10",
    },
    {
      label: "Error",
      count: data.errorDeviceCount ?? 0,
      icon: <ShieldX size={20} />,
      color: "text-orange-400",
      bg: "bg-orange-500/10",
    },
    {
      label: "Conflict",
      count: data.conflictDeviceCount ?? 0,
      icon: <AlertTriangle size={20} />,
      color: "text-yellow-400",
      bg: "bg-yellow-500/10",
    },
    {
      label: "Unknown",
      count: data.unknownDeviceCount ?? 0,
      icon: <HelpCircle size={20} />,
      color: "text-gray-400",
      bg: "bg-gray-500/10",
    },
    {
      label: "Not Applicable",
      count: data.notApplicableDeviceCount ?? 0,
      icon: <MinusCircle size={20} />,
      color: "text-gray-500",
      bg: "bg-gray-500/10",
    },
  ];

  const total = items.reduce((sum, item) => sum + item.count, 0);

  return (
    <div>
      <div className="grid grid-cols-3 gap-3">
        {items.map((item) => (
          <div
            key={item.label}
            className={`${item.bg} rounded-lg p-3 flex flex-col items-center gap-1`}
          >
            <span className={item.color}>{item.icon}</span>
            <span className="text-2xl font-bold text-white">{item.count}</span>
            <span className="text-xs text-gray-400">{item.label}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 text-center text-xs text-gray-500">
        Total devices: {total}
      </div>
    </div>
  );
}
