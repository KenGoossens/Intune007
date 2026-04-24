/**
 * Historical Trending — Time-series storage for compliance and device metrics.
 *
 * Stores periodic snapshots of key Intune metrics (compliance counts, device
 * counts, alert counts) in a local SQLite database. Enables trend analysis
 * and reporting over time.
 *
 * Storage: server/data/history.db
 * Schema: Single metrics table with (timestamp, metric_name, metric_value)
 */

import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "..", "data");
const DB_PATH = path.join(DATA_DIR, "history.db");

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");

  // Create tables if they don't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      metric_name TEXT NOT NULL,
      metric_value REAL NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_metrics_name_time
      ON metrics (metric_name, timestamp);

    CREATE TABLE IF NOT EXISTS snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      data TEXT NOT NULL
    );
  `);

  return db;
}

/**
 * Record a metric data point.
 */
export function recordMetric(name: string, value: number): void {
  const database = getDb();
  database
    .prepare("INSERT INTO metrics (metric_name, metric_value) VALUES (?, ?)")
    .run(name, value);
}

/**
 * Record multiple metrics at once (batched in a transaction).
 */
export function recordMetrics(metrics: Array<{ name: string; value: number }>): void {
  const database = getDb();
  const insert = database.prepare(
    "INSERT INTO metrics (metric_name, metric_value) VALUES (?, ?)"
  );

  const batch = database.transaction((items: Array<{ name: string; value: number }>) => {
    for (const item of items) {
      insert.run(item.name, item.value);
    }
  });

  batch(metrics);
}

/**
 * Get metric trend data for a specific metric over a date range.
 */
export function getMetricTrend(
  metricName: string,
  days: number = 30
): Array<{ timestamp: string; value: number }> {
  const database = getDb();
  const since = new Date();
  since.setDate(since.getDate() - days);

  const rows = database
    .prepare(
      `SELECT timestamp, metric_value as value
       FROM metrics
       WHERE metric_name = ? AND timestamp >= ?
       ORDER BY timestamp ASC`
    )
    .all(metricName, since.toISOString()) as Array<{ timestamp: string; value: number }>;

  return rows;
}

/**
 * Get daily aggregated trend (average per day).
 */
export function getDailyTrend(
  metricName: string,
  days: number = 30
): Array<{ date: string; avg: number; min: number; max: number; count: number }> {
  const database = getDb();
  const since = new Date();
  since.setDate(since.getDate() - days);

  const rows = database
    .prepare(
      `SELECT
         date(timestamp) as date,
         AVG(metric_value) as avg,
         MIN(metric_value) as min,
         MAX(metric_value) as max,
         COUNT(*) as count
       FROM metrics
       WHERE metric_name = ? AND timestamp >= ?
       GROUP BY date(timestamp)
       ORDER BY date ASC`
    )
    .all(metricName, since.toISOString()) as Array<{
      date: string;
      avg: number;
      min: number;
      max: number;
      count: number;
    }>;

  return rows;
}

/**
 * Get all available metric names.
 */
export function getAvailableMetrics(): string[] {
  const database = getDb();
  const rows = database
    .prepare("SELECT DISTINCT metric_name FROM metrics ORDER BY metric_name")
    .all() as Array<{ metric_name: string }>;
  return rows.map((r) => r.metric_name);
}

/**
 * Store a full JSON snapshot (e.g., compliance status, device counts).
 */
export function recordSnapshot(data: Record<string, unknown>): void {
  const database = getDb();
  database
    .prepare("INSERT INTO snapshots (data) VALUES (?)")
    .run(JSON.stringify(data));
}

/**
 * Get recent snapshots.
 */
export function getSnapshots(
  limit: number = 100
): Array<{ id: number; timestamp: string; data: Record<string, unknown> }> {
  const database = getDb();
  const rows = database
    .prepare("SELECT id, timestamp, data FROM snapshots ORDER BY timestamp DESC LIMIT ?")
    .all(limit) as Array<{ id: number; timestamp: string; data: string }>;

  return rows.map((r) => ({
    id: r.id,
    timestamp: r.timestamp,
    data: JSON.parse(r.data) as Record<string, unknown>,
  }));
}

/**
 * Clean up old data beyond retention period.
 */
export function pruneOldData(retentionDays: number = 90): number {
  const database = getDb();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);

  const metricsResult = database
    .prepare("DELETE FROM metrics WHERE timestamp < ?")
    .run(cutoff.toISOString());

  const snapshotsResult = database
    .prepare("DELETE FROM snapshots WHERE timestamp < ?")
    .run(cutoff.toISOString());

  return metricsResult.changes + snapshotsResult.changes;
}
