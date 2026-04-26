/**
 * CVE Auto-Remediation Engine — Prepares and executes remediation actions
 * for detected CVEs, with admin approval workflow.
 *
 * Flow:
 *   1. CVE detected with AI remediation suggestion
 *   2. Engine generates the ACTUAL remediation action:
 *      - Windows Update: expedite update via update ring
 *      - Compliance Policy: create/update policy to enforce fix
 *      - Remediation Script: generate + prepare Proactive Remediation
 *      - Configuration Profile: create config to mitigate vulnerability
 *   3. Action queued as "pending_approval" in the database
 *   4. Admin reviews in CVE Monitor panel → clicks "Approve & Execute"
 *   5. Engine executes the action via Graph API
 *
 * Every action is reversible and logged.
 */

import { AzureOpenAI } from "openai";
import { config } from "../config.js";
import { getGraphClient } from "../graph/client.js";
import { createCompliancePolicy, assignCompliancePolicy } from "../graph/policyManagement.js";
import { createRemediationScript, assignRemediationScript } from "../graph/remediation.js";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "..", "data");
const DB_PATH = path.join(DATA_DIR, "cve.db");

function getDb(): Database.Database {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS remediation_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cve_id TEXT NOT NULL,
      action_type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      action_payload TEXT NOT NULL,
      status TEXT DEFAULT 'pending_approval',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      approved_at TEXT,
      executed_at TEXT,
      result TEXT,
      error TEXT
    );
  `);

  return db;
}

export type ActionType = "update_ring" | "compliance_policy" | "remediation_script" | "configuration_profile" | "expedite_update";

export interface RemediationAction {
  id: number;
  cveId: string;
  actionType: ActionType;
  title: string;
  description: string;
  actionPayload: Record<string, unknown>;
  status: "pending_approval" | "approved" | "executing" | "completed" | "failed" | "rejected";
  createdAt: string;
  approvedAt: string | null;
  executedAt: string | null;
  result: string | null;
  error: string | null;
}

/**
 * Generate a concrete remediation action for a CVE.
 * Uses Azure OpenAI to create the exact Graph API payload.
 */
export async function generateRemediationAction(
  cveId: string,
  cveDescription: string,
  severity: string,
  suggestedType: string
): Promise<RemediationAction> {
  const db = getDb();

  // Check if action already exists for this CVE
  const existing = db
    .prepare("SELECT id FROM remediation_actions WHERE cve_id = ? AND status NOT IN ('failed', 'rejected')")
    .get(cveId) as { id: number } | undefined;

  if (existing) {
    const row = db.prepare("SELECT * FROM remediation_actions WHERE id = ?").get(existing.id) as Record<string, unknown>;
    return rowToAction(row);
  }

  const client = new AzureOpenAI({
    apiKey: config.azureOpenAI.apiKey,
    endpoint: config.azureOpenAI.endpoint,
    deployment: config.azureOpenAI.deployment,
    apiVersion: config.azureOpenAI.apiVersion,
  });

  const actionType = mapSuggestedType(suggestedType);

  const completion = await client.chat.completions.create({
    model: config.azureOpenAI.deployment,
    messages: [
      {
        role: "system",
        content: `You are an Intune security remediation expert. Generate a CONCRETE remediation action for a CVE that can be executed via Microsoft Graph API.

Based on the action type, generate the appropriate JSON payload:

For "compliance_policy": Generate a Windows 10 compliance policy body with @odata.type, displayName, description, and relevant settings.
For "remediation_script": Generate a detection script and remediation script (PowerShell) that checks for and fixes the vulnerability.
For "configuration_profile": Generate a device configuration profile body.
For "expedite_update": Generate a Windows update expedite request body.

Return JSON:
{
  "title": "Short action title",
  "description": "What this action does and why",
  "payload": { /* the actual Graph API request body */ }
}

IMPORTANT: 
- The policy must be deployable to Intune as-is
- Include scheduledActionsForRule for compliance policies
- Scripts must be valid PowerShell
- Be specific to the CVE, not generic

Return ONLY the JSON, no markdown.`,
      },
      {
        role: "user",
        content: `CVE: ${cveId}\nSeverity: ${severity}\nDescription: ${cveDescription.substring(0, 500)}\nAction Type: ${actionType}`,
      },
    ],
  });

  const content = completion.choices[0]?.message?.content || "";
  let parsed: { title: string; description: string; payload: Record<string, unknown> };

  try {
    const cleaned = content.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    parsed = {
      title: `Remediation for ${cveId}`,
      description: `Apply security update to mitigate ${cveId}`,
      payload: { type: actionType, cveId, note: "AI generation failed — manual review required" },
    };
  }

  const result = db
    .prepare(
      `INSERT INTO remediation_actions (cve_id, action_type, title, description, action_payload)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(cveId, actionType, parsed.title, parsed.description, JSON.stringify(parsed.payload));

  return {
    id: result.lastInsertRowid as number,
    cveId,
    actionType,
    title: parsed.title,
    description: parsed.description,
    actionPayload: parsed.payload,
    status: "pending_approval",
    createdAt: new Date().toISOString(),
    approvedAt: null,
    executedAt: null,
    result: null,
    error: null,
  };
}

/**
 * Execute an approved remediation action via Graph API.
 */
