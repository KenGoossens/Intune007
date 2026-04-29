import pptxgen from "pptxgenjs";

const pptx = new pptxgen();

// ─── Theme ─────────────────────────────────────────────────
const C = {
  bg: "0F172A",
  bgLight: "1E293B",
  gold: "D4A017",
  goldLight: "F5C842",
  white: "FFFFFF",
  gray: "94A3B8",
  grayDark: "64748B",
  green: "22C55E",
  blue: "3B82F6",
  red: "EF4444",
  code: "111827",
  orange: "F59E0B",
};

pptx.author = "Ken Goossens";
pptx.company = "Intune007";
pptx.subject = "Vibe Coding Session — Step-by-Step Copilot Prompts";
pptx.title = "Vibe Coding Session Prompts — Build an AI Intune Agent Live";
pptx.defineLayout({ name: "WIDE", width: 13.33, height: 7.5 });
pptx.layout = "WIDE";

// ─── Helpers ───────────────────────────────────────────────
function bg(s) { s.background = { color: C.bg }; }

function titleSlide(title, subtitle, extra) {
  const s = pptx.addSlide(); bg(s);
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 3.2, w: 13.33, h: 0.06, fill: { color: C.gold } });
  s.addText(title, { x: 0.8, y: 0.8, w: 11.7, h: 2.0, fontSize: 42, fontFace: "Georgia", color: C.white, bold: true, align: "center" });
  s.addText(subtitle, { x: 0.8, y: 3.6, w: 11.7, h: 1.0, fontSize: 20, fontFace: "Calibri", color: C.gray, align: "center" });
  if (extra) s.addText(extra, { x: 0.8, y: 4.8, w: 11.7, h: 0.6, fontSize: 16, fontFace: "Georgia", color: C.gold, italic: true, align: "center" });
  return s;
}

function section(num, title, sub) {
  const s = pptx.addSlide(); bg(s);
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.15, h: 7.5, fill: { color: C.gold } });
  s.addText(num, { x: 1.0, y: 1.5, w: 11, h: 0.6, fontSize: 16, fontFace: "Calibri", color: C.gold, bold: true });
  s.addText(title, { x: 1.0, y: 2.3, w: 11, h: 1.5, fontSize: 38, fontFace: "Georgia", color: C.white, bold: true });
  if (sub) s.addText(sub, { x: 1.0, y: 4.0, w: 10, h: 1.2, fontSize: 18, fontFace: "Calibri", color: C.gray });
  return s;
}

function content(title, bullets, opts = {}) {
  const s = pptx.addSlide(); bg(s);
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.9, fill: { color: C.bgLight } });
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0.88, w: 13.33, h: 0.04, fill: { color: C.gold } });
  s.addText(title, { x: 0.6, y: 0.1, w: 12, h: 0.7, fontSize: 22, fontFace: "Georgia", color: C.gold, bold: true });
  const b = bullets.map(t => ({
    text: t, options: { fontSize: opts.fs || 17, fontFace: "Calibri", color: C.white, bullet: { type: "bullet", color: C.gold }, paraSpaceAfter: 8, lineSpacingMultiple: 1.2 },
  }));
  s.addText(b, { x: 0.8, y: 1.3, w: 11.5, h: 5.5, valign: "top" });
  return s;
}

function prompt(title, promptText, explanation) {
  const s = pptx.addSlide(); bg(s);
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.9, fill: { color: C.bgLight } });
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0.88, w: 13.33, h: 0.04, fill: { color: C.gold } });
  s.addText(title, { x: 0.6, y: 0.1, w: 12, h: 0.7, fontSize: 22, fontFace: "Georgia", color: C.gold, bold: true });
  s.addShape(pptx.ShapeType.roundRect, { x: 0.6, y: 1.3, w: 3.2, h: 0.45, rectRadius: 0.1, fill: { color: C.gold } });
  s.addText("💬 Say this to Copilot:", { x: 0.6, y: 1.3, w: 3.2, h: 0.45, fontSize: 12, fontFace: "Calibri", color: C.bg, bold: true, align: "center" });
  s.addShape(pptx.ShapeType.roundRect, { x: 0.5, y: 2.0, w: 12.33, h: 2.2, rectRadius: 0.15, fill: { color: C.code }, line: { color: C.gold, width: 1.5 } });
  s.addText(promptText, { x: 0.8, y: 2.1, w: 11.8, h: 2.0, fontSize: 15, fontFace: "Cascadia Code", color: C.goldLight, valign: "top", lineSpacingMultiple: 1.3 });
  if (explanation) {
    const exp = explanation.map(t => ({
      text: t, options: { fontSize: 15, fontFace: "Calibri", color: C.gray, bullet: { type: "bullet", color: C.gold }, paraSpaceAfter: 6 },
    }));
    s.addText(exp, { x: 0.8, y: 4.5, w: 11.5, h: 2.5, valign: "top" });
  }
  return s;
}

