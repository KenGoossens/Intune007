/**
 * Device Cache — SQLite-backed local inventory of all managed devices.
 *
 * Uses Microsoft Graph delta queries to keep the cache fresh with minimal API calls.
 * Delta sync runs every 2-5 minutes and only fetches changes since last sync.
 *
 * At 100K devices:
 *   - Full sync: ~1,000 API calls (one-time)
 *   - Delta sync: 1-10 API calls per cycle
 *   - Agent reads: 0 API calls (all from local SQLite)
 */

import Database from "better-sqlite3";
import path from "path";
import { getGraphClient, fetchWithPagination } from "../graph/client.js";

const DB_PATH = path.join(process.cwd(), "devices.db");
const BETA = "https://graph.microsoft.com/beta";

// Fields to sync from Graph API
const DEVICE_SELECT = [
  "id", "deviceName", "operatingSystem", "osVersion", "complianceState",
  "managementAgent", "managedDeviceOwnerType", "enrolledDateTime",
  "lastSyncDateTime", "userPrincipalName", "model", "manufacturer",
  "serialNumber", "isEncrypted", "joinType", "skuFamily",
  "totalStorageSpaceInBytes", "freeStorageSpaceInBytes",
  "autopilotEnrolled", "azureADDeviceId",
].join(",");

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;

  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");

  // Main device table
  db.exec(`
    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      deviceName TEXT,
      operatingSystem TEXT,
      osVersion TEXT,
      complianceState TEXT,
      managementAgent TEXT,
      managedDeviceOwnerType TEXT,
      enrolledDateTime TEXT,
      lastSyncDateTime TEXT,
      userPrincipalName TEXT,
      model TEXT,
      manufacturer TEXT,
      serialNumber TEXT,
      isEncrypted INTEGER,
      joinType TEXT,
      skuFamily TEXT,
      totalStorageSpaceInBytes INTEGER,
      freeStorageSpaceInBytes INTEGER,
      autopilotEnrolled INTEGER,
      azureADDeviceId TEXT,
      _json TEXT,
      _syncedAt TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_devices_name ON devices(deviceName);
    CREATE INDEX IF NOT EXISTS idx_devices_os ON devices(operatingSystem);
    CREATE INDEX IF NOT EXISTS idx_devices_compliance ON devices(complianceState);
    CREATE INDEX IF NOT EXISTS idx_devices_upn ON devices(userPrincipalName);
    CREATE INDEX IF NOT EXISTS idx_devices_serial ON devices(serialNumber);
  `);

  // Meta table for delta links and sync state
  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  return db;
}

// ─── Upsert a device into cache ─────────────────────────────────
const upsertStmt = () => getDb().prepare(`
  INSERT INTO devices (
    id, deviceName, operatingSystem, osVersion, complianceState,
    managementAgent, managedDeviceOwnerType, enrolledDateTime,
    lastSyncDateTime, userPrincipalName, model, manufacturer,
    serialNumber, isEncrypted, joinType, skuFamily,
    totalStorageSpaceInBytes, freeStorageSpaceInBytes,
    autopilotEnrolled, azureADDeviceId, _json, _syncedAt
  ) VALUES (
    @id, @deviceName, @operatingSystem, @osVersion, @complianceState,
    @managementAgent, @managedDeviceOwnerType, @enrolledDateTime,
    @lastSyncDateTime, @userPrincipalName, @model, @manufacturer,
    @serialNumber, @isEncrypted, @joinType, @skuFamily,
    @totalStorageSpaceInBytes, @freeStorageSpaceInBytes,
    @autopilotEnrolled, @azureADDeviceId, @_json, datetime('now')
  ) ON CONFLICT(id) DO UPDATE SET
    deviceName = @deviceName,
    operatingSystem = @operatingSystem,
    osVersion = @osVersion,
    complianceState = @complianceState,
    managementAgent = @managementAgent,
    managedDeviceOwnerType = @managedDeviceOwnerType,
    enrolledDateTime = @enrolledDateTime,
    lastSyncDateTime = @lastSyncDateTime,
    userPrincipalName = @userPrincipalName,
    model = @model,
    manufacturer = @manufacturer,
    serialNumber = @serialNumber,
    isEncrypted = @isEncrypted,
    joinType = @joinType,
    skuFamily = @skuFamily,
    totalStorageSpaceInBytes = @totalStorageSpaceInBytes,
    freeStorageSpaceInBytes = @freeStorageSpaceInBytes,
    autopilotEnrolled = @autopilotEnrolled,
    azureADDeviceId = @azureADDeviceId,
    _json = @_json,
    _syncedAt = datetime('now')
`);

