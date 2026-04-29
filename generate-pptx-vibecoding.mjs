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
pptx.subject = "Vibe Coding an AI-Powered Intune Agent";
pptx.title = "Vibe Code Your Own AI-Powered Intune Agent — A Workshop for IT Admins";
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
  s.addText(`STEP ${num}`, { x: 1.0, y: 1.5, w: 11, h: 0.6, fontSize: 16, fontFace: "Calibri", color: C.gold, bold: true });
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
  // "Say this to Copilot" badge
  s.addShape(pptx.ShapeType.roundRect, { x: 0.6, y: 1.3, w: 3.2, h: 0.45, rectRadius: 0.1, fill: { color: C.gold } });
  s.addText("💬 Say this to Copilot:", { x: 0.6, y: 1.3, w: 3.2, h: 0.45, fontSize: 12, fontFace: "Calibri", color: C.bg, bold: true, align: "center" });
  // Prompt box
  s.addShape(pptx.ShapeType.roundRect, { x: 0.5, y: 2.0, w: 12.33, h: 2.2, rectRadius: 0.15, fill: { color: C.code }, line: { color: C.gold, width: 1.5 } });
  s.addText(promptText, { x: 0.8, y: 2.1, w: 11.8, h: 2.0, fontSize: 15, fontFace: "Cascadia Code", color: C.goldLight, valign: "top", lineSpacingMultiple: 1.3 });
  // Explanation
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

// ═══════════════════════════════════════════════════════════
// SLIDES
// ═══════════════════════════════════════════════════════════

// ─── 1. Title ──────────────────────────────────────────────
const s1 = titleSlide(
  "Vibe Code Your Own\nAI-Powered Intune Agent",
  "A 90-Minute Workshop for IT Admins — No Coding Experience Required",
  "Your license to manage."
);
s1.addText("Ken Goossens  ·  IT Conference 2026", {
  x: 0.8, y: 6.2, w: 11.7, h: 0.5, fontSize: 14, fontFace: "Calibri", color: C.grayDark, align: "center",
});

// ─── 2. What is Vibe Coding ────────────────────────────────
content("What is Vibe Coding?", [
  "Vibe coding = describing WHAT you want, and AI writes the code for you",
  "You don't need to know TypeScript, React, or Node.js",
  "You describe intent in plain English — GitHub Copilot generates the code",
  "You review, accept, and run — the AI handles the syntax",
  "",
  "Think of it like giving instructions to a very smart intern:",
  "   \"Create a server that connects to Microsoft Graph API\"",
  "   \"Build a chat interface that sends messages to the backend\"",
  "   \"Add a tool that lists all non-compliant devices\"",
  "",
  "Today: we'll vibe-code a working Intune management tool in 90 minutes",
]);

// ─── 3. What We're Building ────────────────────────────────
content("What We're Building Today", [
  "An AI chatbot that manages Microsoft Intune through natural language",
  "",
  "You type: \"Show me all non-compliant Windows devices\"",
  "The AI: queries the Microsoft Graph API and shows results in a table",
  "",
  "MVP Features we'll build:",
  "   ✅ Chat interface (type questions, get answers)",
  "   ✅ Device queries (list devices, filter by OS/compliance/name)",
  "   ✅ Compliance policies (view all policies and their status)",
  "   ✅ Device actions (sync a device, restart a device)",
  "   ✅ Alerts dashboard (automated health monitoring)",
  "",
  "All in ~90 minutes. No prior coding experience needed.",
]);

// ─── 4. Architecture (Simple) ──────────────────────────────
const arch = pptx.addSlide(); bg(arch);
arch.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.9, fill: { color: C.bgLight } });
arch.addShape(pptx.ShapeType.rect, { x: 0, y: 0.88, w: 13.33, h: 0.04, fill: { color: C.gold } });
arch.addText("How It Works — The Big Picture", { x: 0.6, y: 0.1, w: 12, h: 0.7, fontSize: 22, fontFace: "Georgia", color: C.gold, bold: true });

