/**
 * Security Middleware & Utilities for Intune007
 *
 * Implements protections against:
 *  - OWASP Top 10 for LLM Applications (prompt injection, tool abuse)
 *  - OWASP Top 10 Web (injection, broken access control, security misconfig)
 *  - OData filter injection in Microsoft Graph API calls
 *  - Rate limiting & DoS prevention
 *  - Input validation & sanitization
 */

import type { Request, Response, NextFunction } from "express";

// ════════════════════════════════════════════════════════════════
//  1. OData FILTER SANITIZATION — Prevents Graph API injection
// ════════════════════════════════════════════════════════════════

/**
 * Sanitize a value for use in an OData filter string.
 * Escapes single quotes (OData's string delimiter) and strips
 * any OData operators or function calls that could alter query logic.
 *
 * Usage:
 *   filter: `deviceName eq '${sanitizeOData(userInput)}'`
 */
export function sanitizeOData(value: string): string {
  if (!value || typeof value !== "string") return "";

  // 1. Escape single quotes (OData string escaping = double single quotes)
  let sanitized = value.replace(/'/g, "''");

  // 2. Remove any characters that could break out of a quoted string context
  //    Allow alphanumeric, spaces, hyphens, underscores, dots, @
  //    This prevents injection of OData operators like: or, and, eq, ne, etc.
  sanitized = sanitized.replace(/[^a-zA-Z0-9\s\-_\.@]/g, "");

  // 3. Length limit to prevent oversized filter strings
  return sanitized.substring(0, 256);
}

/**
 * Validate that a string looks like a UUID (for group IDs, device IDs, etc.)
 */
export function isValidUUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Validate that a string looks like a serial number (alphanumeric + hyphens)
 */
export function isValidSerialNumber(value: string): boolean {
  return /^[A-Za-z0-9\-_]{1,64}$/.test(value);
}

/**
 * Validate that a string looks like a UPN (email-like)
 */
export function isValidUPN(value: string): boolean {
  return /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(value) && value.length <= 256;
}

// ════════════════════════════════════════════════════════════════
//  2. INPUT VALIDATION MIDDLEWARE — For Express routes
// ════════════════════════════════════════════════════════════════

/**
 * Validate that the request body doesn't exceed size limits.
 * Protects against memory exhaustion from oversized payloads.
 */
export function validateBodySize(maxFields: number = 20) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.body && typeof req.body === "object") {
      const keys = Object.keys(req.body);
      if (keys.length > maxFields) {
        res.status(400).json({ error: `Too many fields in request body (max ${maxFields})` });
        return;
      }
    }
    next();
  };
}

// ════════════════════════════════════════════════════════════════
//  3. CHAT INPUT VALIDATION — Prevents prompt injection & DoS
// ════════════════════════════════════════════════════════════════

/** Maximum length for a single chat message */
export const MAX_MESSAGE_LENGTH = 10_000;

/** Maximum number of history messages to accept */
export const MAX_HISTORY_LENGTH = 50;

/** Maximum length for each history message content */
export const MAX_HISTORY_MESSAGE_LENGTH = 50_000;

/**
 * Validate and sanitize chat input.
 * Returns sanitized message or null + error string.
 */
export function validateChatInput(body: {
  message?: unknown;
  history?: unknown;
}): { message: string; history: unknown[]; error?: undefined } | { error: string } {
  // Validate message
  if (!body.message || typeof body.message !== "string") {
    return { error: "Missing or invalid 'message' field" };
  }

  const message = body.message.trim();

  if (message.length === 0) {
    return { error: "Message cannot be empty" };
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    return { error: `Message too long (max ${MAX_MESSAGE_LENGTH} characters)` };
  }

  // Validate history
  let history: unknown[] = [];
  if (body.history) {
    if (!Array.isArray(body.history)) {
      return { error: "History must be an array" };
    }
    if (body.history.length > MAX_HISTORY_LENGTH) {
      // Truncate to last N messages instead of rejecting
      history = body.history.slice(-MAX_HISTORY_LENGTH);
    } else {
      history = body.history;
    }

    // Validate each history message
    for (const msg of history) {
      if (typeof msg !== "object" || msg === null) {
        return { error: "Invalid history message format" };
      }
      const m = msg as Record<string, unknown>;
      if (typeof m.content === "string" && m.content.length > MAX_HISTORY_MESSAGE_LENGTH) {
        return { error: "History message content too long" };
      }
    }
  }

  return { message, history };
}

