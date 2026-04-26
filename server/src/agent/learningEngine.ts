/**
 * Agent Learning Engine — Self-improving AI through interaction learning.
 *
 * This module implements a continuous learning loop that makes the agent
 * smarter over time without fine-tuning the LLM. It works by:
 *
 * 1. INTERACTION LOGGING
 *    Every conversation is recorded: user query → tool chain → outcome.
 *    This builds a searchable knowledge base of past interactions.
 *
 * 2. FEW-SHOT EXAMPLE BANK
 *    Successful interactions (high feedback scores) are promoted to
 *    "exemplars" — injected into the system prompt as few-shot examples
 *    so the model learns the best patterns for this specific tenant.
 *
 * 3. TOOL CHAIN PATTERNS
 *    Tracks which tool sequences work best for which query types.
 *    E.g., "compliance questions" → get_compliance_status then get_managed_devices.
 *    These patterns are surfaced as hints in the system prompt.
 *
 * 4. CORRECTION LEARNING
 *    When a user rephrases a question (indicating the first answer was bad),
 *    the engine records the correction. Next time a similar query comes in,
 *    the agent knows to use the corrected approach.
 *
 * 5. FEEDBACK SCORING
 *    Users can rate responses (thumbs up/down). High-rated interactions
 *    become exemplars; low-rated ones generate "avoid" patterns.
 *
 * Storage: server/data/learning.db
 */

import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const DB_PATH = path.join(DATA_DIR, "learning.db");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");

  db.exec(`
    -- Every interaction logged
    CREATE TABLE IF NOT EXISTS interactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_query TEXT NOT NULL,
      query_intent TEXT,
      tool_chain TEXT,
      tool_count INTEGER DEFAULT 0,
      response_summary TEXT,
      response_length INTEGER DEFAULT 0,
      feedback_score INTEGER DEFAULT 0,
      was_correction INTEGER DEFAULT 0,
      correction_of INTEGER,
      duration_ms INTEGER DEFAULT 0,
      token_count INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Promoted exemplars (few-shot examples)
    CREATE TABLE IF NOT EXISTS exemplars (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      interaction_id INTEGER,
      query_pattern TEXT NOT NULL,
      ideal_tool_chain TEXT NOT NULL,
      ideal_response_summary TEXT NOT NULL,
      category TEXT DEFAULT 'general',
      usage_count INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (interaction_id) REFERENCES interactions(id)
    );

    -- Tool chain patterns
    CREATE TABLE IF NOT EXISTS tool_patterns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      intent TEXT NOT NULL,
      tool_chain TEXT NOT NULL,
      success_count INTEGER DEFAULT 0,
      failure_count INTEGER DEFAULT 0,
      avg_duration_ms REAL DEFAULT 0,
      last_used TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(intent, tool_chain)
    );

    -- Learned corrections / "don't do this" patterns
    CREATE TABLE IF NOT EXISTS corrections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_query TEXT NOT NULL,
      original_response_summary TEXT,
      corrected_query TEXT NOT NULL,
      corrected_tool_chain TEXT,
      lesson TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- FTS index for searching past interactions
    CREATE VIRTUAL TABLE IF NOT EXISTS interactions_fts USING fts5(
      user_query, query_intent, response_summary,
      content='interactions',
      content_rowid='id'
    );

    CREATE TRIGGER IF NOT EXISTS interactions_ai AFTER INSERT ON interactions BEGIN
      INSERT INTO interactions_fts(rowid, user_query, query_intent, response_summary)
        VALUES (new.id, new.user_query, new.query_intent, new.response_summary);
    END;

    CREATE TRIGGER IF NOT EXISTS interactions_ad AFTER DELETE ON interactions BEGIN
      INSERT INTO interactions_fts(interactions_fts, rowid, user_query, query_intent, response_summary)
        VALUES ('delete', old.id, old.user_query, old.query_intent, old.response_summary);
    END;
  `);

  return db;
}

// ════════════════════════════════════════════════════════════════
//  1. INTERACTION LOGGING
// ════════════════════════════════════════════════════════════════

export interface InteractionRecord {
  id: number;
  userQuery: string;
  queryIntent?: string;
  toolChain: string[];
  responseSummary: string;
  feedbackScore: number;
  wasCorrection: boolean;
  durationMs: number;
  tokenCount: number;
  createdAt: string;
}