function deviceToRow(d: Record<string, unknown>) {
  return {
    id: String(d.id || ""),
    deviceName: d.deviceName != null ? String(d.deviceName) : null,
    operatingSystem: d.operatingSystem != null ? String(d.operatingSystem) : null,
    osVersion: d.osVersion != null ? String(d.osVersion) : null,
    complianceState: d.complianceState != null ? String(d.complianceState) : null,
    managementAgent: d.managementAgent != null ? String(d.managementAgent) : null,
    managedDeviceOwnerType: d.managedDeviceOwnerType != null ? String(d.managedDeviceOwnerType) : null,
    enrolledDateTime: d.enrolledDateTime != null ? String(d.enrolledDateTime) : null,
    lastSyncDateTime: d.lastSyncDateTime != null ? String(d.lastSyncDateTime) : null,
    userPrincipalName: d.userPrincipalName != null ? String(d.userPrincipalName) : null,
    model: d.model != null ? String(d.model) : null,
    manufacturer: d.manufacturer != null ? String(d.manufacturer) : null,
    serialNumber: d.serialNumber != null ? String(d.serialNumber) : null,
    isEncrypted: d.isEncrypted === true ? 1 : d.isEncrypted === false ? 0 : null,
    joinType: d.joinType != null ? String(d.joinType) : null,
    skuFamily: d.skuFamily != null ? String(d.skuFamily) : null,
    totalStorageSpaceInBytes: d.totalStorageSpaceInBytes != null ? Number(d.totalStorageSpaceInBytes) : null,
    freeStorageSpaceInBytes: d.freeStorageSpaceInBytes != null ? Number(d.freeStorageSpaceInBytes) : null,
    autopilotEnrolled: d.autopilotEnrolled === true ? 1 : d.autopilotEnrolled === false ? 0 : null,
    azureADDeviceId: d.azureADDeviceId != null ? String(d.azureADDeviceId) : null,
    _json: JSON.stringify(d),
  };
}

// ─── Delta Sync ─────────────────────────────────────────────────

