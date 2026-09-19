# Intune007 — License to Manage!

**AI-powered Microsoft Intune management platform** with a conversational agent, 90 tools, 25 interactive UI panels, ConfigMgr co-management, a Delivery Optimization simulator, RAG-powered documentation search, 24/7 CVE vulnerability monitoring, OWASP-hardened security with destructive action confirmation gates, and full Microsoft Graph API integration.

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
  - [Destructive Action Confirmation Gate](#destructive-action-confirmation-gate)
  - [Structured Audit Log](#structured-audit-log)
  - [Server-Side Tool Policy](#server-side-tool-policy)
  - [Per-Panel Settings](#per-panel-settings)
- [Self-Improving Agent](#self-improving-agent)
- [RAG Documentation Engine](#rag-documentation-engine)
- [Cross-Panel Interactivity](#cross-panel-interactivity)
- [Troubleshooting](#troubleshooting)

---

## Overview

Intune007 is a full-stack application that connects to Microsoft Intune via the Microsoft Graph API. IT administrators interact through either a **conversational AI agent** (right-docked chat panel) or **31 dedicated dashboard panels** — all fully interactive and interconnected. The agent is powered by comprehensive Intune domain knowledge and RAG-based documentation search from learn.microsoft.com.

**Key stats:**
- 90 agent tools (device management, compliance, apps, security, Autopilot, remediation, CVE monitoring, ConfigMgr co-management)
- 25 UI panels with cross-panel navigation, drill-down, and auto-execution
- 31 API routes
- 12 SQLite databases (analytics, baselines, configmgr, cve, devices, docs, history, learning, memory, simulations, tasks, tenants)
- 153 TypeScript source files
- ConfigMgr co-management: hybrid device visibility, collections, deployments, client actions, CMPivot
- Delivery Optimization simulator: model bandwidth/peer-caching impact before rolling out content policies
- AI chat follow-up suggestions: contextual next-question chips after each agent response
- 24/7 CVE vulnerability monitoring with AI auto-remediation and admin approval workflow
- RAG engine indexing 45+ Microsoft Learn documentation pages
- OWASP-hardened security (rate limiting, input validation, OData injection prevention, prompt injection defense, destructive action confirmation gate, structured audit logging)
- Server-side tool policy enforcement and 3-minute agent timeout
- Configurable per-panel settings with tool-level enforcement
- Golden sparkle particle effects during all agentic operations

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
│  25 Panels   │     │       │                                         │     └───────────────────┘
│  + Agent Chat│     │  ┌────▼─────┐  ┌───────────┐  ┌─────────────┐  │
│              │     │  │ 90 Tools │  │  SQLite   │  │  Learning   │  │     ┌───────────────────┐
│              │     │  └──────────┘  │  (12 DBs) │  │  Engine     │  │     │  SQLite (local)   │
└──────────────┘     └─────────────────┴───────────┴──┴─────────────┴──┘     │  12 DBs: analytics,│
                                                                             │  baselines,       │
    Azure Function (optional)                                                │  configmgr, cve,  │
    ┌──────────────────────────┐                                             │  devices, docs,   │
    │ Autopilot Hash Ingestion │                                             │  history, learning,│
    │ POST /api/autopilot/     │                                             │  memory,          │
    │ ingest                   │                                             │  simulations,     │
    └──────────────────────────┘                                             │  tasks, tenants   │
                                                                             └───────────────────┘
```

| Layer | Stack |
|---|---|
| **Client** | React 18, Vite, Tailwind CSS, Zustand (with localStorage persistence) |
| **Server** | Express, TypeScript (tsx watch), Azure OpenAI SDK, better-sqlite3 |
| **Shared** | TypeScript types, tool title mappings (npm workspace) |
| **AI** | Azure OpenAI (`gpt-5.3-chat`, or GPT-4o+), function calling with 90 tools |
| **Data** | Microsoft Graph API (beta), ConfigMgr AdminService, 12 SQLite databases (auto-created) |
| **Security** | Helmet, express-rate-limit, OData sanitization, prompt injection defense, PowerShell script scanning, destructive action confirmation gate, structured audit logging, server-side tool policy |
| **RAG** | Documentation search: 45+ learn.microsoft.com pages indexed with Azure OpenAI embeddings |
| **UX** | Gold 007 branding, golden sparkle particle effects during agent operations |
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
| **Remediation** | AI-generated PowerShell Proactive Remediation scripts (detection + remediation). Quick templates for common fixes. Deploy to Intune directly. Scripts scanned for 15 dangerous patterns before deployment. **Existing scripts: expand to view code, inline editing with live save back to Intune, delete from Intune with confirmation.** |
| **Troubleshooter** | 7-step automated diagnostic with SSE streaming: resolve device → compliance → config profiles → app installs → group membership → sync status → AI root cause analysis. Auto-executes when navigated to with a device name. |
| **Logs** | Intune audit logs, Azure AD sign-in logs, directory audit logs with filtering and export. |

### Insights

| Panel | Description |
|---|---|
| **Insights** | AI-generated environment summary and recommendations. |
| **Risk Scores** | Fleet-wide device risk scoring (0-100) based on compliance, sync age, encryption, OS version, config conflicts. |
| **Compliance Forecast** | Predict compliance impact of new policy requirements before deploying. |
| **Security Posture** | Overall security score with compliance rate, encryption rate, stale device rate. Trend charts, device breakdowns with clickable device names, Troubleshoot and Timeline links per device. |
| **App Health** | App deployment health with real app icons from Intune, detection rates, per-device version tracking. Inline actions: delete app (assignments removed first), find/refresh icon (7-source search with SSE progress + PNG conversion + upload to Intune), filter by All/Detected/Not Detected. **Scan for missing icons, bulk rename apps, wrong icon feedback with custom URL upload.** |
| **Autopilot Readiness** | Check readiness by serial number, auto-remediate (group tag, profile assignment), full onboarding pipeline (hash import → processing → group tag → group membership → profile verification). Three collection methods: Azure Function for bare-metal, Proactive Remediation for enrolled devices, CSV import. |
| **Config Baselines** | Snapshot current configuration state, compare against baselines, detect drift. |
| **Device Timeline** | Full lifecycle timeline: enrollment, compliance changes, config assignments, sync events. Auto-executes when navigated to with a device name. |
| **Tasks** | Recurring scheduled agent queries (hourly, daily, weekly). |
| **Analytics** | Persistent (SQLite-backed) request analytics: token usage, costs, response times, tool usage breakdown, error rates. Survives server restarts. |
| **CVE Monitor** | 24/7 vulnerability monitoring: fetches CVEs from NVD (NIST) + CISA Known Exploited Vulnerabilities, matches against tenant OS versions and apps, scores relevance (0-100), AI-generates remediation suggestions. **Full auto-remediation with admin approval**: Prepare Auto-Fix → review action → select target group → Approve & Execute → policy/script/update created and assigned via Graph API. Wrong icon feedback with custom URL upload. |
| **ConfigMgr Co-management** | Connect a Configuration Manager site (via AdminService) alongside Intune. Hybrid device visibility, collections, deployments, application list, remote client actions, and CMPivot queries — all from the same agent/UI. Connection wizard with test-before-save. |
| **Delivery Optimization Simulator** | Model bandwidth savings and peer-caching behavior for a content-distribution policy before deploying it — per-site/tenant profile, prefill from tenant data, CSV site import, saved simulation runs. |

### AI Agent

| Capability | Details |
|---|---|
| **90 Function-calling tools** | Full Intune management: devices, apps, policies, groups, security, Autopilot, remediation, reporting, ConfigMgr co-management, Delivery Optimization simulation |
| **RAG documentation search** | 45+ learn.microsoft.com pages indexed with embeddings, relevant docs injected into agent context per query |
| **Deep Intune expertise** | 120+ lines of domain knowledge covering 15 areas: licensing, enrollment, compliance, Autopilot, Conditional Access, troubleshooting, Graph API, error codes |
| **Auto-panel navigation** | When agent calls a tool with a visual panel (timeline, troubleshooter, device card, etc.), the UI auto-navigates to show both text AND visual output |
| **Self-improving** | Learning engine with few-shot exemplars, tool chain pattern learning, correction memory, user feedback (👍/👎) |
| **Tool name confidentiality** | Agent describes capabilities in plain language, never exposes internal function names to users |
| **Safety guardrails** | Destructive actions enforce a two-step server-side confirmation gate (time-limited tokens); PowerShell scripts scanned before deployment; all OData filters sanitized; input validation on all tool arguments; 3-minute agent timeout; structured audit logging |
| **Cross-panel navigation** | Clicking data elements triggers panel switches with auto-execution |
| **App management** | Search/fix/refresh app icons (7 sources with PNG conversion via sharp), remove apps (assignments cleared first), bulk rename apps (find-and-replace across all app names), scan for missing icons |
| **Sync-then-reboot** | Restart command sends a sync first so the device picks up the reboot immediately |
| **Follow-up suggestions** | After each agent response, contextual next-question chips are suggested so admins can drill deeper without typing |

---

## Prerequisites

| Requirement | Version |
|---|---|
| Node.js | 18.x+ (tested on v24.9.0) |
| npm | 9.x+ |
| Azure Subscription | For Azure OpenAI + Entra ID |
| Azure OpenAI | GPT-4o or newer deployment (this instance runs `gpt-5.3-chat`) |

---

## Azure Setup

### 1. Azure OpenAI Resource

1. Create an Azure OpenAI resource in the Azure portal
2. Deploy a model (e.g., `gpt-5.3-chat` — used in this deployment — or `gpt-4o`)
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
| `DeviceManagementManagedDevices.ReadWrite.All` | Application | Device queries, actions (sync, restart, lock), diagnostic logs |
| `DeviceManagementManagedDevices.PrivilegedOperations.All` | Application | Destructive actions: retire, wipe |
| `DeviceManagementConfiguration.ReadWrite.All` | Application | Compliance policies, config profiles, Proactive Remediations, update rings |
| `DeviceManagementApps.ReadWrite.All` | Application | Mobile apps, app icons, assignments, install status |
| `DeviceManagementServiceConfig.ReadWrite.All` | Application | Autopilot devices, profiles, hardware hash import, enrollment |
| `DeviceManagementRBAC.Read.All` | Application | Role-based access control |
| `Directory.Read.All` | Application | Users, directory objects |
| `Device.Read.All` | Application | Azure AD device objects (Autopilot group assignment) |
| `Group.ReadWrite.All` | Application | Create groups, list groups |
| `GroupMember.ReadWrite.All` | Application | Add/remove group members |
| `AuditLog.Read.All` | Application | Sign-in logs, directory audit logs |
| `SecurityEvents.Read.All` | Application | Microsoft Defender security alerts |
| `BitlockerKey.Read.All` | Application | BitLocker recovery key values |
| `BitlockerKey.ReadBasic.All` | Application | BitLocker recovery key metadata |
| `Policy.Read.All` | Application | Conditional Access policies (read) |
| `Policy.ReadWrite.ConditionalAccess` | Application | Conditional Access policy updates |

> **Important:** After adding permissions, click **"Grant admin consent for [your tenant]"** — permissions won't work without admin consent.

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

# RAG Documentation (optional — enables doc search)
AZURE_OPENAI_EMBEDDING_DEPLOYMENT=text-embedding-ada-002
AZURE_OPENAI_EMBEDDING_ENDPOINT=https://your-resource.cognitiveservices.azure.com
AZURE_OPENAI_EMBEDDING_API_KEY=your-embedding-key
AZURE_OPENAI_EMBEDDING_API_VERSION=2023-05-15

# Optional: Server-side tool policy (disable dangerous tools)
DISABLED_TOOLS=wipe_device,retire_device
```

---

## Running

```bash
# Start both server and client
npm run dev
```

Or individually:

```bash
# Terminal 1: Start the server
cd server && npx tsx src/index.ts

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
│       │   ├── SettingsPanel.tsx   # Per-panel toggle settings with persist
│       │   ├── GenericTable.tsx    # Smart table: auto-detects clickable data types
│       │   └── ...27 more panels
│       ├── hooks/useAgentStream.ts
│       ├── lib/followUpSuggestions.ts # Contextual next-question chips after agent replies
│       └── stores/                 # Zustand state (chatStore, navigationStore, configMgrStore, doSimulatorStore, ...)
├── server/                         # Express backend
│   └── src/
│       ├── index.ts                # Entry (helmet, rate limiting, CORS, routes)
│       ├── security.ts             # OWASP security: sanitization, validation, scanning, confirmation gate, audit log
│       ├── agent/
│       │   ├── agent.ts            # Agent loop with tool name confidentiality, 3-min timeout
│       │   ├── executor.ts         # 90 tool dispatcher with confirmation gate + audit logging
│       │   ├── tools.ts            # Tool definitions
│       │   ├── memory.ts           # Persistent agent memory (SQLite)
│       │   └── learningEngine.ts   # Self-improving learning loop (SQLite)
│       ├── graph/                  # 19 Microsoft Graph API modules
│       │   ├── appIcons.ts         # Icon search (7 sources) + sharp PNG conversion
│       │   ├── appManagement.ts    # Remove, rename, bulk rename apps
│       │   └── ...17 more modules
│       ├── autopilot/              # Onboarding, remediation, hash collection
│       ├── configmgr/              # ConfigMgr AdminService client, co-management, connection store
│       ├── doSimulator/            # Delivery Optimization simulation engine, tenant analyzer, profile builder
│       ├── routes/                 # 31 Express API routes
│       └── ...engines (analytics, alerts, forecast, baselines, troubleshooter, etc.)
└── shared/                         # Shared TypeScript types + tool title maps
```

---

## Agent Tools Reference (90 tools)

### Devices (6)
Managed devices, device details, device card (50+ fields), device timeline, threat summary, risk scores

### Device Actions (6)
Sync (forces check-in), restart (sync-then-reboot), lock, reset passcode, retire, wipe

### Applications (11)
Mobile apps, install status, detected apps, managed app states, app health, scan for missing icons, fix/refresh icon (7-source search + PNG conversion), fix all missing icons, remove app (assignments first), rename app, bulk rename apps

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

### CVE Monitoring (4)
Get CVE status, get CVE list (filtered), scan for new CVEs, update CVE status (reviewed/remediated/dismissed)

### ConfigMgr Co-management
Site summary, hybrid device list, co-management eligibility, AdminService health/status, collections, deployments, applications, remote client actions, CMPivot queries, connection management

### Delivery Optimization Simulator
Run simulation, list/fetch/delete saved runs, prefill from tenant data, per-run profile generation, CSV site import

---

## API Endpoints (31 routes)

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
| GET | `/api/docs/status` | RAG documentation index status |
| POST | `/api/docs/index` | Trigger doc indexing (SSE progress) |
| POST | `/api/docs/search` | Search indexed documentation |
| DELETE | `/api/remediation/scripts/:id` | Delete remediation script from Intune |
| PATCH | `/api/remediation/scripts/:id` | Update remediation script content |
| GET | `/api/cve/stats` | CVE monitoring statistics |
| GET | `/api/cve` | List tracked CVEs (filterable) |
| POST | `/api/cve/scan` | Trigger manual CVE scan |
| PATCH | `/api/cve/:cveId/status` | Update CVE status |
| POST | `/api/cve/:cveId/prepare` | Generate auto-remediation action |
| POST | `/api/cve/actions/:id/approve` | Approve & execute remediation |
| POST | `/api/cve/actions/:id/reject` | Reject remediation action |
| GET | `/api/cve/actions` | List remediation actions |
| POST | `/api/app-health/upload-icon-url` | Upload icon from custom URL |
| GET | `/api/configmgr/summary` | ConfigMgr site summary |
| GET | `/api/configmgr/devices` | Hybrid (ConfigMgr) device list |
| GET | `/api/configmgr/eligible` | Co-management eligibility |
| GET | `/api/configmgr/health` | AdminService connection health |
| GET/POST/DELETE | `/api/configmgr/connection` | Manage ConfigMgr connection |
| POST | `/api/configmgr/connection/test` | Test ConfigMgr connection before saving |
| GET | `/api/configmgr/collections` | ConfigMgr collections |
| GET | `/api/configmgr/deployments` | ConfigMgr deployments |
| GET | `/api/configmgr/applications` | ConfigMgr applications |
| POST | `/api/configmgr/client-action` | Trigger remote client action |
| POST | `/api/configmgr/cmpivot` | Run a CMPivot query |
| POST | `/api/do-simulator/run` | Run a Delivery Optimization simulation |
| GET | `/api/do-simulator` | List saved simulation runs |
| GET/DELETE | `/api/do-simulator/:id` | Fetch or delete a simulation run |
| POST | `/api/do-simulator/prefill` | Prefill simulator inputs from tenant data |
| POST | `/api/do-simulator/:id/profiles` | Generate DO profile for a run |
| POST | `/api/do-simulator/csv/sites` | Import sites from CSV |

---

## Security

### Security Headers & Middleware

| Protection | Implementation |
|---|---|
| **Security Headers** | Helmet (CSP, X-Frame-Options, HSTS, X-Content-Type-Options) |
| **Rate Limiting** | 60 req/min API, 20 req/min chat |
| **Input Validation** | Message max 10K chars, history max 50 messages |
| **OData Injection** | `sanitizeODataFilter()` on all Graph API filter strings; blocks `$expand`, `$batch`, `@odata.bind`, script injection |
| **Prompt Injection** | `sanitizeForSystemPrompt()` strips injection patterns from memory, learning context, AND RAG documentation |
| **History Role Filtering** | Client-sent `role: "system"` messages stripped server-side — prevents injected system prompts |
| **Tool Validation** | UUID format, serial number, UPN, string length checks |
| **PowerShell Scanning** | 16 dangerous patterns blocked before deployment |
| **Error Sanitization** | Paths, tokens, connection strings stripped from responses |
| **SQL Injection** | All SQLite queries use parameterized statements |

### Destructive Action Confirmation Gate

Destructive tools (`wipe_device`, `retire_device`, `deploy_remediation_script`, `create_compliance_policy`, `assign_policy`, `update_conditional_access_policy`, `deploy_hash_collector`, `remove_app`, `bulk_rename_apps`) are protected by a **server-side two-step confirmation flow**:

1. **Step 1:** Agent calls the tool → server generates a cryptographic confirmation token (valid 5 minutes, single-use)
2. **Step 2:** Agent must call the tool again with the `confirmationToken` parameter → server validates and executes

This cannot be bypassed by LLM jailbreaking — enforcement is entirely server-side.

### Structured Audit Log

Every tool execution is logged to `logs/audit.jsonl` with:
- Timestamp, tool name, arguments
- Destructive flag, confirmation status
- Result (success/error/blocked), duration

### Server-Side Tool Policy

Tools can be permanently disabled via the `DISABLED_TOOLS` environment variable:

```env
DISABLED_TOOLS=wipe_device,retire_device
```

Server policy overrides client settings — disabled tools cannot be re-enabled by clients.

### Per-Panel Settings

The Settings panel allows toggling individual panels on/off. When a panel is disabled:
- It is hidden from the navigation sidebar
- Its associated tools are blocked from the AI agent (the model literally cannot see or call them)
- Preferences persist in localStorage across sessions

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

## RAG Documentation Engine

The agent has access to official Microsoft Intune documentation via a Retrieval-Augmented Generation pipeline:

| Step | What happens |
|---|---|
| **Index** | 45+ pages from learn.microsoft.com scraped, HTML stripped, chunked into ~500-token sections |
| **Embed** | Each chunk embedded via Azure OpenAI (`text-embedding-ada-002`) → stored in `docs.db` |
| **Search** | Per user query: embed the question → cosine similarity search → top 3 most relevant chunks |
| **Inject** | Relevant doc sections injected into the agent's system prompt as context |
| **Cache** | Index cached for 7 days, subsequent queries use cached embeddings (fast) |

**Coverage:** Intune fundamentals, licensing, enrollment (Windows/iOS/Android), device management, compliance policies, configuration profiles, Settings Catalog, endpoint security, Autopilot (all modes), app management (Win32/MAM), Conditional Access, Proactive Remediations, Windows Update, troubleshooting, Graph API.

**Setup:** Add `AZURE_OPENAI_EMBEDDING_DEPLOYMENT` to `.env`. Falls back to keyword search if embedding model unavailable.

---

## Multi-Tenant Setup

Intune007 supports managing **multiple Intune tenants** from a single instance. Each tenant needs its own Entra ID app registration.

### Step 1: Create App Registration Per Tenant

For **each tenant** you want to manage:

1. Sign into **Azure Portal** as an admin of that tenant
2. Go to **Microsoft Entra ID → App registrations → New registration**
3. Name: `Intune007` (or `Intune007 - [Tenant Name]`)
4. Supported account types: **Single tenant**
5. Click **Register**
6. Note the **Application (client) ID** and **Directory (tenant) ID**
7. Go to **Certificates & secrets → New client secret** → copy the secret value
8. Go to **API permissions** → Add all 16 permissions from the [API Permissions](#3-api-permissions) table
9. Click **Grant admin consent for [tenant]**

> **Important:** Each tenant gets its own `clientId` + `clientSecret`. The app registration must be created IN that tenant — you can't reuse the app registration from your primary tenant.

### Step 2: Configure Primary Tenant

Your primary tenant is configured via the standard `.env` variables:

```env
AZURE_TENANT_ID=primary-tenant-id
AZURE_CLIENT_ID=primary-client-id
AZURE_CLIENT_SECRET=primary-client-secret
```

### Step 3: Add Additional Tenants

Add additional tenants via the `AZURE_TENANTS` environment variable in `.env`:

```env
AZURE_TENANTS=[{"tenantId":"second-tenant-id","clientId":"second-client-id","clientSecret":"second-client-secret","label":"Client A"},{"tenantId":"third-tenant-id","clientId":"third-client-id","clientSecret":"third-client-secret","label":"Client B"}]
```

Each tenant object requires:

| Field | Description |
|---|---|
| `tenantId` | Azure AD / Entra ID tenant ID (GUID) |
| `clientId` | App registration client ID from that tenant |
| `clientSecret` | Client secret from that tenant's app registration |
| `label` | Display name (shown in UI and agent responses) |

### Step 4: Use Multi-Tenant

**Via the agent:**
- *"List my tenants"* → shows all configured tenants with active marker
- *"Switch to Client A"* → all subsequent queries use Client A's tenant

**How it works:**
- All Graph API calls use the **active tenant's** credentials
- Tenant switching is instant (no restart needed)
- Each tenant's Graph client is cached after first use
- All tools, panels, and features work with whichever tenant is active

### Security Notes

- Each tenant's credentials are isolated — switching tenants uses a separate `ClientSecretCredential`
- The `.env` file containing all secrets is gitignored
- Consider using Azure Key Vault for production deployments instead of environment variables
- Each tenant's app registration should have the minimum required permissions

---

## App Icon Sources

The icon search engine checks **8 sources** in order for each app:

| Priority | Source | Quality | Coverage |
|---|---|---|---|
| 1 | **theSVG.org** | ★★★★★ | 5,600+ brand SVGs via jsDelivr CDN |
| 2 | Google Favicon (128px) | ★★★★ | Most websites |
| 3 | Clearbit Logo | ★★★★ | Company logos |
| 4 | DuckDuckGo Icons | ★★★ | General purpose |
| 5 | Direct favicon.ico | ★★ | Any website with favicon |
| 6 | Direct favicon (www) | ★★ | www-prefixed domains |
| 7 | icon.horse | ★★★ | Aggregator fallback |
| 8 | Google Favicon (64px) | ★★ | Last resort |

All icons are auto-converted to **128×128 PNG** via sharp before uploading to Intune. Wrong icon? Use the 👎 button to provide a custom URL.

---

## Troubleshooting

| Issue | Solution |
|---|---|
| `tsx watch` hangs on startup | Large `node_modules` causes file watcher stall — use `tsx` without `watch` instead |
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
