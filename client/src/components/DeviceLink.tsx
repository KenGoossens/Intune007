import { Monitor } from "lucide-react";
import { useNavigationStore } from "../stores/navigationStore.ts";

/**
 * Clickable device name link — navigates to the Device Card panel.
 * Use this anywhere a device name is displayed to make it interactive.
 */
export default function DeviceLink({ name, className }: { name: string; className?: string }) {
  const navigateToDeviceCard = useNavigationStore((s) => s.navigateToDeviceCard);

  return (
    <button
      onClick={() => navigateToDeviceCard(name)}
      className={`inline-flex items-center gap-1 text-brand-400 hover:text-brand-300 hover:underline transition-colors ${className || ""}`}
      title={`View device card for ${name}`}
    >
      <Monitor size={11} className="shrink-0" />
      {name}
    </button>
  );
}