function twoCol(title, lTitle, lBullets, rTitle, rBullets) {
  const s = pptx.addSlide(); bg(s);
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.9, fill: { color: C.bgLight } });
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0.88, w: 13.33, h: 0.04, fill: { color: C.gold } });
  s.addText(title, { x: 0.6, y: 0.1, w: 12, h: 0.7, fontSize: 22, fontFace: "Georgia", color: C.gold, bold: true });
  s.addText(lTitle, { x: 0.6, y: 1.3, w: 5.5, h: 0.5, fontSize: 16, fontFace: "Calibri", color: C.goldLight, bold: true });
  s.addText(lBullets.map(t => ({ text: t, options: { fontSize: 15, fontFace: "Calibri", color: C.white, bullet: { type: "bullet", color: C.gold }, paraSpaceAfter: 6 } })),
    { x: 0.8, y: 1.9, w: 5.3, h: 5.0, valign: "top" });
  s.addShape(pptx.ShapeType.rect, { x: 6.55, y: 1.3, w: 0.03, h: 5.5, fill: { color: "334155" } });
  s.addText(rTitle, { x: 6.9, y: 1.3, w: 5.5, h: 0.5, fontSize: 16, fontFace: "Calibri", color: C.goldLight, bold: true });
  s.addText(rBullets.map(t => ({ text: t, options: { fontSize: 15, fontFace: "Calibri", color: C.white, bullet: { type: "bullet", color: C.gold }, paraSpaceAfter: 6 } })),
    { x: 7.1, y: 1.9, w: 5.5, h: 5.0, valign: "top" });
  return s;
}

function tip(title, tipText, details) {
  const s = pptx.addSlide(); bg(s);
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.9, fill: { color: C.bgLight } });
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0.88, w: 13.33, h: 0.04, fill: { color: C.orange } });
  s.addText("💡 " + title, { x: 0.6, y: 0.1, w: 12, h: 0.7, fontSize: 22, fontFace: "Georgia", color: C.orange, bold: true });
  s.addShape(pptx.ShapeType.roundRect, { x: 0.5, y: 1.3, w: 12.33, h: 1.5, rectRadius: 0.15, fill: { color: "1a2744" }, line: { color: C.orange, width: 1 } });
  s.addText(tipText, { x: 0.8, y: 1.4, w: 11.8, h: 1.3, fontSize: 18, fontFace: "Calibri", color: C.white, valign: "middle" });
  if (details) {
    const d = details.map(t => ({ text: t, options: { fontSize: 15, fontFace: "Calibri", color: C.gray, bullet: { type: "bullet", color: C.orange }, paraSpaceAfter: 6 } }));
    s.addText(d, { x: 0.8, y: 3.1, w: 11.5, h: 3.8, valign: "top" });
  }
  return s;
}

import fs from "fs";
import path from "path";

const SCREENSHOTS_DIR = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "screenshots");

/** Screenshot slide: embeds the image if it exists, otherwise shows a placeholder */
function screenshot(title, imageFile, caption) {
  const s = pptx.addSlide(); bg(s);
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.9, fill: { color: C.bgLight } });
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0.88, w: 13.33, h: 0.04, fill: { color: C.gold } });
  s.addText(title, { x: 0.6, y: 0.1, w: 12, h: 0.7, fontSize: 22, fontFace: "Georgia", color: C.gold, bold: true });

  const imgPath = path.join(SCREENSHOTS_DIR, imageFile);
  if (fs.existsSync(imgPath)) {
    const ext = path.extname(imageFile).slice(1).toLowerCase();
    const imgData = fs.readFileSync(imgPath).toString("base64");
    s.addImage({ data: `image/${ext === "jpg" ? "jpeg" : ext};base64,${imgData}`, x: 0.5, y: 1.2, w: 12.33, h: 5.3, rounding: true });
  } else {
    s.addShape(pptx.ShapeType.roundRect, { x: 0.5, y: 1.2, w: 12.33, h: 5.3, rectRadius: 0.15, fill: { color: C.bgLight }, line: { color: C.gold, width: 1, dashType: "dash" } });
    s.addText("📷  Save " + imageFile + " to screenshots/ and re-run", { x: 0.5, y: 3.3, w: 12.33, h: 0.8, fontSize: 16, fontFace: "Calibri", color: C.grayDark, align: "center" });
  }
  if (caption) s.addText(caption, { x: 0.8, y: 6.7, w: 11.5, h: 0.5, fontSize: 12, fontFace: "Calibri", color: C.grayDark, italic: true, align: "center" });
  return s;
}

// ═══════════════════════════════════════════════════════════
//  SLIDES
// ═══════════════════════════════════════════════════════════

// ─── Title ────────────────────────────────────────────────
const s1 = titleSlide(
  "Vibe Coding Session\nStep-by-Step Prompts",
  "Build an AI-Powered Intune Agent Live with Your Audience",
  "Your license to manage."
);
s1.addText("Ken Goossens  ·  IT Conference 2026", {
  x: 0.8, y: 6.2, w: 11.7, h: 0.5, fontSize: 14, fontFace: "Calibri", color: C.grayDark, align: "center",
});

// ─── Overview: What We'll Build ───────────────────────────
content("What We're Building Live", [
  "An AI chatbot that manages Microsoft Intune through natural conversation",
  "",
  "Features we'll build step by step:",
  "   ① Chat interface — type questions, get answers from real Intune data",
  "   ② Alerts dashboard — automated health monitoring with severity badges",
  "   ③ Device table — query results with compliance badges and action links",
  "   ④ Device card — full hardware, security, and enrollment overview",
  "   ⑤ Query builder — natural language search → OData filter → results",
  "   ⑥ Remediation — AI-generated PowerShell scripts, deploy to Intune",
  "   ⑦ Analytics — cost, tokens, tool usage, request history",
  "   ⑧ App health — deployment status with icons across all apps",
  "   ⑨ CVE monitor — vulnerability tracking with severity and exploits",
  "   ⑩ Device timeline — lifecycle events from enrollment to today",
]);

