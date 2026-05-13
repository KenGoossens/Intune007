import { Router, type Request, type Response } from "express";
import { getGraphClient, fetchWithPagination } from "../graph/client.js";
import { getManagedDevices } from "../graph/devices.js";
import { removeApp, getAppAssignments } from "../graph/appManagement.js";
import { findAndUploadIcon, searchIconWithProgress, uploadAppIcon } from "../graph/appIcons.js";
import { sanitizeErrorMessage } from "../security.js";
import { batchGetDetectedApps } from "../graph/batch.js";

const router = Router();
const BETA = "https://graph.microsoft.com/beta";

let cache: { data: Record<string, unknown>; ts: number } | null = null;

/** Get app health data (used by executor + route). Returns cached data if fresh. */
export async function getAppHealthData(): Promise<Record<string, unknown>> {
  if (cache && Date.now() - cache.ts < 180000) return cache.data;

  const client = getGraphClient();
  const apps = await fetchWithPagination<Record<string, unknown>>(client,
    `${BETA}/deviceAppManagement/mobileApps`,
    { select: "id,displayName,publisher", maxItems: 100 }
  );
  const devices = await getManagedDevices({ top: 100 });

  const appDeviceDetails = new Map<string, Map<string, string>>();
  let totalDetectedApps = 0;

  // Use $batch API: 20 devices per batch call instead of 1-by-1
  const deviceIds = devices.items.map((d) => String(d.id));
  console.log(`[AppHealth] Querying detected apps for ${deviceIds.length} devices...`);
  const batchResults = await batchGetDetectedApps(deviceIds);

  for (const [, apps] of batchResults) {
    totalDetectedApps += apps.length;
    for (const app of apps) {
      const name = String(app.displayName || "");
      if (!appDeviceDetails.has(name)) appDeviceDetails.set(name, new Map());
      // Find which device this belongs to — batch preserves device ID as key
    }
  }

  // Re-iterate to build device-level mapping
  for (const device of devices.items) {
    const detected = batchResults.get(String(device.id)) || [];
    for (const app of detected) {
      const name = String(app.displayName || "");
      if (!appDeviceDetails.has(name)) appDeviceDetails.set(name, new Map());
      appDeviceDetails.get(name)!.set(
        String((device as unknown as Record<string, unknown>).deviceName || ""),
        String(app.version || "")
      );
    }
  }

  const detectedNamesLower = new Map<string, Map<string, string>>();
  for (const [name, deviceMap] of appDeviceDetails) {
    detectedNamesLower.set(name.toLowerCase(), deviceMap);
  }

  const appHealth: Array<Record<string, unknown>> = [];
  for (const app of apps.items) {
    const appName = String(app.displayName || "");
    const appType = String(app["@odata.type"] || "").replace("#microsoft.graph.", "");
    const appNameLower = appName.toLowerCase();

    let matchedDevices: Map<string, string> | undefined = detectedNamesLower.get(appNameLower);
    if (!matchedDevices || matchedDevices.size === 0) {
      for (const [detectedName, deviceMap] of detectedNamesLower) {
        if (detectedName.includes(appNameLower) || appNameLower.includes(detectedName)) {
          if (!matchedDevices || deviceMap.size > matchedDevices.size) matchedDevices = deviceMap;
        }
      }
    }

    const detectedOn = matchedDevices?.size || 0;
    const deviceList = matchedDevices
      ? Array.from(matchedDevices.entries()).map(([name, version]) => ({ deviceName: name, version }))
      : [];

    appHealth.push({
      appId: String(app.id), displayName: appName, publisher: app.publisher, appType,
      iconBase64: null as string | null, iconType: "image/png",
      detectedOnDevices: detectedOn, totalDevices: devices.items.length,
      deploymentRate: devices.items.length > 0 ? Math.round((detectedOn / devices.items.length) * 100) : 0,
      devices: deviceList,
    });
  }

  // Fetch icons in parallel batches of 5
  const BATCH_SIZE = 5;
  for (let i = 0; i < appHealth.length; i += BATCH_SIZE) {
    const batch = appHealth.slice(i, i + BATCH_SIZE);
    const icons = await Promise.all(batch.map((a) => getAppIcon(client, a.appId as string)));
    for (let j = 0; j < batch.length; j++) {
      if (icons[j]) { batch[j].iconBase64 = icons[j]!.base64; batch[j].iconType = icons[j]!.type; }
    }
  }

  appHealth.sort((a, b) => (b.detectedOnDevices as number) - (a.detectedOnDevices as number));

  const detectedCount = appHealth.filter((a) => (a.detectedOnDevices as number) > 0).length;
  console.log(`[AppHealth] Results: ${apps.items.length} managed apps, ${devices.items.length} devices, ${totalDetectedApps} detected app instances, ${detectedCount} apps matched`);

  const result: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
    totalManagedApps: apps.items.length,
    totalDevices: devices.items.length,
    totalDetectedApps,
    appsDetectedOnDevices: appHealth.filter((a) => (a.detectedOnDevices as number) > 0).length,
    apps: appHealth,
  };
  cache = { data: result, ts: Date.now() };
  return result;
}

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
  try {
    const result = await getAppHealthData();
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

/** POST /api/app-health/upload-icon-url — Download icon from a custom URL and upload to Intune */
router.post("/upload-icon-url", async (req: Request, res: Response) => {
  const { appId, iconUrl } = req.body;
  if (!appId || !iconUrl) { res.status(400).json({ error: "appId and iconUrl required" }); return; }
  try {
    // Validate URL format
    const url = new URL(iconUrl);
    if (!["http:", "https:"].includes(url.protocol)) {
      res.status(400).json({ error: "Only HTTP/HTTPS URLs are supported" });
      return;
    }

    // Fetch the icon
    const response = await fetch(iconUrl, {
      headers: { "User-Agent": "Mozilla/5.0 Intune007/1.0" },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) { res.status(400).json({ error: `Failed to fetch icon: HTTP ${response.status}` }); return; }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length < 100) { res.status(400).json({ error: "Downloaded file is too small to be a valid icon" }); return; }

    // Convert to PNG using sharp
    const sharp = (await import("sharp")).default;
    const png = await sharp(buffer)
      .resize(128, 128, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();

    // Upload to Intune
    const { uploadAppIcon } = await import("../graph/appIcons.js");
    await uploadAppIcon(appId, png.toString("base64"), "image/png");
    clearAppHealthCache();

    res.json({ success: true, message: `Icon uploaded from custom URL (${Math.round(png.length / 1024)}KB PNG)` });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeErrorMessage(err instanceof Error ? err.message : String(err)) });
  }
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
