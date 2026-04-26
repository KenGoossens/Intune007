/**
 * App Icon Manager — Search for app icons and upload them to Intune.
 *
 * Strategy for finding icons (in order):
 * 1. Google Favicon API — works for web apps (Copilot, Edge, etc.)
 * 2. Clearbit Logo API — works for known companies (Microsoft, Adobe, etc.)
 * 3. Icon.horse fallback — general-purpose favicon lookup
 *
 * Once found, the icon is uploaded to Intune via:
 *   PATCH /deviceAppManagement/mobileApps/{id}
 *   { largeIcon: { type: "image/png", value: "<base64>" } }
 *
 * Required Permission: DeviceManagementApps.ReadWrite.All
 */

import { getGraphClient } from "../graph/client.js";
import { clearAppHealthCache } from "../routes/appHealth.js";
import sharp from "sharp";

const BETA = "https://graph.microsoft.com/beta";

// Known publisher → domain mappings for logo lookup
const PUBLISHER_DOMAINS: Record<string, string> = {
  "microsoft": "microsoft.com",
  "microsoft corporation": "microsoft.com",
  "adobe": "adobe.com",
  "adobe inc.": "adobe.com",
  "google": "google.com",
  "google llc": "google.com",
  "apple": "apple.com",
  "apple inc.": "apple.com",
  "mozilla": "mozilla.org",
  "mozilla corporation": "mozilla.org",
  "zoom": "zoom.us",
  "zoom video communications": "zoom.us",
  "slack": "slack.com",
  "salesforce": "salesforce.com",
  "citrix": "citrix.com",
  "vmware": "vmware.com",
  "cisco": "cisco.com",
  "oracle": "oracle.com",
  "sap": "sap.com",
  "ibm": "ibm.com",
  "dell": "dell.com",
  "hp": "hp.com",
  "lenovo": "lenovo.com",
  "dropbox": "dropbox.com",
  "box": "box.com",
  "7-zip": "7-zip.org",
  "7zip": "7-zip.org",
  "notepad++": "notepad-plus-plus.org",
  "vlc": "videolan.org",
  "gimp": "gimp.org",
  "firefox": "mozilla.org",
  "chrome": "google.com",
  "edge": "microsoft.com",
  "teams": "microsoft.com",
  "outlook": "microsoft.com",
  "onenote": "microsoft.com",
  "onedrive": "microsoft.com",
  "intune": "microsoft.com",
  "goosnet": "goosnet.xyz",
  "m365 labs": "m365labs.com",
};

// Known app name → domain for direct lookup
const APP_DOMAINS: Record<string, string> = {
  "microsoft edge": "microsoft.com",
  "microsoft teams": "teams.microsoft.com",
  "microsoft 365": "microsoft.com",
  "microsoft copilot": "copilot.microsoft.com",
  "microsoft intune": "intune.microsoft.com",
  "microsoft onenote": "onenote.com",
  "microsoft onedrive": "onedrive.com",
  "microsoft outlook": "outlook.com",
  "adobe acrobat": "adobe.com",
  "adobe reader": "adobe.com",
  "adobe dc": "adobe.com",
  "google chrome": "google.com",
  "mozilla firefox": "mozilla.org",
  "zoom": "zoom.us",
  "slack": "slack.com",
  "7-zip": "7-zip.org",
  "notepad++": "notepad-plus-plus.org",
  "vlc media player": "videolan.org",
  "company portal": "microsoft.com",
};

export interface IconSearchResult {
  found: boolean;
  source: string;
  domain?: string;
  base64?: string;
  mimeType?: string;
  sizeBytes?: number;
  sourcesChecked?: number;
}

export interface IconUploadResult {
  appId: string;
  appName: string;
  success: boolean;
  message: string;
  iconSource?: string;
}

/**
 * Try to find a domain for an app based on its name and publisher.
 */
function resolveDomain(appName: string, publisher?: string): string | null {
  const nameLower = appName.toLowerCase().trim();
  const pubLower = (publisher || "").toLowerCase().trim();

  // Try exact app name match
  for (const [key, domain] of Object.entries(APP_DOMAINS)) {
    if (nameLower.includes(key)) return domain;
  }

  // Try publisher match
  for (const [key, domain] of Object.entries(PUBLISHER_DOMAINS)) {
    if (pubLower === key || pubLower.includes(key) || nameLower.includes(key)) return domain;
  }

  // Try to extract a domain from the publisher (e.g. "Goosnet" → "goosnet.com")
  if (pubLower && !pubLower.includes(" ")) {
    return `${pubLower}.com`;
  }

  return null;
}