// ─── Session Flow ─────────────────────────────────────────
content("Session Flow", [
  "We'll work through these prompts in order:",
  "",
  "FOUNDATION (Steps 0–1):",
  "   Set up the project, connect to Graph API, create the AI agent, build the chat UI",
  "",
  "CORE PANELS (Steps 2–5):",
  "   Alerts → Data table → Device card → Query builder",
  "",
  "OPERATIONS (Step 6):",
  "   Remediation script generator + deployment",
  "",
  "INSIGHTS (Steps 7–10):",
  "   Analytics → App health → CVE monitor → Device timeline",
  "",
  "POLISH (Steps 11–12):",
  "   Golden sparkle effect + cross-panel navigation",
  "",
  "Each step = 1–2 Copilot prompts. Just copy, paste, accept, run!",
]);


// ═══════════════════════════════════════════════════════════
//  STEP 0: Project Scaffold
// ═══════════════════════════════════════════════════════════
section("STEP 0", "Project Scaffold", "Create the monorepo, Graph client, AI agent core, and Express server");

prompt("0.1 — Create the Monorepo",
  `I want to create a new TypeScript monorepo called "intune-agent" using npm workspaces. It should have three folders: shared for shared types, server for an Express backend running on port 3001, and client for a React frontend with Vite and Tailwind CSS on port 5173. Set up a root package.json with the workspaces config and add a "dev" script that runs the server and client concurrently. Initialize all the package.json files and tsconfig files for me.`,
  [
    "Copilot creates all the folders, configs, and scripts for you",
    "A monorepo = 3 mini-projects that share code in one repo",
    "The \"dev\" script starts everything with one command: npm run dev",
  ]
);

prompt("0.2 — Environment Config & Graph Client",
  `I need two things. First, create a config module at server/src/config.ts that loads environment variables from a .env file using dotenv: AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, AZURE_OPENAI_DEPLOYMENT, and PORT defaulting to 3001. Add a validateConfig function that checks all required values exist. Second, create a Microsoft Graph API client at server/src/graph/client.ts using ClientSecretCredential from @azure/identity and the Microsoft Graph client library. Make it a lazy singleton with a getGraphClient function. Install whatever npm packages are needed.`,
  [
    "The .env file holds your Azure secrets — never committed to git",
    "ClientSecretCredential authenticates your app to Microsoft",
    "The lazy singleton creates the connection once and reuses it",
  ]
);

prompt("0.3 — AI Agent Core",
  `Create the AI agent system across three files. In server/src/agent/tools.ts, define OpenAI function-calling tool definitions for get_managed_devices with an optional OData filter parameter, get_device_details, sync_device, and restart_device. In server/src/agent/executor.ts, create an executeTool function that takes a tool name and arguments, calls the corresponding Graph API, and returns the data with a totalCount. In server/src/agent/agent.ts, create a runAgentLoop function that takes a user message and conversation history, sends it to Azure OpenAI along with the tool definitions, and loops — if the AI wants to call a tool, execute it and send the result back, then let the AI respond again. Cap it at 10 iterations. Use "You are an Intune administration assistant" as the system prompt. Important: do not use the temperature parameter, and use max_completion_tokens instead of max_tokens.`,
  [
    "tools.ts tells the AI what tools exist (descriptions + parameters)",
    "executor.ts runs the tool the AI picks (calls Graph API)",
    "agent.ts is the brain: question → AI → tool → result → AI → answer",
    "The AI never calls APIs directly — it asks, our code executes",
  ]
);

prompt("0.4 — Express Server + Chat Route",
  `Create the Express server in server/src/index.ts. Enable CORS so the frontend on localhost:5173 can call it. Add a POST /api/chat route that accepts a message and conversation history, runs it through the agent loop, and returns the AI response along with any tool results. Also add a simple GET /api/health endpoint. Install express, cors, and their TypeScript type definitions. Have the server listen on the PORT from the config module.`,
  [
    "This creates the web server the chat UI will talk to",
    "POST /api/chat is the single endpoint for all AI conversations",
    "Test it: curl http://localhost:3001/api/health",
  ]
);

tip("Checkpoint: Run the Server",
  "Before building the UI, make sure the server starts. Open a terminal, run it, and test the health endpoint.",
  [
    "Run: cd server && npx tsx src/index.ts",
    "You should see: \"Server running on port 3001\"",
    "Test: curl http://localhost:3001/api/health",
    "Errors? Paste them into Copilot: \"I get this error: [error]. Fix it.\"",
    "That IS vibe coding — iterating with the AI on errors!",
  ]
);


// ═══════════════════════════════════════════════════════════
//  STEP 1: Chat Panel + App Layout
// ═══════════════════════════════════════════════════════════
section("STEP 1", "Chat Panel & App Layout", "Build the conversational UI and sidebar navigation");

screenshot("TARGET: Chat Panel", "01-alerts.png", "Right-side panel with user/bot messages, gold send button, loading state");

prompt("1.1 — Chat Interface",
  `Build a chat panel component at client/src/components/ChatPanel.tsx. Use a dark background (#0F172A) with gold (#D4A017) accents. Show user messages aligned to the right with a gold background, and bot messages on the left in a dark card with white text — render the bot messages as Markdown so it supports bold, lists, and code blocks. Put a text input at the bottom with a gold send button. While waiting for a response, show a loading state that says "Querying" then "Processing..." with a spinner. Auto-scroll to the latest message. Have it POST messages to /api/chat and display the response. Add thumbs up and thumbs down feedback buttons on each bot message.`,
  [
    "This is the main conversation interface — always visible on the right",
    "Markdown rendering means the AI can format responses with bold, lists, code",
    "The loading indicator shows the agent is thinking and calling tools",
  ]
);

