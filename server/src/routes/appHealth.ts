import { Router, type Request, type Response } from "express";
import { getGraphClient, fetchWithPagination } from "../graph/client.js";
import { getManagedDevices } from "../graph/devices.js";
import { removeApp, getAppAssignments } from "../graph/appManagement.js";
import { findAndUploadIcon, searchIconWithProgress, uploadAppIcon } from "../graph/appIcons.js";
import { sanitizeErrorMessage } from "../security.js";

const router = Router();
const BETA = "https://graph.microsoft.com/beta";

let cache: { data: unknown; ts: number } | null = null;

// Icon cache — persists across requests, keyed by app ID
const iconCache = new Map<string, { base64: string; type: string } | null>();

/** Clear the app health cache (call after icon uploads) */
export function clearAppHealthCache(): void {
  cache = null;
  iconCache.clear();
}

/**
 * Fetch app icon from Graph API (individual app endpoint).
 * Caches result so we only fetch once per app.
 */
async function getAppIcon(client: ReturnType<typeof getGraphClient>, appId: string): Promise<{ base64: string; type: string } | null> {
  if (iconCache.has(appId)) return iconCache.get(appId) || null;

  try {
    const app = await client
      .api(`${BETA}/deviceAppManagement/mobileApps/${appId}`)
      .select("id,largeIcon")
      .get();

    const icon = app.largeIcon;
    if (icon?.value && icon.value.length > 10) {
      const result = { base64: icon.value, type: icon.type || "image/png" };
      iconCache.set(appId, result);
      return result;
    }
  } catch { /* skip */ }

  iconCache.set(appId, null);
  return null;
}

/**
 * App Health works by checking detected apps per device (which works with Read.All).
 * The deviceStatuses/installSummary endpoints require ReadWrite.All permission.
 */
router.get("/", async (_req: Request, res: Response) => {
  if (cache && Date.now() - cache.ts < 180000) { res.json(cache.data); return; }
  try {
    const client = getGraphClient();

    // Get all managed apps
    const apps = await fetchWithPagination<Record<string, unknown>>(client,
      `${BETA}/deviceAppManagement/mobileApps`,
      { select: "id,displayName,publisher", maxItems: 100 }
    );

    // Get all devices
    const devices = await getManagedDevices({ top: 100 });

    // For each device, get detected apps and cross-reference
    const appDeviceMap = new Map<string, Set<string>>(); // appName -> Set of deviceNames
    let totalDetectedApps = 0;

    // Track: appName -> Map of deviceName -> version
    const appDeviceDetails = new Map<string, Map<string, string>>();

    for (const device of devices.items) {
      try {
        const detected = await fetchWithPagination<Record<string, unknown>>(client,
          `${BETA}/deviceManagement/managedDevices/${device.id}/detectedApps`,
          { select: "displayName,version", maxItems: 200 }
        );
        totalDetectedApps += detected.items.length;
        for (const app of detected.items) {
          const name = String(app.displayName || "");
          if (!appDeviceDetails.has(name)) appDeviceDetails.set(name, new Map());
          appDeviceDetails.get(name)!.set(
            String((device as unknown as Record<string, unknown>).deviceName || ""),
            String(app.version || "")
          );
        }
      } catch { /* skip */ }
    }

    // Build app health list — merge managed apps with detected data using fuzzy matching
    const appHealth: Array<Record<string, unknown>> = [];

    // Build a lowercase index for fuzzy matching
    const detectedNamesLower = new Map<string, Map<string, string>>();
    for (const [name, deviceMap] of appDeviceDetails) {
      detectedNamesLower.set(name.toLowerCase(), deviceMap);
    }

    for (const app of apps.items) {
      const appName = String(app.displayName || "");
      const appType = String(app["@odata.type"] || "").replace("#microsoft.graph.", "");
      const appNameLower = appName.toLowerCase();

      // Try exact match first, then fuzzy (contains) match
      let matchedDevices: Map<string, string> | undefined = detectedNamesLower.get(appNameLower);

      if (!matchedDevices || matchedDevices.size === 0) {
        for (const [detectedName, deviceMap] of detectedNamesLower) {
          if (detectedName.includes(appNameLower) || appNameLower.includes(detectedName)) {
            if (!matchedDevices || deviceMap.size > matchedDevices.size) {
              matchedDevices = deviceMap;
            }
          }
        }
      }

      const detectedOn = matchedDevices?.size || 0;
      const deviceList = matchedDevices
        ? Array.from(matchedDevices.entries()).map(([name, version]) => ({ deviceName: name, version }))
        : [];

      appHealth.push({
        appId: String(app.id),
        displayName: appName,
        publisher: app.publisher,
        appType,
        iconBase64: null as string | null,
        iconType: "image/png",
        detectedOnDevices: detectedOn,
        totalDevices: devices.items.length,
        deploymentRate: devices.items.length > 0 ? Math.round((detectedOn / devices.items.length) * 100) : 0,
        devices: deviceList,
      });
    }

    // Fetch icons in parallel batches of 5
    const BATCH_SIZE = 5;
    for (let i = 0; i < appHealth.length; i += BATCH_SIZE) {
      const batch = appHealth.slice(i, i + BATCH_SIZE);
      const icons = await Promise.all(
        batch.map((app) => getAppIcon(client, app.appId as string))
      );
      for (let j = 0; j < batch.length; j++) {
        if (icons[j]) {
          batch[j].iconBase64 = icons[j]!.base64;
          batch[j].iconType = icons[j]!.type;
        }
      }
    }

    appHealth.sort((a, b) => (b.detectedOnDevices as number) - (a.detectedOnDevices as number));

    const result = {
      generatedAt: new Date().toISOString(),
      totalManagedApps: apps.items.length,
      totalDevices: devices.items.length,
      totalDetectedApps,
      appsDetectedOnDevices: appHealth.filter((a) => (a.detectedOnDevices as number) > 0).length,
      apps: appHealth,
    };
    cache = { data: result, ts: Date.now() };
    res.json(result);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeErrorMessage(err instanceof Error ? err.message : String(err)) });
  }
});

