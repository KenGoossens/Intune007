import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { config, validateConfig } from "./config.js";
import { validateBodySize } from "./security.js";
import { startSyncScheduler, getCacheStats } from "./cache/deviceCache.js";
import chatRouter from "./routes/chat.js";
import alertsRouter from "./routes/alerts.js";
import remediationRouter from "./routes/remediation.js";
import analyticsRouter from "./routes/analytics.js";
import policyAnalyzerRouter from "./routes/policyAnalyzer.js";
import tasksRouter from "./routes/tasks.js";
import logsRouter from "./routes/logs.js";
import reportsRouter from "./routes/reports.js";
import insightsRouter from "./routes/insights.js";
import policyBuilderRouter from "./routes/policyBuilder.js";
import riskScoresRouter from "./routes/riskScores.js";
import troubleshooterRouter from "./routes/troubleshooter.js";
import policyDiffRouter from "./routes/policyDiff.js";
import forecastRouter from "./routes/forecast.js";
import queryBuilderRouter from "./routes/queryBuilder.js";
import appHealthRouter from "./routes/appHealth.js";
import autopilotReadinessRouter from "./routes/autopilotReadiness.js";
import baselinesRouter from "./routes/baselines.js";
import deviceTimelineRouter from "./routes/deviceTimeline.js";
import alertCorrelationRouter from "./routes/alertCorrelation.js";
import securityPostureRouter from "./routes/securityPosture.js";
import bulkRemediationRouter from "./routes/bulkRemediation.js";
import diagnosticLogsRouter from "./routes/diagnosticLogs.js";
import reportGeneratorRouter from "./routes/reportGenerator.js";
import deviceCardRouter from "./routes/deviceCard.js";
import learningRouter from "./routes/learning.js";
import docsRouter from "./routes/docs.js";
import cveRouter from "./routes/cve.js";
import tenantsRouter from "./routes/tenants.js";
import doSimulatorRouter from "./routes/doSimulator.js";
import configMgrRouter from "./routes/configmgr.js";
import { alertScheduler } from "./alerts/scheduler.js";
import { startTaskScheduler } from "./scheduler/taskScheduler.js";
import { startCVEScheduler } from "./cve/scheduler.js";

const app = express();

// ─── Security Middleware ──────────────────────────────────────
// Helmet: sets security headers (CSP, X-Frame-Options, HSTS, etc.)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Allow cross-origin for API
}));

// CORS: restrict to configured origin
const allowedOrigin = process.env.CORS_ORIGIN || "http://localhost:5173";
app.use(cors({ origin: allowedOrigin }));

// Rate limiting: prevent DoS and API quota exhaustion
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 60,             // 60 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please slow down." },
});

// Stricter rate limit for the chat endpoint (LLM calls are expensive)
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,              // 20 chat requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many chat requests. Please wait a moment." },
});

// Body parsing with size limit
app.use(express.json({ limit: "1mb" }));
app.use(validateBodySize(50));

// Apply rate limiting
app.use("/api/chat", chatLimiter);
app.use("/api", apiLimiter);

// Routes
app.use("/api/chat", chatRouter);
app.use("/api/alerts", alertsRouter);
app.use("/api/remediation", remediationRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/policy-analyzer", policyAnalyzerRouter);
app.use("/api/tasks", tasksRouter);
app.use("/api/logs", logsRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/insights", insightsRouter);
app.use("/api/policy-builder", policyBuilderRouter);
app.use("/api/risk-scores", riskScoresRouter);
app.use("/api/troubleshooter", troubleshooterRouter);
app.use("/api/policy-diff", policyDiffRouter);
app.use("/api/forecast", forecastRouter);
app.use("/api/query-builder", queryBuilderRouter);
app.use("/api/app-health", appHealthRouter);
app.use("/api/autopilot-readiness", autopilotReadinessRouter);
app.use("/api/baselines", baselinesRouter);
app.use("/api/device-timeline", deviceTimelineRouter);
app.use("/api/alert-correlation", alertCorrelationRouter);
app.use("/api/security-posture", securityPostureRouter);
app.use("/api/bulk-remediation", bulkRemediationRouter);
app.use("/api/diagnostic-logs", diagnosticLogsRouter);
app.use("/api/report-generator", reportGeneratorRouter);
app.use("/api/device-card", deviceCardRouter);
app.use("/api/learning", learningRouter);
app.use("/api/docs", docsRouter);
app.use("/api/cve", cveRouter);
app.use("/api/tenants", tenantsRouter);
app.use("/api/do-simulator", doSimulatorRouter);
app.use("/api/configmgr", configMgrRouter);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Cache stats
app.get("/api/cache/stats", (_req, res) => {
  const stats = getCacheStats();
  res.json(stats);
});

// Start server
validateConfig();

app.listen(config.port, () => {
  console.log(`\n🚀 Intune007 Agent server running on http://localhost:${config.port}`);
  console.log(`   Azure OpenAI: ${config.azureOpenAI.endpoint}`);
  console.log(`   Deployment:   ${config.azureOpenAI.deployment}`);
  console.log(`   Tenant ID:    ${config.azureAd.tenantId}\n`);

  // Start device cache delta sync (every 2 minutes)
  startSyncScheduler(2 * 60 * 1000).catch((err) =>
    console.error("[DeviceCache] Initial sync failed:", err instanceof Error ? err.message : err)
  );

  // Start alert scheduler after server is listening
  alertScheduler.start();

  // Start task scheduler for recurring agent jobs
  startTaskScheduler();

  // Start CVE vulnerability monitor (scans every 6 hours)
  startCVEScheduler();
});
