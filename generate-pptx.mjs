import pptxgen from "pptxgenjs";
import fs from "fs";

const pptx = new pptxgen();

// ─── Theme ─────────────────────────────────────────────────
const COLORS = {
  bg: "0F172A",       // dark navy
  bgLight: "1E293B",  // slate 800
  gold: "D4A017",     // brand gold
  goldLight: "F5C842",
  white: "FFFFFF",
  gray: "94A3B8",
  grayDark: "64748B",
  green: "22C55E",
  blue: "3B82F6",
  red: "EF4444",
  codeBlock: "111827",
};

pptx.author = "Ken Goossens";
pptx.company = "Intune007";
pptx.subject = "Building an AI-Powered Intune Management Tool";
pptx.title = "Intune007 — Build Your Own AI-Powered Intune Agent";

pptx.defineLayout({ name: "WIDE", width: 13.33, height: 7.5 });
pptx.layout = "WIDE";

// ─── Helper Functions ──────────────────────────────────────
function addBg(slide) {
  slide.background = { color: COLORS.bg };
}

function titleSlide(title, subtitle) {
  const slide = pptx.addSlide();
  addBg(slide);
  // Gold accent line
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 3.2, w: 13.33, h: 0.06, fill: { color: COLORS.gold } });
  slide.addText(title, {
    x: 0.8, y: 1.0, w: 11.7, h: 1.8,
    fontSize: 44, fontFace: "Georgia", color: COLORS.white, bold: true, align: "center",
  });
  slide.addText(subtitle, {
    x: 0.8, y: 3.6, w: 11.7, h: 1.0,
    fontSize: 20, fontFace: "Calibri", color: COLORS.gray, align: "center",
  });
  return slide;
}

function sectionSlide(sectionNum, title, subtitle) {
  const slide = pptx.addSlide();
  addBg(slide);
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.15, h: 7.5, fill: { color: COLORS.gold } });
  slide.addText(`PART ${sectionNum}`, {
    x: 1.0, y: 1.5, w: 11, h: 0.6,
    fontSize: 16, fontFace: "Calibri", color: COLORS.gold, bold: true, letterSpacing: 4,
  });
  slide.addText(title, {
    x: 1.0, y: 2.3, w: 11, h: 1.5,
    fontSize: 40, fontFace: "Georgia", color: COLORS.white, bold: true,
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: 1.0, y: 4.0, w: 10, h: 1.0,
      fontSize: 18, fontFace: "Calibri", color: COLORS.gray,
    });
  }
  return slide;
}

function contentSlide(title, bullets, opts = {}) {
  const slide = pptx.addSlide();
  addBg(slide);
  // Title bar
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.9, fill: { color: COLORS.bgLight } });
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0.88, w: 13.33, h: 0.04, fill: { color: COLORS.gold } });
  slide.addText(title, {
    x: 0.6, y: 0.1, w: 12, h: 0.7,
    fontSize: 22, fontFace: "Georgia", color: COLORS.gold, bold: true,
  });
  // Bullet content
  const bulletObjs = bullets.map((b) => ({
    text: b,
    options: {
      fontSize: opts.fontSize || 17,
      fontFace: "Calibri",
      color: COLORS.white,
      bullet: { type: "bullet", color: COLORS.gold },
      paraSpaceAfter: 8,
      lineSpacingMultiple: 1.2,
    },
  }));
  slide.addText(bulletObjs, {
    x: 0.8, y: 1.3, w: 11.5, h: 5.5,
    valign: "top",
  });
  return slide;
}

function codeSlide(title, code, lang) {
  const slide = pptx.addSlide();
  addBg(slide);
  // Title bar
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.9, fill: { color: COLORS.bgLight } });
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0.88, w: 13.33, h: 0.04, fill: { color: COLORS.gold } });
  slide.addText(title, {
    x: 0.6, y: 0.1, w: 10, h: 0.7,
    fontSize: 22, fontFace: "Georgia", color: COLORS.gold, bold: true,
  });
  // Language badge
  if (lang) {
    slide.addShape(pptx.ShapeType.roundRect, { x: 11.5, y: 0.15, w: 1.3, h: 0.5, rectRadius: 0.1, fill: { color: COLORS.gold } });
    slide.addText(lang, { x: 11.5, y: 0.15, w: 1.3, h: 0.5, fontSize: 11, fontFace: "Calibri", color: COLORS.bg, bold: true, align: "center" });
  }
  // Code block
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.5, y: 1.2, w: 12.33, h: 5.8, rectRadius: 0.15,
    fill: { color: COLORS.codeBlock },
    line: { color: "1F2937", width: 1 },
  });
  slide.addText(code, {
    x: 0.8, y: 1.4, w: 11.8, h: 5.4,
    fontSize: 12.5, fontFace: "Cascadia Code", color: COLORS.gray, valign: "top",
    paraSpaceAfter: 2, lineSpacingMultiple: 1.15,
  });
  return slide;
}