/** POST /api/app-health/fix-icon — SSE streaming icon search + upload with step-by-step progress */
router.post("/fix-icon", async (req: Request, res: Response) => {
  const { appId, appName, publisher, force } = req.body;
  if (!appId || !appName) { res.status(400).json({ error: "appId and appName required" }); return; }

  // Set up SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    // Step 1: Resolve domain
    send("step", { step: "resolve_domain", status: "running", detail: `Resolving domain for "${appName}" (publisher: ${publisher || "unknown"})...` });

    const searchResult = await searchIconWithProgress(appName, publisher, (source, status, detail) => {
      send("step", { step: `search_${source}`, status, detail });
    });

    if (!searchResult.found || !searchResult.base64) {
      send("step", { step: "result", status: "failed", detail: `No icon found for "${appName}". Domain: ${searchResult.domain || "unknown"}. All ${searchResult.sourcesChecked || 0} sources exhausted.` });
      send("done", { success: false, message: `Could not find an icon for "${appName}".` });
      res.end();
      return;
    }

    send("step", { step: "found", status: "success", detail: `Icon found from ${searchResult.source} (${Math.round((searchResult.sizeBytes || 0) / 1024)}KB, ${searchResult.mimeType})` });

    // Step 2: Upload to Intune
    send("step", { step: "upload", status: "running", detail: "Uploading PNG to Intune via Graph API..." });

    try {
      await uploadAppIcon(appId, searchResult.base64, "image/png");
      clearAppHealthCache();
      send("step", { step: "upload", status: "success", detail: "Icon uploaded to Intune successfully!" });
      send("done", { success: true, message: `Icon uploaded from ${searchResult.source} (${searchResult.domain})`, iconSource: searchResult.source });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      send("step", { step: "upload", status: "failed", detail: `Upload failed: ${msg.substring(0, 200)}` });
      send("done", { success: false, message: `Found icon but upload failed: ${msg.substring(0, 150)}` });
    }
  } catch (err: unknown) {
    send("step", { step: "error", status: "failed", detail: sanitizeErrorMessage(err instanceof Error ? err.message : String(err)) });
    send("done", { success: false, message: "Unexpected error during icon fix." });
  }

  res.end();
});

/** DELETE /api/app-health/:appId — Remove an app from Intune (assignments first, then delete) */
router.delete("/:appId", async (req: Request, res: Response) => {
  const appId = String(req.params.appId);
  if (!appId) { res.status(400).json({ error: "appId is required" }); return; }
  try {
    const result = await removeApp(appId);
    clearAppHealthCache();
    res.json(result);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeErrorMessage(err instanceof Error ? err.message : String(err)) });
  }
});

/** GET /api/app-health/:appId/assignments — Get assignments for an app */
router.get("/:appId/assignments", async (req: Request, res: Response) => {
  const appId = String(req.params.appId);
  try {
    const assignments = await getAppAssignments(appId);
    res.json({ appId, assignments, count: assignments.length });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeErrorMessage(err instanceof Error ? err.message : String(err)) });
  }
});

export default router;