// Step labels above the flow
arch.addText("① You ask a question", { x: 0.3, y: 1.2, w: 3.2, h: 0.4, fontSize: 12, fontFace: "Calibri", color: C.goldLight, align: "center" });
arch.addText("② AI decides what to do", { x: 3.8, y: 1.2, w: 3.2, h: 0.4, fontSize: 12, fontFace: "Calibri", color: C.goldLight, align: "center" });
arch.addText("③ Fetches real data", { x: 7.3, y: 1.2, w: 3.2, h: 0.4, fontSize: 12, fontFace: "Calibri", color: C.goldLight, align: "center" });
arch.addText("④ Your tenant", { x: 10.8, y: 1.2, w: 2.2, h: 0.4, fontSize: 12, fontFace: "Calibri", color: C.green, align: "center" });

// 4 boxes — request flow
const boxes = [
  { x: 0.5, y: 1.8, w: 2.8, h: 1.6, label: "You", desc: "Type a question\nin the chat box", fill: "1a2744", border: C.gold },
  { x: 4.0, y: 1.8, w: 2.8, h: 1.6, label: "AI Brain", desc: "Azure OpenAI\npicks the right tool", fill: "1a2744", border: C.gold },
  { x: 7.5, y: 1.8, w: 2.8, h: 1.6, label: "Graph API", desc: "Calls Microsoft\nGraph endpoints", fill: "1a2744", border: C.gold },
  { x: 11.0, y: 1.8, w: 1.8, h: 1.6, label: "Intune", desc: "Devices, policies\napps, groups", fill: "1a2744", border: C.green },
];
boxes.forEach(b => {
  arch.addShape(pptx.ShapeType.roundRect, { x: b.x, y: b.y, w: b.w, h: b.h, rectRadius: 0.15, fill: { color: b.fill }, line: { color: b.border, width: 1.5 } });
  arch.addText(b.label, { x: b.x, y: b.y + 0.15, w: b.w, h: 0.45, fontSize: 15, fontFace: "Georgia", color: C.gold, bold: true, align: "center" });
  arch.addText(b.desc, { x: b.x + 0.1, y: b.y + 0.65, w: b.w - 0.2, h: 0.8, fontSize: 10.5, fontFace: "Calibri", color: C.gray, align: "center" });
});

// Forward arrows (request) — top
[{ x: 3.3, y: 2.55 }, { x: 6.8, y: 2.55 }, { x: 10.3, y: 2.55 }].forEach(a => {
  arch.addShape(pptx.ShapeType.rect, { x: a.x, y: a.y, w: 0.7, h: 0.04, fill: { color: C.gold } });
});
arch.addText("→", { x: 3.35, y: 2.3, w: 0.6, h: 0.4, fontSize: 16, color: C.gold, align: "center" });
arch.addText("→", { x: 6.85, y: 2.3, w: 0.6, h: 0.4, fontSize: 16, color: C.gold, align: "center" });
arch.addText("→", { x: 10.35, y: 2.3, w: 0.6, h: 0.4, fontSize: 16, color: C.gold, align: "center" });

// Return flow section
arch.addShape(pptx.ShapeType.rect, { x: 0.5, y: 3.8, w: 12.3, h: 0.04, fill: { color: C.green } });
arch.addText("⑤ Data flows back", { x: 0.5, y: 3.9, w: 12.3, h: 0.4, fontSize: 12, fontFace: "Calibri", color: C.green, align: "center" });

