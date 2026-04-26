/**
 * RAG Engine — Retrieval-Augmented Generation for Intune documentation.
 *
 * Architecture:
 *   1. INGEST: Scrape learn.microsoft.com/en-us/intune/ docs → chunk into sections
 *   2. EMBED:  Generate embeddings via Azure OpenAI → store in SQLite
 *   3. SEARCH: For each user query, embed the query → cosine similarity search → return top-K chunks
 *   4. INJECT: Top chunks are injected into the agent's system prompt as context
 *
 * Storage: server/data/docs.db
 *
 * The doc index is built on first run or via POST /api/docs/index.
 * Subsequent queries use the cached embeddings.
 */

import Database from "better-sqlite3";
import { AzureOpenAI } from "openai";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { config } from "../config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "..", "data");
const DB_PATH = path.join(DATA_DIR, "docs.db");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS doc_chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL,
      title TEXT NOT NULL,
      section TEXT,
      content TEXT NOT NULL,
      embedding TEXT,
      indexed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_doc_chunks_url ON doc_chunks(url);

    CREATE TABLE IF NOT EXISTS doc_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  return db;
}

// ════════════════════════════════════════════════════════════════
//  1. SCRAPING — Fetch Intune docs from learn.microsoft.com
// ════════════════════════════════════════════════════════════════

/** Key Intune documentation pages to index */
const INTUNE_DOC_URLS = [
  // Fundamentals
  "https://learn.microsoft.com/en-us/intune/fundamentals/what-is-intune",
  "https://learn.microsoft.com/en-us/intune/fundamentals/intune-planning-guide",
  "https://learn.microsoft.com/en-us/intune/fundamentals/high-level-architecture",
  "https://learn.microsoft.com/en-us/intune/fundamentals/licenses",
  "https://learn.microsoft.com/en-us/intune/fundamentals/role-based-access-control",
  // Enrollment
  "https://learn.microsoft.com/en-us/intune/enrollment/device-enrollment",
  "https://learn.microsoft.com/en-us/intune/enrollment/windows-enrollment-methods",
  "https://learn.microsoft.com/en-us/intune/enrollment/apple-device-enrollment-program-enroll-ios",
  "https://learn.microsoft.com/en-us/intune/enrollment/android-enroll",
  // Device management
  "https://learn.microsoft.com/en-us/intune/remote-actions/device-management",
  "https://learn.microsoft.com/en-us/intune/remote-actions/devices-wipe",
  // Compliance
  "https://learn.microsoft.com/en-us/intune/protect/device-compliance-get-started",
  "https://learn.microsoft.com/en-us/intune/protect/compliance-policy-create-windows",
  "https://learn.microsoft.com/en-us/intune/protect/compliance-policy-create-ios",
  "https://learn.microsoft.com/en-us/intune/protect/compliance-policy-create-android",
  "https://learn.microsoft.com/en-us/intune/protect/actions-for-noncompliance",
  // Configuration
  "https://learn.microsoft.com/en-us/intune/configuration/device-profiles",
  "https://learn.microsoft.com/en-us/intune/configuration/settings-catalog",
  "https://learn.microsoft.com/en-us/intune/configuration/administrative-templates-windows",
  "https://learn.microsoft.com/en-us/intune/configuration/device-restrictions-windows-10",
  // Endpoint security
  "https://learn.microsoft.com/en-us/intune/protect/endpoint-security",
  "https://learn.microsoft.com/en-us/intune/protect/endpoint-security-antivirus-policy",
  "https://learn.microsoft.com/en-us/intune/protect/encrypt-devices",
  "https://learn.microsoft.com/en-us/intune/protect/endpoint-security-firewall-policy",
  "https://learn.microsoft.com/en-us/intune/protect/endpoint-security-asr-policy",
  // Autopilot
  "https://learn.microsoft.com/en-us/autopilot/windows-autopilot",
  "https://learn.microsoft.com/en-us/autopilot/tutorial/user-driven/entra-join-autopilot-deploy",
  "https://learn.microsoft.com/en-us/autopilot/tutorial/self-deploying/self-deploying-workflow",
  "https://learn.microsoft.com/en-us/autopilot/pre-provisioning",
  "https://learn.microsoft.com/en-us/autopilot/registration-overview",
  "https://learn.microsoft.com/en-us/autopilot/enrollment-status",
  // Apps
  "https://learn.microsoft.com/en-us/intune/apps/apps-add",
  "https://learn.microsoft.com/en-us/intune/apps/apps-win32-app-management",
  "https://learn.microsoft.com/en-us/intune/apps/app-protection-policy",
  "https://learn.microsoft.com/en-us/intune/apps/app-configuration-policies-overview",
  "https://learn.microsoft.com/en-us/intune/apps/company-portal-app",
  // Conditional Access
  "https://learn.microsoft.com/en-us/entra/identity/conditional-access/overview",
  "https://learn.microsoft.com/en-us/entra/identity/conditional-access/concept-conditional-access-policies",
  "https://learn.microsoft.com/en-us/entra/identity/conditional-access/howto-conditional-access-policy-compliant-device",
  // Proactive Remediations
  "https://learn.microsoft.com/en-us/intune/fundamentals/remediations",
  // Windows Update
  "https://learn.microsoft.com/en-us/intune/protect/windows-update-for-business-configure",
  "https://learn.microsoft.com/en-us/intune/protect/windows-10-feature-updates",
  // Troubleshooting
  "https://learn.microsoft.com/en-us/intune/fundamentals/help-desk-operators",
  "https://learn.microsoft.com/en-us/troubleshoot/mem/intune/device-enrollment/troubleshoot-device-enrollment-in-intune",
  // Graph API
  "https://learn.microsoft.com/en-us/graph/api/resources/intune-graph-overview",
];