prompt("1.2 — App Layout with Sidebar",
  `Create the main app layout in client/src/App.tsx. I want a left sidebar about 150 pixels wide with navigation items grouped into categories: under CORE put Alerts, Data, Device Card, and Query Builder; under OPERATIONS put Remediation; under INSIGHTS put Analytics, App Health, CVE Monitor, and Device Timeline. At the bottom of the sidebar add a Settings gear icon and an "Agent" button to toggle the chat panel. The main content area should show whichever panel is currently active. On the right side, show a collapsible ChatPanel. The header should say "Intune 007" in gold Georgia serif font with the tagline "Your license to manage." Use Zustand for managing the navigation state. Gold brand color is #D4A017, dark background is #0F172A.`,
  [
    "This creates the full app shell you see in all the screenshots",
    "Zustand is a tiny state manager — much simpler than Redux",
    "Each nav item switches the main content area to a different panel",
  ]
);


// ═══════════════════════════════════════════════════════════
//  STEP 2: Alerts Panel
// ═══════════════════════════════════════════════════════════
section("STEP 2", "Alerts Dashboard", "Automated health monitoring that runs in the background");

screenshot("TARGET: Alerts Panel", "01-alerts.png", "Alert cards with INFO badge, CA policy warning, acknowledge/dismiss buttons");

prompt("2.1 — Alert Checks Backend",
  `Create a health monitoring system. In server/src/alerts/checks.ts, write two check functions: one that queries the Graph API for non-compliant devices and another that checks for Conditional Access policies that are disabled or in report-only mode. Each check should return an alert object with an id, title, message, severity (critical, warning, or info), a timestamp, and a link URL. Then create server/src/alerts/scheduler.ts that runs these checks automatically every 15 minutes, stores the alerts in memory, and exposes a getAlerts function and a startScheduler function. Add a GET /api/alerts route to the Express server that returns the current alerts.`,
  [
    "This runs automatically — no user action needed",
    "Every 15 minutes, it checks your tenant for problems",
    "The screenshot shows \"4 CA Policies Not Enforcing\" — that's this check!",
  ]
);

prompt("2.2 — Alerts Panel UI",
  `Create an AlertsPanel component at client/src/components/AlertsPanel.tsx. It should fetch alerts from /api/alerts and auto-refresh every 60 seconds. Show each alert as a dark-themed card with a severity icon and colored badge — blue for INFO, amber for WARNING, red for CRITICAL. Display the title and description, a link icon to open the related resource, and three action buttons: acknowledge with a checkmark, dismiss with an X, and a forward arrow. Also show the alert count as a badge on the Alerts nav item in the sidebar so you can see at a glance how many active alerts there are.`,
  [
    "The blue INFO badge and gold styling match the screenshot exactly",
    "Alert count shows as a badge on the sidebar nav item",
    "Acknowledge/dismiss lets you manage alerts without leaving the app",
  ]
);


// ═══════════════════════════════════════════════════════════
//  STEP 3: Data Panel
// ═══════════════════════════════════════════════════════════
section("STEP 3", "Data Panel & Device Table", "Display agent query results in a structured table");

screenshot("TARGET: Data Panel", "02-data.png", "Managed Devices table with compliance badges, Troubleshoot/Timeline actions");

prompt("3.1 — Data Panel with Device Table",
  `Create a DataPanel component at client/src/components/DataPanel.tsx that displays query results from the AI agent. Show a header that says "Query Results" with the count and a "Clear all" button. When the agent fetches devices, display them in a "Managed Devices" card with the total count and a cache timestamp. The device table should have columns for Device Name as a gold clickable link, OS, Version, Compliance as a green "compliant" badge, Ownership, User with a link, Last Sync, and an Actions column with Troubleshoot and Timeline links. Clicking a device name should navigate to the Device Card panel. Store the results in a Zustand store as a dataPanels array, and automatically route to this panel when the agent returns device tool results.`,
  [
    "The screenshot shows NB-DUYGU-AI1 as a gold clickable link",
    "Green 'compliant' badge with circle icon — color-coded status",
    "Troubleshoot and Timeline are quick-action links per device",
    "Results auto-appear when you ask the chat: \"How many devices do I have?\"",
  ]
);


// ═══════════════════════════════════════════════════════════
//  STEP 4: Device Card
// ═══════════════════════════════════════════════════════════
section("STEP 4", "Device Card", "Comprehensive device overview with hardware, security, and quick actions");

screenshot("TARGET: Device Card", "03-device-card.png", "Full device card: header, badges, action buttons, hardware, security, storage bar");

prompt("4.1 — Device Card Backend",
  `Add a new get_device_card tool to the agent that fetches comprehensive device information from the Graph API. It should get the device name, OS, version, and architecture, along with compliance and encryption status. Pull the full hardware details including manufacturer, model, chassis type, RAM, and architecture. Get the storage breakdown with total, used, and free space. Include security info like encryption status and whether DFCI is managed. Also fetch the installed app count and assigned profile count from separate queries. Return everything in one structured object so the frontend can render a complete device overview.`,
  [
    "This fetches everything about a device in one call",
    "The app count (200) and profile count (3) come from separate queries",
    "Storage data comes from the device's hardwareInformation property",
  ]
);