// Return boxes
const retBoxes = [
  { x: 0.5, y: 4.5, w: 2.8, h: 1.5, label: "📊 Output", desc: "Results shown as\ntables, cards, and\nAI summary text", fill: "1a2744", border: C.green },
  { x: 4.0, y: 4.5, w: 2.8, h: 1.5, label: "🤖 AI Summarizes", desc: "\"Found 12 non-compliant\ndevices. 8 are Windows,\n4 are iOS...\"", fill: "1a2744", border: C.green },
  { x: 7.5, y: 4.5, w: 2.8, h: 1.5, label: "📦 Raw Data", desc: "JSON device objects\nwith all properties", fill: "1a2744", border: C.green },
  { x: 11.0, y: 4.5, w: 1.8, h: 1.5, label: "✅ Done", desc: "Real tenant\ndata returned", fill: "1a2744", border: C.green },
];
retBoxes.forEach(b => {
  arch.addShape(pptx.ShapeType.roundRect, { x: b.x, y: b.y, w: b.w, h: b.h, rectRadius: 0.15, fill: { color: b.fill }, line: { color: b.border, width: 1 } });
  arch.addText(b.label, { x: b.x, y: b.y + 0.1, w: b.w, h: 0.4, fontSize: 13, fontFace: "Georgia", color: C.green, bold: true, align: "center" });
  arch.addText(b.desc, { x: b.x + 0.1, y: b.y + 0.55, w: b.w - 0.2, h: 0.85, fontSize: 10, fontFace: "Calibri", color: C.gray, align: "center" });
});

// Return arrows (response) — bottom
[{ x: 3.35 }, { x: 6.85 }, { x: 10.35 }].forEach(a => {
  arch.addText("←", { x: a.x, y: 4.9, w: 0.6, h: 0.4, fontSize: 16, color: C.green, align: "center" });
});

arch.addText("Request →    goes right  |  ← Response    comes back left", { x: 0.5, y: 6.4, w: 12, h: 0.5, fontSize: 13, fontFace: "Calibri", color: C.grayDark, align: "center" });

// ─── 5. Prerequisites ─────────────────────────────────────
section("0", "Before We Start", "Things you should have ready");

twoCol("Prerequisites Checklist",
  "On Your Laptop",
  [
    "✅ VS Code installed (free: code.visualstudio.com)",
    "✅ GitHub Copilot extension (paid, or free trial)",
    "✅ Node.js 18+ installed (nodejs.org)",
    "✅ A terminal/command prompt",
  ],
  "In Azure",
  [
    "✅ An Azure subscription",
    "✅ Azure OpenAI resource with a GPT model deployed",
    "✅ Entra ID App Registration with Intune permissions",
    "✅ Client ID, Client Secret, Tenant ID noted down",
    "  (I'll show the permissions on the next slide)",
  ]
);

content("Required Entra ID Permissions", [
  "Your app registration needs these Application permissions (with admin consent):",
  "",
  "   DeviceManagementManagedDevices.ReadWrite.All",
  "   DeviceManagementConfiguration.ReadWrite.All",
  "   DeviceManagementApps.Read.All",
  "   Directory.Read.All",
  "   Group.Read.All",
  "",
  "Go to: Azure Portal → Entra ID → App registrations → Your app → API permissions",
  "Click \"Grant admin consent\" after adding all permissions",
  "",
  "⚠️ Without admin consent, the tool won't be able to access Intune data",
], { fs: 16 });

// ═══════════════════════════════════════════════════════════
// STEP 1: Project Setup
// ═══════════════════════════════════════════════════════════
section("1", "Create the Project", "Open VS Code, open Copilot Chat, and start talking");

prompt("Create the Monorepo Structure", 
  `Create a new TypeScript monorepo project called "intune-agent" with npm workspaces.\n\nIt should have 3 folders:\n- shared/ (shared TypeScript types)\n- server/ (Express backend, port 3001)\n- client/ (React frontend with Vite, port 5173)\n\nAdd a root package.json with workspaces config and a "dev" script\nthat runs server and client concurrently.\n\nInitialize all package.json files and tsconfig files.`,
  [
    "Copilot will create all the folders and config files for you",
    "It sets up a monorepo — 3 mini-projects that share code",
    "The 'dev' script starts everything with one command",
    "You don't need to understand TypeScript — Copilot handles that",
  ]
);

