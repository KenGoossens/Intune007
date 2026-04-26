# Intune007 — License to Manage!

**AI-powered Microsoft Intune management platform** with a conversational agent, 68 tools, 29 interactive UI panels, and full Microsoft Graph API integration.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Azure Setup](#azure-setup)
- [Installation](#installation)
- [Configuration](#configuration)
- [Running](#running)
- [Project Structure](#project-structure)
- [Agent Tools Reference](#agent-tools-reference)
- [API Endpoints](#api-endpoints)
- [Security](#security)
- [Self-Improving Agent](#self-improving-agent)
- [Cross-Panel Interactivity](#cross-panel-interactivity)
- [Troubleshooting](#troubleshooting)

---

## Overview

Intune007 is a full-stack application that connects to Microsoft Intune via the Microsoft Graph API. IT administrators interact through either a **conversational AI agent** (right-docked chat panel) or **29 dedicated dashboard panels** — all fully interactive and interconnected.

**Key stats:**
- 68 agent tools (device management, compliance, apps, security, Autopilot, remediation)
- 29 UI panels with cross-panel navigation and drill-down
- 26 API routes
- 6 SQLite databases (analytics, history, memory, tasks, learning, baselines)
- 116 TypeScript source files
- OWASP-hardened security (rate limiting, input validation, OData injection prevention, prompt injection defense)

---

## Architecture

```
┌──────────────┐     ┌─────────────────────────────────────────────────┐     ┌───────────────────┐
│   Browser    │────▶│              Server (Express + tsx)             │────▶│  Microsoft Graph  │
│  React 18    │     │                                                 │     │  API (beta)       │
│  Vite        │     │  ┌──────────┐  ┌───────────┐  ┌─────────────┐  │     └───────────────────┘
│  Tailwind    │◀────│  │  Agent   │  │  Alert    │  │   Task      │  │
│  Zustand     │     │  │  Loop    │  │ Scheduler │  │  Scheduler  │  │     ┌───────────────────┐
│              │     │  └────┬─────┘  └───────────┘  └─────────────┘  │────▶│  Azure OpenAI     │
│  29 Panels   │     │       │                                         │     └───────────────────┘
│  + Agent Chat│     │  ┌────▼─────┐  ┌───────────┐  ┌─────────────┐  │
│              │     │  │ 68 Tools │  │  SQLite   │  │  Learning   │  │     ┌───────────────────┐
│              │     │  └──────────┘  │  (6 DBs)  │  │  Engine     │  │     │  SQLite (local)   │
└──────────────┘     └─────────────────┴───────────┴──┴─────────────┴──┘     │  analytics.db     │
                                                                             │  history.db       │
    Azure Function (optional)                                                │  memory.db        │
    ┌──────────────────────────┐                                             │  tasks.db         │
    │ Autopilot Hash Ingestion │                                             │  learning.db      │
    │ POST /api/autopilot/     │                                             │  baselines.db     │
    │ ingest                   │                                             └───────────────────┘
    └──────────────────────────┘
```

| Layer | Stack |
|---|---|
| **Client** | React 18, Vite, Tailwind CSS, Zustand (with localStorage persistence) |
| **Server** | Express, TypeScript (tsx watch), Azure OpenAI SDK, better-sqlite3 |
| **Shared** | TypeScript types, tool title mappings (npm workspace) |
| **AI** | Azure OpenAI (GPT-4o / GPT-5.3-chat), function calling with 68 tools |
| **Data** | Microsoft Graph API (beta), 6 SQLite databases (auto-created) |
| **Security** | Helmet, express-rate-limit, OData sanitization, prompt injection defense, PowerShell script scanning |
| **Optional** | Azure Functions for Autopilot hardware hash ingestion from bare-metal devices |

---

## Features

### Core

| Panel | Description |
|---|---|
| **Alerts** | 8 automated health checks: non-compliant devices, policy conflicts, stale devices, failed app installs, CA policy issues, new enrollments, high-risk devices, update compliance. Configurable intervals. |
| **Data** | Query results from the agent render as interactive data cards. Device names → Device Card, policies → Policy view, UPNs → user device lookup, compliance states → Security Posture. Each card individually dismissible. |
| **Device Card** | Rich 50+ field device card with action bar (Sync, Restart, Troubleshoot, Timeline, Prepare Autopilot), drill-down into apps/profiles/compliance, hardware/network/security/enrollment sections. |
| **Query Builder** | Natural language → OData filter translation. Auto-executes when navigated to with a query. |
| **Report Generator** | AI-generated comprehensive reports from 15+ data sources with executive summary, risk assessment, and recommendations. |

### Operations

| Panel | Description |
|---|---|
| **Policies** | Policy Analyzer with health score (0-100), clickable severity filtering (Critical/Warning/Info/Good), affected items drill-down, action buttons (Remediate, Build Policy, Troubleshoot, View Posture). Stats link to their respective panels. |
| **Policy Builder** | Describe a policy in plain English → AI generates valid Intune policy JSON with 8 security benchmark overlays (CIS L1/L2, NIST, ISO 27001, HIPAA, Essential Eight, Zero Trust, STIG). Deploy to Intune with one click. |
| **Policy Diff** | Compare two policy configurations side-by-side. |
| **Remediation** | AI-generated PowerShell Proactive Remediation scripts (detection + remediation). Quick templates for common fixes. Deploy to Intune directly. Scripts scanned for 15 dangerous patterns before deployment. |
| **Troubleshooter** | 7-step automated diagnostic with SSE streaming: resolve device → compliance → config profiles → app installs → group membership → sync status → AI root cause analysis. Auto-executes when navigated to with a device name. |
| **Logs** | Intune audit logs, Azure AD sign-in logs, directory audit logs with filtering and export. |

### Insights

| Panel | Description |
|---|---|
| **Insights** | AI-generated environment summary and recommendations. |
| **Risk Scores** | Fleet-wide device risk scoring (0-100) based on compliance, sync age, encryption, OS version, config conflicts. |
| **Compliance Forecast** | Predict compliance impact of new policy requirements before deploying. |
| **Security Posture** | Overall security score with compliance rate, encryption rate, stale device rate. Trend charts, device breakdowns with clickable device names, Troubleshoot and Timeline links per device. |
| **App Health** | App deployment health with real app icons from Intune, detection rates, per-device version tracking. Inline actions: delete app (assignments removed first), find/refresh icon (7-source search with SSE progress + PNG conversion + upload to Intune), filter by All/Detected/Not Detected. |
| **Autopilot Readiness** | Check readiness by serial number, auto-remediate (group tag, profile assignment), full onboarding pipeline (hash import → processing → group tag → group membership → profile verification). Three collection methods: Azure Function for bare-metal, Proactive Remediation for enrolled devices, CSV import. |
| **Config Baselines** | Snapshot current configuration state, compare against baselines, detect drift. |
| **Device Timeline** | Full lifecycle timeline: enrollment, compliance changes, config assignments, sync events. Auto-executes when navigated to with a device name. |
| **Tasks** | Recurring scheduled agent queries (hourly, daily, weekly). |
| **Analytics** | Persistent (SQLite-backed) request analytics: token usage, costs, response times, tool usage breakdown, error rates. Survives server restarts. |

### AI Agent

| Capability | Details |
|---|---|
| **68 Function-calling tools** | Full Intune management: devices, apps, policies, groups, security, Autopilot, remediation, reporting |
| **Self-improving** | Learning engine with few-shot exemplars, tool chain pattern learning, correction memory, user feedback (👍/👎) |
| **Tool name confidentiality** | Agent describes capabilities in plain language, never exposes internal function names to users |
| **Safety guardrails** | Destructive actions require user confirmation; PowerShell scripts scanned before deployment; input validation on all tool arguments |
| **Cross-panel navigation** | Clicking data elements triggers panel switches with auto-execution |
| **App management** | Search/fix/refresh app icons (7 sources with PNG conversion via sharp), remove apps (assignments cleared first), bulk rename apps (find-and-replace across all app names) |
| **Sync-then-reboot** | Restart command sends a sync first so the device picks up the reboot immediately |

---

## Prerequisites

| Requirement | Version |
|---|---|
| Node.js | 18.x+ (tested on v24.9.0) |
| npm | 9.x+ |
| Azure Subscription | For Azure OpenAI + Entra ID |
| Azure OpenAI | GPT-4o or newer deployment |

---

## Azure Setup

### 1. Azure OpenAI Resource

1. Create an Azure OpenAI resource in the Azure portal
2. Deploy a model (e.g., `gpt-4o` or `gpt-5.3-chat`)
3. Note the **endpoint**, **API key**, and **deployment name**

### 2. App Registration (Entra ID)

1. Go to **Azure Portal → Microsoft Entra ID → App registrations → New registration**
2. Name: `Intune007`
3. Supported account types: **Single tenant**
4. Create a **client secret** (Certificates & secrets → New client secret)

### 3. API Permissions

Add these **Application** permissions and grant admin consent:

| Permission | Type | For |
|---|---|---|
| `DeviceManagementManagedDevices.ReadWrite.All` | Application | Devices, actions, diagnostics |
| `DeviceManagementConfiguration.ReadWrite.All` | Application | Policies, profiles, baselines |
| `DeviceManagementApps.ReadWrite.All` | Application | Apps, icons, assignments |
| `DeviceManagementServiceConfig.ReadWrite.All` | Application | Autopilot, enrollment |
| `DeviceManagementRBAC.Read.All` | Application | Role-based access |
| `Directory.Read.All` | Application | Groups, users, devices |
| `Group.ReadWrite.All` | Application | Group management |
| `AuditLog.Read.All` | Application | Sign-in and audit logs |
| `SecurityEvents.Read.All` | Application | Security alerts |
| `BitlockerKey.Read.All` | Application | BitLocker recovery keys |
| `Policy.Read.All` | Application | Conditional Access |
| `Policy.ReadWrite.ConditionalAccess` | Application | CA policy updates |

---

## Installation

```bash
git clone https://github.com/KenGoossens/Intune007.git
cd Intune007
npm install
```

This installs all three workspaces (client, server, shared) via npm workspaces.

---

## Configuration

Create `server/.env`:

```env
# Azure OpenAI
AZURE_OPENAI_API_KEY=your-api-key
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_DEPLOYMENT=gpt-4o
AZURE_OPENAI_API_VERSION=2024-10-01-preview

# Azure AD / Microsoft Graph
AZURE_TENANT_ID=your-tenant-id
AZURE_CLIENT_ID=your-client-id
AZURE_CLIENT_SECRET=your-client-secret

# Optional
CORS_ORIGIN=http://localhost:5173
PORT=3001
```

---

## Running

```bash
# Terminal 1: Start the server
cd server && npx tsx watch src/index.ts

# Terminal 2: Start the client
cd client && npx vite
```

- **Server**: http://localhost:3001
- **Client**: http://localhost:5173

---

## Project Structure

```
Intune007/
├── package.json                    # Root workspace config
├── README.md
├── azure-functions/                # Optional: Autopilot hash ingestion
│   └── src/functions/ingestHardwareHash.ts
├── client/                         # React frontend
│   └── src/
│       ├── App.tsx                 # Layout: left nav + panels + right-docked agent
│       ├── components/             # 29 UI panel components
│       │   ├── ChatPanel.tsx       # AI agent chat with thumbs up/down feedback
│       │   ├── DataPanel.tsx       # Interactive query result cards
│       │   ├── DeviceCardPanel.tsx # Rich device card with action bar
│       │   ├── DrillLinks.tsx      # 8 reusable cross-panel navigation links
│       │   ├── GenericTable.tsx    # Smart table: auto-detects clickable data types
│       │   └── ...27 more panels
│       ├── hooks/useAgentStream.ts
│       └── stores/                 # Zustand state (chatStore, navigationStore, ...)
├── server/                         # Express backend
│   └── src/
│       ├── index.ts                # Entry (helmet, rate limiting, CORS, routes)
│       ├── security.ts             # OWASP security: sanitization, validation, scanning
│       ├── agent/
│       │   ├── agent.ts            # Agent loop with tool name confidentiality
│       │   ├── executor.ts         # 68 tool dispatcher
│       │   ├── tools.ts            # Tool definitions
│       │   ├── memory.ts           # Persistent agent memory (SQLite)
│       │   └── learningEngine.ts   # Self-improving learning loop (SQLite)
│       ├── graph/                  # 18 Microsoft Graph API modules
│       │   ├── appIcons.ts         # Icon search (7 sources) + sharp PNG conversion
│       │   ├── appManagement.ts    # Remove, rename, bulk rename apps
│       │   └── ...16 more modules
│       ├── autopilot/              # Onboarding, remediation, hash collection
│       ├── routes/                 # 26 Express API routes
│       └── ...engines (analytics, alerts, forecast, baselines, troubleshooter, etc.)
└── shared/                         # Shared TypeScript types + tool title maps
```

---

## Agent Tools Reference (68 tools)

### Devices (6)
Managed devices, device details, device card (50+ fields), device timeline, threat summary, risk scores

### Device Actions (6)
Sync (forces check-in), restart (sync-then-reboot), lock, reset passcode, retire, wipe

### Applications (10)
Mobile apps, install status, detected apps, managed app states, app health, fix/refresh icon (7-source search + PNG conversion), fix all missing icons, remove app (assignments first), rename app, bulk rename apps

### Compliance (6)
Compliance policies, create policy, assign policy, compliance status, compliance trend, compliance forecast

### Configuration (3)
Device configurations, configuration states, manage config baselines

### Conditional Access (2)
View CA policies, update CA policies

### Autopilot (8)
Autopilot devices, profiles, readiness check, onboard device, collection script, deploy hash collector, process collected hashes, ingest CSV

### Security (3)
Security alerts, BitLocker keys, security posture

### Groups (4)
List groups, group members, create group, add member

### Logs (3)
Audit logs, sign-in logs, directory audit logs

### Remediation (4)
Generate remediation script, deploy script, list scripts, analyze policies

### Updates (2)
Update rings, update compliance

### Memory & Learning (4)
Save note, recall notes, learning stats, record learning

### Tasks (3)
Create task, list tasks, manage task

### Multi-Tenant (2)
List tenants, switch tenant

### Reporting (2)
Generate report, run troubleshooter

---

## API Endpoints (26 routes)

| Method | Path | Description |
|---|---|---|
| POST | `/api/chat` | Send message to AI agent (rate limited: 20/min) |
| GET | `/api/alerts` | Active alerts |
| POST | `/api/alerts/refresh` | Force alert refresh |
| GET | `/api/analytics` | Analytics summary (SQLite-backed) |
| GET | `/api/app-health` | App deployment health with icons |
| POST | `/api/app-health/fix-icon` | SSE streaming icon search + upload |
| DELETE | `/api/app-health/:appId` | Remove app from Intune |
| POST | `/api/autopilot-readiness/check` | Autopilot readiness check |
| POST | `/api/autopilot-readiness/onboard` | Full onboarding pipeline |
| POST | `/api/autopilot-readiness/deploy-collector` | Deploy hash collector |
| POST | `/api/autopilot-readiness/ingest-csv` | CSV bulk import |
| GET | `/api/baselines` | Configuration baselines |
| GET | `/api/device-card/:deviceId` | Rich device card |
| POST | `/api/device-timeline` | Device lifecycle timeline |
| POST | `/api/forecast` | Compliance forecast |
| GET | `/api/insights` | AI insights |
| POST | `/api/learning/feedback` | Thumbs up/down feedback |
| GET | `/api/learning/stats` | Learning statistics |
| GET | `/api/logs` | Audit logs |
| POST | `/api/policy-builder/generate` | Generate policy from description |
| POST | `/api/policy-builder/deploy` | Deploy generated policy |
| GET | `/api/policy-analyzer` | Policy health analysis |
| POST | `/api/query-builder` | Natural language → OData |
| POST | `/api/remediation/generate` | Generate remediation scripts |
| GET | `/api/risk-scores` | Fleet risk scores |
| GET | `/api/security-posture` | Security posture dashboard |
| POST | `/api/troubleshooter/diagnose` | SSE streaming diagnostics |

---

## Security

| Protection | Implementation |
|---|---|
| **Security Headers** | Helmet (CSP, X-Frame-Options, HSTS, X-Content-Type-Options) |
| **Rate Limiting** | 60 req/min API, 20 req/min chat |
| **Input Validation** | Message max 10K chars, history max 50 messages |
| **OData Injection** | `sanitizeOData()` on all Graph API filter strings |
| **Prompt Injection** | `sanitizeForSystemPrompt()` strips injection patterns from memory context |
| **Tool Validation** | UUID format, serial number, UPN, string length checks |
| **PowerShell Scanning** | 15 dangerous patterns blocked before deployment |
| **Error Sanitization** | Paths, tokens, connection strings stripped from responses |
| **Destructive Actions** | `wipe_device`, `retire_device`, `remove_app`, `bulk_rename_apps`, `deploy_remediation_script` require confirmation |
| **SQL Injection** | All SQLite queries use parameterized statements |

---

## Self-Improving Agent

The Learning Engine (`server/src/agent/learningEngine.ts`) makes the agent smarter over time:

| Mechanism | How it works |
|---|---|
| **Interaction logging** | Every query → tool chain → response stored in `learning.db` |
| **Feedback** | 👍/👎 buttons on every agent response |
| **Few-shot exemplars** | Thumbs-up interactions become system prompt examples (max 30) |
| **Tool chain patterns** | Tracks best tool sequences per intent category |
| **Corrections** | Records lessons from mistakes — injected as "avoid" patterns |
| **Intent detection** | 12-category keyword classifier for pattern matching |

---

## Cross-Panel Interactivity

Every data element is clickable and connected:

| Data Element | Click Action |
|---|---|
| Device name | → Device Card |
| User UPN | → Query Builder (find devices) |
| Compliance state | → Security Posture |
| Policy name | → Agent searches for the policy |
| App name | → App Health |
| Group name | → Query Builder (group members) |
| Troubleshoot | → Troubleshooter (auto-executes) |
| Timeline | → Timeline (auto-loads) |

---

## Troubleshooting

| Issue | Solution |
|---|---|
| `temperature` not supported | Some models (gpt-5.3-chat) don't support it — remove from config |
| `max_tokens` error | Use `max_completion_tokens` instead |
| App install status returns 0 | `deviceStatuses` is deprecated — uses `detectedApps` |
| Graph API 403 errors | Add all required permissions AND grant admin consent |
| Battery showing wrong % | Stale snapshot from last check-in — hidden when charge cycles = 0 |
| Icon upload "invalid format" | Icons are auto-converted to PNG via sharp — check sharp installation |
| Device restart not working | `rebootNow` is queued — the sync-then-reboot pattern forces immediate check-in |

---

## License

MIT

---

Built with ❤️ by **Intune007** — *License to Manage!*