prompt("4.2 — Device Card UI",
  `Create a DeviceCardPanel component at client/src/components/DeviceCardPanel.tsx. At the top, put a search bar where you type a device name and click a magnifying glass button to load it. Show a device header with the device icon, name, manufacturer and model description, and the OS version with an architecture badge in the top right. Display status badges for compliant in green, Encrypted in green, and how long ago it last synced in gold. Add a row of quick action buttons: Sync, Restart, Troubleshoot, Timeline, and Prepare Autopilot. Below that, show four stats cards for Apps count, Profiles count, Compliance checkmark, and RAM in GB. Include a summary line like "Profiles: ✓ 3 | 256GB free / 475GB | company" and a user card showing the display name and email with a Summary button. Then add collapsible sections with chevron toggles for Hardware & Storage showing manufacturer, model, chassis, architecture, RAM, OS Edition, and a storage usage bar with green for used and darker for free space; Security showing encryption and DFCI status; and Network, Enrollment & Management, and Identity sections.`,
  [
    "The screenshot shows all of this — header, badges, actions, hardware sections",
    "Collapsible sections keep it clean — expand what you need",
    "Quick actions let you sync/restart directly from the card",
    "The storage bar gives instant visual feedback on disk usage",
  ]
);


// ═══════════════════════════════════════════════════════════
//  STEP 5: Query Builder
// ═══════════════════════════════════════════════════════════
section("STEP 5", "Query Builder", "Natural language to OData — search devices by describing what you want");

screenshot("TARGET: Query Builder", "04-query-builder.png", "Natural language search, OData filter preview, results table");

prompt("5.1 — Query Builder Backend",
  `Create a POST /api/query-builder endpoint that accepts a natural language query string describing what devices to find. Send the query to Azure OpenAI and ask it to generate an OData $filter expression for the /deviceManagement/managedDevices endpoint. Make sure to sanitize the generated filter before executing it to prevent OData injection. Run the filter against the Graph API and return the generated filter string, the matching devices, and the total count. For example, if someone types "All compliant corporate devices" it should generate something like complianceState eq 'compliant' and managedDeviceOwnerType eq 'company'.`,
  [
    "The AI translates plain English into OData filter syntax",
    "The screenshot shows exactly this filter generated from natural language",
    "Sanitizing prevents OData injection — important security measure",
  ]
);

prompt("5.2 — Query Builder UI",
  `Build a QueryBuilderPanel component at client/src/components/QueryBuilderPanel.tsx. Show a header that says "Query Builder" with a gold "Natural Language" badge next to it. Add a label saying "Describe the devices you want to find" above a large textarea where the user types their search. Below the textarea, add quick template buttons like "Non-compliant Windows devices", "Devices not synced in 7 days", "Personal iOS devices", and "All compliant corporate devices" — clicking one should fill the textarea with that text. Add a gold Search button with a magnifying glass icon. In the results area, show the generated OData filter in a dark code block with gold monospace text, a count like "N device(s) found", and a results table with columns for Device, OS, Version, Compliance with a green badge, Owner, User, and Last Sync.`,
  [
    "The screenshot shows \"All compliant corporate devices\" in the textarea",
    "Below it: the generated OData filter in a code block",
    "Template buttons give quick starting points — one click fills the query",
    "Results appear as a familiar device table below the filter",
  ]
);


// ═══════════════════════════════════════════════════════════
//  STEP 6: Remediation
// ═══════════════════════════════════════════════════════════
section("STEP 6", "Remediation Scripts", "AI-generated PowerShell scripts that deploy to Intune");

screenshot("TARGET: Remediation Panel", "05-remediation.png", "Detection + remediation scripts, syntax highlighting, deploy button");

prompt("6.1 — Remediation Backend",
  `Build a remediation system with three endpoints. First, POST /api/remediation/generate should accept a prompt describing what needs to be fixed, send it to Azure OpenAI, and get back two PowerShell scripts: a detection script that exits 0 if everything is OK and exits 1 if the issue is found, and a remediation script that runs when detection fails. Return the title, description, category, and both scripts. Second, POST /api/remediation/deploy should take the generated scripts and deploy them to Intune as a Proactive Remediation using the deviceHealthScript Graph API. Third, GET /api/remediation/scripts should list the existing proactive remediations already deployed in the tenant. Before deploying any scripts, scan them for dangerous patterns like Format-C or Remove-Item on system paths to prevent accidental damage.`,
  [
    "The AI writes both scripts — detection checks the problem, remediation fixes it",
    "The screenshot shows \"Restart Intune Management Extension\" scripts",
    "Security scan blocks scripts with Format-C, Remove-Item on system paths, etc.",
  ]
);

prompt("6.2 — Remediation UI",
  `Create a RemediationPanel component at client/src/components/RemediationPanel.tsx. The header should say "Remediation" with two tab buttons: "Generate" and "Existing" showing a count of deployed scripts. In the Generate tab, show a textarea asking "Describe the remediation you need" with a placeholder like "Ensure BitLocker is enabled on all Windows devices". Add a gold "Generate Scripts" button with a sparkle icon. Below the textarea, add quick template buttons for common remediations: Enable BitLocker encryption, Ensure Windows Firewall is enabled, Fix Windows Update service, Clear Intune app cache and re-sync, Restart Intune Management Extension, and Enable Windows Defender real-time protection. When scripts are generated, show a result card with the title, description, and a category badge. Display the Detection Script and Remediation Script in collapsible sections with syntax-highlighted PowerShell using react-syntax-highlighter. Label the detection script with "exit 0 = OK, exit 1 = needs fix" and the remediation script with "runs when detection fails". At the bottom, add a gold "Deploy to Intune as Proactive Remediation" button.`,
  [
    "The screenshot shows generated scripts with full syntax highlighting",
    "Quick templates let you generate common remediations in one click",
    "The deploy button pushes it to Intune as a real Proactive Remediation",
    "Existing tab shows what's already deployed in your tenant",
  ]
);