tip("Vibe Coding Tip: Be Specific",
  "The more detail you give Copilot, the better the result. Don't say \"make a project\" — say exactly what you want: names, ports, tools, structure.",
  [
    "Bad: \"Create a project\"",
    "Good: \"Create a TypeScript monorepo with npm workspaces, 3 folders (shared, server, client), Express on port 3001, React with Vite on port 5173\"",
    "Include tech choices, folder names, and port numbers",
    "If the result isn't right, just say \"That's not what I meant, change X to Y\"",
  ]
);

// ═══════════════════════════════════════════════════════════
// STEP 2: Server + Graph Connection
// ═══════════════════════════════════════════════════════════
section("2", "Connect to Microsoft Graph", "Make the server talk to your Intune tenant");

prompt("Create the Environment Config",
  `In server/src/config.ts, create an environment config module.\n\nLoad these from a .env file using dotenv:\n- AZURE_TENANT_ID\n- AZURE_CLIENT_ID\n- AZURE_CLIENT_SECRET\n- AZURE_OPENAI_ENDPOINT\n- AZURE_OPENAI_API_KEY\n- AZURE_OPENAI_DEPLOYMENT\n- PORT (default 3001)\n\nAdd a validateConfig() function that checks all required vars exist.`,
  [
    "This is where your Azure secrets live — the .env file is never committed to git",
    "Create server/.env and paste in your actual values",
    "validateConfig() prevents the server from starting with missing config",
  ]
);

prompt("Create the Graph API Client",
  `In server/src/graph/client.ts, create a Microsoft Graph API client.\n\nUse @azure/identity ClientSecretCredential for authentication.\nUse @microsoft/microsoft-graph-client with the auth provider.\n\nCreate a lazy singleton getGraphClient() function.\nAlso create a fetchWithPagination helper that follows @odata.nextLink pages.\n\nInstall the required npm packages in the server workspace.`,
  [
    "This module handles authentication — your app proves who it is to Microsoft",
    "The lazy singleton means it only creates the connection once and reuses it",
    "The pagination helper handles large result sets (Intune returns 100 items per page)",
  ]
);

prompt("Create Device Query Functions",
  `In server/src/graph/devices.ts, create two functions:\n\n1. getManagedDevices(options?) — lists devices with optional OData $filter and $top\n   - Use the beta API endpoint: /deviceManagement/managedDevices\n   - Select these fields: id, deviceName, operatingSystem, osVersion,\n     complianceState, lastSyncDateTime, userPrincipalName, model,\n     manufacturer, serialNumber, isEncrypted\n\n2. getDeviceDetails(deviceId) — get a single device by ID with full details`,
  [
    "These functions talk to Microsoft Graph to get real Intune data",
    "The beta API has more fields than the v1.0 API",
    "OData filters let you query like: complianceState eq 'noncompliant'",
  ]
);

// ═══════════════════════════════════════════════════════════
// STEP 3: AI Agent
// ═══════════════════════════════════════════════════════════
section("3", "Add the AI Brain", "Connect Azure OpenAI with function calling");

content("How AI Function Calling Works", [
  "The AI doesn't call APIs directly — it suggests which tool to use",
  "",
  "1. You ask: \"Show me non-compliant devices\"",
  "2. We send your question + a list of available tools to Azure OpenAI",
  "3. The AI responds: \"Call get_managed_devices with filter = noncompliant\"",
  "4. OUR code executes the tool (calls Graph API)",
  "5. We send the results back to the AI",
  "6. The AI writes a nice summary: \"Found 12 non-compliant devices...\"",
  "",
  "The AI is the brain. Our code is the hands.",
  "We control what tools exist and what they can do.",
]);

