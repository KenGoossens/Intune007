/**
 * Scheduled Tasks — Cron-like task runner for recurring agent jobs.
 *
 * Users can define tasks with a natural language prompt that the agent
 * will execute on a schedule (daily, weekly, or at custom intervals).
 * Results are stored and surfaced as notifications.
 *
 * Storage: server/data/tasks.db
 */

import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "..", "data");
const DB_PATH = path.join(DATA_DIR, "tasks.db");

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      prompt TEXT NOT NULL,
      schedule TEXT NOT NULL DEFAULT 'daily',
      interval_minutes INTEGER NOT NULL DEFAULT 1440,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_run TEXT,
      last_result TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS task_executions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      result TEXT,
      error TEXT,
      duration_ms INTEGER,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );
  `);

  return db;
}

export interface ScheduledTask {
  id: string;
  name: string;
  prompt: string;
  schedule: string;
  intervalMinutes: number;
  enabled: boolean;
  lastRun: string | null;
  lastResult: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskExecution {
  id: number;
  taskId: string;
  startedAt: string;
  completedAt: string | null;
  result: string | null;
  error: string | null;
  durationMs: number | null;
}

type TaskRow = {
  id: string;
  name: string;
  prompt: string;
  schedule: string;
  interval_minutes: number;
  enabled: number;
  last_run: string | null;
  last_result: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

function rowToTask(row: TaskRow): ScheduledTask {
  return {
    id: row.id,
    name: row.name,
    prompt: row.prompt,
    schedule: row.schedule,
    intervalMinutes: row.interval_minutes,
    enabled: row.enabled === 1,
    lastRun: row.last_run,
    lastResult: row.last_result,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Create a new scheduled task.
 */
export function createTask(params: {
  name: string;
  prompt: string;
  schedule?: string;
  intervalMinutes?: number;
}): ScheduledTask {
  const database = getDb();
  const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const schedule = params.schedule || "daily";
  const intervalMinutes = params.intervalMinutes || (schedule === "daily" ? 1440 : schedule === "weekly" ? 10080 : 1440);

  database
    .prepare(
      `INSERT INTO tasks (id, name, prompt, schedule, interval_minutes)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(id, params.name, params.prompt, schedule, intervalMinutes);

  return {
    id,
    name: params.name,
    prompt: params.prompt,
    schedule,
    intervalMinutes,
    enabled: true,
    lastRun: null,
    lastResult: null,
    lastError: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * List all scheduled tasks.
 */
export function listTasks(): ScheduledTask[] {
  const database = getDb();
  const rows = database
    .prepare("SELECT * FROM tasks ORDER BY created_at DESC")
    .all() as TaskRow[];
  return rows.map(rowToTask);
}

/**
 * Update a task (enable/disable, change schedule).
 */
export function updateTask(
  id: string,
  updates: Partial<Pick<ScheduledTask, "name" | "prompt" | "schedule" | "intervalMinutes" | "enabled">>
): ScheduledTask | null {
  const database = getDb();
  const existing = database.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as TaskRow | undefined;
  if (!existing) return null;

  const name = updates.name ?? existing.name;
  const prompt = updates.prompt ?? existing.prompt;
  const schedule = updates.schedule ?? existing.schedule;
  const intervalMinutes = updates.intervalMinutes ?? existing.interval_minutes;
  const enabled = updates.enabled !== undefined ? (updates.enabled ? 1 : 0) : existing.enabled;

  database
    .prepare(
      `UPDATE tasks
       SET name = ?, prompt = ?, schedule = ?, interval_minutes = ?, enabled = ?, updated_at = datetime('now')
       WHERE id = ?`
    )
    .run(name, prompt, schedule, intervalMinutes, enabled, id);

  const updated = database.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as TaskRow;
  return rowToTask(updated);
}

/**
 * Delete a task.
 */
export function deleteTask(id: string): boolean {
  const database = getDb();
  const result = database.prepare("DELETE FROM tasks WHERE id = ?").run(id);
  return result.changes > 0;
}

/**
 * Record a task execution result.
 */
export function recordExecution(
  taskId: string,
  result: string | null,
  error: string | null,
  durationMs: number
): void {
  const database = getDb();

  database
    .prepare(
      `INSERT INTO task_executions (task_id, completed_at, result, error, duration_ms)
       VALUES (?, datetime('now'), ?, ?, ?)`
    )
    .run(taskId, result, error, durationMs);

  // Update the task's last run info
  database
    .prepare(
      `UPDATE tasks
       SET last_run = datetime('now'), last_result = ?, last_error = ?, updated_at = datetime('now')
       WHERE id = ?`
    )
    .run(result, error, taskId);
}

/**
 * Get execution history for a task.
 */
export function getTaskExecutions(taskId: string, limit: number = 20): TaskExecution[] {
  const database = getDb();
  return database
    .prepare(
      `SELECT id, task_id as taskId, started_at as startedAt,
              completed_at as completedAt, result, error, duration_ms as durationMs
       FROM task_executions
       WHERE task_id = ?
       ORDER BY started_at DESC
       LIMIT ?`
    )
    .all(taskId, limit) as TaskExecution[];
}

/**
 * Get tasks that are due to run (enabled + past their interval since last run).
 */
export function getDueTasks(): ScheduledTask[] {
  const database = getDb();
  const rows = database
    .prepare(
      `SELECT * FROM tasks
       WHERE enabled = 1
         AND (last_run IS NULL
              OR datetime(last_run, '+' || interval_minutes || ' minutes') <= datetime('now'))
       ORDER BY created_at ASC`
    )
    .all() as TaskRow[];
  return rows.map(rowToTask);
}