function twoColumnSlide(title, leftTitle, leftBullets, rightTitle, rightBullets) {
  const slide = pptx.addSlide();
  addBg(slide);
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.9, fill: { color: COLORS.bgLight } });
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0.88, w: 13.33, h: 0.04, fill: { color: COLORS.gold } });
  slide.addText(title, { x: 0.6, y: 0.1, w: 12, h: 0.7, fontSize: 22, fontFace: "Georgia", color: COLORS.gold, bold: true });

  // Left column
  slide.addText(leftTitle, { x: 0.6, y: 1.3, w: 5.5, h: 0.5, fontSize: 16, fontFace: "Calibri", color: COLORS.goldLight, bold: true });
  const leftObjs = leftBullets.map((b) => ({
    text: b, options: { fontSize: 15, fontFace: "Calibri", color: COLORS.white, bullet: { type: "bullet", color: COLORS.gold }, paraSpaceAfter: 6, lineSpacingMultiple: 1.15 },
  }));
  slide.addText(leftObjs, { x: 0.8, y: 1.9, w: 5.3, h: 5.0, valign: "top" });

  // Divider
  slide.addShape(pptx.ShapeType.rect, { x: 6.55, y: 1.3, w: 0.03, h: 5.5, fill: { color: "334155" } });

  // Right column
  slide.addText(rightTitle, { x: 6.9, y: 1.3, w: 5.5, h: 0.5, fontSize: 16, fontFace: "Calibri", color: COLORS.goldLight, bold: true });
  const rightObjs = rightBullets.map((b) => ({
    text: b, options: { fontSize: 15, fontFace: "Calibri", color: COLORS.white, bullet: { type: "bullet", color: COLORS.gold }, paraSpaceAfter: 6, lineSpacingMultiple: 1.15 },
  }));
  slide.addText(rightObjs, { x: 7.1, y: 1.9, w: 5.5, h: 5.0, valign: "top" });

  return slide;
}

function diagramSlide(title, boxes) {
  const slide = pptx.addSlide();
  addBg(slide);
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.9, fill: { color: COLORS.bgLight } });
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0.88, w: 13.33, h: 0.04, fill: { color: COLORS.gold } });
  slide.addText(title, { x: 0.6, y: 0.1, w: 12, h: 0.7, fontSize: 22, fontFace: "Georgia", color: COLORS.gold, bold: true });

  boxes.forEach((box) => {
    slide.addShape(pptx.ShapeType.roundRect, {
      x: box.x, y: box.y, w: box.w, h: box.h, rectRadius: 0.15,
      fill: { color: box.fill || COLORS.bgLight },
      line: { color: box.border || COLORS.gold, width: 1.5 },
      shadow: { type: "outer", blur: 6, offset: 2, color: "000000", opacity: 0.3 },
    });
    slide.addText(box.label, {
      x: box.x, y: box.y, w: box.w, h: box.h * 0.5,
      fontSize: 14, fontFace: "Georgia", color: COLORS.gold, bold: true, align: "center", valign: "bottom",
    });
    if (box.desc) {
      slide.addText(box.desc, {
        x: box.x + 0.15, y: box.y + box.h * 0.5, w: box.w - 0.3, h: box.h * 0.5,
        fontSize: 10.5, fontFace: "Calibri", color: COLORS.gray, align: "center", valign: "top",
      });
    }
  });

  // Arrows between boxes (simple horizontal connectors)
  for (let i = 0; i < boxes.length - 1; i++) {
    if (boxes[i].noArrow) continue;
    const from = boxes[i];
    const to = boxes[i + 1];
    if (Math.abs(from.y - to.y) < 0.5) {
      slide.addShape(pptx.ShapeType.rect, {
        x: from.x + from.w, y: from.y + from.h / 2 - 0.02,
        w: to.x - (from.x + from.w), h: 0.04,
        fill: { color: COLORS.gold },
      });
    }
  }

  return slide;
}

// ═══════════════════════════════════════════════════════════
// SLIDES
// ═══════════════════════════════════════════════════════════

// ─── 1. Title Slide ────────────────────────────────────────
const s1 = titleSlide(
  "Building an AI-Powered\nIntune Management Tool",
  "From Zero to Agentic — A Hands-On Workshop"
);
s1.addText("Your license to manage.", {
  x: 0.8, y: 4.6, w: 11.7, h: 0.6,
  fontSize: 16, fontFace: "Georgia", color: COLORS.gold, italic: true, align: "center",
});
s1.addText("Ken Goossens  ·  IT Conference 2026", {
  x: 0.8, y: 6.2, w: 11.7, h: 0.5,
  fontSize: 14, fontFace: "Calibri", color: COLORS.grayDark, align: "center",
});

