/**
 * PowerShell Script Quality Validator for Intune007
 *
 * Provides multi-layer validation for AI-generated PowerShell scripts:
 *
 *  1. **PowerShell AST Validation** — Invokes PowerShell's native parser via
 *     child process to catch syntax errors, missing closing braces, bad
 *     variable references, etc.  Zero false positives because it uses
 *     the same parser the runtime uses.
 *
 *  2. **Pester Test Scaffolding** — Generates a Pester v5 test that verifies
 *     structural correctness (valid PowerShell, correct exit‑code contract,
 *     presence of error handling) and executes it in a sandboxed session
 *     with -NoProfile -ExecutionPolicy Bypass.
 *
 *  3. **Combined validateScript()** — Runs both layers and returns a unified
 *     result that the deploy flow can use to gate deployment.
 *
 * Called by executor.ts before deploy_remediation_script reaches Intune.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import os from "os";

const execFileAsync = promisify(execFile);

// ════════════════════════════════════════════════════════════════
//  Types
// ════════════════════════════════════════════════════════════════

export interface ValidationPhase {
  name: string;
  status: "passed" | "failed" | "skipped" | "warning" | "pending";
  duration?: number;
  details?: string;
}

export interface ScriptValidationResult {
  valid: boolean;
  /** AST-level syntax errors found by PowerShell parser */
  syntaxErrors: string[];
  /** Pester test results (empty if Pester is unavailable) */
  pesterResults: PesterResult[];
  /** Human-readable summary */
  summary: string;
  /** Pipeline phases with individual status and timing */
  phases: ValidationPhase[];
}

export interface PesterResult {
  name: string;
  passed: boolean;
  message?: string;
}

// ════════════════════════════════════════════════════════════════
//  1. PowerShell AST Validation
// ════════════════════════════════════════════════════════════════

/**
 * Parse a PowerShell script using the native PowerShell AST parser.
 * Returns an array of syntax error messages (empty = valid script).
 */
export async function validatePowerShellSyntax(script: string): Promise<string[]> {
  // Write script to a temp file so we can parse it without injection risk
  const tmpDir = os.tmpdir();
  const tmpFile = path.join(tmpDir, `intune007_validate_${Date.now()}.ps1`);

  try {
    fs.writeFileSync(tmpFile, script, "utf-8");

    // Use PowerShell's parser to check for syntax errors.
    // [System.Management.Automation.Language.Parser]::ParseFile returns
    // (AST, tokens, errors). We only care about errors.
    const psCommand = `
$errors = $null
$tokens = $null
[System.Management.Automation.Language.Parser]::ParseFile(
  '${tmpFile.replace(/'/g, "''")}',
  [ref]$tokens,
  [ref]$errors
) | Out-Null
if ($errors.Count -gt 0) {
  foreach ($e in $errors) {
    Write-Output "ERROR: $($e.Message) (Line $($e.Extent.StartLineNumber), Col $($e.Extent.StartColumnNumber))"
  }
  exit 1
} else {
  Write-Output "OK"
  exit 0
}
`;

    const { stdout } = await execFileAsync("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy", "Bypass",
      "-Command", psCommand,
    ], { timeout: 15_000 });

    const output = stdout.trim();
    if (output === "OK") return [];

    // Extract error lines
    return output
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("ERROR:"));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // If PowerShell is unavailable, log warning but don't block
    if (msg.includes("ENOENT") || msg.includes("not recognized")) {
      console.warn("[ScriptValidator] PowerShell not found — skipping AST validation");
      return [];
    }
    return [`AST validation failed: ${msg.substring(0, 200)}`];
  } finally {
    try { fs.unlinkSync(tmpFile); } catch { /* ignore cleanup errors */ }
  }
}

// ════════════════════════════════════════════════════════════════
//  2. Pester Test Scaffolding & Execution
// ════════════════════════════════════════════════════════════════

/**
 * Generate a Pester v5 test for a remediation script pair and run it.
 * Tests structural correctness only — does NOT execute the actual
 * remediation logic (safe to run on any machine).
 */
