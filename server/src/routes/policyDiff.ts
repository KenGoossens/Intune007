import { Router, type Request, type Response } from "express";
import { diffPolicies, clonePolicy } from "../policyDiff/differ.js";
import { fetchWithPagination, getGraphClient } from "../graph/client.js";

const router = Router();

/** POST /api/policy-diff/compare — Compare two policies. */
router.post("/compare", async (req: Request, res: Response) => {
  const { policyIdA, policyIdB, policyType } = req.body;
  if (!policyIdA || !policyIdB) {
    res.status(400).json({ error: "policyIdA and policyIdB are required" });
    return;
  }
  try {
    const result = await diffPolicies(policyIdA, policyIdB, policyType || "compliance");
    res.json(result);
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/** POST /api/policy-diff/clone — Clone a policy with modifications. */
router.post("/clone", async (req: Request, res: Response) => {
  const { sourcePolicyId, newDisplayName, policyType, overrides } = req.body;
  if (!sourcePolicyId || !newDisplayName) {
    res.status(400).json({ error: "sourcePolicyId and newDisplayName are required" });
    return;
  }
  try {
    const result = await clonePolicy(sourcePolicyId, newDisplayName, policyType || "compliance", overrides);
    res.json({ success: true, policy: result });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/** GET /api/policy-diff/policies — List all policies for picker. */
router.get("/policies", async (req: Request, res: Response) => {
  const type = (req.query.type as string) || "compliance";
  try {
    const client = getGraphClient();
    const endpoint = type === "configuration"
      ? "/deviceManagement/deviceConfigurations"
      : "/deviceManagement/deviceCompliancePolicies";
    const result = await fetchWithPagination<Record<string, unknown>>(client, endpoint, {
      select: "id,displayName,lastModifiedDateTime",
      maxItems: 100,
    });
    res.json({ policies: result.items });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
