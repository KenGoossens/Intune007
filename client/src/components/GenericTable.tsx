interface Column {
  key: string;
  label: string;
}

interface GenericTableProps {
  data: Record<string, unknown>[];
  columns: Column[];
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
                  {col.key === "state"
                    ? renderStateBadge(String(row[col.key] ?? ""))
                    : col.key.includes("DateTime") || col.key.includes("Date")
                      ? formatDate(row[col.key])
                      : String(row[col.key] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
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