// ═══════════════════════════════════════════════════════════
//  STEP 7: Analytics
// ═══════════════════════════════════════════════════════════
section("STEP 7", "Analytics Dashboard", "Track cost, tokens, tool usage, and request history");

screenshot("TARGET: Analytics Panel", "06-analytics.png", "KPI cards, token distribution, tool usage bars, request history");

prompt("7.1 — Analytics Backend",
  `Create an analytics tracking system in server/src/analytics/tracker.ts. Every time the agent processes a request, track the request ID, timestamp, the user's message, token usage broken down by prompt and completion tokens, the calculated cost, which tools were called with their duration and whether they succeeded or errored, and the total response time. Store everything in a SQLite database called analytics.db. Then create a GET /api/analytics endpoint that returns aggregated stats: total requests, total cost, total tokens, total tool calls, average response time, error rate, a tool usage breakdown showing each tool's call count, average duration, and error count, and a list of recent requests with their cost and timing details.`,
  [
    "Every agent interaction is tracked: tokens, cost, tools used, timing",
    "SQLite keeps the data persistent across server restarts",
    "The screenshot shows $4.87 total cost across 53 requests — that's real data",
  ]
);

prompt("7.2 — Analytics Panel UI",
  `Create an AnalyticsPanel component at client/src/components/AnalyticsPanel.tsx. Show a header saying "Analytics" with the request count as a badge and buttons to reset and refresh the data. At the top, display four KPI cards in a row: Total Cost in red showing the dollar amount and per-request average, Total Tokens in gold with the count and per-request average, Average Response in green showing seconds with the min-max range, and Tool Calls in blue with the total count, per-request average, and number of unique tools. Below that, add a Cost Per Request sparkline chart, a Token Distribution horizontal bar showing the prompt versus completion percentage split, and an error rate line. Add a Tool Usage section with horizontal bars for each tool showing how many times it was called and its average duration. At the bottom, show a Request History as an expandable list where each entry shows the user's message, cost, token count, duration, and timestamp. Auto-refresh the data every 10 seconds.`,
  [
    "The screenshot shows all of this — KPI cards, bars, tool usage, history",
    "Tool usage shows which tools are called most (managed devices = 13x)",
    "Request history lets you expand each conversation to see details",
    "Auto-refresh keeps the dashboard live during the demo",
  ]
);


// ═══════════════════════════════════════════════════════════
//  STEP 8: App Health
// ═══════════════════════════════════════════════════════════
section("STEP 8", "App Deployment Health", "Monitor which apps are deployed and detected on devices");

screenshot("TARGET: App Health Panel", "07-app-health.png", "App list with icons, detection status, 27 apps tracked");

prompt("8.1 — App Health Backend",
  `Create an App Health system. Add a GET /api/app-health endpoint that fetches all mobile apps from Intune using the /deviceAppManagement/mobileApps Graph API, then checks the device install status for each app. Return a list of apps with their name, publisher, type, icon URL, detected count, total device count, and deployment rate. Use the Graph batch API to combine up to 20 requests per call so we don't make hundreds of individual API calls. Also add a POST /api/app-health/fix-icon endpoint that re-fetches an app's icon individually, because the largeIcon binary is not returned in list queries — that's a Graph API limitation. Include summary counts for total apps, detected, and not detected.`,
  [
    "The batch API reduces API calls: 27 apps in 2 calls instead of 27",
    "App icons need individual fetches — Graph API quirk",
    "The screenshot shows 27 apps, 0 detected, 27 not detected",
  ]
);

prompt("8.2 — App Health Panel UI",
  `Build an AppHealthPanel component at client/src/components/AppHealthPanel.tsx. The header should say "App Deployment Health" with a Refresh button on the right. Show three colored summary cards at the top: All Apps in blue, Detected in green, and Not Detected in amber. Below that, list each app as a row with the app icon as a small square image with a fallback placeholder if no icon is available, the app name in bold with the publisher and app type underneath, and a status badge on the right showing either "Not detected" or "Detected". Add small action buttons on each row for copy, link, refresh, and delete. Fetch the data from /api/app-health when the component mounts and again when the user clicks Refresh.`,
  [
    "The screenshot shows apps like 7-Zip, Adobe DC, Company Portal",
    "Each has a real icon from Intune + publisher info",
    "Status badges show if the app is actually installed on devices",
  ]
);


// ═══════════════════════════════════════════════════════════
//  STEP 9: CVE Monitor
// ═══════════════════════════════════════════════════════════
section("STEP 9", "CVE Monitor", "Track vulnerabilities relevant to your managed devices");

screenshot("TARGET: CVE Monitor Panel", "08-cve-monitor.png", "CVE cards with CVSS scores, EXPLOITED badges, remediation guidance");

prompt("9.1 — CVE Monitor Backend",
  `Create a CVE monitoring system. Add a POST /api/cve/scan endpoint that scans the National Vulnerability Database for CVEs that match the operating systems and apps on your managed devices. Store the results in a SQLite database called cve.db with the CVE ID, title, description, CVSS score, severity, whether it's actively exploited, affected products, how many of your devices are impacted, the status (new, reviewed, remediated, or fixed), publish date, and remediation guidance. Add GET /api/cve/stats that returns counts for total, new, critical, exploited, and fixed. Add GET /api/cve with a limit parameter that returns the CVE list sorted by severity. Add PATCH /api/cve/:cveId/status so you can update a CVE's status. For each CVE, use Azure OpenAI to generate Intune-specific remediation steps — things like setting up update rings, creating compliance policies, or deploying configuration profiles.`,
  [
    "Scans NVD (National Vulnerability Database) for relevant CVEs",
    "The screenshot shows CRITICAL CVSS 9 CVEs with EXPLOITED warnings",
    "AI generates Intune-specific remediation: update rings, compliance policies",
    "Status tracking: new → reviewed → remediated → fixed",
  ]
);