/**
 * Log a completed interaction for learning.
 */
export function logInteraction(params: {
  userQuery: string;
  queryIntent?: string;
  toolChain: string[];
  responseSummary: string;
  durationMs?: number;
  tokenCount?: number;
  wasCorrection?: boolean;
  correctionOf?: number;
}): number {
  const database = getDb();
  const result = database
    .prepare(
      `INSERT INTO interactions
        (user_query, query_intent, tool_chain, tool_count, response_summary, response_length, was_correction, correction_of, duration_ms, token_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      params.userQuery,
      params.queryIntent || null,
      JSON.stringify(params.toolChain),
      params.toolChain.length,
      params.responseSummary.substring(0, 500),
      params.responseSummary.length,
      params.wasCorrection ? 1 : 0,
      params.correctionOf || null,
      params.durationMs || 0,
      params.tokenCount || 0
    );

  const interactionId = result.lastInsertRowid as number;

  // Update tool patterns
  if (params.toolChain.length > 0 && params.queryIntent) {
    updateToolPattern(params.queryIntent, params.toolChain, params.durationMs || 0);
  }

  return interactionId;
}

// ════════════════════════════════════════════════════════════════
//  2. FEEDBACK
// ════════════════════════════════════════════════════════════════

/**
 * Record user feedback on an interaction.
 * score: 1 = thumbs up, -1 = thumbs down, 0 = neutral
 */
export function recordFeedback(interactionId: number, score: number): void {
  const database = getDb();
  database
    .prepare("UPDATE interactions SET feedback_score = ? WHERE id = ?")
    .run(score, interactionId);

  // If thumbs up, consider promoting to exemplar
  if (score === 1) {
    maybePromoteToExemplar(interactionId);
  }

  // If thumbs down, check if next message is a correction
  if (score === -1) {
    console.log(`[Learning] Negative feedback on interaction ${interactionId} — watching for correction`);
  }
}

/**
 * Get the last interaction ID (for the feedback button to reference).
 */
export function getLastInteractionId(): number | null {
  const database = getDb();
  const row = database
    .prepare("SELECT id FROM interactions ORDER BY id DESC LIMIT 1")
    .get() as { id: number } | undefined;
  return row?.id || null;
}

// ════════════════════════════════════════════════════════════════
//  3. FEW-SHOT EXAMPLE MANAGEMENT
// ════════════════════════════════════════════════════════════════

/**
 * Promote a high-quality interaction to an exemplar.
 */
function maybePromoteToExemplar(interactionId: number): void {
  const database = getDb();
  const interaction = database
    .prepare("SELECT * FROM interactions WHERE id = ?")
    .get(interactionId) as Record<string, unknown> | undefined;

  if (!interaction) return;

  // Only promote if it has a tool chain and decent response
  const toolChain = JSON.parse(String(interaction.tool_chain || "[]"));
  if (toolChain.length === 0) return;
  if ((interaction.response_length as number) < 20) return;

  // Check if we already have a similar exemplar
  const existingCount = database
    .prepare("SELECT COUNT(*) as count FROM exemplars WHERE query_pattern = ?")
    .get(String(interaction.user_query).substring(0, 200)) as { count: number };

  if (existingCount.count > 0) return;

  // Keep total exemplars manageable (max 30)
  const totalExemplars = database
    .prepare("SELECT COUNT(*) as count FROM exemplars")
    .get() as { count: number };

  if (totalExemplars.count >= 30) {
    // Remove the oldest, least-used exemplar
    database
      .prepare("DELETE FROM exemplars WHERE id = (SELECT id FROM exemplars ORDER BY usage_count ASC, created_at ASC LIMIT 1)")
      .run();
  }

  database
    .prepare(
      `INSERT INTO exemplars (interaction_id, query_pattern, ideal_tool_chain, ideal_response_summary, category)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(
      interactionId,
      String(interaction.user_query).substring(0, 200),
      String(interaction.tool_chain),
      String(interaction.response_summary).substring(0, 300),
      interaction.query_intent || "general"
    );

  console.log(`[Learning] Promoted interaction ${interactionId} to exemplar`);
}

/**
 * Get relevant few-shot examples for a given query.
 * Uses FTS to find the most similar past successful interactions.
 */
export function getRelevantExemplars(query: string, limit: number = 3): Array<{
  queryPattern: string;
  toolChain: string[];
  responseSummary: string;
}> {
  const database = getDb();

  // Search by FTS similarity against the exemplar query patterns
  try {
    const rows = database
      .prepare(
        `SELECT e.id, e.query_pattern, e.ideal_tool_chain, e.ideal_response_summary
         FROM exemplars e
         JOIN interactions i ON e.interaction_id = i.id
         JOIN interactions_fts f ON i.id = f.rowid
         WHERE interactions_fts MATCH ?
         ORDER BY rank
         LIMIT ?`
      )
      .all(sanitizeFtsQuery(query), limit) as Array<Record<string, unknown>>;

    // Mark as used
    for (const row of rows) {
      database
        .prepare("UPDATE exemplars SET usage_count = usage_count + 1 WHERE id = ?")
        .run(row.id);
    }

    return rows.map((row) => ({
      queryPattern: String(row.query_pattern),
      toolChain: JSON.parse(String(row.ideal_tool_chain)),
      responseSummary: String(row.ideal_response_summary),
    }));
  } catch {
    // FTS query may fail on unusual input — fall back to recent exemplars
    const rows = database
      .prepare(
        `SELECT query_pattern, ideal_tool_chain, ideal_response_summary
         FROM exemplars
         ORDER BY usage_count DESC, created_at DESC
         LIMIT ?`
      )
      .all(limit) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      queryPattern: String(row.query_pattern),
      toolChain: JSON.parse(String(row.ideal_tool_chain)),
      responseSummary: String(row.ideal_response_summary),
    }));
  }
}

