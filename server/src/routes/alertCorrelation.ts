import { Router, type Request, type Response } from "express";
import { getGraphClient, fetchWithPagination } from "../graph/client.js";

const router = Router();

interface Correlation {
  pattern: string;
  severity: "critical" | "warning" | "info";
  description: string;
  affectedDevices: string[];
  suggestedCause: string;
}

router.get("/", async (_req: Request, res: Response) => {
  try {
    const client = getGraphClient();
    const devices = await fetchWithPagination<Record<string, unknown>>(client,
      "/deviceManagement/managedDevices",
      { select: "id,deviceName,operatingSystem,osVersion,complianceState,lastSyncDateTime,userPrincipalName,managedDeviceOwnerType,isEncrypted", maxItems: 300 }
    );

    const correlations: Correlation[] = [];

    // Pattern 1: Multiple devices went non-compliant with same OS version
    const ncByOs = new Map<string, string[]>();
    for (const d of devices.items) {
      if (String(d.complianceState) === "noncompliant") {
        const key = `${d.operatingSystem} ${d.osVersion}`;
        if (!ncByOs.has(key)) ncByOs.set(key, []);
        ncByOs.get(key)!.push(String(d.deviceName));
      }
    }
    for (const [os, names] of ncByOs) {
      if (names.length >= 3) {
        correlations.push({
          pattern: "OS-Specific Non-Compliance", severity: "warning",
          description: `${names.length} non-compliant devices all running ${os}`,
          affectedDevices: names,
          suggestedCause: `A compliance policy may be incompatible with ${os}, or a recent OS update broke compliance.`,
        });
      }
    }

    // Pattern 2: Stale devices clustered (all went stale around same time)
    const staleDevices = devices.items.filter((d) => {
      if (!d.lastSyncDateTime) return false;
      return (Date.now() - new Date(String(d.lastSyncDateTime)).getTime()) > 7 * 86400000;
    });
    if (staleDevices.length >= 5) {
      const syncDates = staleDevices.map((d) => new Date(String(d.lastSyncDateTime)).toDateString());
      const dateCount = new Map<string, number>();
      for (const sd of syncDates) dateCount.set(sd, (dateCount.get(sd) || 0) + 1);
      for (const [date, count] of dateCount) {
        if (count >= 3) {
          correlations.push({
            pattern: "Sync Cluster", severity: "warning",
            description: `${count} devices last synced on ${date} and haven't synced since`,
            affectedDevices: staleDevices.filter((d) => new Date(String(d.lastSyncDateTime)).toDateString() === date).map((d) => String(d.deviceName)),
            suggestedCause: "A network change, VPN issue, or service outage on that date may have disconnected these devices.",
          });
        }
      }
    }

    // Pattern 3: Unencrypted devices concentration
    const unencrypted = devices.items.filter((d) => d.isEncrypted === false);
    if (unencrypted.length >= 3) {
      const byOs = new Map<string, string[]>();
      for (const d of unencrypted) {
        const os = String(d.operatingSystem);
        if (!byOs.has(os)) byOs.set(os, []);
        byOs.get(os)!.push(String(d.deviceName));
      }
      for (const [os, names] of byOs) {
        if (names.length >= 2) {
          correlations.push({
            pattern: "Encryption Gap", severity: "critical",
            description: `${names.length} ${os} devices are not encrypted`,
            affectedDevices: names,
            suggestedCause: `BitLocker/FileVault policy may not be assigned to the group containing these ${os} devices.`,
          });
        }
      }
    }

    // Pattern 4: Personal vs corporate compliance difference
    const personal = devices.items.filter((d) => String(d.managedDeviceOwnerType) === "personal");
    const corporate = devices.items.filter((d) => String(d.managedDeviceOwnerType) === "company");
    const personalNC = personal.filter((d) => String(d.complianceState) === "noncompliant").length;
    const corporateNC = corporate.filter((d) => String(d.complianceState) === "noncompliant").length;
    const personalRate = personal.length > 0 ? (personalNC / personal.length) * 100 : 0;
    const corporateRate = corporate.length > 0 ? (corporateNC / corporate.length) * 100 : 0;
    if (personalRate > corporateRate + 20 && personalNC >= 3) {
      correlations.push({
        pattern: "Ownership Compliance Gap", severity: "info",
        description: `Personal devices are ${Math.round(personalRate)}% non-compliant vs ${Math.round(corporateRate)}% for corporate`,
        affectedDevices: personal.filter((d) => String(d.complianceState) === "noncompliant").map((d) => String(d.deviceName)),
        suggestedCause: "Personal devices may not have the same policies or users may not comply with stricter requirements on personal devices.",
      });
    }

    correlations.sort((a, b) => { const o: Record<string, number> = { critical: 0, warning: 1, info: 2 }; return (o[a.severity] || 3) - (o[b.severity] || 3); });
    res.json({ generatedAt: new Date().toISOString(), totalDevices: devices.items.length, correlations, count: correlations.length });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
