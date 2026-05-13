/**
 * DO Simulator REST API.
 *
 * Routes:
 *   POST   /api/do-simulator/run           — run a simulation, optionally save
 *   GET    /api/do-simulator               — list saved simulations
 *   GET    /api/do-simulator/:id           — fetch a saved simulation
 *   DELETE /api/do-simulator/:id           — remove a saved simulation
 *   POST   /api/do-simulator/prefill       — pre-fill from current tenant
 *   POST   /api/do-simulator/:id/profiles  — generate Intune profiles
 *   POST   /api/do-simulator/csv/sites     — parse CSV into site list
 */

import { Router } from "express";
import { runSimulation } from "../doSimulator/engine.js";
import {
  saveSimulation,
  listSimulations,
  getSimulation,
  deleteSimulation,
} from "../doSimulator/store.js";
import { buildAllProfiles } from "../doSimulator/intuneProfile.js";
import { analyseCurrentTenantForDO } from "../doSimulator/tenantAnalyzer.js";
import { sanitizeErrorMessage } from "../security.js";
import type { DOSimulationInput, DOSite, DOSubnet } from "@intune-agent/shared";
import { randomUUID } from "crypto";

const router = Router();

router.post("/run", (req, res) => {
  try {
    const input = req.body as DOSimulationInput;
    if (!input || !Array.isArray(input.sites)) {
      return res.status(400).json({ error: "Body must include `sites` array." });
    }
    const result = runSimulation(input);
    result.intuneProfiles = buildAllProfiles(result);
    if (req.query.save === "1" || req.query.save === "true") {
      saveSimulation(result);
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({
      error: sanitizeErrorMessage(err instanceof Error ? err.message : String(err)),
    });
  }
});

router.get("/", (_req, res) => {
  res.json({ simulations: listSimulations() });
});

router.get("/:id", (req, res) => {
  const sim = getSimulation(req.params.id);
  if (!sim) return res.status(404).json({ error: "Simulation not found" });
  res.json(sim);
});

router.delete("/:id", (req, res) => {
  const ok = deleteSimulation(req.params.id);
  if (!ok) return res.status(404).json({ error: "Simulation not found" });
  res.json({ success: true });
});

router.post("/prefill", async (_req, res) => {
  try {
    const result = await analyseCurrentTenantForDO();
    res.json(result);
  } catch (err) {
    res.status(500).json({
      error: sanitizeErrorMessage(err instanceof Error ? err.message : String(err)),
    });
  }
});

router.post("/:id/profiles", (req, res) => {
  const sim = getSimulation(req.params.id);
  if (!sim) return res.status(404).json({ error: "Simulation not found" });
  res.json({ profiles: buildAllProfiles(sim) });
});

/**
 * POST /api/do-simulator/csv/sites
 *
 * Body: { csv: "name,deviceCount,wanBandwidthMbps,hasMCCCandidate,hasConfigMgrDP,subnets,adSiteName,boundaryGroupName,type\n..." }
 *
 * Returns parsed DOSite[] for the form to consume.
 */
router.post("/csv/sites", (req, res) => {
  const csv = String(req.body?.csv || "").trim();
  if (!csv) return res.status(400).json({ error: "csv body field required" });
  try {
    const sites = parseSitesCsv(csv);
    res.json({ sites, count: sites.length });
  } catch (err) {
    res.status(400).json({
      error: sanitizeErrorMessage(err instanceof Error ? err.message : String(err)),
    });
  }
});

// ─── CSV parser ────────────────────────────────────────────────
// Minimal RFC4180-ish parser to keep deps zero.

function parseSitesCsv(csv: string): DOSite[] {
  const rows = parseCsv(csv);
  if (rows.length < 2) throw new Error("CSV must have a header and at least one data row.");
  const header = rows[0].map((h) => h.trim().toLowerCase());

  const idx = (col: string): number => {
    const i = header.indexOf(col);
    if (i === -1) throw new Error(`Missing CSV column: ${col}`);
    return i;
  };
  const optional = (col: string): number => header.indexOf(col);

  const cols = {
    name: idx("name"),
    deviceCount: idx("devicecount"),
    wan: idx("wanbandwidthmbps"),
    mcc: optional("hasmcccandidate"),
    dp: optional("hasconfigmgrdp"),
    subnets: optional("subnets"),
    adSite: optional("adsitename"),
    bg: optional("boundarygroupname"),
    type: optional("type"),
  };

  const sites: DOSite[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.every((c) => !c.trim())) continue;
    const name = row[cols.name]?.trim();
    if (!name) continue;
    const deviceCount = parseInt(row[cols.deviceCount] || "0", 10);
    const wan = parseInt(row[cols.wan] || "0", 10);
    const subnets: DOSubnet[] =
      cols.subnets >= 0
        ? (row[cols.subnets] || "")
            .split(/[;|]/)
            .map((s) => s.trim())
            .filter(Boolean)
            .map((cidr) => ({ cidr }))
        : [];
    const typeRaw = (cols.type >= 0 ? row[cols.type] : "").trim().toLowerCase();
    const type =
      typeRaw === "headquarters" || typeRaw === "branch" || typeRaw === "small_branch" ||
      typeRaw === "roaming" || typeRaw === "guest"
        ? typeRaw
        : deviceCount >= 100
        ? "headquarters"
        : deviceCount >= 20
        ? "branch"
        : "small_branch";
    sites.push({
      id: randomUUID(),
      name,
      type,
      deviceCount,
      wanBandwidthMbps: wan,
      hasMCCCandidate: parseBool(cols.mcc >= 0 ? row[cols.mcc] : ""),
      hasConfigMgrDP: parseBool(cols.dp >= 0 ? row[cols.dp] : ""),
      subnets,
      adSiteName: cols.adSite >= 0 ? row[cols.adSite]?.trim() || undefined : undefined,
      boundaryGroupName: cols.bg >= 0 ? row[cols.bg]?.trim() || undefined : undefined,
    });
  }
  return sites;
}

function parseBool(s: string): boolean {
  if (!s) return false;
  return /^(1|true|yes|y)$/i.test(s.trim());
}

function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (inQuotes) {
      if (c === '"' && csv[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cur += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        row.push(cur);
        cur = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && csv[i + 1] === "\n") i++;
        row.push(cur);
        rows.push(row);
        row = [];
        cur = "";
      } else {
        cur += c;
      }
    }
  }
  if (cur.length > 0 || row.length > 0) {
    row.push(cur);
    rows.push(row);
  }
  return rows;
}

export default router;