// ════════════════════════════════════════════════════════════════
//  4. TOOL CHAIN PATTERN LEARNING
// ════════════════════════════════════════════════════════════════

/**
 * Record a successful tool chain for an intent.
 */
function updateToolPattern(intent: string, toolChain: string[], durationMs: number): void {
  const database = getDb();
  const chainKey = JSON.stringify(toolChain);

  const existing = database
    .prepare("SELECT id, success_count, avg_duration_ms FROM tool_patterns WHERE intent = ? AND tool_chain = ?")
    .get(intent, chainKey) as Record<string, unknown> | undefined;

  if (existing) {
    const newCount = (existing.success_count as number) + 1;
    const newAvg =
      ((existing.avg_duration_ms as number) * (existing.success_count as number) + durationMs) / newCount;
    database
      .prepare("UPDATE tool_patterns SET success_count = ?, avg_duration_ms = ?, last_used = datetime('now') WHERE id = ?")
      .run(newCount, newAvg, existing.id);
  } else {
    database
      .prepare(
        "INSERT INTO tool_patterns (intent, tool_chain, success_count, avg_duration_ms) VALUES (?, ?, 1, ?)"
      )
      .run(intent, chainKey, durationMs);
  }
}

/**
 * Get the best tool chain patterns for a given intent.
 */
export function getBestToolPatterns(intent: string, limit: number = 3): Array<{
  toolChain: string[];
  successCount: number;
  avgDurationMs: number;
}> {
  const database = getDb();
  const rows = database
    .prepare(
      `SELECT tool_chain, success_count, avg_duration_ms
       FROM tool_patterns
       WHERE intent = ?
       ORDER BY success_count DESC
       LIMIT ?`
    )
    .all(intent, limit) as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    toolChain: JSON.parse(String(row.tool_chain)),
    successCount: row.success_count as number,
    avgDurationMs: row.avg_duration_ms as number,
  }));
}

// ════════════════════════════════════════════════════════════════
//  5. CORRECTION LEARNING
// ════════════════════════════════════════════════════════════════

/**
 * Record a correction: user was unhappy with the first response,
 * then rephrased. We learn from the difference.
 */
