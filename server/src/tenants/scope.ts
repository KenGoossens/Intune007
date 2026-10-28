/**
 * Tenant scoping for local stores.
 *
 * Anything derived from a tenant's directory — devices, policy baselines, CVE
 * exposure, remediation actions, saved notes — is only meaningful next to the
 * tenant it came from. A store that keeps one pool for every connected tenant
 * answers a question about one customer with another customer's data, under
 * the first customer's name. That reads as a perfectly ordinary answer, which
 * is what makes it the worst shape this bug can take.
 *
 * Two rules, both enforced here rather than remembered at each call site:
 *
 *  - `ensureTenantColumn` adds the column to stores that predate it. A column
 *    added to a `CREATE TABLE IF NOT EXISTS` never appears for anyone who
 *    already has the database, so it needs a real migration. Existing rows
 *    cannot be attributed to a tenant after the fact, so they are dropped:
 *    silently handing them to whichever tenant asks first is the bug.
 *
 *  - `tenantScope` returns the clause and parameter for reads. Callers AND
 *    their own filters onto it, so no filter can widen past the active tenant.
 */

import type Database from "better-sqlite3";
import { getActiveTenantId } from "../graph/tenantManager.js";

/** The tenant that local reads and writes belong to. */
export function activeTenant(): string {
  return getActiveTenantId() || "";
}

/**
 * Add `tenant_id` to a table that predates tenant scoping, dropping rows that
 * can no longer be attributed to anyone.
 *
 * `purge` exists for stores whose rows a person authored rather than a
 * directory produced — a saved simulation is worth keeping and adopting into
 * the current tenant; a cached device count is not.
 */
export function ensureTenantColumn(
  db: Database.Database,
  table: string,
  options: { purge?: boolean; adoptInto?: string } = {}
): void {
  const columns = (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>)
    .map((c) => c.name);
  if (columns.includes("tenant_id")) return;

  db.exec(`ALTER TABLE ${table} ADD COLUMN tenant_id TEXT`);

  if (options.adoptInto) {
    db.prepare(`UPDATE ${table} SET tenant_id = ?`).run(options.adoptInto);
  } else if (options.purge !== false) {
    db.exec(`DELETE FROM ${table}`);
  }

  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_${table}_tenant ON ${table}(tenant_id)`
  );
}

/**
 * The WHERE fragment and bind parameter restricting a query to the active
 * tenant. `IS` rather than `=` so a row stored before a tenant was active
 * (tenant_id NULL, active tenant "") still matches itself rather than
 * vanishing.
 */
export function tenantScope(): { clause: string; param: string } {
  return { clause: "tenant_id IS ?", param: activeTenant() };
}

/** Combine the tenant clause with a caller's own WHERE fragment. */
export function scopedWhere(extra?: string): { sql: string; params: string[] } {
  const { clause, param } = tenantScope();
  return {
    sql: extra ? `WHERE ${clause} AND (${extra})` : `WHERE ${clause}`,
    params: [param],
  };
}