// ─── 2. Agenda ─────────────────────────────────────────────
contentSlide("Session Agenda", [
  "Part 1 — What are we building? Architecture & Demo",
  "Part 2 — Prerequisites & Project Setup",
  "Part 3 — Shared Types (the contract between client and server)",
  "Part 4 — Server: Express + Microsoft Graph API",
  "Part 5 — AI Agent: Azure OpenAI + Function Calling",
  "Part 6 — Client: React + Tailwind + SSE Streaming",
  "Part 7 — Connecting It All Together",
  "Part 8 — Live Demo & Next Steps",
]);

// ─── 3. What We're Building ────────────────────────────────
contentSlide("What Are We Building?", [
  "An AI assistant that manages Microsoft Intune via natural language",
  "\"Show me all non-compliant Windows devices\" → agent queries Graph API → renders results",
  "Real-time streaming responses with Server-Sent Events (SSE)",
  "Auto-navigation: agent tool calls drive the UI panels automatically",
  "Built with TypeScript end-to-end (shared types, type safety)",
  "Extensible: each new tool = new capability for the AI",
]);

// ─── 4. Architecture Diagram ──────────────────────────────
diagramSlide("Architecture Overview", [
  { x: 0.5,  y: 2.5, w: 2.5, h: 2.0, label: "React Client", desc: "Vite + Tailwind\nZustand stores\nSSE streaming", fill: "1a2744" },
  { x: 4.0,  y: 2.5, w: 2.5, h: 2.0, label: "Express Server", desc: "REST API routes\nHelmet + CORS\nRate limiting", fill: "1a2744" },
  { x: 7.5,  y: 1.5, w: 2.5, h: 2.0, label: "Azure OpenAI", desc: "GPT function calling\nSystem prompt\nTool definitions", fill: "1a2744", noArrow: true },
  { x: 7.5,  y: 4.0, w: 2.5, h: 2.0, label: "Microsoft Graph", desc: "Devices, Policies\nCompliance, Apps\nAutopilot", fill: "1a2744", noArrow: true },
  { x: 11.0, y: 3.0, w: 1.8, h: 1.5, label: "Intune", desc: "Your tenant", fill: "1a2744", border: COLORS.green },
]);
// Add vertical arrows from server to OpenAI and Graph
const archSlide = pptx.slides[pptx.slides.length - 1];
archSlide.addShape(pptx.ShapeType.rect, { x: 6.5, y: 3.0, w: 1.0, h: 0.04, fill: { color: COLORS.gold } });
archSlide.addShape(pptx.ShapeType.rect, { x: 6.5, y: 4.5, w: 1.0, h: 0.04, fill: { color: COLORS.gold } });
archSlide.addShape(pptx.ShapeType.rect, { x: 10.0, y: 3.7, w: 1.0, h: 0.04, fill: { color: COLORS.green } });

// ─── 5. Tech Stack ────────────────────────────────────────
twoColumnSlide("Tech Stack",
  "Frontend",
  [
    "React 18 with TypeScript",
    "Vite (fast dev server & build)",
    "Tailwind CSS (utility-first styling)",
    "Zustand (lightweight state management)",
    "Lucide React (icons)",
    "SSE via native EventSource/fetch",
  ],
  "Backend",
  [
    "Express.js with TypeScript",
    "Azure OpenAI SDK (function calling)",
    "@microsoft/microsoft-graph-client",
    "@azure/identity (client credentials)",
    "tsx (TypeScript execution & watch)",
    "npm workspaces (monorepo)",
  ]
);

// ═══════════════════════════════════════════════════════════
// PART 2 — Prerequisites
// ═══════════════════════════════════════════════════════════
sectionSlide("2", "Prerequisites & Setup", "Everything you need before we start coding");

contentSlide("Prerequisites", [
  "Node.js v18+ installed (we'll use npm workspaces)",
  "VS Code with TypeScript extension",
  "An Azure subscription with Azure OpenAI access",
  "A Microsoft 365 tenant with Intune licenses",
  "An Entra ID App Registration with Graph API permissions:",
  "    DeviceManagementManagedDevices.ReadWrite.All",
  "    DeviceManagementConfiguration.ReadWrite.All",
  "    DeviceManagementApps.ReadWrite.All",
  "    Directory.Read.All",
]);