export function recordCorrection(params: {
  originalQuery: string;
  originalResponseSummary?: string;
  correctedQuery: string;
  correctedToolChain?: string[];
  lesson: string;
}): void {
  const database = getDb();
  database
    .prepare(
      `INSERT INTO corrections (original_query, original_response_summary, corrected_query, corrected_tool_chain, lesson)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(
      params.originalQuery,
      params.originalResponseSummary || null,
      params.correctedQuery,
      params.correctedToolChain ? JSON.stringify(params.correctedToolChain) : null,
      params.lesson
    );
}

/**
 * Get corrections relevant to a query (to avoid repeating past mistakes).
 */
export function getRelevantCorrections(query: string, limit: number = 3): Array<{
  originalQuery: string;
  lesson: string;
}> {
  const database = getDb();

  try {
    // Search interactions FTS for similar past failures
    const rows = database
      .prepare(
        `SELECT c.original_query, c.lesson
         FROM corrections c
         ORDER BY c.created_at DESC
         LIMIT ?`
      )
      .all(limit) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      originalQuery: String(row.original_query),
      lesson: String(row.lesson),
    }));
  } catch {
    return [];
  }
}

// ════════════════════════════════════════════════════════════════
//  6. SYSTEM PROMPT CONTEXT BUILDER
// ════════════════════════════════════════════════════════════════

/**
 * Build the learning context to inject into the system prompt.
 * This is the core of the self-improvement loop.
 */
export function buildLearningContext(userQuery: string): string {
  const sections: string[] = [];

  // 1. Relevant few-shot examples
  const exemplars = getRelevantExemplars(userQuery, 3);
  if (exemplars.length > 0) {
    sections.push("--- Learned Patterns (from successful past interactions) ---");
    for (const ex of exemplars) {
      sections.push(
        `When asked "${ex.queryPattern}", the best approach was: ${ex.toolChain.join(" → ")}. ` +
        `Result: ${ex.responseSummary}`
      );
    }
  }

  // 2. Relevant corrections (avoid past mistakes)
  const corrections = getRelevantCorrections(userQuery, 2);
  if (corrections.length > 0) {
    sections.push("\n--- Lessons Learned (avoid these mistakes) ---");
    for (const c of corrections) {
      sections.push(`When asked "${c.originalQuery}": ${c.lesson}`);
    }
  }

  // 3. Top tool patterns for the detected intent
  // (Intent is extracted from the query by simple keyword matching)
  const intent = detectQueryIntent(userQuery);
  if (intent) {
    const patterns = getBestToolPatterns(intent, 2);
    if (patterns.length > 0) {
      sections.push(`\n--- Preferred tool chains for "${intent}" queries ---`);
      for (const p of patterns) {
        sections.push(
          `Tools: ${p.toolChain.join(" → ")} (used ${p.successCount} times, avg ${Math.round(p.avgDurationMs)}ms)`
        );
      }
    }
  }

  return sections.join("\n");
}

// ════════════════════════════════════════════════════════════════
//  7. ANALYTICS & STATS
// ════════════════════════════════════════════════════════════════

export interface LearningStats {
  totalInteractions: number;
  positiveCount: number;
  negativeCount: number;
  exemplarCount: number;
  correctionCount: number;
  patternCount: number;
  topPatterns: Array<{ intent: string; toolChain: string[]; successCount: number }>;
  recentExemplars: Array<{ query: string; toolChain: string[] }>;
  feedbackRate: number;
}

/**
 * Get learning statistics.
 */
export function getLearningStats(): LearningStats {
  const database = getDb();

  const totals = database
    .prepare(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN feedback_score = 1 THEN 1 ELSE 0 END) as positive,
        SUM(CASE WHEN feedback_score = -1 THEN 1 ELSE 0 END) as negative,
        SUM(CASE WHEN feedback_score != 0 THEN 1 ELSE 0 END) as rated
       FROM interactions`
    )
    .get() as Record<string, number>;

  const exemplarCount = (database.prepare("SELECT COUNT(*) as c FROM exemplars").get() as { c: number }).c;
  const correctionCount = (database.prepare("SELECT COUNT(*) as c FROM corrections").get() as { c: number }).c;
  const patternCount = (database.prepare("SELECT COUNT(*) as c FROM tool_patterns").get() as { c: number }).c;

  const topPatterns = database
    .prepare(
      `SELECT intent, tool_chain, success_count
       FROM tool_patterns
       ORDER BY success_count DESC
       LIMIT 5`
    )
    .all() as Array<Record<string, unknown>>;

  const recentExemplars = database
    .prepare(
      `SELECT query_pattern, ideal_tool_chain
       FROM exemplars
       ORDER BY created_at DESC
       LIMIT 5`
    )
    .all() as Array<Record<string, unknown>>;

  return {
    totalInteractions: totals.total || 0,
    positiveCount: totals.positive || 0,
    negativeCount: totals.negative || 0,
    exemplarCount,
    correctionCount,
    patternCount,
    topPatterns: topPatterns.map((p) => ({
      intent: String(p.intent),
      toolChain: JSON.parse(String(p.tool_chain)),
      successCount: p.success_count as number,
    })),
    recentExemplars: recentExemplars.map((e) => ({
      query: String(e.query_pattern),
      toolChain: JSON.parse(String(e.ideal_tool_chain)),
    })),
    feedbackRate: totals.total > 0 ? (totals.rated / totals.total) * 100 : 0,
  };
}