prompt("Create Tool Definitions",
  `In server/src/agent/tools.ts, create OpenAI function-calling tool definitions.\n\nDefine these 5 tools:\n\n1. get_managed_devices — list devices with optional OData filter and top\n2. get_device_details — get one device by ID\n3. get_compliance_policies — list compliance policies\n4. sync_device — trigger a device sync by device ID\n5. restart_device — restart a device by device ID\n\nUse the ChatCompletionTool type from the openai package.\nEach tool needs: name, description, and parameters (JSON Schema).`,
  [
    "These definitions tell the AI what tools are available",
    "The AI reads the descriptions to decide which tool to call",
    "Good descriptions = the AI makes better decisions",
    "Parameters tell the AI what arguments each tool accepts",
  ]
);

prompt("Create the Tool Executor",
  `In server/src/agent/executor.ts, create an executeTool function.\n\nIt takes a tool name and arguments (JSON string), and runs the actual code:\n\n- get_managed_devices → call getManagedDevices() from graph/devices\n- get_device_details → call getDeviceDetails() from graph/devices\n- get_compliance_policies → call Graph API /deviceManagement/deviceCompliancePolicies\n- sync_device → POST to /managedDevices/{id}/syncDevice\n- restart_device → POST to /managedDevices/{id}/rebootNow\n\nReturn { data: [...], totalCount: number } for each tool.\nWrap everything in try/catch and return errors gracefully.`,
  [
    "This is the bridge between what the AI wants and what actually happens",
    "Each case in the switch statement calls a different Graph API",
    "The try/catch prevents one error from crashing everything",
  ]
);

prompt("Create the Agent Loop",
  `In server/src/agent/agent.ts, create the main AI agent loop.\n\nCreate a runAgentLoop function that:\n1. Takes a user message and conversation history\n2. Creates an Azure OpenAI client using the config\n3. Sends messages + tool definitions to the AI\n4. If the AI wants to call a tool: execute it, send results back, repeat\n5. If the AI generates text: that's the final response\n6. Max 10 iterations to prevent infinite loops\n\nUse a system prompt that says: "You are an Intune administration assistant.\nUse the provided tools to query Microsoft Intune via Graph API.\nAlways use tools to fetch real data — never make up information."\n\nReturn the final text response and all tool results.\n\n⚠️ Important: Do NOT use the 'temperature' parameter — some Azure OpenAI\nmodels don't support it. Use max_completion_tokens instead of max_tokens.`,
  [
    "This is the heart of the app — the AI loop that processes your questions",
    "It can call multiple tools in sequence (e.g., get device, then sync it)",
    "The system prompt gives the AI its personality and rules",
    "The 10-iteration limit prevents runaway loops",
  ]
);

// ═══════════════════════════════════════════════════════════
// STEP 4: Chat API Route
// ═══════════════════════════════════════════════════════════
section("4", "Create the Chat API", "One endpoint that handles everything");

prompt("Create the Express Server & Chat Route",
  `In server/src/index.ts, create an Express server that:\n- Uses CORS (allow http://localhost:5173)\n- Parses JSON body\n- Has a POST /api/chat route\n- Has a GET /api/health route\n- Listens on PORT from config\n\nThe POST /api/chat route should:\n- Accept { message: string, history: array }\n- Call runAgentLoop with the message and history\n- Return { response: string, toolResults: array }\n\nAlso install express, cors, and their TypeScript types.`,
  [
    "This creates a web server that the chat interface will talk to",
    "CORS allows the browser to call the server (they're on different ports)",
    "POST /api/chat is the only endpoint the AI chat needs",
    "The response includes both the AI's text AND any data it fetched",
  ]
);

tip("Checkpoint: Test the Server!",
  "Before building the UI, let's make sure the server works. Open a terminal and run the server, then test with a simple curl command.",
  [
    "Terminal: cd server && npx tsx src/index.ts",
    "You should see: \"Server running on port 3001\"",
    "Test health: curl http://localhost:3001/api/health",
    "If you get errors, ask Copilot: \"I'm getting this error: [paste error]. Fix it.\"",
    "Common issues: missing .env values, missing npm packages, typos in import paths",
  ]
);

