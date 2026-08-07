/**
 * ConfigMgr Connection Store — SQLite-backed storage for the on-prem
 * AdminService connection so IT admins can connect via the UI wizard instead
 * of editing environment variables.
 *
 * A single row (id = 1) holds the connection. Secrets are stored locally in
 * this gitignored database and are never returned to the client (the API masks
 * them). This mirrors how the app already persists tenant connection state.
 */

import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "configmgr.db");

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS connection (
      id                 INTEGER PRIMARY KEY CHECK (id = 1),
      admin_service_url  TEXT NOT NULL DEFAULT '',
      auth_mode          TEXT NOT NULL DEFAULT 'azuread',
      resource           TEXT NOT NULL DEFAULT '',
      tenant_id          TEXT NOT NULL DEFAULT '',
      client_id          TEXT NOT NULL DEFAULT '',
      client_secret      TEXT NOT NULL DEFAULT '',
      bearer_token       TEXT NOT NULL DEFAULT '',
      allow_insecure_tls INTEGER NOT NULL DEFAULT 0,
      updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return db;
}

export interface StoredConnection {
  adminServiceUrl: string;
  authMode: string;
  resource: string;
  tenantId: string;
  clientId: string;
  clientSecret: string;
  bearerToken: string;
  allowInsecureTls: boolean;
  updatedAt: string;
}

interface ConnectionRow {
  admin_service_url: string;
  auth_mode: string;
  resource: string;
  tenant_id: string;
  client_id: string;
  client_secret: string;
  bearer_token: string;
  allow_insecure_tls: number;
  updated_at: string;
}

/** Returns the stored connection, or null when none has been saved yet. */
export function getStoredConnection(): StoredConnection | null {
  const row = getDb()
    .prepare(`SELECT * FROM connection WHERE id = 1`)
    .get() as ConnectionRow | undefined;
  if (!row || !row.admin_service_url) return null;
  return {
    adminServiceUrl: row.admin_service_url,
    authMode: row.auth_mode,
    resource: row.resource,
    tenantId: row.tenant_id,
    clientId: row.client_id,
    clientSecret: row.client_secret,
    bearerToken: row.bearer_token,
    allowInsecureTls: row.allow_insecure_tls === 1,
    updatedAt: row.updated_at,
  };
}

/** Upsert the single connection row. */
export function saveStoredConnection(conn: {
  adminServiceUrl: string;
  authMode: string;
  resource: string;
  tenantId: string;
  clientId: string;
  clientSecret: string;
  bearerToken: string;
  allowInsecureTls: boolean;
}): void {
  getDb()
    .prepare(
      `INSERT INTO connection
         (id, admin_service_url, auth_mode, resource, tenant_id, client_id, client_secret, bearer_token, allow_insecure_tls, updated_at)
       VALUES (1, @adminServiceUrl, @authMode, @resource, @tenantId, @clientId, @clientSecret, @bearerToken, @allowInsecureTls, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         admin_service_url = excluded.admin_service_url,
         auth_mode         = excluded.auth_mode,
         resource          = excluded.resource,
         tenant_id         = excluded.tenant_id,
         client_id         = excluded.client_id,
         client_secret     = excluded.client_secret,
         bearer_token      = excluded.bearer_token,
         allow_insecure_tls = excluded.allow_insecure_tls,
         updated_at        = datetime('now')`
    )
    .run({
      ...conn,
      allowInsecureTls: conn.allowInsecureTls ? 1 : 0,
    });
}

/** Remove the stored connection (disconnect). */
export function clearStoredConnection(): void {
  getDb().prepare(`DELETE FROM connection WHERE id = 1`).run();
}