/**
 * Search past interactions.
 */
export function searchInteractions(query: string, limit: number = 10): InteractionRecord[] {
  const database = getDb();

  try {
    const rows = database
      .prepare(
        `SELECT i.id, i.user_query, i.query_intent, i.tool_chain, i.response_summary,
                i.feedback_score, i.was_correction, i.duration_ms, i.token_count, i.created_at
         FROM interactions i
         JOIN interactions_fts f ON i.id = f.rowid
         WHERE interactions_fts MATCH ?
         ORDER BY rank
         LIMIT ?`
      )
      .all(sanitizeFtsQuery(query), limit) as Array<Record<string, unknown>>;

    return rows.map(rowToInteraction);
  } catch {
    return [];
  }
}

/**
 * Get recent interactions.
 */
export function getRecentInteractions(limit: number = 20): InteractionRecord[] {
  const database = getDb();
  const rows = database
    .prepare(
      `SELECT id, user_query, query_intent, tool_chain, response_summary,
              feedback_score, was_correction, duration_ms, token_count, created_at
       FROM interactions
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(limit) as Array<Record<string, unknown>>;

  return rows.map(rowToInteraction);
}

// ════════════════════════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════════════════════════

function rowToInteraction(row: Record<string, unknown>): InteractionRecord {
  return {
    id: row.id as number,
    userQuery: String(row.user_query),
    queryIntent: row.query_intent ? String(row.query_intent) : undefined,
    toolChain: JSON.parse(String(row.tool_chain || "[]")),
    responseSummary: String(row.response_summary || ""),
    feedbackScore: row.feedback_score as number,
    wasCorrection: (row.was_correction as number) === 1,
    durationMs: row.duration_ms as number,
    tokenCount: row.token_count as number,
    createdAt: String(row.created_at),
  };
}

/**
 * Detect the general intent of a user query via keyword matching.
 * This is a lightweight classifier — no LLM call needed.
 */
function detectQueryIntent(query: string): string | null {
  const q = query.toLowerCase();

  const intentMap: Array<[string, RegExp]> = [
    ["compliance", /\b(complian|non-compliant|policy violation|policy status)\b/],
    ["devices", /\b(device|laptop|desktop|phone|tablet|machine|computer|endpoint)\b/],
    ["apps", /\b(app|application|software|install|deploy|package)\b/],
    ["security", /\b(security|threat|vulnerability|risk|attack|defender|bitlocker|encrypt)\b/],
    ["autopilot", /\b(autopilot|enrollment|oobe|provision|onboard)\b/],
    ["updates", /\b(update|patch|windows update|ring|feature update)\b/],
    ["users", /\b(user|sign.in|login|authentication|mfa|conditional access)\b/],
    ["groups", /\b(group|assignment|target|scope|membership)\b/],
    ["configuration", /\b(config|profile|setting|baseline|policy)\b/],
    ["troubleshoot", /\b(troubleshoot|diagnos|fix|issue|problem|error|not working|broken)\b/],
    ["reporting", /\b(report|summary|overview|dashboard|status|how many|count)\b/],
    ["remediation", /\b(remediat|script|proactive|fix|heal|automat)\b/],
  ];

  for (const [intent, pattern] of intentMap) {
    if (pattern.test(q)) return intent;
  }

  return null;
}

/**
 * Sanitize a query for FTS5 MATCH syntax.
 * FTS5 doesn't like special characters — strip them.
 */
function sanitizeFtsQuery(query: string): string {
  // Keep alphanumeric and spaces, wrap each word in quotes for prefix matching
  const words = query
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length >= 2)
    .slice(0, 8); // Max 8 search terms

  if (words.length === 0) return '""';
  return words.map((w) => `"${w}"`).join(" OR ");
}