codeSlide("Project Structure — Monorepo", `
  intune-agent/
  ├── package.json              ← root: workspaces config
  ├── shared/                   ← shared TypeScript types
  │   ├── package.json
  │   └── src/
  │       ├── types.ts          ← SSE events, chat messages
  │       └── index.ts          ← re-exports
  ├── server/                   ← Express + AI agent
  │   ├── package.json
  │   ├── .env                  ← secrets (never commit!)
  │   └── src/
  │       ├── index.ts          ← Express app
  │       ├── config.ts         ← env validation
  │       ├── graph/client.ts   ← Graph API auth
  │       ├── graph/devices.ts  ← device queries
  │       ├── agent/agent.ts    ← AI orchestration
  │       ├── agent/tools.ts    ← tool definitions
  │       ├── agent/executor.ts ← tool execution
  │       └── routes/chat.ts    ← SSE chat endpoint
  └── client/                   ← React frontend
      ├── package.json
      └── src/
          ├── App.tsx           ← main layout
          ├── components/       ← UI panels
          ├── hooks/            ← SSE streaming hook
          └── stores/           ← Zustand state
`, "Structure");

codeSlide("Step 1 — Initialize the Monorepo", `
  # Create project folder
  mkdir intune-agent && cd intune-agent

  # Initialize root package.json with workspaces
  npm init -y

  # Edit package.json — add workspaces
  {
    "name": "intune-agent",
    "private": true,
    "workspaces": ["shared", "server", "client"],
    "scripts": {
      "dev": "concurrently \\"npm run dev:server\\" \\"npm run dev:client\\"",
      "dev:server": "npm -w server run dev",
      "dev:client": "npm -w client run dev"
    }
  }

  # Create workspace folders
  mkdir shared server client

  # Install concurrently for parallel dev
  npm install -D concurrently
`, "Terminal");

// ═══════════════════════════════════════════════════════════
// PART 3 — Shared Types
// ═══════════════════════════════════════════════════════════
sectionSlide("3", "Shared Types", "The contract between client and server");

codeSlide("shared/src/types.ts — Chat Messages", `
  // Chat message shape (matches OpenAI's format)
  export interface ChatMessage {
    role: "system" | "user" | "assistant" | "tool";
    content: string;
    toolCalls?: ToolCallInfo[];
    toolCallId?: string;
  }

  export interface ToolCallInfo {
    id: string;
    name: string;
    arguments: string;
  }

  // Server-Sent Event types for real-time streaming
  export type SSEEventType = "tool_call" | "tool_result"
                           | "token" | "done" | "error";

  export interface SSEToolCallEvent  {
    type: "tool_call";
    name: string;
    arguments: Record<string, unknown>;
  }
  export interface SSETokenEvent { type: "token"; content: string; }
  export interface SSEDoneEvent  { type: "done";  fullResponse: string; }
`, "TypeScript");

codeSlide("shared/src/types.ts — Tool Result Events", `
  // When the agent calls a tool, we stream the result to the client
  export interface SSEToolResultEvent {
    type: "tool_result";
    name: string;                        // which tool was called
    data: unknown[];                     // the result data (devices, policies, etc.)
    totalCount?: number;                 // for pagination info
  }

  export interface SSEErrorEvent {
    type: "error";
    message: string;
  }

  // Union type — the client uses this to handle all event types
  export type SSEEvent =
    | SSEToolCallEvent
    | SSEToolResultEvent
    | SSETokenEvent
    | SSEDoneEvent
    | SSEErrorEvent;

  // Maps tool names → panel types for auto-navigation
  export const TOOL_TO_PANEL_TYPE: Record<string, string> = {
    get_managed_devices: "devices",
    get_compliance_policies: "compliance_policies",
    // add more as you build tools...
  };
`, "TypeScript");

// ═══════════════════════════════════════════════════════════
// PART 4 — Server
// ═══════════════════════════════════════════════════════════
sectionSlide("4", "Building the Server", "Express + Microsoft Graph API integration");

codeSlide("server/.env — Configuration", `
  # Azure AD App Registration
  AZURE_TENANT_ID=your-tenant-id
  AZURE_CLIENT_ID=your-client-id
  AZURE_CLIENT_SECRET=your-client-secret

  # Azure OpenAI
  AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
  AZURE_OPENAI_DEPLOYMENT=gpt-4o
  AZURE_OPENAI_API_VERSION=2025-01-01-preview

  # Server
  PORT=3001
  CORS_ORIGIN=http://localhost:5173
`, "Environment");

codeSlide("server/src/config.ts — Environment Validation", `
  import dotenv from "dotenv";
  dotenv.config();

  export const config = {
    port: parseInt(process.env.PORT || "3001"),
    azureAd: {
      tenantId:     process.env.AZURE_TENANT_ID!,
      clientId:     process.env.AZURE_CLIENT_ID!,
      clientSecret: process.env.AZURE_CLIENT_SECRET!,
    },
    azureOpenAI: {
      endpoint:   process.env.AZURE_OPENAI_ENDPOINT!,
      deployment: process.env.AZURE_OPENAI_DEPLOYMENT!,
      apiVersion: process.env.AZURE_OPENAI_API_VERSION!,
    },
  };

  export function validateConfig() {
    const required = [
      "AZURE_TENANT_ID", "AZURE_CLIENT_ID", "AZURE_CLIENT_SECRET",
      "AZURE_OPENAI_ENDPOINT", "AZURE_OPENAI_DEPLOYMENT",
    ];
    const missing = required.filter((k) => !process.env[k]);
    if (missing.length) throw new Error("Missing: " + missing.join(", "));
  }
`, "TypeScript");