prompt("9.2 — CVE Monitor Panel UI",
  `Create a CVEMonitorPanel component at client/src/components/CVEMonitorPanel.tsx. The header should say "CVE Monitor" with a badge showing how many are new and a "Scan Now" button. Display five KPI cards at the top for Tracked, New, Critical, Exploited, and Fixed counts. Show a "Last scan" timestamp below. List each CVE as an expandable card showing a severity badge — red for CRITICAL, orange for HIGH, yellow for MEDIUM — the CVSS score like "CVSS 9", a red "EXPLOITED" warning badge if it's actively exploited, a relevance percentage and affected device count, and a status badge that's blue for new, gray for reviewed, or green for remediated. When you expand a CVE, show the full description, a recommended remediation box with the AI-generated Intune steps, the source, published date, and affected products. Add action buttons for "NVD Details" to open the NVD page, "Prepare Auto-Fix", "Mark Fixed", and "Dismiss".`,
  [
    "The screenshot shows 8 tracked, 1 new, 8 critical, 8 exploited, 5 fixed",
    "Expanded CVE shows remediation: Intune update rings, compliance policies",
    "Action buttons let you act directly: mark fixed, prepare auto-fix",
    "This turns CVE data into actionable Intune tasks",
  ]
);


// ═══════════════════════════════════════════════════════════
//  STEP 10: Device Timeline
// ═══════════════════════════════════════════════════════════
section("STEP 10", "Device Timeline", "See a device's full lifecycle from enrollment to today");

screenshot("TARGET: Device Timeline", "09-device-timeline.png", "Vertical timeline: enrollment, config, compliance, sync events");

prompt("10.1 — Device Timeline Backend",
  `Create a POST /api/device-timeline endpoint that accepts a device name, looks it up in the Graph API, and builds a timeline of everything that's happened to that device. Pull the enrollment date from enrolledDateTime, configuration profile assignments and their compliance status, compliance policy evaluations, the most recent sync events from lastSyncDateTime, and a current state snapshot showing compliance and encryption status. Return the device metadata with name, OS, model, and user, along with an array of timeline events where each event has a title, description, timestamp, and category. Use these categories: enrollment, configuration, compliance, sync, and status.`,
  [
    "Combines data from multiple Graph API sources into one timeline",
    "The screenshot shows 6 events from enrollment to current state",
    "Categories are color-coded: green=enrollment, gear=config, blue=compliance",
  ]
);

prompt("10.2 — Device Timeline UI",
  `Build a TimelinePanel component at client/src/components/TimelinePanel.tsx. The header should say "Device Lifecycle Timeline". Put a text field for the device name and a gold "Load" button at the top. After loading, show a device info card with the name, OS and version, manufacturer and model, and user email. Display an event count label. Render the events as a vertical timeline with colored category icons on the left — green for enrollment, a gear for configuration, blue for compliance, a refresh icon for sync, and a chart icon for status — and the event title, description, timestamp, and category label on the right. Draw a vertical connecting line between the events. Sort everything chronologically. If the user navigates here from another panel like Device Card, auto-fill the device name so they don't have to type it again.`,
  [
    "The screenshot shows NB-DUYGU-AI1 with 6 events on a vertical timeline",
    "Events: enrolled → config profile → compliance → sync → current state",
    "Auto-fill: clicking Timeline from Device Card pre-fills the device name",
  ]
);


// ═══════════════════════════════════════════════════════════
//  STEP 11: Polish — Sparkle + Navigation
// ═══════════════════════════════════════════════════════════
section("STEP 11", "Polish & Connect", "Golden sparkle effect + cross-panel navigation");

prompt("11.1 — Golden Sparkle Overlay",
  `Create a SparkleOverlay component at client/src/components/SparkleOverlay.tsx. It should render a canvas overlay with floating golden particles in #D4A017 and #F5C842. The particles should be small dots of varying sizes that float upward slowly with a gentle horizontal drift, fading in and out at random opacity. Make it non-interactive with pointer-events none so it never blocks clicks. Use requestAnimationFrame for smooth 60fps animation. Position it fixed behind all the content so it creates a subtle luxurious background effect across the whole app.`,
  [
    "Visible in all the screenshots — golden particles floating in the background",
    "Pure cosmetic effect but adds the \"007\" premium feel",
    "Non-interactive so it never blocks clicks or scrolling",
  ]
);

prompt("11.2 — Cross-Panel Navigation",
  `Create a navigation system that connects all the panels together. Add a Zustand store at navigationStore.ts with an activePanel state and a navigateToPanel function that can pass context like a device name, device ID, or query text between panels. In the useAgentStream hook, automatically navigate to the correct panel when the agent returns tool results — for example, get_managed_devices should go to the Data panel, get_device_card should go to the Device Card panel, and device_timeline should go to the Timeline panel. Wire up cross-panel links so clicking a device name in the Data Panel navigates to the Device Card, clicking the Timeline action navigates to the Timeline with that device name pre-filled, and the Device Card's Timeline button does the same. Define the tool-to-panel mapping in shared/types.ts as TOOL_TO_PANEL_TYPE.`,
  [
    "This is what makes the app feel integrated — everything links together",
    "Ask \"how many devices?\" → auto-navigates to Data panel with results",
    "Click a device name → jumps to Device Card → click Timeline → jumps again",
  ]
);