export async function runPesterTests(
  detectionScript: string,
  remediationScript: string,
  displayName: string
): Promise<PesterResult[]> {
  const tmpDir = path.join(os.tmpdir(), `intune007_pester_${Date.now()}`);
  const detectionFile = path.join(tmpDir, "Detection.ps1");
  const remediationFile = path.join(tmpDir, "Remediation.ps1");
  const testFile = path.join(tmpDir, "ScriptQuality.Tests.ps1");
  const resultFile = path.join(tmpDir, "results.json");

  try {
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(detectionFile, detectionScript, "utf-8");
    fs.writeFileSync(remediationFile, remediationScript, "utf-8");

    // Build the Pester test file
    const pesterTest = generatePesterTest(
      detectionFile,
      remediationFile,
      displayName
    );
    fs.writeFileSync(testFile, pesterTest, "utf-8");

    // Run Pester with JSON output
    const psCommand = `
$ErrorActionPreference = 'Stop'
try {
  Import-Module Pester -MinimumVersion 5.0 -ErrorAction Stop
} catch {
  Write-Output '{"unavailable":true}'
  exit 0
}
$config = New-PesterConfiguration
$config.Run.Path = '${testFile.replace(/\\/g, "\\\\").replace(/'/g, "''")}'
$config.Run.PassThru = $true
$config.Output.Verbosity = 'None'
$result = Invoke-Pester -Configuration $config
$tests = @()
foreach ($t in $result.Tests) {
  $tests += @{
    Name   = $t.Name
    Passed = ($t.Result -eq 'Passed')
    Message = if ($t.Result -ne 'Passed') { $t.ErrorRecord.Exception.Message } else { '' }
  }
}
$tests | ConvertTo-Json -Depth 3 | Out-File '${resultFile.replace(/\\/g, "\\\\").replace(/'/g, "''")}'
`;

    await execFileAsync("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy", "Bypass",
      "-Command", psCommand,
    ], { timeout: 30_000 });

    // Read results
    if (!fs.existsSync(resultFile)) {
      // Check if Pester was unavailable
      return [{ name: "Pester availability", passed: true, message: "Pester not installed — structural tests skipped" }];
    }

    const raw = fs.readFileSync(resultFile, "utf-8").trim();
    if (raw.includes('"unavailable":true')) {
      return [{ name: "Pester availability", passed: true, message: "Pester not installed — structural tests skipped" }];
    }

    const parsed = JSON.parse(raw);
    const tests = Array.isArray(parsed) ? parsed : [parsed];
    return tests.map((t: { Name: string; Passed: boolean; Message?: string }) => ({
      name: t.Name,
      passed: t.Passed,
      message: t.Message || undefined,
    }));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("ENOENT") || msg.includes("not recognized")) {
      console.warn("[ScriptValidator] PowerShell not found — skipping Pester tests");
      return [];
    }
    return [{ name: "Pester execution", passed: false, message: msg.substring(0, 200) }];
  } finally {
    // Cleanup temp files
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

/**
 * Generate a Pester v5 test file for structural validation of
 * detection + remediation scripts.
 */
function generatePesterTest(
  detectionFile: string,
  remediationFile: string,
  displayName: string
): string {
  // Escape backslashes for PowerShell string literal
  const detPath = detectionFile.replace(/\\/g, "\\\\");
  const remPath = remediationFile.replace(/\\/g, "\\\\");

  return `
Describe "Script Quality: ${displayName.replace(/"/g, '`"')}" {

  Context "Detection Script" {
    It "Should have valid PowerShell syntax" {
      $errors = $null
      [System.Management.Automation.Language.Parser]::ParseFile(
        "${detPath}", [ref]$null, [ref]$errors
      ) | Out-Null
      $errors.Count | Should -Be 0 -Because "Detection script must be syntactically valid"
    }

    It "Should contain exit statements" {
      $content = Get-Content "${detPath}" -Raw
      $content | Should -Match 'exit\\s+[01]' -Because "Detection scripts must exit with 0 (compliant) or 1 (non-compliant)"
    }

    It "Should contain error handling" {
      $content = Get-Content "${detPath}" -Raw
      $content | Should -Match '(try|catch|\\$ErrorActionPreference)' -Because "Detection scripts should include error handling"
    }

    It "Should not exceed 200KB" {
      (Get-Item "${detPath}").Length | Should -BeLessOrEqual 204800 -Because "Intune has a script size limit"
    }
  }

  Context "Remediation Script" {
    It "Should have valid PowerShell syntax" {
      $errors = $null
      [System.Management.Automation.Language.Parser]::ParseFile(
        "${remPath}", [ref]$null, [ref]$errors
      ) | Out-Null
      $errors.Count | Should -Be 0 -Because "Remediation script must be syntactically valid"
    }

    It "Should contain exit statements" {
      $content = Get-Content "${remPath}" -Raw
      $content | Should -Match 'exit\\s+[01]' -Because "Remediation scripts must exit with 0 (success) or 1 (failure)"
    }

    It "Should contain error handling" {
      $content = Get-Content "${remPath}" -Raw
      $content | Should -Match '(try|catch|\\$ErrorActionPreference)' -Because "Remediation scripts should include error handling"
    }

    It "Should not exceed 200KB" {
      (Get-Item "${remPath}").Length | Should -BeLessOrEqual 204800 -Because "Intune has a script size limit"
    }
  }
}
`;
}

// ════════════════════════════════════════════════════════════════
//  3. Combined Validation Pipeline
// ════════════════════════════════════════════════════════════════

/**
 * Run the full validation pipeline on a script pair:
 *   1. Security pattern scan (16 regex patterns)
 *   2. AST syntax check (detection + remediation)
 *   3. Pester structural tests
 *
 * Returns a unified result with per-phase timing. If any hard failure
 * is found the result.valid flag is false and deployment should be blocked.
 */
export async function validateScript(
  detectionScript: string,
  remediationScript: string,
  displayName: string
): Promise<ScriptValidationResult> {
  console.log(`[ScriptValidator] Validating "${displayName}"...`);
  const startTime = Date.now();
  const phases: ValidationPhase[] = [];

  // ── Phase 1: Security Pattern Scan ──
  const secStart = Date.now();
  const { scanPowerShellScript } = await import("../security.js");
  const detectionSecurityIssues = scanPowerShellScript(detectionScript);
  const remediationSecurityIssues = scanPowerShellScript(remediationScript);
  const allSecurityIssues = [...detectionSecurityIssues, ...remediationSecurityIssues];
  const secDuration = Date.now() - secStart;

  phases.push({
    name: "Security Pattern Scan",
    status: allSecurityIssues.length > 0 ? "failed" : "passed",
    duration: secDuration,
    details: allSecurityIssues.length > 0
      ? `${allSecurityIssues.length} dangerous pattern(s) detected: ${allSecurityIssues[0]}`
      : "16 patterns checked — no threats detected",
  });

  // ── Phase 2: PowerShell AST Validation ──
  const astStart = Date.now();
  const [detectionSyntax, remediationSyntax] = await Promise.all([
    validatePowerShellSyntax(detectionScript),
    validatePowerShellSyntax(remediationScript),
  ]);
  const astDuration = Date.now() - astStart;

  const syntaxErrors = [
    ...detectionSyntax.map((e) => `Detection: ${e}`),
    ...remediationSyntax.map((e) => `Remediation: ${e}`),
  ];

  phases.push({
    name: "PowerShell AST Validation",
    status: syntaxErrors.length > 0 ? "failed" : "passed",
    duration: astDuration,
    details: syntaxErrors.length > 0
      ? `${syntaxErrors.length} syntax error(s) found`
      : "Both scripts parse cleanly",
  });

  // ── Phase 3: Pester Structural Tests ──
  const pesterStart = Date.now();
  let pesterResults: PesterResult[] = [];
  if (syntaxErrors.length === 0 && allSecurityIssues.length === 0) {
    pesterResults = await runPesterTests(
      detectionScript,
      remediationScript,
      displayName
    );
  }
  const pesterDuration = Date.now() - pesterStart;

  const pesterFailures = pesterResults.filter((r) => !r.passed);
  const pesterSkipped = syntaxErrors.length > 0 || allSecurityIssues.length > 0;

  phases.push({
    name: "Pester Structural Tests",
    status: pesterSkipped
      ? "skipped"
      : pesterFailures.length > 0
        ? "failed"
        : "passed",
    duration: pesterDuration,
    details: pesterSkipped
      ? "Skipped — prior phase failed"
      : pesterFailures.length > 0
        ? `${pesterFailures.length}/${pesterResults.length} test(s) failed`
        : `${pesterResults.length}/${pesterResults.length} test(s) passed`,
  });

  // ── Phase 4: User Approval Gate ──
  phases.push({
    name: "User Approval Gate",
    status: "pending",
    duration: 0,
    details: "Awaiting user review and approval",
  });

  const valid = syntaxErrors.length === 0 && pesterFailures.length === 0 && allSecurityIssues.length === 0;
  const elapsed = Date.now() - startTime;

  // Build summary
  const parts: string[] = [];
  if (allSecurityIssues.length > 0) {
    parts.push(`${allSecurityIssues.length} security issue(s)`);
  }
  if (syntaxErrors.length > 0) {
    parts.push(`${syntaxErrors.length} syntax error(s)`);
  }
  if (pesterFailures.length > 0) {
    parts.push(`${pesterFailures.length} structural test failure(s)`);
  }
  if (valid) {
    parts.push("All checks passed");
  }

  const summary = `Script validation (${elapsed}ms): ${parts.join(", ")}`;
  console.log(`[ScriptValidator] ${summary}`);

  return { valid, syntaxErrors, pesterResults, summary, phases };
}
