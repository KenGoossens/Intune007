/**
 * CVE Monitor — 24/7 vulnerability monitoring for Intune-managed devices.
 *
 * Data Sources:
 *   1. NVD (National Vulnerability Database) — NIST CVE feed
 *   2. MSRC (Microsoft Security Response Center) — Microsoft-specific patches
 *   3. CISA KEV (Known Exploited Vulnerabilities) — actively exploited CVEs
 *
 * Pipeline:
 *   1. FETCH:  Pull recent CVEs from NVD/MSRC/CISA
 *   2. MATCH:  Cross-reference with tenant's OS versions, apps, configurations
 *   3. ASSESS: Score relevance and severity for this specific environment
 *   4. SUGGEST: AI-generated remediation (update, policy, script, config)
 *   5. ALERT:  Surface critical CVEs in the alert system
 *
 * Storage: server/data/cve.db
 */

import Database from "better-sqlite3";
import { AzureOpenAI } from "openai";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { config } from "../config.js";
import { getManagedDevices } from "../graph/devices.js";
import { getGraphClient, fetchWithPagination } from "../graph/client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "..", "data");
const DB_PATH = path.join(DATA_DIR, "cve.db");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS cve_entries (
      id TEXT PRIMARY KEY,
      cve_id TEXT NOT NULL UNIQUE,
      title TEXT,
      description TEXT,
      severity TEXT,
      cvss_score REAL,
      published_date TEXT,
      modified_date TEXT,
      affected_products TEXT,
      source TEXT,
      is_exploited INTEGER DEFAULT 0,
      relevance_score REAL DEFAULT 0,
      affected_device_count INTEGER DEFAULT 0,
      remediation TEXT,
      remediation_type TEXT,
      status TEXT DEFAULT 'new',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      dismissed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS cve_scan_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scan_time TEXT NOT NULL DEFAULT (datetime('now')),
      source TEXT,
      cves_found INTEGER DEFAULT 0,
      cves_relevant INTEGER DEFAULT 0,
      duration_ms INTEGER DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_cve_severity ON cve_entries(severity);
    CREATE INDEX IF NOT EXISTS idx_cve_status ON cve_entries(status);
    CREATE INDEX IF NOT EXISTS idx_cve_relevance ON cve_entries(relevance_score DESC);
  `);

  return db;
}

// ════════════════════════════════════════════════════════════════
//  1. CVE DATA FETCHING
// ════════════════════════════════════════════════════════════════

export interface CVEEntry {
  cveId: string;
  title: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low" | "unknown";
  cvssScore: number;
  publishedDate: string;
  affectedProducts: string[];
  source: string;
  isExploited: boolean;
  relevanceScore: number;
  affectedDeviceCount: number;
  remediation: string | null;
  remediationType: string | null;
  status: "new" | "reviewed" | "remediated" | "dismissed";
}

/**
 * Fetch recent CVEs from NVD (National Vulnerability Database).
 * Uses the NVD 2.0 API — free, no API key required (but rate-limited).
 */
async function fetchNVDCves(daysBack: number = 7): Promise<Array<{
  cveId: string; description: string; severity: string; cvssScore: number;
  publishedDate: string; affectedProducts: string[];
}>> {
  const results: Array<{
    cveId: string; description: string; severity: string; cvssScore: number;
    publishedDate: string; affectedProducts: string[];
  }> = [];

  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);
    const pubStartDate = startDate.toISOString().replace(/\.\d+Z$/, ".000");
    const pubEndDate = new Date().toISOString().replace(/\.\d+Z$/, ".000");

    // Focus on Windows and Microsoft-related CVEs
    const url = `https://services.nvd.nist.gov/rest/json/cves/2.0?pubStartDate=${pubStartDate}&pubEndDate=${pubEndDate}&keywordSearch=Microsoft+Windows&resultsPerPage=50`;

    const response = await fetch(url, {
      headers: { "User-Agent": "Intune007-CVEMonitor/1.0" },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      console.warn(`[CVE] NVD API returned ${response.status}`);
      return results;
    }

    const data = await response.json() as Record<string, unknown>;
    const vulnerabilities = (data.vulnerabilities || []) as Array<Record<string, unknown>>;

    for (const vuln of vulnerabilities) {
      const cve = vuln.cve as Record<string, unknown>;
      if (!cve) continue;

      const cveId = String(cve.id || "");
      const descriptions = (cve.descriptions || []) as Array<Record<string, string>>;
      const englishDesc = descriptions.find((d) => d.lang === "en")?.value || "";

      // Extract CVSS score
      const metrics = cve.metrics as Record<string, unknown> | undefined;
      let cvssScore = 0;
      let severity = "unknown";

      if (metrics) {
        const cvss31 = (metrics.cvssMetricV31 as Array<Record<string, unknown>>)?.[0];
        const cvss30 = (metrics.cvssMetricV30 as Array<Record<string, unknown>>)?.[0];
        const cvssData = (cvss31?.cvssData || cvss30?.cvssData) as Record<string, unknown> | undefined;
        if (cvssData) {
          cvssScore = (cvssData.baseScore as number) || 0;
          severity = String(cvssData.baseSeverity || "unknown").toLowerCase();
        }
      }

      // Extract affected products from CPE
      const configurations = (cve.configurations || []) as Array<Record<string, unknown>>;
      const products: string[] = [];
      for (const config of configurations) {
        const nodes = (config.nodes || []) as Array<Record<string, unknown>>;
        for (const node of nodes) {
          const cpeMatch = (node.cpeMatch || []) as Array<Record<string, unknown>>;
          for (const match of cpeMatch) {
            const criteria = String(match.criteria || "");
            // Extract product name from CPE string
            const parts = criteria.split(":");
            if (parts.length > 4) {
              products.push(`${parts[3]}:${parts[4]}`);
            }
          }
        }
      }

      results.push({
        cveId,
        description: englishDesc.substring(0, 1000),
        severity: severity as "critical" | "high" | "medium" | "low" | "unknown",
        cvssScore,
        publishedDate: String(cve.published || ""),
        affectedProducts: [...new Set(products)].slice(0, 10),
      });
    }
  } catch (err) {
    console.error("[CVE] NVD fetch error:", err instanceof Error ? err.message : String(err));
  }

  return results;
}

