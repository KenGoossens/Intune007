/**
 * Config Baseline Snapshots — Version control for Intune configuration.
 * Takes snapshots of all policies/profiles/CA rules, stores locally,
 * and can compare current state against a saved snapshot.
 */

import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { getGraphClient, fetchWithPagination } from "../graph/client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "..", "data");
const DB_PATH = path.join(DATA_DIR, "baselines.db");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

let db: Database.Database | null = null;
function getDb(): Database.Database {
  if (db) return db;
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      data TEXT NOT NULL
    );
  `);
  return db;
}

export interface BaselineSnapshot {
  id: number;
  name: string;
  description: string;
  createdAt: string;
  stats: { compliancePolicies: number; configProfiles: number; caPolicies: number };
}

export async function takeSnapshot(name: string, description: string = ""): Promise<BaselineSnapshot> {
  const client = getGraphClient();
  const [compliance, configs, ca] = await Promise.all([
    fetchWithPagination<Record<string, unknown>>(client, "/deviceManagement/deviceCompliancePolicies", { maxItems: 200 }),
    fetchWithPagination<Record<string, unknown>>(client, "/deviceManagement/deviceConfigurations", { maxItems: 200 }),
    fetchWithPagination<Record<string, unknown>>(client, "/identity/conditionalAccess/policies", { maxItems: 200 }).catch(() => ({ items: [], totalCount: 0 })),
  ]);

  const data = { compliancePolicies: compliance.items, configProfiles: configs.items, caPolicies: ca.items };
  const database = getDb();
  const result = database.prepare("INSERT INTO snapshots (name, description, data) VALUES (?, ?, ?)").run(name, description, JSON.stringify(data));

  return {
    id: result.lastInsertRowid as number, name, description,
    createdAt: new Date().toISOString(),
    stats: { compliancePolicies: compliance.items.length, configProfiles: configs.items.length, caPolicies: ca.items.length },
  };
}

export function listSnapshots(): BaselineSnapshot[] {
  const database = getDb();
  const rows = database.prepare("SELECT id, name, description, created_at, data FROM snapshots ORDER BY created_at DESC").all() as Array<{ id: number; name: string; description: string; created_at: string; data: string }>;
  return rows.map((r) => {
    const d = JSON.parse(r.data);
    return { id: r.id, name: r.name, description: r.description, createdAt: r.created_at,
      stats: { compliancePolicies: d.compliancePolicies?.length || 0, configProfiles: d.configProfiles?.length || 0, caPolicies: d.caPolicies?.length || 0 } };
  });
}

export function deleteSnapshot(id: number): boolean {
  return getDb().prepare("DELETE FROM snapshots WHERE id = ?").run(id).changes > 0;
}

export interface DriftResult {
  snapshotName: string;
  snapshotDate: string;
  added: Array<{ type: string; displayName: string }>;
  removed: Array<{ type: string; displayName: string }>;
  modified: Array<{ type: string; displayName: string; changes: Array<{ property: string; was: unknown; now: unknown }> }>;
}

export async function compareWithSnapshot(snapshotId: number): Promise<DriftResult> {
  const database = getDb();
  const row = database.prepare("SELECT * FROM snapshots WHERE id = ?").get(snapshotId) as { id: number; name: string; created_at: string; data: string } | undefined;
  if (!row) throw new Error("Snapshot not found");

  const saved = JSON.parse(row.data);
  const client = getGraphClient();
  const [compliance, configs, ca] = await Promise.all([
    fetchWithPagination<Record<string, unknown>>(client, "/deviceManagement/deviceCompliancePolicies", { maxItems: 200 }),
    fetchWithPagination<Record<string, unknown>>(client, "/deviceManagement/deviceConfigurations", { maxItems: 200 }),
    fetchWithPagination<Record<string, unknown>>(client, "/identity/conditionalAccess/policies", { maxItems: 200 }).catch(() => ({ items: [], totalCount: 0 })),
  ]);

  const current = { compliancePolicies: compliance.items, configProfiles: configs.items, caPolicies: ca.items };
  const added: DriftResult["added"] = [];
  const removed: DriftResult["removed"] = [];
  const modified: DriftResult["modified"] = [];

  const SKIP = new Set(["id", "createdDateTime", "lastModifiedDateTime", "version", "@odata.type", "@odata.context", "roleScopeTagIds"]);

  for (const [category, label] of [["compliancePolicies", "Compliance"], ["configProfiles", "Config"], ["caPolicies", "CA"]] as const) {
    const savedMap = new Map((saved[category] || []).map((p: Record<string, unknown>) => [p.id, p]));
    const currentMap = new Map((current[category] || []).map((p: Record<string, unknown>) => [p.id, p]));

    for (const [id, cur] of currentMap) {
      if (!savedMap.has(id)) {
        added.push({ type: label, displayName: String((cur as Record<string, unknown>).displayName || id) });
      } else {
        const old = savedMap.get(id) as Record<string, unknown>;
        const cur2 = cur as Record<string, unknown>;
        const changes: Array<{ property: string; was: unknown; now: unknown }> = [];
        for (const key of new Set([...Object.keys(old), ...Object.keys(cur2)])) {
          if (SKIP.has(key)) continue;
          if (JSON.stringify(old[key]) !== JSON.stringify(cur2[key])) {
            changes.push({ property: key, was: old[key], now: cur2[key] });
          }
        }
        if (changes.length > 0) modified.push({ type: label, displayName: String(cur2.displayName || id), changes });
      }
    }
    for (const [id, old] of savedMap) {
      if (!currentMap.has(id)) removed.push({ type: label, displayName: String((old as Record<string, unknown>).displayName || id) });
    }
  }

  return { snapshotName: row.name, snapshotDate: row.created_at, added, removed, modified };
}