/**
 * Convert any image buffer to PNG using sharp.
 * Intune requires image/png for largeIcon.
 * Returns null if conversion fails — caller should skip this icon.
 */
async function convertToPng(buffer: Buffer): Promise<Buffer | null> {
  try {
    return await sharp(buffer)
      .resize(128, 128, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
  } catch {
    try {
      // For multi-page formats like ICO, try extracting first page
      return await sharp(buffer, { pages: 1 })
        .resize(128, 128, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();
    } catch {
      // Conversion truly failed — return null so we try the next source
      return null;
    }
  }
}

/**
 * Fetch an icon from a URL and convert to Base64 PNG.
 */
async function fetchIconAsBase64(url: string, minBytes: number = 200): Promise<{ base64: string; mimeType: string; sizeBytes: number } | null> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") || "image/png";
    // Only accept image types (including ico, svg)
    if (!contentType.startsWith("image/") && !contentType.includes("icon")) return null;

    const rawBuffer = Buffer.from(await response.arrayBuffer());

    // Skip icons smaller than the minimum
    if (rawBuffer.length < minBytes) return null;

    // Convert to PNG (Intune requirement) — returns null if conversion fails
    const png = await convertToPng(rawBuffer);
    if (!png || png.length < 100) return null; // Conversion failed or result too small

    const base64 = png.toString("base64");
    return { base64, mimeType: "image/png", sizeBytes: png.length };
  } catch {
    return null;
  }
}

/**
 * Search for an app icon using multiple sources, from highest to lowest quality.
 */