codeSlide("server/src/graph/client.ts — Graph API Auth", `
  import { Client } from "@microsoft/microsoft-graph-client";
  import { ClientSecretCredential } from "@azure/identity";
  import { TokenCredentialAuthenticationProvider }
    from "@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials";
  import { config } from "../config.js";

  let graphClient: Client | null = null;

  export function getGraphClient(): Client {
    if (graphClient) return graphClient;   // lazy singleton

    const credential = new ClientSecretCredential(
      config.azureAd.tenantId,
      config.azureAd.clientId,
      config.azureAd.clientSecret
    );

    const authProvider = new TokenCredentialAuthenticationProvider(
      credential,
      { scopes: ["https://graph.microsoft.com/.default"] }
    );

    graphClient = Client.initWithMiddleware({ authProvider });
    return graphClient;
  }
`, "TypeScript");

codeSlide("server/src/graph/devices.ts — Device Queries", `
  import { getGraphClient } from "./client.js";

  export async function getManagedDevices(options?: {
    filter?: string;
    top?: number;
    select?: string;
  }) {
    const client = getGraphClient();

    let request = client.api("/deviceManagement/managedDevices");

    if (options?.filter) request = request.filter(options.filter);
    if (options?.top)    request = request.top(options.top);
    if (options?.select) request = request.select(options.select);

    const result = await request.get();
    return {
      items: result.value || [],
      totalCount: result["@odata.count"] || result.value?.length || 0,
    };
  }

  // Example filters the agent can construct:
  // "operatingSystem eq 'Windows'"
  // "complianceState eq 'noncompliant'"
  // "startsWith(deviceName, 'NB-')"
`, "TypeScript");

codeSlide("server/src/index.ts — Express App", `
  import express from "express";
  import cors from "cors";
  import { config, validateConfig } from "./config.js";
  import { chatRouter } from "./routes/chat.js";

  const app = express();

  // Middleware
  app.use(cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:5173"
  }));
  app.use(express.json({ limit: "1mb" }));

  // Routes
  app.use("/api/chat", chatRouter);

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Start
  validateConfig();
  app.listen(config.port, () => {
    console.log("Server running on port " + config.port);
  });
`, "TypeScript");

// ═══════════════════════════════════════════════════════════
// PART 5 — AI Agent
// ═══════════════════════════════════════════════════════════
sectionSlide("5", "The AI Agent", "Azure OpenAI + Function Calling — the brain of the tool");

contentSlide("How Function Calling Works", [
  "1. User sends a message: \"Show me non-compliant devices\"",
  "2. We send the message + tool definitions to Azure OpenAI",
  "3. The model decides which tool to call and with what arguments",
  "4. We execute the tool (call Graph API) and get results",
  "5. We send the results back to the model for summarization",
  "6. The model generates a natural language response",
  "",
  "The model never calls APIs directly — it only suggests tool calls.",
  "We control execution, validation, and what data flows back.",
]);

codeSlide("server/src/agent/tools.ts — Tool Definitions", `
  import type { ChatCompletionTool } from "openai/resources/chat/completions";

  export const agentTools: ChatCompletionTool[] = [
    {
      type: "function",
      function: {
        name: "get_managed_devices",
        description:
          "List Intune managed devices. Returns device name, OS, "
          + "compliance state, last sync, and more.",
        parameters: {
          type: "object",
          properties: {
            filter: {
              type: "string",
              description: "OData $filter (e.g. \\"complianceState eq 'noncompliant'\\")"
            },
            top: {
              type: "number",
              description: "Max devices to return (default 25)"
            },
          },
          required: [],
        },
      },
    },
    // Add more tools here — each one = a new AI capability!
  ];
`, "TypeScript");

codeSlide("server/src/agent/executor.ts — Tool Execution", `
  import { getManagedDevices } from "../graph/devices.js";

  export async function executeTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<{ data: unknown[]; totalCount?: number }> {

    switch (name) {
      case "get_managed_devices": {
        const result = await getManagedDevices({
          filter: args.filter as string | undefined,
          top:    args.top as number | undefined,
        });
        return { data: result.items, totalCount: result.totalCount };
      }

      // Add cases for each new tool:
      // case "get_compliance_policies": ...
      // case "sync_device": ...

      default:
        throw new Error("Unknown tool: " + name);
    }
  }
`, "TypeScript");