function getMeta(key: string): string | null {
  const row = getDb().prepare("SELECT value FROM sync_meta WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value || null;
}

function setMeta(key: string, value: string): void {
  getDb().prepare("INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)").run(key, value);
}

/**
 * Run a full initial sync — fetches ALL managed devices and populates cache.
 * Only needed on first run or after cache reset.
 */
export async function fullSync(): Promise<{ deviceCount: number; durationMs: number }> {
  const start = Date.now();
  console.log("[DeviceCache] Starting full sync...");

  const client = getGraphClient();
  const allDevices: Record<string, unknown>[] = [];
  let nextLink: string | null = `${BETA}/deviceManagement/managedDevices?$select=${DEVICE_SELECT}&$top=999`;

  while (nextLink) {
    const response = await client.api(nextLink).get();
    if (response.value) {
      allDevices.push(...response.value);
    }
    nextLink = response["@odata.nextLink"] || null;
    if (allDevices.length % 5000 === 0 && allDevices.length > 0) {
      console.log(`[DeviceCache] Fetched ${allDevices.length} devices...`);
    }
  }

  // Bulk upsert in a transaction
  const stmt = upsertStmt();
  const insertMany = getDb().transaction((devices: Record<string, unknown>[]) => {
    for (const d of devices) {
      stmt.run(deviceToRow(d));
    }
  });
  insertMany(allDevices);

  // Mark cache as warm immediately — devices are in DB
  setMeta("lastFullSync", new Date().toISOString());
  setMeta("lastSync", new Date().toISOString());

  // Now get delta link for subsequent syncs (non-fatal if this fails)
  try {
    // Use function-call URL format to prevent SDK from treating 'delta' as an entity key
    const deltaUrl = `${BETA}/deviceManagement/managedDevices/delta?$select=${DEVICE_SELECT}`;
    const deltaResponse = await client
      .api(deltaUrl)
      .version("beta")
      .get();

    // Consume the full delta response (we already have the data)
    let deltaLink: string | null = null;
    let resp = deltaResponse;
    while (resp["@odata.nextLink"]) {
      resp = await client.api(resp["@odata.nextLink"]).get();
    }
    deltaLink = resp["@odata.deltaLink"] || null;

    if (deltaLink) {
      setMeta("deltaLink", deltaLink);
    }
  } catch (err) {
    console.warn("[DeviceCache] Delta link acquisition failed (will retry next sync):",
      err instanceof Error ? err.message : "Unknown error");
  }

  const duration = Date.now() - start;
  console.log(`[DeviceCache] Full sync complete: ${allDevices.length} devices in ${Math.round(duration / 1000)}s`);
  return { deviceCount: allDevices.length, durationMs: duration };
}

/**
 * Run a delta sync — fetches only changes since last sync.
 * Typically 1-10 API calls instead of ~1,000.
 */
export async function deltaSync(): Promise<{
  added: number;
  modified: number;
  removed: number;
  durationMs: number;
}> {
  const start = Date.now();
  const deltaLink = getMeta("deltaLink");

  if (!deltaLink) {
    // If we already synced recently (within 5 min) but just can't get a delta link,
    // skip the full sync to avoid hammering the API every 2 minutes.
    const lastSync = getMeta("lastSync");
    if (lastSync && Date.now() - new Date(lastSync).getTime() < 5 * 60 * 1000) {
      return { added: 0, modified: 0, removed: 0, durationMs: Date.now() - start };
    }
    console.log("[DeviceCache] No delta link found — running full sync");
    const result = await fullSync();
    return { added: result.deviceCount, modified: 0, removed: 0, durationMs: result.durationMs };
  }

  const client = getGraphClient();
  let added = 0;
  let modified = 0;
  let removed = 0;

  const stmt = upsertStmt();
  const deleteStmt = getDb().prepare("DELETE FROM devices WHERE id = ?");

  let resp = await client.api(deltaLink).get();

  const processPage = (items: Record<string, unknown>[]) => {
    for (const item of items) {
      if (item["@removed"]) {
        // Device was deleted
        deleteStmt.run(String(item.id));
        removed++;
      } else {
        // Check if it exists
        const exists = getDb()
          .prepare("SELECT 1 FROM devices WHERE id = ?")
          .get(String(item.id));
        stmt.run(deviceToRow(item));
        if (exists) {
          modified++;
        } else {
          added++;
        }
      }
    }
  };

  // Process all pages
  if (resp.value) processPage(resp.value);

  while (resp["@odata.nextLink"]) {
    resp = await client.api(resp["@odata.nextLink"]).get();
    if (resp.value) processPage(resp.value);
  }

  // Save new delta link
  const newDeltaLink = resp["@odata.deltaLink"];
  if (newDeltaLink) {
    setMeta("deltaLink", newDeltaLink);
  }
  setMeta("lastSync", new Date().toISOString());

  const duration = Date.now() - start;
  if (added > 0 || modified > 0 || removed > 0) {
    console.log(`[DeviceCache] Delta sync: +${added} ~${modified} -${removed} in ${duration}ms`);
  }
  return { added, modified, removed, durationMs: duration };
}

// ─── Cache Queries (zero API calls) ─────────────────────────────

/**
 * Query devices from local cache with OData-like filtering.
 * Translates common OData filter patterns to SQL WHERE clauses.
 */
export function queryDevices(options?: {
  filter?: string;
  top?: number;
  select?: string;
}): { items: Record<string, unknown>[]; totalCount: number } {
  const database = getDb();
  const top = Math.min(options?.top || 100, 1000);

  let whereClause = "";
  const params: unknown[] = [];

  if (options?.filter) {
    whereClause = "WHERE " + odataToSql(options.filter, params);
  }

  // Get total count
  const countRow = database
    .prepare(`SELECT COUNT(*) as c FROM devices ${whereClause}`)
    .get(...params) as { c: number };

  // Get rows
  const rows = database
    .prepare(`SELECT _json FROM devices ${whereClause} ORDER BY deviceName LIMIT ?`)
    .all(...params, top) as { _json: string }[];

  const items = rows.map((r) => JSON.parse(r._json));

  return { items, totalCount: countRow.c };
}

/**
 * Get a single device from cache by ID.
 * Falls back to live Graph API if not in cache.
 */
export async function getCachedDevice(deviceId: string): Promise<Record<string, unknown> | null> {
  const row = getDb()
    .prepare("SELECT _json FROM devices WHERE id = ?")
    .get(deviceId) as { _json: string } | undefined;

  if (row) {
    return JSON.parse(row._json);
  }

  // Fallback: fetch from Graph and cache
  try {
    const client = getGraphClient();
    const device = await client
      .api(`${BETA}/deviceManagement/managedDevices/${deviceId}`)
      .select(DEVICE_SELECT)
      .get();
    upsertStmt().run(deviceToRow(device));
    return device;
  } catch {
    return null;
  }
}

/**
 * Force-refresh a single device from Graph API.
 * Used after device actions (sync, restart, etc.) where fresh data is needed.
 */
export async function refreshDevice(deviceId: string): Promise<Record<string, unknown>> {
  const client = getGraphClient();
  const device = await client
    .api(`${BETA}/deviceManagement/managedDevices/${deviceId}`)
    .select(DEVICE_SELECT)
    .get();
  upsertStmt().run(deviceToRow(device));
  return device;
}

/**
 * Get cache statistics.
 */
export function getCacheStats(): {
  totalDevices: number;
  lastSync: string | null;
  lastFullSync: string | null;
  cacheAgeMs: number;
} {
  const database = getDb();
  const count = (database.prepare("SELECT COUNT(*) as c FROM devices").get() as { c: number }).c;
  const lastSync = getMeta("lastSync");
  const lastFullSync = getMeta("lastFullSync");
  const cacheAgeMs = lastSync ? Date.now() - new Date(lastSync).getTime() : Infinity;

  return { totalDevices: count, lastSync, lastFullSync, cacheAgeMs };
}

/**
 * Check if cache is warm (has been synced at least once).
 */
export function isCacheWarm(): boolean {
  return getMeta("lastSync") !== null;
}

// ─── OData → SQL Translation ────────────────────────────────────

/**
 * Translate common OData $filter patterns to SQL WHERE clauses.
 * Supports: eq, ne, contains, startsWith, and/or.
 */
function odataToSql(filter: string, params: unknown[]): string {
  let sql = filter;

  // contains(field,'value') → field LIKE '%value%'
  sql = sql.replace(
    /contains\s*\(\s*(\w+)\s*,\s*'([^']*)'\s*\)/gi,
    (_match, field, value) => {
      params.push(`%${value}%`);
      return `${mapField(field)} LIKE ?`;
    }
  );

  // startsWith(field,'value') → field LIKE 'value%'
  sql = sql.replace(
    /startsWith\s*\(\s*(\w+)\s*,\s*'([^']*)'\s*\)/gi,
    (_match, field, value) => {
      params.push(`${value}%`);
      return `${mapField(field)} LIKE ?`;
    }
  );

  // field eq 'value' → field = ?
  sql = sql.replace(
    /(\w+)\s+eq\s+'([^']*)'/gi,
    (_match, field, value) => {
      params.push(value);
      return `${mapField(field)} = ?`;
    }
  );

  // field ne 'value' → field != ?
  sql = sql.replace(
    /(\w+)\s+ne\s+'([^']*)'/gi,
    (_match, field, value) => {
      params.push(value);
      return `${mapField(field)} != ?`;
    }
  );

  // field eq true/false → field = 1/0
  sql = sql.replace(
    /(\w+)\s+eq\s+(true|false)/gi,
    (_match, field, value) => {
      params.push(value.toLowerCase() === "true" ? 1 : 0);
      return `${mapField(field)} = ?`;
    }
  );

  // and/or → AND/OR
  sql = sql.replace(/\band\b/gi, "AND").replace(/\bor\b/gi, "OR");

  return sql;
}