// ═══════════════════════════════════════════════════════════
// STEP 5: React Frontend
// ═══════════════════════════════════════════════════════════
section("5", "Build the Chat Interface", "A React UI that talks to your server");

prompt("Create the React Chat UI",
  `In client/src/, create a React chat application with Tailwind CSS.\n\nBuild these components:\n\n1. ChatPanel — main chat interface with:\n   - Message list showing user and assistant messages\n   - Input box at the bottom with send button\n   - POST to /api/chat when user sends a message\n   - Show loading state while waiting for response\n   - Dark theme (bg-gray-950, text-white)\n\n2. DeviceTable — shows device data when available:\n   - Columns: Device Name, OS, Compliance, Last Sync\n   - Color-coded compliance badges (green=compliant, red=noncompliant)\n\n3. App — main layout with:\n   - Left side: DeviceTable (shows data when agent fetches devices)\n   - Right side: ChatPanel (always visible)\n   - Header with title "Intune Agent"\n\nUse Tailwind for styling. Install react, react-dom, tailwindcss, vite.\nStore chat messages and tool results in React state.\nProxy /api requests to localhost:3001 in vite.config.ts.`,
  [
    "This creates the entire user interface in one go",
    "Tailwind CSS = styling with class names, no CSS files needed",
    "The proxy in Vite config routes API calls to the server automatically",
    "When the agent fetches devices, they appear in the table automatically",
  ]
);

tip("Vibe Coding Tip: Iterate, Don't Restart",
  "If the UI doesn't look right, don't start over! Just tell Copilot what to change.",
  [
    "\"Make the chat messages have rounded corners and more padding\"",
    "\"The send button should be gold colored (#D4A017)\"",
    "\"Add a typing indicator when waiting for the AI response\"",
    "\"The compliance badge should be red for noncompliant and green for compliant\"",
    "Each small change takes seconds — vibe coding is about rapid iteration!",
  ]
);

// ═══════════════════════════════════════════════════════════
// STEP 6: Run it!
// ═══════════════════════════════════════════════════════════
section("6", "Run Your MVP! 🚀", "Start everything and ask your first question");

content("Starting the Application", [
  "Open two terminals in VS Code (or use the dev script):",
  "",
  "Terminal 1 (Server):",
  "   cd server && npx tsx src/index.ts",
  "   → \"Server running on port 3001\"",
  "",
  "Terminal 2 (Client):",
  "   cd client && npx vite",
  "   → \"Local: http://localhost:5173\"",
  "",
  "Open http://localhost:5173 in your browser",
  "",
  "Try these prompts:",
  "   \"Show me all managed devices\"",
  "   \"Which devices are non-compliant?\"",
  "   \"List all Windows 11 devices\"",
  "   \"Show me compliance policies\"",
  "   \"Sync device NB-LAPTOP-001\"",
]);

// ═══════════════════════════════════════════════════════════
// STEP 7: Add Alerts
// ═══════════════════════════════════════════════════════════
section("7", "Add Automated Alerts", "A background health monitor that runs on a schedule");

prompt("Create an Alert Checker",
  `Create server/src/alerts/checks.ts with a function that checks for non-compliant devices.\n\nThe function should:\n- Call getManagedDevices with filter "complianceState eq 'noncompliant'"\n- If any are found, create an alert object with: id, title, severity (critical/warning/info),\n  message, deviceCount, timestamp\n- Store alerts in an in-memory array\n\nCreate server/src/alerts/scheduler.ts that:\n- Runs the non-compliant check every 15 minutes\n- Exposes a getAlerts() function and a start() function\n\nCreate a GET /api/alerts route that returns current alerts.\n\nCreate a simple AlertsPanel component in the client that:\n- Fetches alerts from /api/alerts every 60 seconds\n- Shows them as colored cards (red for critical, yellow for warning)\n- Shows device count and timestamp`,
  [
    "This runs in the background — no user action needed",
    "Every 15 minutes, it checks your tenant for problems",
    "Non-compliant devices = security risk = critical alert",
    "The UI auto-refreshes to show new alerts",
    "Later you can add more checks: stale devices, failed app installs, etc.",
  ]
);