/**
 * Fetch a documentation page and extract the main content.
 * Strips HTML tags and returns clean text.
 */
async function fetchDocPage(url: string): Promise<{ title: string; content: string; sections: string[] } | null> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 Intune007-DocIndexer/1.0" },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return null;

    const html = await response.text();

    // Extract title
    const titleMatch = html.match(/<h1[^>]*>(.*?)<\/h1>/s);
    const title = titleMatch
      ? titleMatch[1].replace(/<[^>]*>/g, "").trim()
      : url.split("/").pop()?.replace(/-/g, " ") || "Untitled";

    // Extract main content area
    const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/);
    const mainHtml = mainMatch ? mainMatch[1] : html;

    // Strip HTML tags, normalize whitespace
    const text = mainHtml
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim();

    // Extract section headings for chunking
    const headings = [...mainHtml.matchAll(/<h[23][^>]*>(.*?)<\/h[23]>/gs)]
      .map((m) => m[1].replace(/<[^>]*>/g, "").trim());

    return { title, content: text, sections: headings };
  } catch {
    return null;
  }
}

// ════════════════════════════════════════════════════════════════
//  2. CHUNKING — Split docs into embeddable sections
// ════════════════════════════════════════════════════════════════

interface DocChunk {
  url: string;
  title: string;
  section: string;
  content: string;
}

/**
 * Split a document into chunks of ~500 tokens (~2000 chars).
 */
function chunkDocument(url: string, title: string, content: string): DocChunk[] {
  const MAX_CHUNK_SIZE = 2000;
  const chunks: DocChunk[] = [];

  // Split by sentences
  const sentences = content.match(/[^.!?]+[.!?]+\s*/g) || [content];
  let currentChunk = "";
  let currentSection = title;
  let chunkIndex = 0;

  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length > MAX_CHUNK_SIZE && currentChunk.length > 200) {
      chunks.push({
        url,
        title,
        section: `${currentSection} (part ${++chunkIndex})`,
        content: currentChunk.trim(),
      });
      currentChunk = "";
    }
    currentChunk += sentence;
  }

  if (currentChunk.trim().length > 50) {
    chunks.push({
      url,
      title,
      section: chunkIndex > 0 ? `${currentSection} (part ${chunkIndex + 1})` : currentSection,
      content: currentChunk.trim(),
    });
  }

  return chunks;
}