/**
 * Fetch CISA Known Exploited Vulnerabilities catalog.
 * These are CVEs with confirmed active exploitation — highest priority.
 */
async function fetchCISAKEV(): Promise<Array<{
  cveId: string; title: string; description: string; dueDate: string;
}>> {
  try {
    const response = await fetch(
      "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json",
      { headers: { "User-Agent": "Intune007-CVEMonitor/1.0" }, signal: AbortSignal.timeout(15000) }
    );
    if (!response.ok) return [];

    const data = await response.json() as Record<string, unknown>;
    const vulnerabilities = (data.vulnerabilities || []) as Array<Record<string, unknown>>;

    // Return only recent ones (last 30 days)
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);

    return vulnerabilities
      .filter((v) => new Date(String(v.dateAdded || "")) >= cutoff)
      .filter((v) => String(v.vendorProject || "").toLowerCase().includes("microsoft"))
      .map((v) => ({
        cveId: String(v.cveID || ""),
        title: String(v.vulnerabilityName || ""),
        description: String(v.shortDescription || ""),
        dueDate: String(v.dueDate || ""),
      }));
  } catch {
    return [];
  }
}

// ════════════════════════════════════════════════════════════════
//  2. ENVIRONMENT MATCHING
// ════════════════════════════════════════════════════════════════

interface TenantProfile {
  osVersions: Map<string, number>; // version → device count
  totalDevices: number;
  windowsCount: number;
  macCount: number;
  iosCount: number;
  androidCount: number;
  detectedApps: string[];
}

/**
 * Build a profile of the current tenant's environment.
 */
async function buildTenantProfile(): Promise<TenantProfile> {
  const devices = await getManagedDevices({ top: 500 });

  const osVersions = new Map<string, number>();
  let windowsCount = 0, macCount = 0, iosCount = 0, androidCount = 0;

  for (const d of devices.items) {
    const os = String(d.operatingSystem || "").toLowerCase();
    const version = String(d.osVersion || "unknown");
    osVersions.set(version, (osVersions.get(version) || 0) + 1);

    if (os.includes("windows")) windowsCount++;
    else if (os.includes("macos")) macCount++;
    else if (os.includes("ios")) iosCount++;
    else if (os.includes("android")) androidCount++;
  }

  // Get detected apps (sample from first 5 devices)
  const apps: string[] = [];
  const client = getGraphClient();
  for (const d of devices.items.slice(0, 5)) {
    try {
      const detected = await fetchWithPagination<Record<string, unknown>>(
        client,
        `https://graph.microsoft.com/beta/deviceManagement/managedDevices/${d.id}/detectedApps`,
        { select: "displayName", maxItems: 50 }
      );
      apps.push(...detected.items.map((a) => String(a.displayName || "")));
    } catch { /* skip */ }
  }

  return {
    osVersions,
    totalDevices: devices.items.length,
    windowsCount, macCount, iosCount, androidCount,
    detectedApps: [...new Set(apps)],
  };
}

