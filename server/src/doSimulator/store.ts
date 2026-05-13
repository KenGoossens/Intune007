/**
 * Simulation store — persists DO simulations so admins can compare runs
 * over time (e.g. quarterly recompute vs. last quarter) and revisit a
 * saved scenario.
 */

import Database from "better-sqlite3";
import path from "path";
import type { DOSimulationResult } from "@intune-agent/shared";

const DB_PATH = path.join(process.cwd(), "simulations.db");

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS do_simulations (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      result_json  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_do_sim_created ON do_simulations(created_at DESC);
  `);
  return db;
}

export function saveSimulation(result: DOSimulationResult): void {
  getDb()
    .prepare(`INSERT OR REPLACE INTO do_simulations (id, name, result_json) VALUES (?, ?, ?)`)
    .run(result.simulationId, result.name, JSON.stringify(result));
}

export interface SimulationListEntry {
  id: string;
  name: string;
  createdAt: string;
  totalSavingsGB: number;
  readinessScore: number;
}

export function listSimulations(): SimulationListEntry[] {
  const rows = getDb()
    .prepare(`SELECT id, name, created_at, result_json FROM do_simulations ORDER BY created_at DESC LIMIT 50`)
    .all() as Array<{ id: string; name: string; created_at: string; result_json: string }>;
  return rows.map((r) => {
    const parsed = JSON.parse(r.result_json) as DOSimulationResult;
    return {
      id: r.id,
      name: r.name,
      createdAt: r.created_at,
      totalSavingsGB: parsed.savings.baselineMonthlyGB - parsed.savings.doPlusMCCMonthlyGB,
      readinessScore: parsed.readiness.total,
    };
  });
}

export function getSimulation(id: string): DOSimulationResult | null {
  const row = getDb()
    .prepare(`SELECT result_json FROM do_simulations WHERE id = ?`)
    .get(id) as { result_json: string } | undefined;
  return row ? (JSON.parse(row.result_json) as DOSimulationResult) : null;
}

export function deleteSimulation(id: string): boolean {
  const r = getDb().prepare(`DELETE FROM do_simulations WHERE id = ?`).run(id);
  return r.changes > 0;
}
