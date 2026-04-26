import { Router, type Request, type Response } from "express";
import { AzureOpenAI } from "openai";
import { config } from "../config.js";
import { getGraphClient, fetchWithPagination } from "../graph/client.js";

const router = Router();

const QUERY_PROMPT = `Convert the following natural language device query into a Microsoft Graph OData $filter expression for /deviceManagement/managedDevices.

Available filterable properties:
- operatingSystem (eq 'Windows', 'iOS', 'Android', 'macOS')
- complianceState (eq 'compliant', 'noncompliant', 'unknown')
- managedDeviceOwnerType (eq 'company', 'personal')
- deviceName (contains(deviceName,'value'))
- userPrincipalName (contains(userPrincipalName,'value'))
- lastSyncDateTime (lt or gt ISO datetime)
- enrolledDateTime (lt or gt ISO datetime)

Return ONLY the OData filter string, nothing else. If you cannot convert it, return "UNABLE".
Example input: "all non-compliant Windows devices"
Example output: complianceState eq 'noncompliant' and operatingSystem eq 'Windows'`;

router.post("/", async (req: Request, res: Response) => {
  const { query } = req.body;
  if (!query) { res.status(400).json({ error: "query is required" }); return; }
  try {
    const openai = new AzureOpenAI({
      apiKey: config.azureOpenAI.apiKey, endpoint: config.azureOpenAI.endpoint,
      deployment: config.azureOpenAI.deployment, apiVersion: config.azureOpenAI.apiVersion,
    });
    const completion = await openai.chat.completions.create({
      model: config.azureOpenAI.deployment,
      messages: [{ role: "system", content: QUERY_PROMPT }, { role: "user", content: query }],
    });
    const filter = completion.choices[0]?.message?.content?.trim() || "";
    if (filter === "UNABLE" || !filter) {
      res.json({ filter: null, error: "Could not convert query to OData filter" });
      return;
    }
    const client = getGraphClient();
    const result = await fetchWithPagination<Record<string, unknown>>(client,
      "/deviceManagement/managedDevices",
      { filter, select: "id,deviceName,operatingSystem,osVersion,complianceState,managedDeviceOwnerType,lastSyncDateTime,userPrincipalName", maxItems: 100 }
    );
    res.json({ query, filter, devices: result.items, totalCount: result.totalCount });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