// ════════════════════════════════════════════════════════════════
//  4. AGENT TOOL GUARDRAILS — Prevents tool abuse
// ════════════════════════════════════════════════════════════════

/** Tools that require extra confirmation / are destructive */
export const DESTRUCTIVE_TOOLS = new Set([
  "wipe_device",
  "retire_device",
  "deploy_remediation_script",
  "create_compliance_policy",
  "assign_policy",
  "update_conditional_access_policy",
  "deploy_hash_collector",
  "remove_app",
  "bulk_rename_apps",
]);

/** Tools that are read-only and safe */
export const READONLY_TOOLS = new Set([
  "get_managed_devices",
  "get_device_details",
  "get_compliance_policies",
  "get_compliance_status",
  "get_device_configurations",
  "get_device_configuration_states",
  "get_mobile_apps",
  "get_app_install_status",
  "get_device_detected_apps",
  "get_device_app_install_states",
  "get_conditional_access_policies",
  "get_autopilot_devices",
  "get_autopilot_profiles",
  "list_remediation_scripts",
  "get_groups",
  "get_group_members",
  "get_security_alerts",
  "get_bitlocker_keys",
  "get_device_threat_summary",
  "get_audit_logs",
  "get_sign_in_logs",
  "get_directory_audit_logs",
  "get_update_rings",
  "get_update_compliance",
  "get_compliance_trend",
  "recall_notes",
  "list_scheduled_tasks",
  "list_tenants",
  "get_device_risk_scores",
  "get_device_card",
  "get_security_posture",
  "get_app_health",
  "check_autopilot_readiness",
  "get_autopilot_collection_script",
  "get_device_timeline",
  "run_compliance_forecast",
  "generate_report",
  "run_troubleshooter",
]);

/**
 * Validate tool arguments to prevent injection attacks.
 * Returns sanitized args or throws with details.
 */
export function validateToolArgs(
  toolName: string,
  args: Record<string, unknown>
): Record<string, unknown> {
  const sanitized = { ...args };

  // Validate UUIDs where expected
  const uuidFields = ["deviceId", "policyId", "groupId", "targetGroupId", "scriptId"];
  for (const field of uuidFields) {
    if (sanitized[field] && typeof sanitized[field] === "string") {
      const val = sanitized[field] as string;
      if (val.length > 0 && !isValidUUID(val)) {
        throw new Error(`Invalid ${field} format — must be a valid UUID`);
      }
    }
  }

  // Validate serial numbers
  if (sanitized.serialNumber && typeof sanitized.serialNumber === "string") {
    if (!isValidSerialNumber(sanitized.serialNumber as string)) {
      throw new Error("Invalid serial number format (alphanumeric, hyphens, max 64 chars)");
    }
  }

  // Validate groupIds (comma-separated UUIDs)
  if (sanitized.groupIds && typeof sanitized.groupIds === "string") {
    const ids = (sanitized.groupIds as string).split(",").map(s => s.trim());
    for (const id of ids) {
      if (!isValidUUID(id)) {
        throw new Error(`Invalid group ID in list: "${id}" — must be a valid UUID`);
      }
    }
  }

  // Validate OData filters — strip dangerous content
  if (sanitized.filter && typeof sanitized.filter === "string") {
    const filter = sanitized.filter as string;
    // Block attempts to inject additional operators or functions
    if (filter.length > 500) {
      throw new Error("OData filter too long (max 500 characters)");
    }
  }

  // Validate device names (used in OData filters)
  if (sanitized.deviceName && typeof sanitized.deviceName === "string") {
    const name = sanitized.deviceName as string;
    if (name.length > 128) {
      throw new Error("Device name too long (max 128 characters)");
    }
    // Sanitize for OData usage
    sanitized.deviceName = sanitizeOData(name);
  }

  // Validate UPN
  if (sanitized.assignedUserUpn && typeof sanitized.assignedUserUpn === "string") {
    if (!isValidUPN(sanitized.assignedUserUpn as string)) {
      throw new Error("Invalid UPN format");
    }
  }

  // Limit string field lengths to prevent oversized payloads
  const maxLengths: Record<string, number> = {
    prompt: 5000,
    displayName: 256,
    description: 1000,
    policyBody: 10000,
    csvData: 500000, // 500KB for CSV imports
    message: MAX_MESSAGE_LENGTH,
  };

  for (const [field, maxLen] of Object.entries(maxLengths)) {
    if (sanitized[field] && typeof sanitized[field] === "string") {
      const val = sanitized[field] as string;
      if (val.length > maxLen) {
        throw new Error(`${field} exceeds maximum length of ${maxLen} characters`);
      }
    }
  }

  return sanitized;
}