// ═══════════════════════════════════════════════════════════
//  DEMO FLOW
// ═══════════════════════════════════════════════════════════
content("Live Demo Script", [
  "Once everything is running, demo these prompts in the chat:",
  "",
  "1. \"How many managed devices do I have?\"",
  "   → Agent calls get_managed_devices → Data panel shows device table",
  "",
  "2. Click the device name (NB-DUYGU-AI1) in the table",
  "   → Navigates to Device Card with full hardware/security overview",
  "",
  "3. \"Can you reboot NB-DUYGU-AI1?\"",
  "   → Agent calls restart_device → confirms with security token",
  "",
  "4. Open Query Builder → type \"All compliant corporate devices\" → Search",
  "   → Shows generated OData filter + matching devices",
  "",
  "5. Open Remediation → click \"Restart Intune Management Extension\"",
  "   → AI generates detection + remediation scripts → Deploy button",
]);

content("Live Demo Script (continued)", [
  "6. Open Analytics",
  "   → Shows cost per request, token usage, tool call breakdown",
  "   → Point out: \"All of the queries we just ran are tracked here\"",
  "",
  "7. Open App Health → click Refresh",
  "   → Shows all deployed apps with detection status",
  "",
  "8. Open CVE Monitor → click Scan Now",
  "   → Scans NVD for relevant vulnerabilities",
  "   → Expand a CVE to show AI-generated remediation steps",
  "",
  "9. Open Device Timeline → type device name → Load",
  "   → Shows lifecycle from enrollment to today",
  "",
  "10. Point out the golden sparkle overlay ✨",
  "    → \"Even the visual effects were vibe-coded\"",
]);


// ═══════════════════════════════════════════════════════════
//  CLOSING
// ═══════════════════════════════════════════════════════════
content("What You Just Built", [
  "✅ TypeScript monorepo (3 workspaces: shared, server, client)",
  "✅ Express server connected to Microsoft Graph API",
  "✅ Azure OpenAI agent with function calling",
  "✅ React chat interface with Tailwind dark theme",
  "✅ Alerts dashboard with automated health checks",
  "✅ Device table with compliance badges and quick actions",
  "✅ Device card with hardware, security, and storage details",
  "✅ Natural language query builder with OData generation",
  "✅ AI-powered remediation script generator + Intune deployment",
  "✅ Analytics dashboard tracking cost, tokens, and tool usage",
  "✅ App deployment health monitor",
  "✅ CVE vulnerability tracker with AI remediation guidance",
  "✅ Device lifecycle timeline",
  "✅ Golden sparkle overlay ✨",
  "",
  "All built with Copilot prompts — no manual code required!",
]);

twoCol("Where To Go From Here",
  "More Tools = More Power",
  [
    "\"Add a tool to list all mobile apps\"",
    "\"Add a tool to wipe a device (with confirmation!)\"",
    "\"Add a Conditional Access policy viewer\"",
    "\"Add Autopilot device registration\"",
    "\"Add a policy builder — create policies from plain English\"",
    "\"Add a security posture scoring system\"",
  ],
  "Production-Ready",
  [
    "\"Add rate limiting and request throttling\"",
    "\"Add OData filter sanitization to prevent injection\"",
    "\"Add an audit log for all tool executions\"",
    "\"Add RAG with Microsoft Learn documentation\"",
    "\"Add a learning engine that improves from feedback\"",
    "\"Add SSE streaming for real-time agent updates\"",
  ]
);

// ─── Final Slide ──────────────────────────────────────────
const fin = pptx.addSlide(); bg(fin);
fin.addShape(pptx.ShapeType.rect, { x: 0, y: 3.4, w: 13.33, h: 0.06, fill: { color: C.gold } });
fin.addText("Thank You", { x: 0.8, y: 1.2, w: 11.7, h: 1.2, fontSize: 48, fontFace: "Georgia", color: C.white, bold: true, align: "center" });
fin.addText("You're now licensed to vibe code.", { x: 0.8, y: 2.5, w: 11.7, h: 0.6, fontSize: 18, fontFace: "Georgia", color: C.gold, italic: true, align: "center" });
fin.addText([
  { text: "GitHub: ", options: { fontSize: 15, color: C.gray } },
  { text: "github.com/KenGoossens/Intune007", options: { fontSize: 15, color: C.goldLight, bold: true } },
], { x: 0.8, y: 4.0, w: 11.7, h: 0.5, align: "center" });
fin.addText([
  { text: "Full source code ", options: { fontSize: 13, color: C.gray } },
  { text: "(73 tools, 31 panels, complete project)", options: { fontSize: 13, color: C.grayDark } },
], { x: 0.8, y: 4.6, w: 11.7, h: 0.5, align: "center" });
fin.addText([
  { text: "Ken Goossens  ·  ", options: { fontSize: 14, color: C.grayDark } },
  { text: "@KenGoossens", options: { fontSize: 14, color: C.gray } },
], { x: 0.8, y: 5.5, w: 11.7, h: 0.5, align: "center" });
fin.addText("Questions?", { x: 0.8, y: 6.2, w: 11.7, h: 0.5, fontSize: 20, fontFace: "Georgia", color: C.gold, align: "center" });


// ─── Generate ─────────────────────────────────────────────
const out = "Intune007_Session_Prompts.pptx";
pptx.writeFile({ fileName: out }).then(() => {
  console.log(`\n  ✅ Presentation generated: ${out}`);
  console.log(`  📊 ${pptx.slides.length} slides created\n`);
});