codeSlide("server/src/agent/agent.ts — The Agent Loop", `
  import { AzureOpenAI } from "openai";
  import { agentTools } from "./tools.js";
  import { executeTool } from "./executor.js";
  import { config } from "../config.js";

  const openai = new AzureOpenAI({
    endpoint:   config.azureOpenAI.endpoint,
    apiVersion: config.azureOpenAI.apiVersion,
    apiKey:     config.azureOpenAI.apiKey,     // or use DefaultAzureCredential
  });

  const SYSTEM_PROMPT = \`You are an Intune administration assistant.
  Use the provided tools to query Microsoft Intune via Graph API.
  Always use tools to fetch real data — never make up information.
  Format responses clearly with device names, statuses, and counts.\`;

  export async function* streamAgentResponse(
    messages: ChatMessage[]
  ): AsyncGenerator<SSEEvent> {
    // Full messages array with system prompt
    const fullMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...messages,
    ];
    // continues on next slide...
  }
`, "TypeScript");

codeSlide("Agent Loop (continued) — Tool Call Cycle", `
  // Inside streamAgentResponse():
  while (true) {
    const stream = await openai.chat.completions.create({
      model: config.azureOpenAI.deployment,
      messages: fullMessages,
      tools: agentTools,
      stream: true,
    });

    let toolCalls = [];
    let textContent = "";

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (delta?.content) {
        textContent += delta.content;
        yield { type: "token", content: delta.content };      // stream text
      }
      if (delta?.tool_calls) {
        // accumulate tool call chunks...
        toolCalls.push(...delta.tool_calls);
      }
    }

    if (toolCalls.length === 0) {
      yield { type: "done", fullResponse: textContent };      // no more tools
      break;
    }

    // Execute each tool and yield results
    for (const tc of toolCalls) {
      yield { type: "tool_call", name: tc.function.name,
              arguments: JSON.parse(tc.function.arguments) };
      const result = await executeTool(tc.function.name,
                                       JSON.parse(tc.function.arguments));
      yield { type: "tool_result", name: tc.function.name,
              data: result.data, totalCount: result.totalCount };

      // Feed result back into conversation for next iteration
      fullMessages.push({ role: "tool", content: JSON.stringify(result.data),
                          tool_call_id: tc.id });
    }
    // Loop continues — model may call more tools or generate final response
  }
`, "TypeScript");

codeSlide("server/src/routes/chat.ts — SSE Endpoint", `
  import { Router } from "express";
  import { streamAgentResponse } from "../agent/agent.js";

  export const chatRouter = Router();

  chatRouter.post("/", async (req, res) => {
    const { messages } = req.body;

    // Set SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    try {
      // Stream events from the agent
      for await (const event of streamAgentResponse(messages)) {
        res.write("data: " + JSON.stringify(event) + "\\n\\n");
      }
    } catch (err) {
      res.write("data: " + JSON.stringify({
        type: "error",
        message: "Agent error occurred"
      }) + "\\n\\n");
    }

    res.end();
  });
`, "TypeScript");

// ═══════════════════════════════════════════════════════════
// PART 6 — Client
// ═══════════════════════════════════════════════════════════
sectionSlide("6", "Building the Client", "React + Tailwind + SSE streaming");

codeSlide("Client Setup — Vite + React + Tailwind", `
  # Initialize client workspace
  cd client
  npm init -y

  # Install dependencies
  npm install react react-dom zustand lucide-react
  npm install -D vite @vitejs/plugin-react typescript
  npm install -D tailwindcss postcss autoprefixer
  npx tailwindcss init -p

  # vite.config.ts
  import { defineConfig } from "vite";
  import react from "@vitejs/plugin-react";

  export default defineConfig({
    plugins: [react()],
    server: {
      proxy: {
        "/api": "http://localhost:3001"    // proxy API calls to server
      }
    }
  });
`, "Terminal");

codeSlide("client/src/stores/chatStore.ts — Zustand Store", `
  import { create } from "zustand";
  import type { ChatMessage, SSEEvent } from "@intune-agent/shared";

  interface ChatState {
    messages: ChatMessage[];
    isStreaming: boolean;
    toolResults: Map<string, unknown[]>;  // tool name → result data
    addMessage: (msg: ChatMessage) => void;
    setStreaming: (v: boolean) => void;
    appendToken: (content: string) => void;
    setToolResult: (name: string, data: unknown[]) => void;
  }

  export const useChatStore = create<ChatState>((set, get) => ({
    messages: [],
    isStreaming: false,
    toolResults: new Map(),
    addMessage: (msg) =>
      set((s) => ({ messages: [...s.messages, msg] })),
    setStreaming: (v) => set({ isStreaming: v }),
    appendToken: (content) =>
      set((s) => {
        const msgs = [...s.messages];
        const last = msgs[msgs.length - 1];
        if (last?.role === "assistant") last.content += content;
        else msgs.push({ role: "assistant", content });
        return { messages: msgs };
      }),
    setToolResult: (name, data) =>
      set((s) => {
        const m = new Map(s.toolResults);
        m.set(name, data);
        return { toolResults: m };
      }),
  }));
`, "TypeScript");

