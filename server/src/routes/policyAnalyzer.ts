import { Router, type Request, type Response } from "express";
import { analyzePolicies } from "../policyAnalyzer/analyzer.js";
import type { PolicyAnalysisResult } from "@intune-agent/shared";

const router = Router();

let cachedResult: PolicyAnalysisResult | null = null;
let lastRunTime = 0;
const CACHE_TTL_MS = 60_000; // 1-minute cache to avoid hammering Graph API

/**
 * GET /api/policy-analyzer
 * Returns the policy analysis results (cached for 1 minute).
 */
router.get("/", async (_req: Request, res: Response) => {
  try {
    if (cachedResult && Date.now() - lastRunTime < CACHE_TTL_MS) {
      res.json(cachedResult);
      return;
    }

    console.log("[PolicyAnalyzer] Running analysis...");
    cachedResult = await analyzePolicies();
    lastRunTime = Date.now();
    console.log(`[PolicyAnalyzer] Complete — score: ${cachedResult.score}, findings: ${cachedResult.findings.length} (${cachedResult.durationMs}ms)`);
    res.json(cachedResult);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[PolicyAnalyzer] Error:", msg);
    res.status(500).json({ error: msg });
  }
});

/**
 * POST /api/policy-analyzer/refresh
 * Force a fresh analysis (clears cache).
 */
router.post("/refresh", async (_req: Request, res: Response) => {
  try {
    console.log("[PolicyAnalyzer] Forced refresh...");
    cachedResult = await analyzePolicies();
    lastRunTime = Date.now();
    console.log(`[PolicyAnalyzer] Complete — score: ${cachedResult.score}, findings: ${cachedResult.findings.length} (${cachedResult.durationMs}ms)`);
    res.json(cachedResult);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[PolicyAnalyzer] Error:", msg);
    res.status(500).json({ error: msg });
  }
});

export default router;
