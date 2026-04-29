# Intune007 — Project Instructions

## Project Overview

Intune007 is an AI-powered Microsoft Intune management platform. It uses a conversational AI agent with 73 tools to manage Intune via the Microsoft Graph API. The codebase is a TypeScript monorepo with three npm workspaces: `shared`, `server`, and `client`.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Client | React 18, Vite, Tailwind CSS, Zustand (with localStorage persist) |
| Server | Express, TypeScript (tsx), Azure OpenAI SDK, better-sqlite3 |
| Shared | TypeScript types, tool-to-panel mappings, panel-to-tools mappings |
| AI | Azure OpenAI (gpt-5.3-chat deployment — does NOT support `temperature` or `max_tokens`, use `max_completion_tokens`) |
| Embedding | text-embedding-ada-002 at cognitiveservices.azure.com endpoint, API version 2023-05-15 |
| Graph API | Primarily beta endpoints, 16 required application permissions |
| Icons | Lucide React icons, gold 007 brand theme |

## Architecture

- **Monorepo**: npm workspaces — `shared/`, `server/`, `client/`
- **Server port**: 3001, **Client port**: 5173
- **Build order**: shared → server → client (`npm -w shared run build` first)
- **Dev command**: `npm run dev` (runs concurrently)
- **Server dev**: `tsx src/index.ts` (not `tsx watch` — watch hangs with large node_modules)

## Key Files

| File | Purpose |
|------|---------|
| `server/src/agent/agent.ts` | Agent loop with system prompt, RAG injection, learning context, 10-iteration max, 3-min timeout |
| `server/src/agent/executor.ts` | 73 tool dispatcher with confirmation gate, OData sanitization, audit logging |
| `server/src/agent/tools.ts` | OpenAI function-calling tool definitions (all 73) |
| `server/src/security.ts` | OWASP security: OData sanitization, prompt injection defense, confirmation tokens, audit log, tool policy |
| `server/src/config.ts` | Environment validation (dotenv) |
| `server/src/graph/client.ts` | Graph API auth (ClientSecretCredential, lazy singleton) |
| `client/src/App.tsx` | Main layout — nav sidebar, panel routing, settings gear |
| `client/src/hooks/useAgentStream.ts` | Chat hook — sends messages, receives results, auto-navigates panels, sends disabledTools |
| `client/src/stores/settingsStore.ts` | Per-panel visibility toggles (persisted to localStorage) |
| `client/src/stores/navigationStore.ts` | Cross-panel navigation with context |
| `shared/src/types.ts` | SSE events, ChatMessage, TOOL_TO_PANEL_TYPE, PANEL_TO_TOOLS mappings |

## Databases (9 SQLite, auto-created, gitignored)

analytics.db, history.db, memory.db, tasks.db, learning.db, baselines.db, docs.db, cve.db, devices.db

## Scaling Architecture

- **Device Cache** (`server/src/cache/deviceCache.ts`): SQLite-backed device inventory with delta sync
  - `devices.db` stores all managed devices locally
  - Delta queries (`/managedDevices/delta`) fetch only changes — reduces 1,000 API calls to 1-10 per cycle
  - Background sync scheduler runs every 2 minutes
  - `getManagedDevices()` reads from cache (zero API calls) when cache is warm
  - `forceRefreshDevice()` for post-action fresh data
  - OData → SQL translation handles common filter patterns (eq, ne, contains, startsWith)
- **Rate Queue** (`server/src/cache/rateQueue.ts`): Priority-based request scheduling
  - P0 IMMEDIATE: user actions bypass queue
  - P1 AGENT: agent tool calls
  - P2 BACKGROUND: sync, alerts
  - P3 BULK: icon scans, app health
  - Tracks sliding-window rate budget (9K/10min), handles 429 with backoff + jitter
- **Batch API** (`server/src/graph/batch.ts`): `POST /$batch` combines up to 20 requests per call
  - `batchGetDetectedApps()` — detected apps for N devices in N/20 calls
  - `batchGetDevices()` — device details in bulk
  - App Health route uses batch instead of per-device fetch

## Coding Conventions

- All Graph API calls go through `getGraphClient()` from `graph/client.ts`
- OData filters from LLM args MUST pass through `sanitizeODataFilter()` before reaching Graph API
- Destructive tools (wipe, retire, deploy, assign, remove) require server-side confirmation tokens
- Every tool execution is audit-logged to `logs/audit.jsonl`
- RAG doc context and memory context are sanitized via `sanitizeForSystemPrompt()` before injection
- Client-sent history has `role: "system"` stripped server-side
- Tool results map to UI panels via `TOOL_TO_PANEL_TYPE` in shared/types.ts
- Panel toggles in settings disable both nav visibility AND agent tool access via `PANEL_TO_TOOLS`
- Server-side tool policy (`DISABLED_TOOLS` env var) always overrides client settings

## Security Rules

- Never bypass the confirmation gate for destructive tools
- Never pass raw `args.filter` to Graph API — always sanitize
- Never inject unsanitized external content into the system prompt
- All SQLite queries use parameterized statements
- Error messages are sanitized before returning to clients
- PowerShell scripts are scanned for 16 dangerous patterns before deployment

## Common Gotchas

- Azure OpenAI gpt-5.3-chat does NOT support `temperature` parameter — omit it
- Use `max_completion_tokens` instead of `max_tokens`
- Graph API `deviceStatuses` is deprecated — use `detectedApps` for app install status
- Graph API `largeIcon` binary is NOT returned in list queries — requires per-app individual GET
- MAA properties (12 specific ones) cause compliance policy deploy failures — must be stripped
- `@odata.type` cannot be in `$select` — it's a system annotation returned automatically
- When adding a new tool: add to `tools.ts`, `executor.ts` switch, `TOOL_TO_PANEL_TYPE` in shared/types.ts, `PANEL_TO_TOOLS`, and `TOOL_PANEL_MAP` in useAgentStream.ts
- After changing shared/src/types.ts, rebuild shared: `npm -w shared run build`

## Brand

- Gold theme: brand color `#D4A017`, dark background `#0F172A`
- Serif font (Georgia) for headings, "007" branding
- SparkleOverlay component shows golden particles during agent activity
- Tagline: "Your license to manage."

## GitHub

- Origin: https://github.com/KenGoossens/Intune007
- AlphaV1: https://github.com/KenGoossens/Intune007_AlphaV1
- Push to both: `git push origin main && git push alphav1 main`