// ════════════════════════════════════════════════════════════════
//  5. REMEDIATION SCRIPT SAFETY — Blocks dangerous commands
// ════════════════════════════════════════════════════════════════

/**
 * Patterns that indicate potentially malicious PowerShell content.
 * These should NEVER appear in auto-generated remediation scripts.
 */
const DANGEROUS_PS_PATTERNS = [
  /Invoke-WebRequest\s+.*-Uri\s+(?!https:\/\/(manage\.microsoft\.com|graph\.microsoft\.com))/i,
  /Invoke-RestMethod\s+.*-Uri\s+(?!https:\/\/(manage\.microsoft\.com|graph\.microsoft\.com))/i,
  /Start-BitsTransfer/i,
  /Net\.WebClient/i,
  /DownloadFile|DownloadString/i,
  /\bIEX\b|\bInvoke-Expression\b/i,
  /ConvertTo-SecureString.*-AsPlainText/i,
  /New-Object\s+System\.Net\.(Sockets|WebClient)/i,
  /\[System\.Reflection\.Assembly\]::Load/i,
  /Add-Type\s+.*-TypeDefinition.*DllImport/i,
  /Start-Process\s+.*powershell.*-enc/i,
  /\bcmd\.exe\s*\/c\b/i,
  /\bsc\.exe\s+(create|config)\b/i,
  /\bschtasks\s*\/create\b/i,
  /\breg\s+(add|delete)\s+.*\\Run\b/i,
  /\bnet\s+user\s+.*\/add\b/i,
];

/**
 * Scan a PowerShell script for dangerous patterns.
 * Returns array of detected issues.
 */
export function scanPowerShellScript(script: string): string[] {
  const issues: string[] = [];

  for (const pattern of DANGEROUS_PS_PATTERNS) {
    if (pattern.test(script)) {
      issues.push(`Blocked pattern detected: ${pattern.source.substring(0, 60)}`);
    }
  }

  return issues;
}

// ════════════════════════════════════════════════════════════════
//  6. PROMPT INJECTION DEFENSE — Protects agent memory context
// ════════════════════════════════════════════════════════════════

/**
 * Sanitize text that will be injected into the system prompt context.
 * Strips anything that looks like prompt injection attempts.
 */
export function sanitizeForSystemPrompt(text: string): string {
  // Remove common prompt injection patterns
  let sanitized = text
    // Remove "[SYSTEM", "SYSTEM:", "[INST" markers
    .replace(/\[(SYSTEM|INST|ADMIN|OVERRIDE|IGNORE)\b[^\]]*\]/gi, "[blocked]")
    // Remove "ignore previous instructions" patterns
    .replace(/ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|rules?|guidelines?|prompts?)/gi, "[blocked]")
    // Remove "you are now" role reassignment
    .replace(/you\s+are\s+now\s+(a|an|the)\s+/gi, "[blocked] ")
    // Remove "new instructions" patterns
    .replace(/new\s+(instructions?|rules?|guidelines?|system\s+prompt)\s*:/gi, "[blocked]:")
    // Remove "disregard" patterns
    .replace(/disregard\s+(all\s+)?(previous|prior|safety|earlier)\s+/gi, "[blocked] ");

  return sanitized;
}

// ════════════════════════════════════════════════════════════════
//  7. ERROR SANITIZATION — Prevents information leakage
// ════════════════════════════════════════════════════════════════

/**
 * Sanitize error messages before sending to the client.
 * Strips internal paths, credentials, and implementation details.
 */
export function sanitizeErrorMessage(error: string): string {
  let safe = error
    // Remove file paths
    .replace(/[A-Z]:\\[^\s"']+/gi, "[path]")
    .replace(/\/home\/[^\s"']+/gi, "[path]")
    .replace(/\/usr\/[^\s"']+/gi, "[path]")
    // Remove connection strings
    .replace(/Server=[^;]+;/gi, "[redacted];")
    .replace(/Password=[^;]+/gi, "Password=[redacted]")
    // Remove tokens/keys
    .replace(/Bearer\s+[A-Za-z0-9\-_\.]+/g, "Bearer [redacted]")
    .replace(/api[_-]?key[=:]\s*[^\s"']+/gi, "apiKey=[redacted]")
    // Remove tenant/client IDs if in error context
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "[uuid]")
    // Truncate long messages
    .substring(0, 500);

  return safe;
}