/**
 * Score how relevant a CVE is to this tenant.
 */
function scoreRelevance(
  cve: { description: string; affectedProducts: string[]; severity: string; cvssScore: number },
  profile: TenantProfile
): { score: number; affectedCount: number; reason: string } {
  let score = 0;
  let reason = "";
  let affectedCount = 0;

  const desc = cve.description.toLowerCase();
  const products = cve.affectedProducts.join(" ").toLowerCase();

  // Check if it affects Windows (most Intune devices)
  if ((desc.includes("windows") || products.includes("windows")) && profile.windowsCount > 0) {
    score += 40;
    affectedCount = profile.windowsCount;
    reason = `Affects Windows (${profile.windowsCount} devices)`;

    // Check specific versions
    for (const [version, count] of profile.osVersions) {
      if (desc.includes(version) || products.includes(version.replace("10.0.", ""))) {
        score += 20;
        affectedCount = count;
        reason = `Affects Windows ${version} (${count} devices)`;
        break;
      }
    }
  }

  // Check macOS, iOS, Android
  if ((desc.includes("macos") || products.includes("macos")) && profile.macCount > 0) {
    score += 30;
    affectedCount = profile.macCount;
    reason = `Affects macOS (${profile.macCount} devices)`;
  }

  // Check affected apps
  for (const app of profile.detectedApps) {
    if (desc.includes(app.toLowerCase()) || products.includes(app.toLowerCase())) {
      score += 25;
      reason += ` + affects ${app}`;
      break;
    }
  }

  // Severity multiplier
  if (cve.severity === "critical") score *= 2;
  else if (cve.severity === "high") score *= 1.5;

  // CVSS boost
  if (cve.cvssScore >= 9.0) score += 30;
  else if (cve.cvssScore >= 7.0) score += 15;

  return { score: Math.min(Math.round(score), 100), affectedCount, reason };
}

// ════════════════════════════════════════════════════════════════
//  3. AI REMEDIATION SUGGESTIONS
// ════════════════════════════════════════════════════════════════

/**
 * Generate remediation suggestions for a CVE using Azure OpenAI.
 */
async function generateRemediation(cve: {
  cveId: string; description: string; severity: string; affectedProducts: string[];
}): Promise<{ remediation: string; type: string }> {
  try {
    const client = new AzureOpenAI({
      apiKey: config.azureOpenAI.apiKey,
      endpoint: config.azureOpenAI.endpoint,
      deployment: config.azureOpenAI.deployment,
      apiVersion: config.azureOpenAI.apiVersion,
    });

    const completion = await client.chat.completions.create({
      model: config.azureOpenAI.deployment,
      messages: [
        {
          role: "system",
          content: `You are an Intune security expert. Given a CVE, suggest the best remediation action that can be performed through Microsoft Intune. Be specific and actionable. Respond in JSON: { "remediation": "specific action steps", "type": "update|policy|script|configuration|monitor" }. Only return the JSON.`,
        },
        {
          role: "user",
          content: `CVE: ${cve.cveId}\nSeverity: ${cve.severity}\nDescription: ${cve.description.substring(0, 500)}\nAffected: ${cve.affectedProducts.join(", ")}`,
        },
      ],
    });

    const content = completion.choices[0]?.message?.content || "";
    const cleaned = content.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(cleaned);
    return { remediation: parsed.remediation || "Review and apply latest security updates.", type: parsed.type || "update" };
  } catch {
    return { remediation: "Apply the latest Windows security updates via Windows Update for Business. Verify devices are receiving updates through the Update Compliance dashboard.", type: "update" };
  }
}

// ════════════════════════════════════════════════════════════════
//  4. FULL SCAN PIPELINE
// ════════════════════════════════════════════════════════════════

export interface CVEScanResult {
  scanTime: string;
  durationMs: number;
  totalCvesFound: number;
  relevantCves: number;
  criticalCves: number;
  cisaExploited: number;
  newCves: CVEEntry[];
}

