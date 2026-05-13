/**
 * Tenant Store — SQLite-backed registry of connected Intune tenants.
 *
 * Stores only tenantId + display metadata. Credentials (clientId + cert/secret)
 * come from environment config and are shared across all tenants — this requires
 * the Azure AD app registration to be configured as multi-tenant.
 *
 * The active tenant ID is also persisted so it survives server restarts.
 */

import Database from "better-sqlite3";
import path from "path";
import type { TenantInfo } from "@intune-agent/shared";

const DB_PATH = path.join(process.cwd(), "tenants.db");

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS tenants (
      tenant_id    TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      added_at     TEXT NOT NULL DEFAULT (datetime('now')),
      last_used_at TEXT
    );

    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  return db;
}

export interface StoredTenant {
  tenantId: string;
  displayName: string;
  addedAt: string;
  lastUsedAt: string | null;
}

export function addTenant(tenantId: string, displayName: string): void {
  const stmt = getDb().prepare(`
    INSERT INTO tenants (tenant_id, display_name)
    VALUES (?, ?)
    ON CONFLICT(tenant_id) DO UPDATE SET display_name = excluded.display_name
  `);
  stmt.run(tenantId, displayName);
}

export function removeTenant(tenantId: string): boolean {
  const stmt = getDb().prepare(`DELETE FROM tenants WHERE tenant_id = ?`);
  const result = stmt.run(tenantId);
  return result.changes > 0;
}

export function listTenants(): StoredTenant[] {
  const rows = getDb()
    .prepare(`SELECT tenant_id, display_name, added_at, last_used_at FROM tenants ORDER BY added_at ASC`)
    .all() as Array<{
      tenant_id: string;
      display_name: string;
      added_at: string;
      last_used_at: string | null;
    }>;

  return rows.map((r) => ({
    tenantId: r.tenant_id,
    displayName: r.display_name,
    addedAt: r.added_at,
    lastUsedAt: r.last_used_at,
  }));
}

export function getTenant(tenantId: string): StoredTenant | null {
  const row = getDb()
    .prepare(`SELECT tenant_id, display_name, added_at, last_used_at FROM tenants WHERE tenant_id = ?`)
    .get(tenantId) as
    | { tenant_id: string; display_name: string; added_at: string; last_used_at: string | null }
    | undefined;
  if (!row) return null;
  return {
    tenantId: row.tenant_id,
    displayName: row.display_name,
    addedAt: row.added_at,
    lastUsedAt: row.last_used_at,
  };
}

export function touchTenant(tenantId: string): void {
  getDb()
    .prepare(`UPDATE tenants SET last_used_at = datetime('now') WHERE tenant_id = ?`)
    .run(tenantId);
}

export function getActiveTenantId(): string | null {
  const row = getDb()
    .prepare(`SELECT value FROM meta WHERE key = 'active_tenant'`)
    .get() as { value: string } | undefined;
  return row?.value ?? null;
}

export function setActiveTenantId(tenantId: string): void {
  getDb()
    .prepare(`
      INSERT INTO meta (key, value) VALUES ('active_tenant', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `)
    .run(tenantId);
}

export function toTenantInfo(t: StoredTenant, isActive: boolean): TenantInfo {
  return {
    tenantId: t.tenantId,
    displayName: t.displayName,
    addedAt: t.addedAt,
    lastUsedAt: t.lastUsedAt,
    isActive,
  };
}