codeSlide("client/src/hooks/useAgentStream.ts — SSE Hook", `
  import { useCallback } from "react";
  import { useChatStore } from "../stores/chatStore";
  import type { SSEEvent } from "@intune-agent/shared";

  export function useAgentStream() {
    const { addMessage, setStreaming, appendToken, setToolResult } =
      useChatStore();

    const sendMessage = useCallback(async (userMessage: string) => {
      addMessage({ role: "user", content: userMessage });
      setStreaming(true);

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: useChatStore.getState().messages,
        }),
      });

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // Parse SSE "data: {...}" lines
        const lines = buffer.split("\\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const event: SSEEvent = JSON.parse(line.slice(6));

          switch (event.type) {
            case "token":      appendToken(event.content);         break;
            case "tool_result": setToolResult(event.name, event.data); break;
            case "done":       setStreaming(false);                 break;
          }
        }
      }
    }, []);

    return { sendMessage };
  }
`, "TypeScript");

codeSlide("client/src/components/ChatPanel.tsx", `
  import { useState, useRef } from "react";
  import { useChatStore } from "../stores/chatStore";
  import { useAgentStream } from "../hooks/useAgentStream";

  export default function ChatPanel() {
    const [input, setInput] = useState("");
    const { messages, isStreaming } = useChatStore();
    const { sendMessage } = useAgentStream();

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!input.trim() || isStreaming) return;
      sendMessage(input.trim());
      setInput("");
    };

    return (
      <div className="flex flex-col h-full bg-gray-900">
        {/* Message list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((msg, i) => (
            <div key={i} className={\`p-3 rounded-lg \${
              msg.role === "user"
                ? "bg-blue-900/30 ml-8"
                : "bg-gray-800 mr-8"
            }\`}>
              {msg.content}
            </div>
          ))}
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="p-3 border-t border-gray-700">
          <input value={input} onChange={e => setInput(e.target.value)}
            placeholder="Ask about your Intune environment..."
            className="w-full bg-gray-800 text-white rounded-lg px-4 py-2" />
        </form>
      </div>
    );
  }
`, "TSX");

codeSlide("client/src/components/DeviceTable.tsx — Data Display", `
  import { useChatStore } from "../stores/chatStore";

  export default function DeviceTable() {
    const devices = useChatStore(
      (s) => s.toolResults.get("get_managed_devices") || []
    );

    if (devices.length === 0) {
      return <p className="text-gray-500 p-6">
        Ask the agent to fetch devices...
      </p>;
    }

    return (
      <table className="w-full text-sm text-left text-gray-300">
        <thead className="text-xs uppercase bg-gray-800">
          <tr>
            <th className="px-4 py-3">Device Name</th>
            <th className="px-4 py-3">OS</th>
            <th className="px-4 py-3">Compliance</th>
            <th className="px-4 py-3">Last Sync</th>
          </tr>
        </thead>
        <tbody>
          {devices.map((d: any) => (
            <tr key={d.id} className="border-b border-gray-700">
              <td className="px-4 py-2">{d.deviceName}</td>
              <td className="px-4 py-2">{d.operatingSystem}</td>
              <td className="px-4 py-2">
                <span className={\`px-2 py-1 rounded text-xs \${
                  d.complianceState === "compliant"
                    ? "bg-green-900 text-green-300"
                    : "bg-red-900 text-red-300"
                }\`}>{d.complianceState}</span>
              </td>
              <td className="px-4 py-2">
                {new Date(d.lastSyncDateTime).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
`, "TSX");

codeSlide("client/src/App.tsx — Main Layout", `
  import { useState } from "react";
  import ChatPanel from "./components/ChatPanel";
  import DeviceTable from "./components/DeviceTable";

  export default function App() {
    const [chatOpen, setChatOpen] = useState(true);

    return (
      <div className="flex h-screen bg-gray-950 text-white">

        {/* Left: Data panel */}
        <div className="flex-1 overflow-hidden">
          <header className="p-4 border-b border-gray-800">
            <h1 className="text-lg font-bold text-amber-400">
              Intune007 — Your license to manage.
            </h1>
          </header>
          <DeviceTable />
        </div>

        {/* Right: Chat panel */}
        {chatOpen && (
          <div className="w-[400px] border-l border-gray-800">
            <ChatPanel />
          </div>
        )}
      </div>
    );
  }
`, "TSX");

// ═══════════════════════════════════════════════════════════
// PART 7 — Connecting It All
// ═══════════════════════════════════════════════════════════
sectionSlide("7", "Connecting It All", "Running the full stack and testing");