// ════════════════════════════════════════════════════════════════
//  3. EMBEDDING — Generate and store vector embeddings
// ════════════════════════════════════════════════════════════════

/**
 * Generate embedding for a text using Azure OpenAI.
 */
async function generateEmbedding(text: string): Promise<number[]> {
  const client = new AzureOpenAI({
    apiKey: config.azureOpenAI.embeddingApiKey,
    endpoint: config.azureOpenAI.embeddingEndpoint,
    deployment: config.azureOpenAI.embeddingDeployment,
    apiVersion: config.azureOpenAI.embeddingApiVersion,
  });

  const response = await client.embeddings.create({
    model: config.azureOpenAI.embeddingDeployment,
    input: text.substring(0, 8000),
  });

  return response.data[0].embedding;
}

/**
 * Cosine similarity between two vectors.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ════════════════════════════════════════════════════════════════
//  4. INDEXING — Build the search index
// ════════════════════════════════════════════════════════════════

export interface IndexProgress {
  total: number;
  indexed: number;
  current: string;
  status: "running" | "done" | "error";
}

/**
 * Index all Intune documentation pages.
 * Fetches each page, chunks it, generates embeddings, stores in SQLite.
 */
export async function indexDocs(
  onProgress?: (progress: IndexProgress) => void
): Promise<{ totalPages: number; totalChunks: number; errors: string[] }> {
  const database = getDb();
  const errors: string[] = [];
  let totalChunks = 0;

  // Check if already indexed recently (within 7 days)
  const lastIndexed = database
    .prepare("SELECT value FROM doc_meta WHERE key = 'last_indexed'")
    .get() as { value: string } | undefined;

  if (lastIndexed) {
    const daysSince = (Date.now() - new Date(lastIndexed.value).getTime()) / 86400000;
    if (daysSince < 7) {
      const chunkCount = (database.prepare("SELECT COUNT(*) as c FROM doc_chunks").get() as { c: number }).c;
      if (chunkCount > 0) {
        console.log(`[RAG] Docs already indexed ${Math.round(daysSince)} days ago (${chunkCount} chunks). Skipping.`);
        return { totalPages: INTUNE_DOC_URLS.length, totalChunks: chunkCount, errors: [] };
      }
    }
  }

  console.log(`[RAG] Indexing ${INTUNE_DOC_URLS.length} Intune documentation pages...`);

  // Clear existing chunks
  database.prepare("DELETE FROM doc_chunks").run();

  const insertChunk = database.prepare(
    "INSERT INTO doc_chunks (url, title, section, content, embedding) VALUES (?, ?, ?, ?, ?)"
  );

  for (let i = 0; i < INTUNE_DOC_URLS.length; i++) {
    const url = INTUNE_DOC_URLS[i];
    const pageName = url.split("/").pop() || url;

    onProgress?.({
      total: INTUNE_DOC_URLS.length,
      indexed: i,
      current: pageName,
      status: "running",
    });

    console.log(`[RAG] [${i + 1}/${INTUNE_DOC_URLS.length}] Fetching: ${pageName}`);

    const page = await fetchDocPage(url);
    if (!page || page.content.length < 100) {
      errors.push(`Failed to fetch: ${pageName}`);
      continue;
    }

    const chunks = chunkDocument(url, page.title, page.content);

    // Generate embeddings in batches of 3
    for (let j = 0; j < chunks.length; j += 3) {
      const batch = chunks.slice(j, j + 3);
      const embeddings = await Promise.all(
        batch.map((chunk) =>
          generateEmbedding(`${chunk.title}: ${chunk.content}`).catch(() => null)
        )
      );

      for (let k = 0; k < batch.length; k++) {
        const embedding = embeddings[k];
        insertChunk.run(
          batch[k].url,
          batch[k].title,
          batch[k].section,
          batch[k].content,
          embedding ? JSON.stringify(embedding) : null
        );
        totalChunks++;
      }
    }
  }

  // Record indexing timestamp
  database
    .prepare("INSERT OR REPLACE INTO doc_meta (key, value) VALUES ('last_indexed', ?)")
    .run(new Date().toISOString());
  database
    .prepare("INSERT OR REPLACE INTO doc_meta (key, value) VALUES ('total_chunks', ?)")
    .run(String(totalChunks));

  onProgress?.({
    total: INTUNE_DOC_URLS.length,
    indexed: INTUNE_DOC_URLS.length,
    current: "Done",
    status: "done",
  });

  console.log(`[RAG] Indexing complete: ${totalChunks} chunks from ${INTUNE_DOC_URLS.length} pages`);

  return { totalPages: INTUNE_DOC_URLS.length, totalChunks, errors };
}

