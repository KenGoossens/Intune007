# Intune007 — AI-Powered Intune Security Copilot

Intune007 is a full-stack AI agent application that connects to Microsoft Intune via the Microsoft Graph API. It provides IT administrators with a conversational interface to query, manage, and secure their Intune-managed device fleet, backed by Azure OpenAI.

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Azure Setup](#azure-setup)
  - [1. Azure OpenAI Resource](#1-azure-openai-resource)
  - [2. App Registration (Entra ID)](#2-app-registration-entra-id)
  - [3. API Permissions](#3-api-permissions)
- [Installation](#installation)
- [Configuration](#configuration)
- [Running the Application](#running-the-application)
- [Project Structure](#project-structure)
- [Feature Documentation](#feature-documentation)
  - [1. Remote Device Actions](#1-remote-device-actions)
  - [2. Group Management](#2-group-management)
  - [3. Security & Threat Intelligence](#3-security--threat-intelligence)
  - [4. Log Collection](#4-log-collection)
  - [5. Policy Management](#5-policy-management)
  - [6. Windows Update Management](#6-windows-update-management)
  - [7. Historical Trending](#7-historical-trending)
  - [8. Agent Memory](#8-agent-memory)
  - [9. Scheduled Tasks](#9-scheduled-tasks)
  - [10. Multi-Tenant Support](#10-multi-tenant-support)
  - [11. AI Insights & Reports](#11-ai-insights--reports)
- [Agent Tools Reference](#agent-tools-reference)
- [API Endpoints](#api-endpoints)
- [Alert System](#alert-system)
- [Multi-Tenant Configuration](#multi-tenant-configuration)
- [Troubleshooting](#troubleshooting)
- [Security Considerations](#security-considerations)

---

## Features

- **Conversational AI Agent** — Natural language interface powered by Azure OpenAI with 45+ tools for Intune management
- **Device Management** — Query, filter, and perform remote actions (sync, restart, lock, wipe, retire) on managed devices
- **Compliance Monitoring** — Real-time compliance status, policy analysis, and health scoring
- **Security Intelligence** — Defender alerts, BitLocker key recovery, threat summaries
- **Log Collection** — Intune audit logs, Azure AD sign-in logs, and directory audit logs with filtering and CSV export
- **Policy Management** — Create compliance policies, assign to groups, manage Conditional Access policies
- **Windows Update** — Monitor update rings and update compliance across the fleet
- **Group Management** — Query, create, and manage Azure AD / Entra ID security groups
- **AI Insights** — Auto-generated environment reports with executive summaries, risk assessments, and recommendations
- **Historical Trending** — SQLite-backed time-series storage for compliance and device metrics
- **Agent Memory** — Persistent notes with full-text search so the agent remembers your tenant context
- **Scheduled Tasks** — Recurring agent queries that run automatically (hourly, daily, weekly)
- **Multi-Tenant** — Switch between multiple Intune tenants without restarting
- **8 Automated Alert Checks** — Non-compliant devices, policy conflicts, stale devices, failed app installs, CA policy issues, new enrollments, high-risk devices, update compliance

---

## Architecture

```
┌─────────────┐     ┌───────────────────────────────────────────────┐     ┌──────────────────┐
│   Browser   │────▶│              Server (Express)                 │────▶│ Microsoft Graph  │
│  React +    │     │                                               │     │      API         │
│  Vite       │     │  ┌─────────┐  ┌──────────┐  ┌─────────────┐  │     └──────────────────┘
│             │◀────│  │  Agent  │  │ Alert    │  │  Task       │  │
│  Panels:    │     │  │  Loop   │  │ Scheduler│  │  Scheduler  │  │     ┌──────────────────┐
│  - Alerts   │     │  └────┬────┘  └──────────┘  └─────────────┘  │────▶│  Azure OpenAI    │
│  - Data     │     │       │                                       │     └──────────────────┘
│  - Logs     │     │  ┌────▼────┐  ┌──────────┐  ┌─────────────┐  │
│  - Insights │     │  │ 45+     │  │ SQLite   │  │  Insights   │  │     ┌──────────────────┐
│  - Tasks    │     │  │ Tools   │  │ (3 DBs)  │  │  Engine     │  │     │  SQLite (local)  │
│  - Agent    │     │  └─────────┘  └──────────┘  └─────────────┘  │     │  - history.db    │
└─────────────┘     └───────────────────────────────────────────────┘     │  - memory.db     │
                                                                         │  - tasks.db      │
                                                                         └──────────────────┘
```

- **Client**: React 18 + Vite + Tailwind CSS + Zustand
- **Server**: Express + TypeScript (tsx) + Azure OpenAI SDK
- **Shared**: TypeScript types shared between client and server (npm workspace)
- **Data**: SQLite databases auto-created in `server/data/`

---

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| **Node.js** | 18.x or higher | Tested on v24.9.0. Download from [nodejs.org](https://nodejs.org/) |
| **npm** | 9.x or higher | Comes with Node.js |
| **Azure Subscription** | — | Required for Azure OpenAI and Entra ID |
| **Azure OpenAI Resource** | — | With a GPT-4o or newer model deployed |
| **Entra ID App Registration** | — | With Microsoft Graph API permissions |
| **Microsoft Intune** | — | Active Intune tenant with managed devices |

---

## Azure Setup

### 1. Azure OpenAI Resource

1. Go to [Azure Portal](https://portal.azure.com/) → **Azure OpenAI** → Create a resource
2. Deploy a model (e.g., `gpt-4o` or newer) and note the:
   - **Endpoint** (e.g., `https://your-resource.openai.azure.com/`)
   - **API Key** (from Keys and Endpoint)
   - **Deployment name** (the name you gave the model deployment)

### 2. App Registration (Entra ID)

1. Go to **Entra ID** → **App registrations** → **New registration**
2. Name: `Intune007` (or your choice)
3. Supported account types: **Single tenant** (or multi-tenant if using multi-tenant feature)
4. Click **Register**
5. Note the:
   - **Application (client) ID**
   - **Directory (tenant) ID**
6. Go to **Certificates & secrets** → **New client secret**
   - Add a description, set expiry, click **Add**
   - **Copy the secret value immediately** (you can't see it again)

### 3. API Permissions

Go to **API permissions** → **Add a permission** → **Microsoft Graph** → **Application permissions**.

#### Minimum permissions (read-only mode — 9 permissions):

| Permission | Purpose |
|---|---|
| `DeviceManagementManagedDevices.Read.All` | List/query devices, compliance state, detected apps |
| `DeviceManagementConfiguration.Read.All` | Compliance policies, config profiles, update rings |
| `DeviceManagementApps.Read.All` | Mobile apps, app install status |
| `DeviceManagementServiceConfig.Read.All` | Autopilot devices/profiles, Intune audit events |
| `DeviceManagementRBAC.Read.All` | Proactive remediation scripts |
| `Policy.Read.All` | Conditional Access policies |
| `Group.Read.All` | Azure AD groups and members |
| `SecurityEvents.Read.All` | Defender security alerts |
| `AuditLog.Read.All` | Sign-in logs, directory audit logs |

#### Full permissions (all features — 16 permissions):

Add the above 9, plus:

| Permission | Purpose |
|---|---|
| `DeviceManagementManagedDevices.ReadWrite.All` | Sync, restart, lock, reset passcode |
| `DeviceManagementManagedDevices.PrivilegedOperations.All` | Retire and wipe devices |
| `DeviceManagementConfiguration.ReadWrite.All` | Create compliance policies, config profiles |
| `DeviceManagementRBAC.ReadWrite.All` | Deploy proactive remediation scripts |
| `Policy.ReadWrite.ConditionalAccess` | Enable/disable CA policies |
| `Group.ReadWrite.All` | Create groups, add members |
| `BitlockerKey.Read.All` | BitLocker recovery key lookup |

After adding permissions, click **Grant admin consent for [your tenant]**.

---

## Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd Intune007

# Install all dependencies (root, shared, server, client)
npm install

# Build the shared types package
npm -w shared run build
```

---

## Configuration

Create the server environment file:

```bash
cp server/.env.example server/.env
```

Or create `server/.env` manually with these values:

```env
# ─── Azure OpenAI ─────────────────────────────────────────────────
AZURE_OPENAI_API_KEY=your-azure-openai-api-key
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_DEPLOYMENT=your-model-deployment-name
AZURE_OPENAI_API_VERSION=2024-10-01-preview

# ─── Azure AD / Microsoft Graph ──────────────────────────────────
AZURE_TENANT_ID=your-tenant-id
AZURE_CLIENT_ID=your-app-client-id
AZURE_CLIENT_SECRET=your-client-secret

# ─── Server ──────────────────────────────────────────────────────
PORT=3001

# ─── Multi-Tenant (optional) ────────────────────────────────────
# AZURE_TENANTS=[{"tenantId":"...","clientId":"...","clientSecret":"...","label":"Second Tenant"}]
```

---

## Running the Application

### Development (recommended)

Start server and client separately for best reliability:

```bash
# Terminal 1: Start the server
npm -w server run dev

# Terminal 2: Start the client
npm -w client run dev
```

Or start both together:

```bash
npm run dev
```

The application will be available at:
- **Client**: http://localhost:5173
- **Server**: http://localhost:3001

### Production Build

```bash
npm run build
npm -w server run start
```

---

## Project Structure

```
Intune007/
├── package.json                 # Root workspace config
├── tsconfig.base.json           # Shared TypeScript config
├── client/                      # React frontend (Vite)
│   ├── src/
│   │   ├── App.tsx              # Main layout (nav + panels + agent)
│   │   ├── components/
│   │   │   ├── ChatPanel.tsx    # AI agent chat interface
│   │   │   ├── AlertsPanel.tsx  # Alert monitoring dashboard
│   │   │   ├── DataPanel.tsx    # Query result tables
│   │   │   ├── LogViewerPanel.tsx    # Audit & sign-in log viewer
│   │   │   ├── TasksPanel.tsx        # Scheduled task management
│   │   │   ├── InsightsPanel.tsx     # AI insights & reports
│   │   │   ├── RemediationPanel.tsx  # Script generation & deployment
│   │   │   ├── AnalyticsPanel.tsx    # Token usage & cost analytics
│   │   │   ├── PolicyAnalyzerPanel.tsx # Policy health analysis
│   │   │   ├── DeviceTable.tsx       # Device data table
│   │   │   ├── GenericTable.tsx      # Dynamic data table
│   │   │   └── ComplianceStatusCard.tsx
│   │   ├── hooks/
│   │   │   └── useAgentStream.ts     # Chat API communication
│   │   └── stores/                   # Zustand state management
│   │       ├── chatStore.ts
│   │       ├── alertStore.ts
│   │       └── ...
│   └── vite.config.ts           # Vite config with API proxy
├── server/                      # Express backend
│   ├── .env                     # Environment configuration
│   ├── data/                    # Auto-created SQLite databases
│   │   ├── history.db           # Historical metrics
│   │   ├── memory.db            # Agent memory notes
│   │   └── tasks.db             # Scheduled tasks
│   └── src/
│       ├── index.ts             # Server entry point
│       ├── config.ts            # Environment config loader
│       ├── agent/
│       │   ├── agent.ts         # AI agent loop (Azure OpenAI)
│       │   ├── tools.ts         # 45+ tool definitions
│       │   ├── executor.ts      # Tool dispatch & execution
│       │   └── memory.ts        # Agent memory (SQLite + FTS5)
│       ├── graph/               # Microsoft Graph API modules
│       │   ├── client.ts        # Graph client + pagination helper
│       │   ├── devices.ts       # Device queries
│       │   ├── deviceActions.ts # Remote device actions
│       │   ├── compliance.ts    # Compliance policies & status
│       │   ├── configurations.ts # Config profiles
│       │   ├── apps.ts          # Mobile apps
│       │   ├── conditionalAccess.ts # CA policies
│       │   ├── autopilot.ts     # Autopilot devices & profiles
│       │   ├── remediation.ts   # Proactive remediations
│       │   ├── groups.ts        # Azure AD groups
│       │   ├── security.ts      # Defender alerts, BitLocker
│       │   ├── logs.ts          # Audit & sign-in logs
│       │   ├── policyManagement.ts # Policy CRUD operations
│       │   ├── windowsUpdate.ts # Update rings & compliance
│       │   └── tenantManager.ts # Multi-tenant client manager
│       ├── alerts/
│       │   ├── checks.ts        # 8 alert check functions
│       │   └── scheduler.ts     # Alert check scheduler
│       ├── analytics/
│       │   ├── tracker.ts       # Token & cost tracking
│       │   └── history.ts       # Historical metrics (SQLite)
│       ├── insights/
│       │   └── engine.ts        # AI insights report generator
│       ├── remediation/
│       │   ├── scriptGenerator.ts # AI script generation
│       │   └── deployer.ts      # Intune deployment
│       ├── policyAnalyzer/
│       │   └── analyzer.ts      # Policy health scoring
│       ├── scheduler/
│       │   ├── taskStore.ts     # Task CRUD (SQLite)
│       │   └── taskScheduler.ts # Task execution runner
│       └── routes/
│           ├── chat.ts          # POST /api/chat
│           ├── alerts.ts        # Alert CRUD endpoints
│           ├── remediation.ts   # Script generation endpoints
│           ├── analytics.ts     # Analytics endpoints
│           ├── policyAnalyzer.ts # Policy analysis endpoints
│           ├── logs.ts          # Log query endpoints
│           ├── tasks.ts         # Scheduled task endpoints
│           ├── reports.ts       # Trend report endpoints
│           └── insights.ts      # AI insights endpoints
└── shared/                      # Shared TypeScript types
    └── src/
        ├── index.ts
        └── types.ts             # All shared interfaces & constants
```

---

## Feature Documentation

### 1. Remote Device Actions

Perform remote management operations on Intune-managed devices through the chat agent.

| Action | Chat Command Example | Graph API | Risk Level |
|---|---|---|---|
| Sync | "Sync device NB-LAPTOP-01" | `POST .../syncDevice` | Low |
| Restart | "Restart device NB-LAPTOP-01" | `POST .../rebootNow` | Medium |
| Lock | "Lock device NB-LAPTOP-01" | `POST .../remoteLock` | Medium |
| Reset Passcode | "Reset passcode for NB-LAPTOP-01" | `POST .../resetPasscode` | Medium |
| Retire | "Retire device NB-LAPTOP-01" | `POST .../retire` | **High** |
| Wipe | "Wipe device NB-LAPTOP-01" | `POST .../wipe` | **Critical** |

**Safety:** The agent is instructed to always confirm with the user before executing retire or wipe actions.

---

### 2. Group Management

Query and manage Azure AD / Entra ID groups.

| Action | Chat Command Example |
|---|---|
| List groups | "List all security groups" |
| Search groups | "Find groups with 'Marketing' in the name" |
| Group members | "Show members of the IT Admins group" |
| Create group | "Create a security group called 'Pilot Devices'" |
| Add member | "Add device NB-01 to the Pilot Devices group" |

---

### 3. Security & Threat Intelligence

| Action | Chat Command Example |
|---|---|
| Security alerts | "Show recent high severity security alerts" |
| BitLocker keys | "Find BitLocker recovery key for device X" |
| Threat summary | "Show device threat summary" |

---

### 4. Log Collection

Available in the **Logs** tab (left navigation) and via chat.

| Log Type | Source | Graph API Endpoint |
|---|---|---|
| Intune Audit | Intune admin actions | `/deviceManagement/auditEvents` |
| Sign-In Logs | User/device sign-ins | `/auditLogs/signIns` |
| Directory Audit | Tenant-level admin actions | `/auditLogs/directoryAudits` |

Features: Filter text search, row expansion with full JSON, CSV export, configurable row count.

---

### 5. Policy Management

| Action | Chat Command Example |
|---|---|
| Create compliance policy | "Create a Windows 10 compliance policy requiring BitLocker" |
| Assign policy | "Assign policy X to the Marketing group" |
| Enable CA policy | "Enable Conditional Access policy 'Require MFA'" |
| Disable CA policy | "Disable the 'Block Legacy Auth' CA policy" |

**Safety:** The agent confirms all write operations before executing.

---

### 6. Windows Update Management

| Action | Chat Command Example |
|---|---|
| List update rings | "Show Windows Update rings" |
| Update compliance | "How many devices are behind on updates?" |

---

### 7. Historical Trending

Metrics are automatically recorded by the alert scheduler after each check cycle. Data is stored in `server/data/history.db`.

| Chat Command Example |
|---|
| "Show compliance trend for the last 30 days" |
| "What metrics are being tracked?" |

Recorded metrics: `total_alerts`, `alert_non_compliant_devices`, `alert_stale_devices`, etc.

---

### 8. Agent Memory

The agent can save and recall notes that persist across conversations. Stored in `server/data/memory.db` with full-text search (FTS5).

| Action | Chat Command Example |
|---|---|
| Save a note | "Remember that the Finance team uses the 'Finance-Compliance' policy" |
| Recall notes | "What do you know about the Finance team?" |

Saved notes are automatically injected into the agent's context for every conversation.

---

### 9. Scheduled Tasks

Create recurring agent jobs via the **Tasks** tab or chat. Tasks are stored in `server/data/tasks.db` and executed by the task scheduler.

| Action | How |
|---|---|
| Create via UI | Tasks tab → New Task → set name, prompt, schedule |
| Create via chat | "Schedule a daily task to check non-compliant devices" |
| View tasks | Tasks tab shows all tasks with status and last run |
| View history | Click a task to see recent execution results |
| Enable/disable | Toggle button in the Tasks tab |

Schedules: Hourly (60 min), Daily (1440 min), Weekly (10080 min).

---

### 10. Multi-Tenant Support

Switch between multiple Intune tenants without restarting the server.

**Setup:** Add the `AZURE_TENANTS` environment variable to `server/.env`:

```env
AZURE_TENANTS=[{"tenantId":"<id>","clientId":"<id>","clientSecret":"<secret>","label":"Contoso"}]
```

| Chat Command | Description |
|---|---|
| "List my tenants" | Shows all configured tenants and which is active |
| "Switch to Contoso" | Changes the active Graph client to the Contoso tenant |

Each tenant needs its own app registration (or a multi-tenant app) with the required permissions.

---

### 11. AI Insights & Reports

Available in the **Insights** tab. Generates a comprehensive environment report by:

1. Pulling live data from 7 Graph API sources in parallel
2. Computing compliance rate, stale device rate, update compliance, OS distribution
3. Running rule-based analysis (critical/warning/good/info insights)
4. Generating an AI executive summary via Azure OpenAI

Features:
- 4 health score cards (compliance, stale, updates, total devices)
- AI-generated executive summary
- Insights grouped by severity
- Environment breakdown (policies, profiles, apps)
- OS distribution bar chart
- Text report export
- 2-minute server-side cache

---

## Agent Tools Reference

The agent has **45+ tools** organized by category:

| Category | Tools | Count |
|---|---|---|
| **Devices** | `get_managed_devices`, `get_device_details`, `get_device_configuration_states`, `get_device_detected_apps`, `get_device_app_install_states` | 5 |
| **Device Actions** | `sync_device`, `restart_device`, `lock_device`, `reset_passcode`, `retire_device`, `wipe_device` | 6 |
| **Compliance** | `get_compliance_policies`, `get_compliance_status` | 2 |
| **Configuration** | `get_device_configurations` | 1 |
| **Apps** | `get_mobile_apps`, `get_app_install_status` | 2 |
| **Conditional Access** | `get_conditional_access_policies` | 1 |
| **Autopilot** | `get_autopilot_devices`, `get_autopilot_profiles` | 2 |
| **Groups** | `get_groups`, `get_group_members`, `create_group`, `add_group_member` | 4 |
| **Security** | `get_security_alerts`, `get_bitlocker_keys`, `get_device_threat_summary` | 3 |
| **Logs** | `get_audit_logs`, `get_sign_in_logs`, `get_directory_audit_logs` | 3 |
| **Policy Management** | `create_compliance_policy`, `assign_policy`, `update_conditional_access_policy` | 3 |
| **Windows Update** | `get_update_rings`, `get_update_compliance` | 2 |
| **Remediation** | `generate_remediation_script`, `deploy_remediation_script`, `list_remediation_scripts` | 3 |
| **Policy Analysis** | `analyze_policies` | 1 |
| **Trending** | `get_compliance_trend` | 1 |
| **Memory** | `save_note`, `recall_notes` | 2 |
| **Tasks** | `create_scheduled_task`, `list_scheduled_tasks`, `manage_scheduled_task` | 3 |
| **Multi-Tenant** | `list_tenants`, `switch_tenant` | 2 |

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/chat` | Send a message to the AI agent |
| `GET` | `/api/alerts` | Get all alerts, configs, and last run times |
| `POST` | `/api/alerts/refresh` | Trigger all alert checks |
| `POST` | `/api/alerts/refresh/:type` | Trigger a specific alert check |
| `PATCH` | `/api/alerts/config/:type` | Update alert check config |
| `POST` | `/api/alerts/:id/acknowledge` | Acknowledge an alert |
| `DELETE` | `/api/alerts/:id` | Dismiss an alert |
| `GET` | `/api/logs/audit` | Intune audit events |
| `GET` | `/api/logs/signins` | Azure AD sign-in logs |
| `GET` | `/api/logs/directory` | Directory audit logs |
| `GET` | `/api/tasks` | List scheduled tasks |
| `POST` | `/api/tasks` | Create a scheduled task |
| `PATCH` | `/api/tasks/:id` | Update a task |
| `DELETE` | `/api/tasks/:id` | Delete a task |
| `GET` | `/api/tasks/:id/executions` | Get task execution history |
| `GET` | `/api/insights` | Generate AI insights report (cached) |
| `POST` | `/api/insights/refresh` | Force regenerate insights |
| `GET` | `/api/insights/trends` | Get all metric trends |
| `GET` | `/api/reports/trend/:metric` | Get daily trend for a metric |
| `GET` | `/api/reports/metrics` | List available metric names |
| `GET` | `/api/analytics` | Get analytics summary |
| `DELETE` | `/api/analytics` | Clear analytics data |
| `GET` | `/api/policy-analyzer` | Run policy analysis (cached) |
| `POST` | `/api/policy-analyzer/refresh` | Force re-analyze policies |
| `GET` | `/api/health` | Health check |

---

## Alert System

8 automated checks run on configurable intervals:

| Alert Type | Default Interval | Severity Logic |
|---|---|---|
| Non-Compliant Devices | 15 min | ≥5 = critical, else warning |
| Policy Conflicts | 30 min | Always critical |
| Stale Devices (7+ days) | 60 min | ≥10 = warning, else info |
| Failed App Installs | 30 min | ≥10 = critical, else warning |
| CA Policy Issues | 60 min | Info |
| New Enrollments | 15 min | Info |
| High Risk Devices | 30 min | Any critical alert = critical |
| Update Compliance | 60 min | ≥10 = warning, else info |

Alerts can be configured (enable/disable, change interval) via the Alerts panel settings gear icon.

---

## Multi-Tenant Configuration

To manage multiple Intune tenants:

1. Register an app in each tenant (or use a multi-tenant app registration)
2. Grant the required Graph API permissions in each tenant
3. Add the `AZURE_TENANTS` env var to `server/.env`:

```env
AZURE_TENANTS=[
  {
    "tenantId": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    "clientId": "ffffffff-gggg-hhhh-iiii-jjjjjjjjjjjj",
    "clientSecret": "your-secret-here",
    "label": "Contoso Production"
  },
  {
    "tenantId": "11111111-2222-3333-4444-555555555555",
    "clientId": "66666666-7777-8888-9999-000000000000",
    "clientSecret": "another-secret",
    "label": "Fabrikam Test"
  }
]
```

The primary tenant from `AZURE_TENANT_ID` is always available. Use `"List my tenants"` and `"Switch to Contoso Production"` in the chat.

---

## Troubleshooting

| Issue | Solution |
|---|---|
| **Server won't start** | Check `server/.env` exists and has all required values |
| **500 errors on API calls** | Verify Graph API permissions are granted with admin consent |
| **"EADDRINUSE" error** | Another process is using port 3001. Kill it or change `PORT` in `.env` |
| **Shared package errors** | Run `npm -w shared run build` before starting |
| **Stale shared build** | Delete `shared/tsconfig.tsbuildinfo` then rebuild: `npm -w shared run build` |
| **Client can't reach server** | Start the server first, then the client. Check Vite proxy in `client/vite.config.ts` |
| **Agent responds in wrong language** | The agent follows the user's language. Ask in English for English responses |
| **SQLite errors** | Delete the `server/data/` folder and restart — databases are auto-recreated |
| **BitLocker keys not showing** | Ensure `BitlockerKey.Read.All` permission is granted |
| **Device actions fail** | Ensure `DeviceManagementManagedDevices.ReadWrite.All` and `PrivilegedOperations.All` are granted |

---

## Security Considerations

- **Client secrets** — Store in environment variables, never commit to source control. Add `server/.env` to `.gitignore`.
- **Destructive actions** — The agent requires user confirmation before executing wipe or retire operations.
- **Least privilege** — Start with read-only permissions (9 permissions) and add write permissions only as needed.
- **Session isolation** — Each browser session has its own chat history. No data persists between browser sessions (except agent memory notes).
- **SQLite databases** — Stored locally in `server/data/`. Contains metric history, agent notes, and scheduled tasks. Not encrypted at rest.
- **CORS** — Server only accepts requests from `http://localhost:5173` by default. Update in `server/src/index.ts` for production.
- **Multi-tenant secrets** — The `AZURE_TENANTS` env var contains secrets for all tenants. Protect the `.env` file accordingly.
