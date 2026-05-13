# RAG Pipeline — Retrieval-Augmented Generation

## Overview

The RAG pipeline enriches the agent's responses with up-to-date Intune documentation from [learn.microsoft.com](https://learn.microsoft.com). When a user sends a message, the pipeline retrieves the most relevant documentation chunks and injects them into the system prompt, giving the LLM factual context alongside its built-in knowledge.

## Architecture Diagram

```
User Message
     │
     ▼
┌─────────────┐     ┌──────────────┐     ┌──────────────────┐
│  searchDocs │────▶│  Embed Query │────▶│  Cosine Search   │
│  (engine.ts)│     │  (Ada-002)   │     │  (all chunks)    │
└─────────────┘     └──────────────┘     └────────┬─────────┘
                                                  │ Top-3
                                                  ▼
┌─────────────┐     ┌──────────────┐     ┌──────────────────┐
│ System      │◀────│ buildDoc     │◀────│ DocSearchResult[]│
│ Prompt      │     │ Context()    │     │ (title, content, │
│ (agent.ts)  │     │              │     │  url, similarity)│
└─────────────┘     └──────────────┘     └──────────────────┘
```

## Pipeline Stages

### Stage 1 — Ingest (Scraping)

**File:** `server/src/rag/engine.ts` → `fetchDocPage()`

The pipeline scrapes **45 curated Microsoft Learn pages** covering:

| Category             | Pages | Example Topics                                       |
|----------------------|-------|------------------------------------------------------|
| Fundamentals         | 5     | What is Intune, planning guide, architecture, RBAC   |
| Enrollment           | 4     | Device enrollment, Windows, Apple DEP, Android       |
| Device Management    | 2     | Remote actions, wipe vs retire                       |
| Compliance           | 5     | Getting started, Windows/iOS/Android policies        |
| Configuration        | 4     | Profiles, Settings Catalog, Admin Templates          |
| Endpoint Security    | 5     | Antivirus, BitLocker, firewall, ASR                  |
| Autopilot            | 6     | User-driven, self-deploying, pre-provisioning, ESP   |
| Apps                 | 5     | Win32, app protection, app config, Company Portal    |
| Conditional Access   | 3     | Overview, compliant device policy                    |
| Remediation          | 1     | Proactive Remediations                               |
| Windows Update       | 2     | WUfB, feature updates                                |
| Troubleshooting      | 2     | Help desk, enrollment troubleshooting                |
| Graph API            | 1     | Intune Graph API overview                            |

**How it works:**
1. Fetches each URL with a 15-second timeout
2. Extracts the `<main>` content from HTML
3. Strips `<script>`, `<style>`, `<nav>`, `<header>`, `<footer>` tags
4. Decodes HTML entities (`&amp;`, `&lt;`, etc.)
5. Normalizes whitespace → clean plaintext

### Stage 2 — Chunking

**File:** `server/src/rag/engine.ts` → `chunkDocument()`

Each scraped page is split into chunks of **~2000 characters** (~500 tokens):

- Splits on sentence boundaries (`.!?`)
- Minimum chunk size: 200 chars (prevents tiny fragments)
- Minimum tail size: 50 chars (discards trivial remainders)
- Each chunk retains: `url`, `title`, `section` label, `content`

### Stage 3 — Embedding

**File:** `server/src/rag/engine.ts` → `generateEmbedding()`

Each chunk is embedded using **Azure OpenAI `text-embedding-ada-002`**:

| Setting              | Value                                                          |
|----------------------|----------------------------------------------------------------|
| Model                | `text-embedding-ada-002`                                       |
| Endpoint             | `AZURE_OPENAI_EMBEDDING_ENDPOINT` (falls back to main endpoint)|
| API Key              | `AZURE_OPENAI_EMBEDDING_API_KEY` (falls back to main key)     |
| API Version          | `2023-05-15`                                                   |
| Max Input            | 8,000 chars (truncated)                                        |
| Vector Dimensions    | 1,536 (Ada-002 output)                                        |

- Input format: `"{title}: {content}"` for better semantic matching
- Embeddings are batched 3 at a time per page
- Failed embeddings are stored as `null` (chunk still searchable via text fallback)

### Stage 4 — Storage

**Database:** `server/data/docs.db` (SQLite, WAL mode)