/**
 * Map OData field names to SQLite column names.
 * Handles boolean fields stored as integers.
 */
function mapField(field: string): string {
  // These fields are stored as integers (0/1) in SQLite
  const boolFields = new Set(["isEncrypted", "autopilotEnrolled"]);
  if (boolFields.has(field)) return field;
  return field;
}

// ─── Background Sync Scheduler ──────────────────────────────────

let syncInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start the background delta sync scheduler.
 * Runs a full sync if cache is empty, then delta syncs at the given interval.
 */
export async function startSyncScheduler(
  intervalMs: number = 2 * 60 * 1000 // 2 minutes default
): Promise<void> {
  console.log(`[DeviceCache] Starting sync scheduler (every ${Math.round(intervalMs / 1000)}s)`);

  // Initial sync
  if (!isCacheWarm()) {
    await fullSync();
  } else {
    // Run a delta sync immediately to catch up
    await deltaSync();
  }

  // Schedule recurring delta syncs
  syncInterval = setInterval(async () => {
    try {
      await deltaSync();
    } catch (err) {
      console.error("[DeviceCache] Delta sync error:", err instanceof Error ? err.message : err);
    }
  }, intervalMs);
}

/**
 * Stop the background sync scheduler.
 */
export function stopSyncScheduler(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
    console.log("[DeviceCache] Sync scheduler stopped");
  }
}
