import express from "express";
import cors from "cors";
import { config, validateConfig } from "./config.js";
import chatRouter from "./routes/chat.js";
import alertsRouter from "./routes/alerts.js";
import remediationRouter from "./routes/remediation.js";
import analyticsRouter from "./routes/analytics.js";
import policyAnalyzerRouter from "./routes/policyAnalyzer.js";
import { alertScheduler } from "./alerts/scheduler.js";

const app = express();

// Middleware
app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json({ limit: "2mb" }));

// Routes
app.use("/api/chat", chatRouter);
app.use("/api/alerts", alertsRouter);
app.use("/api/remediation", remediationRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/policy-analyzer", policyAnalyzerRouter);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Start server
validateConfig();

app.listen(config.port, () => {
  console.log(`\n🚀 Intune007 Agent server running on http://localhost:${config.port}`);
  console.log(`   Azure OpenAI: ${config.azureOpenAI.endpoint}`);
  console.log(`   Deployment:   ${config.azureOpenAI.deployment}`);
  console.log(`   Tenant ID:    ${config.azureAd.tenantId}\n`);

  // Start alert scheduler after server is listening
  alertScheduler.start();
});