// ════════════════════════════════════════════════════════════════
//  5. SEARCH — Find relevant docs for a query
// ════════════════════════════════════════════════════════════════

export interface DocSearchResult {
  title: string;
  section: string;
  content: string;
  url: string;
  similarity: number;
}

/**
 * Search the indexed docs for the most relevant chunks.
 * Returns top-K results by cosine similarity.
 */
export async function searchDocs(
  query: string,
  topK: number = 5
): Promise<DocSearchResult[]> {
  const database = getDb();

  // Check if we have any indexed docs
  const count = (database.prepare("SELECT COUNT(*) as c FROM doc_chunks WHERE embedding IS NOT NULL").get() as { c: number }).c;
  if (count === 0) return [];

  // Generate query embedding
  let queryEmbedding: number[];
  try {
    queryEmbedding = await generateEmbedding(query);
  } catch {
    // Fallback: simple text search if embedding fails
    return fallbackTextSearch(query, topK);
  }

  // Load all chunks with embeddings
  const rows = database
    .prepare("SELECT title, section, content, url, embedding FROM doc_chunks WHERE embedding IS NOT NULL")
    .all() as Array<{ title: string; section: string; content: string; url: string; embedding: string }>;

  // Calculate similarity for each chunk
  const scored = rows.map((row) => {
    const embedding = JSON.parse(row.embedding) as number[];
    const similarity = cosineSimilarity(queryEmbedding, embedding);
    return { ...row, similarity };
  });

  // Sort by similarity and return top-K
  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, topK).map(({ embedding: _, ...rest }) => rest);
}

/**
 * Fallback text search when embeddings aren't available.
 */
function fallbackTextSearch(query: string, topK: number): DocSearchResult[] {
  const database = getDb();
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);

  const rows = database
    .prepare("SELECT title, section, content, url FROM doc_chunks")
    .all() as Array<{ title: string; section: string; content: string; url: string }>;

  const scored = rows.map((row) => {
    const text = `${row.title} ${row.section} ${row.content}`.toLowerCase();
    const matches = words.filter((w) => text.includes(w)).length;
    return { ...row, similarity: matches / words.length };
  });

  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.filter((r) => r.similarity > 0).slice(0, topK);
}

/**
 * Build a context string from search results for injection into the agent prompt.
 */
export function buildDocContext(results: DocSearchResult[]): string {
  if (results.length === 0) return "";

  const sections = results.map(
    (r) => `[${r.title}] (${r.url})\n${r.content.substring(0, 800)}`
  );

  return `--- Intune Documentation (retrieved from learn.microsoft.com) ---\n${sections.join("\n\n")}`;
}

/**
 * Get indexing status.
 */
export function getIndexStatus(): {
  indexed: boolean;
  totalChunks: number;
  lastIndexed: string | null;
  totalPages: number;
} {
  const database = getDb();

  const count = (database.prepare("SELECT COUNT(*) as c FROM doc_chunks").get() as { c: number }).c;
  const lastIndexed = database
    .prepare("SELECT value FROM doc_meta WHERE key = 'last_indexed'")
    .get() as { value: string } | undefined;

  return {
    indexed: count > 0,
    totalChunks: count,
    lastIndexed: lastIndexed?.value || null,
    totalPages: INTUNE_DOC_URLS.length,
  };
}