```sql
-- Document chunks with embeddings
CREATE TABLE doc_chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  section TEXT,
  content TEXT NOT NULL,
  embedding TEXT,                    -- JSON-serialized float[] or NULL
  indexed_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_doc_chunks_url ON doc_chunks(url);

-- Metadata (last indexed timestamp, total chunks)
CREATE TABLE doc_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

### Stage 5 — Search (Query Time)

**File:** `server/src/rag/engine.ts` → `searchDocs()`

On every user message, the agent loop calls `searchDocs(userMessage, 3)`:

1. **Embed the query** using the same Ada-002 model
2. **Load all chunk embeddings** from SQLite
3. **Cosine similarity** scored against every chunk:

$$\text{similarity}(a, b) = \frac{a \cdot b}{\|a\| \cdot \|b\|}$$

4. **Sort by similarity** descending, return **top-3** results

**Fallback:** If embedding generation fails, `fallbackTextSearch()` runs keyword matching (word overlap scoring) instead.

### Stage 6 — Injection (Prompt Augmentation)

**File:** `server/src/agent/agent.ts` → `runAgentLoop()`

The top-3 chunks are formatted by `buildDocContext()` and appended to the system prompt:

```
--- Intune Documentation (retrieved from learn.microsoft.com) ---
[Title] (url)
<content truncated to 800 chars per chunk>
```

**Security:** All injected content passes through `sanitizeForSystemPrompt()` before entering the system message to prevent prompt injection.

**Prompt assembly order:**
1. Base system prompt (Intune domain knowledge + tool instructions)
2. Agent memory context (saved notes from `memory.db`)
3. Learning context (exemplars + tool patterns from `learning.db`)
4. **RAG doc context** ← injected here
5. Conversation history
6. New user message

## REST API

**File:** `server/src/routes/docs.ts`

| Endpoint             | Method | Description                              |
|----------------------|--------|------------------------------------------|
| `/api/docs/status`   | GET    | Returns indexing status, chunk count, last indexed timestamp |
| `/api/docs/index`    | POST   | Triggers full re-indexing with SSE progress events           |
| `/api/docs/search`   | POST   | Searches indexed docs (body: `{ query, topK? }`)            |

### Index SSE Events

```jsonc
// Progress
{ "total": 45, "indexed": 12, "current": "device-enrollment", "status": "running" }

// Complete
{ "status": "done", "totalPages": 45, "totalChunks": 312, "errors": [] }

// Error
{ "status": "error", "error": "..." }
```

## Caching & Re-indexing

- **7-day cache:** `indexDocs()` skips re-indexing if the database was indexed within the last 7 days and has chunks
- **Manual trigger:** `POST /api/docs/index` forces a full re-index (clears all existing chunks first)
- **No automatic indexing on startup:** The index must be triggered via the API or builds incrementally as needed

## Configuration

Environment variables (in `server/.env`):

```env
# Optional — defaults to main Azure OpenAI credentials
AZURE_OPENAI_EMBEDDING_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_EMBEDDING_API_KEY=your-embedding-key
AZURE_OPENAI_EMBEDDING_DEPLOYMENT=text-embedding-ada-002
AZURE_OPENAI_EMBEDDING_API_VERSION=2023-05-15
```

If embedding-specific variables are not set, the pipeline falls back to the main `AZURE_OPENAI_ENDPOINT` and `AZURE_OPENAI_API_KEY`.

## Resilience

| Failure Mode                  | Behavior                                              |
|-------------------------------|-------------------------------------------------------|
| RAG search fails              | Non-fatal — agent responds using built-in knowledge   |
| Embedding generation fails    | Falls back to keyword-based text search               |
| Page fetch fails (scraping)   | Skipped, logged in errors array                       |
| Single chunk embedding fails  | Stored with `null` embedding, excluded from vector search but available for text fallback |
| No indexed docs exist         | `searchDocs()` returns `[]`, agent runs without doc context |

## File Map

| File                           | Purpose                                          |
|--------------------------------|--------------------------------------------------|
| `server/src/rag/engine.ts`    | Full pipeline: scrape, chunk, embed, store, search |
| `server/src/routes/docs.ts`   | REST API for indexing and search                  |
| `server/src/agent/agent.ts`   | Calls `searchDocs()` + `buildDocContext()` per request |
| `server/src/config.ts`        | Embedding config (endpoint, key, deployment, API version) |
| `server/src/security.ts`      | `sanitizeForSystemPrompt()` — sanitizes injected content |
| `server/data/docs.db`         | SQLite database (auto-created, gitignored)        |
