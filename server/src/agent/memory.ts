/**
 * Agent Memory — Persistent note storage for cross-conversation context.
 *
 * Allows the agent to save and recall facts about the tenant, user
 * preferences, and operational notes. Uses SQLite for persistence.
 *
 * Storage: server/data/memory.db
 */

import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "..", "data");
const DB_PATH = path.join(DATA_DIR, "memory.db");

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
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      category TEXT DEFAULT 'general',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
      content, category,
      content='notes',
      content_rowid='id'
    );

    -- Triggers to keep FTS in sync
    CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
      INSERT INTO notes_fts(rowid, content, category)
        VALUES (new.id, new.content, new.category);
    END;

    CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
      INSERT INTO notes_fts(notes_fts, rowid, content, category)
        VALUES ('delete', old.id, old.content, old.category);
    END;

    CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
      INSERT INTO notes_fts(notes_fts, rowid, content, category)
        VALUES ('delete', old.id, old.content, old.category);
      INSERT INTO notes_fts(rowid, content, category)
        VALUES (new.id, new.content, new.category);
    END;
  `);

  return db;
}

export interface MemoryNote {
  id: number;
  content: string;
  category: string;
  created_at: string;
  updated_at: string;
}

/**
 * Save a new note to memory.
 */
export function saveNote(content: string, category: string = "general"): MemoryNote {
  const database = getDb();
  const result = database
    .prepare("INSERT INTO notes (content, category) VALUES (?, ?)")
    .run(content, category);

  return {
    id: result.lastInsertRowid as number,
    content,
    category,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/**
 * Search notes by keyword using full-text search.
 */
export function searchNotes(query: string, limit: number = 20): MemoryNote[] {
  const database = getDb();

  // Use FTS5 search
  const rows = database
    .prepare(
      `SELECT n.id, n.content, n.category, n.created_at, n.updated_at
       FROM notes n
       JOIN notes_fts f ON n.id = f.rowid
       WHERE notes_fts MATCH ?
       ORDER BY rank
       LIMIT ?`
    )
    .all(query, limit) as MemoryNote[];

  return rows;
}

/**
 * Get all notes, optionally filtered by category.
 */
export function getNotes(category?: string, limit: number = 50): MemoryNote[] {
  const database = getDb();

  if (category) {
    return database
      .prepare(
        "SELECT * FROM notes WHERE category = ? ORDER BY updated_at DESC LIMIT ?"
      )
      .all(category, limit) as MemoryNote[];
  }

  return database
    .prepare("SELECT * FROM notes ORDER BY updated_at DESC LIMIT ?")
    .all(limit) as MemoryNote[];
}

/**
 * Delete a note by ID.
 */
export function deleteNote(id: number): boolean {
  const database = getDb();
  const result = database.prepare("DELETE FROM notes WHERE id = ?").run(id);
  return result.changes > 0;
}

/**
 * Get recent notes for system prompt injection (lightweight context).
 */
export function getRecentContext(limit: number = 10): string {
  const notes = getNotes(undefined, limit);
  if (notes.length === 0) return "";

  return notes
    .map((n) => `[${n.category}] ${n.content}`)
    .join("\n");
}