codeSlide("Install All Dependencies", `
  # From the root of the monorepo:

  # Shared package (no external deps, just TypeScript)
  cd shared && npm init -y && cd ..

  # Server dependencies
  npm -w server install express cors dotenv openai \\
    @microsoft/microsoft-graph-client @azure/identity

  npm -w server install -D typescript tsx @types/express @types/cors

  # Client dependencies
  npm -w client install react react-dom zustand lucide-react
  npm -w client install -D vite @vitejs/plugin-react typescript \\
    tailwindcss postcss autoprefixer @types/react @types/react-dom

  # Build shared types first
  npm -w shared run build

  # Start everything!
  npm run dev

  # Server starts on :3001, Client on :5173
`, "Terminal");

contentSlide("The Magic Flow — What Happens When You Chat", [
  "1.  User types: \"Show me all non-compliant devices\"",
  "2.  ChatPanel → useAgentStream → POST /api/chat with messages",
  "3.  Server sends messages + tool definitions to Azure OpenAI",
  "4.  OpenAI returns: call get_managed_devices with filter = \"complianceState eq 'noncompliant'\"",
  "5.  Server streams SSE: { type: \"tool_call\", name: \"get_managed_devices\", ... }",
  "6.  Server calls Graph API → gets device list",
  "7.  Server streams SSE: { type: \"tool_result\", data: [...devices] }",
  "8.  Client receives tool_result → updates Zustand store → DeviceTable re-renders",
  "9.  OpenAI generates summary → streamed token-by-token",
  "10. Client shows: \"Found 12 non-compliant devices. Here's a summary...\"",
]);

// ═══════════════════════════════════════════════════════════
// PART 8 — Where to Go Next
// ═══════════════════════════════════════════════════════════
sectionSlide("8", "Where to Go Next", "From basic to production-grade");

twoColumnSlide("Expanding Your Tool",
  "More Tools = More Power",
  [
    "Compliance policies (read/create)",
    "Configuration profiles",
    "App management & deployment",
    "Device actions (sync, reboot, wipe)",
    "Conditional Access policies",
    "Autopilot enrollment profiles",
    "Group management",
  ],
  "Production Features",
  [
    "Security: Helmet, rate limiting, input validation",
    "OWASP: OData injection prevention",
    "Self-improving: learning from interactions",
    "RAG: embed Microsoft documentation",
    "CVE monitoring & auto-remediation",
    "Audit logging & analytics",
    "Multi-tenant support",
  ]
);

contentSlide("Key Takeaways", [
  "AI function calling is the bridge between natural language and APIs",
  "SSE streaming gives users real-time feedback (not just a spinner)",
  "TypeScript end-to-end = shared types = fewer bugs",
  "Each new tool = a new capability with zero model retraining",
  "The Graph API is incredibly powerful — 500+ endpoints available",
  "Start simple (5 tools) → iterate → the AI handles the complexity",
  "",
  "The AI doesn't need to know Intune — it just needs the right tools.",
]);

// ─── Final Slide ──────────────────────────────────────────
const finalSlide = pptx.addSlide();
addBg(finalSlide);
finalSlide.addShape(pptx.ShapeType.rect, { x: 0, y: 3.4, w: 13.33, h: 0.06, fill: { color: COLORS.gold } });
finalSlide.addText("Thank You", {
  x: 0.8, y: 1.5, w: 11.7, h: 1.2,
  fontSize: 48, fontFace: "Georgia", color: COLORS.white, bold: true, align: "center",
});
finalSlide.addText("Your license to manage.", {
  x: 0.8, y: 2.7, w: 11.7, h: 0.6,
  fontSize: 18, fontFace: "Georgia", color: COLORS.gold, italic: true, align: "center",
});
finalSlide.addText([
  { text: "GitHub: ", options: { fontSize: 15, color: COLORS.gray } },
  { text: "github.com/KenGoossens/Intune007", options: { fontSize: 15, color: COLORS.goldLight, bold: true } },
], { x: 0.8, y: 4.2, w: 11.7, h: 0.5, align: "center" });
finalSlide.addText([
  { text: "Ken Goossens  ·  ", options: { fontSize: 14, color: COLORS.grayDark } },
  { text: "@KenGoossens", options: { fontSize: 14, color: COLORS.gray } },
], { x: 0.8, y: 5.5, w: 11.7, h: 0.5, align: "center" });
finalSlide.addText("Questions?", {
  x: 0.8, y: 6.2, w: 11.7, h: 0.5,
  fontSize: 20, fontFace: "Georgia", color: COLORS.gold, align: "center",
});

// ─── Generate ─────────────────────────────────────────────
const outputPath = "Intune007_Workshop.pptx";
pptx.writeFile({ fileName: outputPath }).then(() => {
  console.log(`\n  ✅ Presentation generated: ${outputPath}`);
  console.log(`  📊 ${pptx.slides.length} slides created\n`);
});