/**
 * Run a full CVE scan: fetch → match → assess → suggest.
 */
export async function runCVEScan(daysBack: number = 7): Promise<CVEScanResult> {
  const start = Date.now();
  const database = getDb();
  console.log(`[CVE] Starting scan (${daysBack} days back)...`);

  // Build tenant profile
  const profile = await buildTenantProfile();
  console.log(`[CVE] Tenant: ${profile.totalDevices} devices, ${profile.windowsCount} Windows, ${profile.detectedApps.length} unique apps`);

  // Fetch CVEs from multiple sources
  const [nvdCves, cisaKev] = await Promise.all([
    fetchNVDCves(daysBack),
    fetchCISAKEV(),
  ]);

  console.log(`[CVE] Fetched: ${nvdCves.length} from NVD, ${cisaKev.length} from CISA KEV`);

  // Merge CISA KEV data (mark as exploited)
  const cisaIds = new Set(cisaKev.map((k) => k.cveId));

  const newCves: CVEEntry[] = [];
  const insertOrUpdate = database.prepare(
    `INSERT OR REPLACE INTO cve_entries
     (id, cve_id, title, description, severity, cvss_score, published_date, affected_products, source, is_exploited, relevance_score, affected_device_count, remediation, remediation_type, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  // Process NVD CVEs
  for (const cve of nvdCves) {
    // Check if already processed
    const existing = database
      .prepare("SELECT status FROM cve_entries WHERE cve_id = ?")
      .get(cve.cveId) as { status: string } | undefined;

    if (existing && existing.status !== "new") continue; // Don't re-process reviewed/remediated

    const isExploited = cisaIds.has(cve.cveId);
    const relevance = scoreRelevance(cve, profile);

    // Only store relevant CVEs (score > 20) or CISA exploited
    if (relevance.score < 20 && !isExploited) continue;

    // Generate remediation for high-relevance CVEs
    let remediation = { remediation: "", type: "" };
    if (relevance.score >= 50 || isExploited) {
      remediation = await generateRemediation(cve);
    }

    const entry: CVEEntry = {
      cveId: cve.cveId,
      title: cisaKev.find((k) => k.cveId === cve.cveId)?.title || cve.cveId,
      description: cve.description,
      severity: cve.severity as CVEEntry["severity"],
      cvssScore: cve.cvssScore,
      publishedDate: cve.publishedDate,
      affectedProducts: cve.affectedProducts,
      source: isExploited ? "NVD + CISA KEV" : "NVD",
      isExploited,
      relevanceScore: isExploited ? Math.max(relevance.score, 90) : relevance.score,
      affectedDeviceCount: relevance.affectedCount,
      remediation: remediation.remediation || null,
      remediationType: remediation.type || null,
      status: "new",
    };

    insertOrUpdate.run(
      cve.cveId, cve.cveId, entry.title, entry.description, entry.severity,
      entry.cvssScore, entry.publishedDate, JSON.stringify(entry.affectedProducts),
      entry.source, isExploited ? 1 : 0, entry.relevanceScore, entry.affectedDeviceCount,
      entry.remediation, entry.remediationType, existing?.status || "new"
    );

    if (!existing) newCves.push(entry);
  }

  // Process CISA KEV entries not in NVD results
  for (const kev of cisaKev) {
    if (nvdCves.some((n) => n.cveId === kev.cveId)) continue;
    const existing = database
      .prepare("SELECT status FROM cve_entries WHERE cve_id = ?")
      .get(kev.cveId) as { status: string } | undefined;
    if (existing) continue;

    const remediation = await generateRemediation({
      cveId: kev.cveId, description: kev.description, severity: "critical",
      affectedProducts: ["microsoft:windows"],
    });

    const entry: CVEEntry = {
      cveId: kev.cveId, title: kev.title, description: kev.description,
      severity: "critical", cvssScore: 9.0, publishedDate: kev.dueDate,
      affectedProducts: ["microsoft:windows"], source: "CISA KEV",
      isExploited: true, relevanceScore: 95,
      affectedDeviceCount: profile.windowsCount,
      remediation: remediation.remediation, remediationType: remediation.type,
      status: "new",
    };

    insertOrUpdate.run(
      kev.cveId, kev.cveId, entry.title, entry.description, "critical",
      9.0, kev.dueDate, JSON.stringify(["microsoft:windows"]), "CISA KEV",
      1, 95, profile.windowsCount, entry.remediation, entry.remediationType, "new"
    );

    newCves.push(entry);
  }

  const durationMs = Date.now() - start;

  // Log scan
  database
    .prepare("INSERT INTO cve_scan_log (source, cves_found, cves_relevant, duration_ms) VALUES (?, ?, ?, ?)")
    .run("NVD+CISA", nvdCves.length + cisaKev.length, newCves.length, durationMs);

  console.log(`[CVE] Scan complete: ${newCves.length} relevant CVEs found in ${durationMs}ms`);

  return {
    scanTime: new Date().toISOString(),
    durationMs,
    totalCvesFound: nvdCves.length + cisaKev.length,
    relevantCves: newCves.length,
    criticalCves: newCves.filter((c) => c.severity === "critical").length,
    cisaExploited: newCves.filter((c) => c.isExploited).length,
    newCves: newCves.sort((a, b) => b.relevanceScore - a.relevanceScore),
  };
}

// ════════════════════════════════════════════════════════════════
//  5. QUERY & MANAGEMENT
// ════════════════════════════════════════════════════════════════

/**
 * Get all tracked CVEs, optionally filtered.
 */
export function getCVEs(options?: {
  status?: string;
  severity?: string;
  limit?: number;
}): CVEEntry[] {
  const database = getDb();
  let query = "SELECT * FROM cve_entries WHERE 1=1";
  const params: unknown[] = [];

  if (options?.status) {
    query += " AND status = ?";
    params.push(options.status);
  }
  if (options?.severity) {
    query += " AND severity = ?";
    params.push(options.severity);
  }

  query += " ORDER BY relevance_score DESC, cvss_score DESC";

  if (options?.limit) {
    query += " LIMIT ?";
    params.push(options.limit);
  }

  const rows = database.prepare(query).all(...params) as Array<Record<string, unknown>>;
  return rows.map(rowToCVE);
}

/**
 * Update CVE status (reviewed, remediated, dismissed).
 */
export function updateCVEStatus(cveId: string, status: string): void {
  const database = getDb();
  database
    .prepare("UPDATE cve_entries SET status = ?, dismissed_at = CASE WHEN ? = 'dismissed' THEN datetime('now') ELSE dismissed_at END WHERE cve_id = ?")
    .run(status, status, cveId);
}

/**
 * Get CVE scan statistics.
 */
export function getCVEStats(): {
  totalTracked: number;
  newCount: number;
  criticalCount: number;
  exploitedCount: number;
  remediatedCount: number;
  lastScan: string | null;
} {
  const database = getDb();

  const counts = database
    .prepare(`SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) as new_count,
      SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END) as critical_count,
      SUM(CASE WHEN is_exploited = 1 THEN 1 ELSE 0 END) as exploited_count,
      SUM(CASE WHEN status = 'remediated' THEN 1 ELSE 0 END) as remediated_count
    FROM cve_entries`)
    .get() as Record<string, number>;

  const lastScan = database
    .prepare("SELECT scan_time FROM cve_scan_log ORDER BY scan_time DESC LIMIT 1")
    .get() as { scan_time: string } | undefined;

  return {
    totalTracked: counts.total || 0,
    newCount: counts.new_count || 0,
    criticalCount: counts.critical_count || 0,
    exploitedCount: counts.exploited_count || 0,
    remediatedCount: counts.remediated_count || 0,
    lastScan: lastScan?.scan_time || null,
  };
}

function rowToCVE(row: Record<string, unknown>): CVEEntry {
  return {
    cveId: String(row.cve_id),
    title: String(row.title || row.cve_id),
    description: String(row.description || ""),
    severity: String(row.severity || "unknown") as CVEEntry["severity"],
    cvssScore: (row.cvss_score as number) || 0,
    publishedDate: String(row.published_date || ""),
    affectedProducts: JSON.parse(String(row.affected_products || "[]")),
    source: String(row.source || ""),
    isExploited: (row.is_exploited as number) === 1,
    relevanceScore: (row.relevance_score as number) || 0,
    affectedDeviceCount: (row.affected_device_count as number) || 0,
    remediation: row.remediation ? String(row.remediation) : null,
    remediationType: row.remediation_type ? String(row.remediation_type) : null,
    status: String(row.status || "new") as CVEEntry["status"],
  };
}