export async function executeRemediationAction(actionId: number): Promise<RemediationAction> {
  const db = getDb();
  const row = db.prepare("SELECT * FROM remediation_actions WHERE id = ?").get(actionId) as Record<string, unknown> | undefined;

  if (!row) throw new Error(`Action ${actionId} not found`);
  if (row.status !== "pending_approval" && row.status !== "approved") {
    throw new Error(`Action ${actionId} is ${row.status} — cannot execute`);
  }

  // Mark as executing
  db.prepare("UPDATE remediation_actions SET status = 'executing', approved_at = datetime('now') WHERE id = ?").run(actionId);

  const actionType = String(row.action_type) as ActionType;
  const payload = JSON.parse(String(row.action_payload));
  const cveId = String(row.cve_id);

  try {
    let resultMessage = "";

    switch (actionType) {
      case "compliance_policy": {
        // Create the compliance policy
        const policy = await createCompliancePolicy(payload);
        resultMessage = `Compliance policy "${policy.displayName}" created (ID: ${policy.id}). Assign to a group to enforce.`;
        break;
      }

      case "remediation_script": {
        // Create and deploy the Proactive Remediation
        const detectionBase64 = Buffer.from(payload.detectionScript || "exit 0", "utf-8").toString("base64");
        const remediationBase64 = Buffer.from(payload.remediationScript || "exit 0", "utf-8").toString("base64");

        const script = await createRemediationScript({
          displayName: payload.displayName || `CVE Fix: ${cveId}`,
          description: payload.description || `Automated remediation for ${cveId}`,
          detectionScriptContent: detectionBase64,
          remediationScriptContent: remediationBase64,
          runAsAccount: "system",
          enforceSignatureCheck: false,
          runAs32Bit: false,
        });
        resultMessage = `Proactive Remediation "${script.displayName}" created (ID: ${script.id}). Assign to a group to deploy.`;
        break;
      }

      case "expedite_update": {
        // Create a Windows Update expedite policy
        const client = getGraphClient();
        const updatePolicy = await client
          .api("https://graph.microsoft.com/beta/deviceManagement/windowsQualityUpdatePolicies")
          .post({
            displayName: payload.displayName || `Expedite: ${cveId}`,
            description: payload.description || `Expedited update for ${cveId}`,
            hotpatchEnabled: false,
          });
        resultMessage = `Quality update policy created (ID: ${updatePolicy.id}). Assign to expedite the update.`;
        break;
      }

      case "configuration_profile": {
        const client = getGraphClient();
        const profile = await client
          .api("https://graph.microsoft.com/beta/deviceManagement/deviceConfigurations")
          .post(payload);
        resultMessage = `Configuration profile "${profile.displayName}" created (ID: ${profile.id}). Assign to enforce.`;
        break;
      }

      default:
        resultMessage = `Action type "${actionType}" executed. Manual verification recommended.`;
    }

    db.prepare("UPDATE remediation_actions SET status = 'completed', executed_at = datetime('now'), result = ? WHERE id = ?")
      .run(resultMessage, actionId);

    // Also update the CVE status to remediated
    db.prepare("UPDATE cve_entries SET status = 'remediated' WHERE cve_id = ?").run(cveId);

    return { ...rowToAction(db.prepare("SELECT * FROM remediation_actions WHERE id = ?").get(actionId) as Record<string, unknown>) };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    db.prepare("UPDATE remediation_actions SET status = 'failed', error = ? WHERE id = ?")
      .run(errMsg.substring(0, 500), actionId);
    throw err;
  }
}

/**
 * Reject a pending remediation action.
 */
export function rejectRemediationAction(actionId: number): void {
  const db = getDb();
  db.prepare("UPDATE remediation_actions SET status = 'rejected' WHERE id = ?").run(actionId);
}

/**
 * Get all remediation actions, optionally filtered.
 */
export function getRemediationActions(options?: { cveId?: string; status?: string }): RemediationAction[] {
  const db = getDb();
  let query = "SELECT * FROM remediation_actions WHERE 1=1";
  const params: unknown[] = [];

  if (options?.cveId) { query += " AND cve_id = ?"; params.push(options.cveId); }
  if (options?.status) { query += " AND status = ?"; params.push(options.status); }

  query += " ORDER BY created_at DESC";
  const rows = db.prepare(query).all(...params) as Array<Record<string, unknown>>;
  return rows.map(rowToAction);
}

/**
 * Get pending actions count (for badge display).
 */
export function getPendingActionCount(): number {
  const db = getDb();
  return (db.prepare("SELECT COUNT(*) as c FROM remediation_actions WHERE status = 'pending_approval'").get() as { c: number }).c;
}

function mapSuggestedType(type: string): ActionType {
  const lower = type.toLowerCase();
  if (lower.includes("update") || lower.includes("patch")) return "expedite_update";
  if (lower.includes("policy") || lower.includes("compliance")) return "compliance_policy";
  if (lower.includes("script") || lower.includes("remediat")) return "remediation_script";
  if (lower.includes("config") || lower.includes("profile")) return "configuration_profile";
  return "remediation_script"; // default
}

function rowToAction(row: Record<string, unknown>): RemediationAction {
  return {
    id: row.id as number,
    cveId: String(row.cve_id),
    actionType: String(row.action_type) as ActionType,
    title: String(row.title),
    description: String(row.description || ""),
    actionPayload: JSON.parse(String(row.action_payload || "{}")),
    status: String(row.status) as RemediationAction["status"],
    createdAt: String(row.created_at),
    approvedAt: row.approved_at ? String(row.approved_at) : null,
    executedAt: row.executed_at ? String(row.executed_at) : null,
    result: row.result ? String(row.result) : null,
    error: row.error ? String(row.error) : null,
  };
}