// ═══════════════════════════════════════════════════════════
// STEP 8: Polish
// ═══════════════════════════════════════════════════════════
section("8", "Quick Wins to Polish It", "Small prompts, big impact");

content("Polish Prompts — Say These to Copilot", [
  "Each of these is a single prompt that improves the app:",
  "",
  "🎨 Branding:",
  "   \"Change the theme to dark navy (#0F172A) with gold (#D4A017) accents\"",
  "",
  "📊 Better Data:",
  "   \"When the agent fetches devices, show them in a sortable data table",
  "    with columns for Name, OS, Compliance, Last Sync, and User\"",
  "",
  "⚡ Loading States:",
  "   \"Add a pulsing gold dot animation while the agent is thinking\"",
  "",
  "🔒 Safety:",
  "   \"Add a confirmation step before device actions like sync and restart —",
  "    show what will happen and ask the user to confirm\"",
  "",
  "Each one takes < 1 minute to implement with vibe coding!",
]);

// ═══════════════════════════════════════════════════════════
// What You Built
// ═══════════════════════════════════════════════════════════
content("What You Just Built in 90 Minutes", [
  "✅ A TypeScript monorepo (3 workspaces: shared, server, client)",
  "✅ Express server connected to Microsoft Graph API",
  "✅ Azure OpenAI integration with function calling (5 tools)",
  "✅ React chat interface with Tailwind CSS dark theme",
  "✅ Device query and display with compliance color coding",
  "✅ Device actions (sync, restart) via natural language",
  "✅ Automated alert monitoring for non-compliant devices",
  "",
  "All without writing a single line of code manually!",
  "",
  "The AI wrote ~2,000+ lines of TypeScript across 15+ files.",
  "You described what you wanted. Copilot built it.",
]);

// ─── Where To Go Next ─────────────────────────────────────
twoCol("Where To Go From Here",
  "More Tools = More Power",
  [
    "\"Add a tool to list all mobile apps\"",
    "\"Add a tool to view compliance policy details\"",
    "\"Add a tool to wipe a device (with confirmation!)\"",
    "\"Add a Conditional Access policy viewer\"",
    "\"Add Autopilot device registration\"",
    "\"Add a policy builder that creates compliance policies from plain English\"",
  ],
  "Production Features",
  [
    "\"Add Helmet and rate limiting for security\"",
    "\"Add OData filter sanitization to prevent injection\"",
    "\"Add an audit log for all tool executions\"",
    "\"Add SQLite to persist analytics and history\"",
    "\"Add RAG with Microsoft Intune documentation\"",
    "\"Add a learning engine that improves from user feedback\"",
  ]
);

content("The Vibe Coding Workflow", [
  "1.  Describe what you want in plain English",
  "2.  Copilot generates the code",
  "3.  Review: does it look reasonable? Accept it.",
  "4.  Run it: does it work? If not, paste the error back to Copilot",
  "5.  Iterate: \"Make it do X differently\" or \"Add Y feature\"",
  "",
  "That's it. That's vibe coding.",
  "",
  "You don't need to understand every line.",
  "You need to understand what you want it to do.",
  "",
  "As IT admins, you already know Intune inside out.",
  "That domain knowledge IS the most important part.",
  "The AI just translates it into code.",
]);

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
const out = "Intune007_VibeCoding_Workshop.pptx";
pptx.writeFile({ fileName: out }).then(() => {
  console.log(`\n  ✅ Presentation generated: ${out}`);
  console.log(`  📊 ${pptx.slides.length} slides created\n`);
});