export async function searchIcon(appName: string, publisher?: string): Promise<IconSearchResult> {
  const domain = resolveDomain(appName, publisher);

  if (!domain) {
    return { found: false, source: "none", domain: undefined };
  }

  // Source 1: Google Favicon API at 128px (high quality for well-known sites)
  const google128 = await fetchIconAsBase64(
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`, 200
  );
  if (google128 && google128.sizeBytes > 500) {
    return { found: true, source: "Google Favicon (128px)", domain, base64: google128.base64, mimeType: google128.mimeType, sizeBytes: google128.sizeBytes };
  }

  // Source 2: Clearbit Logo API (company logos, high quality)
  const clearbit = await fetchIconAsBase64(
    `https://logo.clearbit.com/${encodeURIComponent(domain)}?size=128`, 200
  );
  if (clearbit && clearbit.sizeBytes > 300) {
    return { found: true, source: "Clearbit Logo", domain, base64: clearbit.base64, mimeType: clearbit.mimeType, sizeBytes: clearbit.sizeBytes };
  }

  // Source 3: DuckDuckGo Icons API (works well for most domains)
  const ddg = await fetchIconAsBase64(
    `https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`, 100
  );
  if (ddg && ddg.sizeBytes > 200) {
    return { found: true, source: "DuckDuckGo Icons", domain, base64: ddg.base64, mimeType: ddg.mimeType, sizeBytes: ddg.sizeBytes };
  }

  // Source 4: Direct favicon.ico from the website
  const directFavicon = await fetchIconAsBase64(
    `https://${domain}/favicon.ico`, 100
  );
  if (directFavicon && directFavicon.sizeBytes > 100) {
    return { found: true, source: "Direct favicon.ico", domain, base64: directFavicon.base64, mimeType: directFavicon.mimeType, sizeBytes: directFavicon.sizeBytes };
  }

  // Source 5: Try www. prefix
  const wwwFavicon = await fetchIconAsBase64(
    `https://www.${domain}/favicon.ico`, 100
  );
  if (wwwFavicon && wwwFavicon.sizeBytes > 100) {
    return { found: true, source: "Direct favicon.ico (www)", domain, base64: wwwFavicon.base64, mimeType: wwwFavicon.mimeType, sizeBytes: wwwFavicon.sizeBytes };
  }

  // Source 6: icon.horse (general fallback)
  const horse = await fetchIconAsBase64(
    `https://icon.horse/icon/${encodeURIComponent(domain)}`, 100
  );
  if (horse && horse.sizeBytes > 100) {
    return { found: true, source: "icon.horse", domain, base64: horse.base64, mimeType: horse.mimeType, sizeBytes: horse.sizeBytes };
  }

  // Source 7: Google Favicon at 64px (smaller but usually available)
  const google64 = await fetchIconAsBase64(
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`, 100
  );
  if (google64 && google64.sizeBytes > 100) {
    return { found: true, source: "Google Favicon (64px)", domain, base64: google64.base64, mimeType: google64.mimeType, sizeBytes: google64.sizeBytes };
  }

  return { found: false, source: "none", domain, sourcesChecked: 7 };
}

/**
 * Search for an app icon with step-by-step progress callbacks.
 * Each source attempt calls onProgress with (sourceName, status, detail).
 */
export async function searchIconWithProgress(
  appName: string,
  publisher: string | undefined,
  onProgress: (source: string, status: "running" | "success" | "skipped" | "failed", detail: string) => void
): Promise<IconSearchResult & { sourcesChecked?: number }> {
  const domain = resolveDomain(appName, publisher);

  if (!domain) {
    onProgress("domain", "failed", `Could not resolve a domain for "${appName}" (publisher: ${publisher || "unknown"})`);
    return { found: false, source: "none", sourcesChecked: 0 };
  }

  onProgress("domain", "success", `Resolved domain: ${domain}`);

  const sources: Array<{ name: string; url: string; minBytes: number }> = [
    { name: "Google Favicon (128px)", url: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`, minBytes: 500 },
    { name: "Clearbit Logo", url: `https://logo.clearbit.com/${encodeURIComponent(domain)}?size=128`, minBytes: 300 },
    { name: "DuckDuckGo Icons", url: `https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`, minBytes: 100 },
    { name: "Direct favicon.ico", url: `https://${domain}/favicon.ico`, minBytes: 100 },
    { name: "Direct favicon (www)", url: `https://www.${domain}/favicon.ico`, minBytes: 100 },
    { name: "icon.horse", url: `https://icon.horse/icon/${encodeURIComponent(domain)}`, minBytes: 100 },
    { name: "Google Favicon (64px)", url: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`, minBytes: 100 },
  ];

  let checked = 0;
  for (let i = 0; i < sources.length; i++) {
    const src = sources[i];
    checked++;
    onProgress(src.name, "running", `Trying ${src.url.substring(0, 80)}...`);

    const result = await fetchIconAsBase64(src.url, src.minBytes);

    if (result && result.sizeBytes > 100) {
      onProgress(src.name, "success", `Found! ${result.sizeBytes} bytes (PNG)`);

      // Mark remaining sources as skipped
      for (let j = i + 1; j < sources.length; j++) {
        onProgress(sources[j].name, "skipped", "Skipped — icon already found");
      }

      return {
        found: true,
        source: src.name,
        domain,
        base64: result.base64,
        mimeType: result.mimeType,
        sizeBytes: result.sizeBytes,
        sourcesChecked: checked,
      };
    } else {
      onProgress(src.name, "failed", result ? `Conversion failed or too small (${result.sizeBytes} bytes)` : "Not found or request failed");
    }
  }

  return { found: false, source: "none", domain, sourcesChecked: checked };
}

/**
 * Upload an icon to an Intune app via Graph API.
 */
export async function uploadAppIcon(
  appId: string,
  base64: string,
  mimeType: string = "image/png"
): Promise<void> {
  const client = getGraphClient();

  // Get the app's @odata.type first (needed for PATCH) — can't use $select for @odata.type
  const app = await client
    .api(`${BETA}/deviceAppManagement/mobileApps/${appId}`)
    .select("id")
    .get();

  // @odata.type is always returned even without $select
  const odataType = app["@odata.type"] || "#microsoft.graph.win32LobApp";

  await client
    .api(`${BETA}/deviceAppManagement/mobileApps/${appId}`)
    .patch({
      "@odata.type": odataType,
      largeIcon: {
        "@odata.type": "microsoft.graph.mimeContent",
        type: mimeType,
        value: base64,
      },
    });
}

/**
 * Find and upload an icon for a specific app.
 * @param force If true, replaces the existing icon even if one is already set.
 */
export async function findAndUploadIcon(
  appId: string,
  appName: string,
  publisher?: string,
  force: boolean = false
): Promise<IconUploadResult> {
  // Step 1: Check if app already has an icon (skip if force refresh)
  const client = getGraphClient();
  try {
    const app = await client
      .api(`${BETA}/deviceAppManagement/mobileApps/${appId}`)
      .select("id,largeIcon")
      .get();

    if (!force && app.largeIcon?.value && app.largeIcon.value.length > 100) {
      return {
        appId,
        appName,
        success: true,
        message: "App already has an icon — no action needed. Use force refresh to replace it.",
        iconSource: "existing",
      };
    }
  } catch {
    return { appId, appName, success: false, message: "Could not read app from Intune." };
  }

  // Step 2: Search for an icon
  const searchResult = await searchIcon(appName, publisher);
  if (!searchResult.found || !searchResult.base64) {
    return {
      appId,
      appName,
      success: false,
      message: `Could not find an icon for "${appName}" (publisher: ${publisher || "unknown"}). Domain resolved: ${searchResult.domain || "none"}.`,
    };
  }

  // Step 3: Upload to Intune
  try {
    await uploadAppIcon(appId, searchResult.base64, searchResult.mimeType);

    // Clear the icon cache so next App Health load picks it up
    clearAppHealthCache();
    return {
      appId,
      appName,
      success: true,
      message: `Icon uploaded successfully from ${searchResult.source} (${searchResult.domain}, ${Math.round((searchResult.sizeBytes || 0) / 1024)}KB).`,
      iconSource: searchResult.source,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      appId,
      appName,
      success: false,
      message: `Found icon from ${searchResult.source} but upload failed: ${msg.substring(0, 150)}`,
    };
  }
}

/**
 * Scan all apps without icons and try to find + upload icons for them.
 */
export async function fixAllMissingIcons(): Promise<{
  totalApps: number;
  appsWithoutIcons: number;
  iconsFound: number;
  iconsUploaded: number;
  results: IconUploadResult[];
}> {
  const client = getGraphClient();

  const apps = await client
    .api(`${BETA}/deviceAppManagement/mobileApps`)
    .select("id,displayName,publisher,largeIcon")
    .top(100)
    .get();

  const allApps = (apps.value || []) as Array<Record<string, unknown>>;
  const appsWithoutIcons = allApps.filter(
    (a) => !a.largeIcon || !(a.largeIcon as Record<string, unknown>).value ||
      String((a.largeIcon as Record<string, unknown>).value || "").length < 100
  );

  const results: IconUploadResult[] = [];
  let iconsFound = 0;
  let iconsUploaded = 0;

  // Process in batches of 3 to avoid rate limiting
  for (let i = 0; i < appsWithoutIcons.length; i += 3) {
    const batch = appsWithoutIcons.slice(i, i + 3);
    const batchResults = await Promise.all(
      batch.map((app) =>
        findAndUploadIcon(
          String(app.id),
          String(app.displayName),
          String(app.publisher || "")
        )
      )
    );

    for (const r of batchResults) {
      results.push(r);
      if (r.success && r.iconSource !== "existing") {
        iconsFound++;
        iconsUploaded++;
      }
    }
  }

  return {
    totalApps: allApps.length,
    appsWithoutIcons: appsWithoutIcons.length,
    iconsFound,
    iconsUploaded,
    results,
  };
}

/**
 * Scan all apps and report which ones have/don't have icons.
 * READ-ONLY — does not modify anything.
 * Checks each app individually since the list endpoint doesn't return largeIcon binary data.
 */
export async function scanAppIcons(): Promise<{
  totalApps: number;
  appsWithIcons: number;
  appsMissingIcons: number;
  withIcons: Array<{ appId: string; displayName: string; publisher: string }>;
  missingIcons: Array<{ appId: string; displayName: string; publisher: string; appType: string }>;
}> {
  const client = getGraphClient();

  // Get all apps (list query — no icon binary data here)
  const apps = await client
    .api(`${BETA}/deviceAppManagement/mobileApps`)
    .select("id,displayName,publisher")
    .top(200)
    .get();

  const allApps = (apps.value || []) as Array<Record<string, unknown>>;

  const withIcons: Array<{ appId: string; displayName: string; publisher: string }> = [];
  const missingIcons: Array<{ appId: string; displayName: string; publisher: string; appType: string }> = [];

  // Check each app individually for icon (batches of 5 for speed)
  for (let i = 0; i < allApps.length; i += 5) {
    const batch = allApps.slice(i, i + 5);
    const results = await Promise.all(
      batch.map(async (app) => {
        try {
          const detail = await client
            .api(`${BETA}/deviceAppManagement/mobileApps/${app.id}`)
            .select("id,largeIcon")
            .get();
          const hasIcon = detail.largeIcon?.value && String(detail.largeIcon.value).length > 100;
          return { app, hasIcon, odataType: detail["@odata.type"] || "" };
        } catch {
          return { app, hasIcon: false, odataType: "" };
        }
      })
    );

    for (const { app, hasIcon, odataType } of results) {
      const entry = {
        appId: String(app.id),
        displayName: String(app.displayName || ""),
        publisher: String(app.publisher || ""),
        appType: String(odataType).replace("#microsoft.graph.", ""),
      };

      if (hasIcon) {
        withIcons.push(entry);
      } else {
        missingIcons.push(entry);
      }
    }
  }

  return {
    totalApps: allApps.length,
    appsWithIcons: withIcons.length,
    appsMissingIcons: missingIcons.length,
    withIcons,
    missingIcons,
  };
}
