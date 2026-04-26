import type { AnalyticsEntry, AnalyticsSummary, AnalyticsToolCall } from "@intune-agent/shared";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

// Pricing per 1K tokens (Azure OpenAI GPT-4o approximate rates)
const PROMPT_COST_PER_1K = 0.005;
const COMPLETION_COST_PER_1K = 0.015;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "..", "data");
const DB_PATH = path.join(DATA_DIR, "analytics.db");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS entries (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      user_message TEXT NOT NULL,
      prompt_tokens INTEGER NOT NULL DEFAULT 0,
      completion_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      estimated_cost REAL NOT NULL DEFAULT 0,
      total_duration_ms INTEGER NOT NULL DEFAULT 0,
      iterations INTEGER NOT NULL DEFAULT 0,
      tool_calls TEXT NOT NULL DEFAULT '[]',
      model TEXT NOT NULL DEFAULT '',
      error TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_entries_timestamp ON entries(timestamp);
  `);

  return db;
}

let idCounter = 0;

class AnalyticsTracker {
  /** Start tracking a new request. Returns an entry builder. */
  startRequest(userMessage: string, model: string): RequestTracker {
    return new RequestTracker(userMessage, model, (entry) => {
      this.persistEntry(entry);
    });
  }

  private persistEntry(entry: AnalyticsEntry): void {
    const database = getDb();
    database
      .prepare(
        `INSERT INTO entries (id, timestamp, user_message, prompt_tokens, completion_tokens,
         total_tokens, estimated_cost, total_duration_ms, iterations, tool_calls, model, error)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        entry.id,
        entry.timestamp,
        entry.userMessage,
        entry.promptTokens,
        entry.completionTokens,
        entry.totalTokens,
        entry.estimatedCost,
        entry.totalDurationMs,
        entry.iterations,
        JSON.stringify(entry.toolCalls),
        entry.model,
        entry.error || null
      );

    // Prune old entries beyond 2000
    database
      .prepare(
        `DELETE FROM entries WHERE id NOT IN (
          SELECT id FROM entries ORDER BY timestamp DESC LIMIT 2000
        )`
      )
      .run();
  }

  getSummary(): AnalyticsSummary {
    const database = getDb();

    const agg = database
      .prepare(
        `SELECT
          COUNT(*) as totalRequests,
          COALESCE(SUM(total_tokens), 0) as totalTokens,
          COALESCE(SUM(prompt_tokens), 0) as totalPromptTokens,
          COALESCE(SUM(completion_tokens), 0) as totalCompletionTokens,
          COALESCE(SUM(estimated_cost), 0) as totalCost,
          COALESCE(SUM(total_duration_ms), 0) as totalDuration,
          COALESCE(SUM(json_array_length(tool_calls)), 0) as totalToolCalls
         FROM entries`
      )
      .get() as Record<string, number>;

    const totalRequests = agg.totalRequests || 0;

    // Get the last 100 entries for display
    const rows = database
      .prepare(
        `SELECT id, timestamp, user_message, prompt_tokens, completion_tokens,
         total_tokens, estimated_cost, total_duration_ms, iterations, tool_calls, model, error
         FROM entries ORDER BY timestamp DESC LIMIT 100`
      )
      .all() as Array<Record<string, unknown>>;

    const entries: AnalyticsEntry[] = rows.map((row) => ({
      id: String(row.id),
      timestamp: String(row.timestamp),
      userMessage: String(row.user_message),
      promptTokens: row.prompt_tokens as number,
      completionTokens: row.completion_tokens as number,
      totalTokens: row.total_tokens as number,
      estimatedCost: row.estimated_cost as number,
      totalDurationMs: row.total_duration_ms as number,
      iterations: row.iterations as number,
      toolCalls: JSON.parse(String(row.tool_calls || "[]")),
      model: String(row.model),
      error: row.error ? String(row.error) : undefined,
    }));

    return {
      totalRequests,
      totalTokens: agg.totalTokens,
      totalPromptTokens: agg.totalPromptTokens,
      totalCompletionTokens: agg.totalCompletionTokens,
      totalCost: agg.totalCost,
      avgResponseMs: totalRequests > 0 ? agg.totalDuration / totalRequests : 0,
      avgTokensPerRequest: totalRequests > 0 ? agg.totalTokens / totalRequests : 0,
      totalToolCalls: agg.totalToolCalls,
      entries,
    };
  }

  clear(): void {
    const database = getDb();
    database.prepare("DELETE FROM entries").run();
  }
}

export class RequestTracker {
  private startTime = Date.now();
  private promptTokens = 0;
  private completionTokens = 0;
  private iterations = 0;
  private toolCalls: AnalyticsToolCall[] = [];
  private error?: string;

  constructor(
    private userMessage: string,
    private model: string,
    private onComplete: (entry: AnalyticsEntry) => void
  ) {}

  addTokenUsage(prompt: number, completion: number): void {
    this.promptTokens += prompt;
    this.completionTokens += completion;
    this.iterations++;
  }

  addToolCall(call: AnalyticsToolCall): void {
    this.toolCalls.push(call);
  }

  setError(message: string): void {
    this.error = message;
  }

  finish(): void {
    const totalTokens = this.promptTokens + this.completionTokens;
    const estimatedCost =
      (this.promptTokens / 1000) * PROMPT_COST_PER_1K +
      (this.completionTokens / 1000) * COMPLETION_COST_PER_1K;

    this.onComplete({
      id: `analytics-${++idCounter}-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userMessage: this.userMessage,
      promptTokens: this.promptTokens,
      completionTokens: this.completionTokens,
      totalTokens,
      estimatedCost,
      totalDurationMs: Date.now() - this.startTime,
      iterations: this.iterations,
      toolCalls: this.toolCalls,
      model: this.model,
      error: this.error,
    });
  }
}

export const analyticsTracker = new AnalyticsTracker();
