# PowerShell Script Quality Pipeline

Intune007 implements a multi-layer quality assurance pipeline for AI-generated
PowerShell remediation scripts. Scripts must pass all layers before deployment
to Intune.

## Architecture

```
User Prompt
    │
    ▼
┌──────────────────────────────┐
│  Azure OpenAI (gpt-5.3-chat) │   Layer 0: Structured Generation
│  SCRIPT_GENERATION_PROMPT     │   - Exit code contract
│  Idempotent, error-handling   │   - try/catch, PS 5.1+
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│  Security Pattern Scan        │   Layer 1: Regex Scan (16 patterns)
│  scanPowerShellScript()       │   - Blocks network exfil, IEX,
│  server/src/security.ts       │     persistence, shell escapes
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│  PowerShell AST Validation    │   Layer 2: Syntax Check
│  validatePowerShellSyntax()   │   - Uses native PS parser
│  scriptValidator.ts           │   - Zero false positives
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│  Pester v5 Structural Tests   │   Layer 3: Structural Tests
│  runPesterTests()             │   - Valid syntax
│  scriptValidator.ts           │   - Exit statements present
│                               │   - Error handling present
│                               │   - Size within limits
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│  User Approval Gate           │   Layer 4: Human Review
│  ScriptApprovalCard.tsx       │   - Shows validation results
│  POST /api/remediation/       │   - Approve or Reject
│    approve/:id                │   - 30-min expiry
└──────────────┬───────────────┘
               │ (only if approved)
               ▼
┌──────────────────────────────┐
│  Signature Check              │   Layer 5: Deployment Config
│  ENFORCE_SCRIPT_SIGNING env   │   - When true, Intune only runs
│  deployer.ts                  │     scripts signed by trusted CA
└──────────────┬───────────────┘
               │
               ▼
       Intune Graph API
       /deviceManagement/deviceHealthScripts
```

## Layer Details

### Layer 0: Structured Generation Prompt
**File:** `server/src/remediation/scriptGenerator.ts`

The system prompt enforces:
- PowerShell 5.1+ compatibility
- Detection scripts: exit 0 (compliant) / exit 1 (non-compliant)
- Remediation scripts: exit 0 (success) / exit 1 (failure)
- `$ErrorActionPreference = "Stop"` + try/catch blocks
- `Write-Output`/`Write-Host` for Intune logging
- Idempotent design (safe to run multiple times)
- No external modules unless absolutely necessary
- Comments explaining script behavior

### Layer 1: Security Pattern Scan (16 Regex Patterns)
**File:** `server/src/security.ts` — `scanPowerShellScript()`

Blocks scripts containing:
| Category | Patterns |
|----------|----------|
| Network exfiltration | Invoke-WebRequest to non-Microsoft URLs, Invoke-RestMethod, Start-BitsTransfer, Net.WebClient, DownloadFile/DownloadString |
| Code injection | IEX, Invoke-Expression, Assembly::Load, Add-Type with DllImport |
| Credential manipulation | ConvertTo-SecureString -AsPlainText |
| Reverse shells | System.Net.Sockets |
| Encoded execution | Start-Process powershell -enc |
| Shell escapes | cmd.exe /c |
| Persistence | sc.exe create/config, schtasks /create, reg add/delete...Run, net user /add |

**Exception:** `Invoke-WebRequest`/`Invoke-RestMethod` to `manage.microsoft.com` and `graph.microsoft.com` are allowed.

### Layer 2: PowerShell AST Validation
**File:** `server/src/remediation/scriptValidator.ts` — `validatePowerShellSyntax()`

Uses PowerShell's native parser (`[System.Management.Automation.Language.Parser]::ParseFile()`)
to detect syntax errors. This is the same parser the PowerShell runtime uses, so
there are **zero false positives** — if it says the script is invalid, it won't run.

Detects:
- Missing closing braces/parentheses
- Invalid variable references
- Bad command syntax
- Missing required parameters
- Unterminated strings

**Requirements:** PowerShell 5.1+ available on the server (`powershell.exe`).
If unavailable, this layer is skipped with a warning (graceful degradation).

### Layer 3: Pester v5 Structural Tests
**File:** `server/src/remediation/scriptValidator.ts` — `runPesterTests()`

Auto-generates and executes a Pester v5 test suite that validates:

| Test | What it checks |
|------|----------------|
| Valid PowerShell syntax | AST parse returns 0 errors |
| Contains exit statements | Script has `exit 0` or `exit 1` |
| Contains error handling | Script has `try`, `catch`, or `$ErrorActionPreference` |
| Size within limits | Script is ≤200KB (Intune limit) |

Tests run in a sandboxed PowerShell session with `-NoProfile -ExecutionPolicy Bypass`.
They validate **structure only** — they do NOT execute the remediation logic.

**Requirements:** Pester v5+ installed (`Install-Module Pester -MinimumVersion 5.0`).
If unavailable, this layer is skipped gracefully.

### Layer 4: User Approval Gate
**Files:**
- Server: `server/src/routes/remediation.ts` — `createScriptApproval()`, `POST /approve/:id`, `POST /reject/:id`
- Client: `client/src/components/ScriptApprovalCard.tsx`
- Store: `client/src/stores/remediationStore.ts` — `approveScript()`, `rejectScript()`

After generation and validation, scripts are stored in a pending approval queue.
The UI shows:
- Full validation results (syntax errors, Pester test outcomes)
- Pass/fail badge
- **Approve & Deploy** button (only if validation passed)
- **Reject** button (always available)

Approvals expire after 30 minutes. The user MUST explicitly click "Approve & Deploy"
before the script reaches Intune.

### Layer 5: Script Signing
**File:** `server/src/remediation/deployer.ts`

Controlled by environment variable:
```env
ENFORCE_SCRIPT_SIGNING=true
```

When enabled, the `enforceSignatureCheck` property is set to `true` on the
Intune deviceHealthScript resource. This means Intune will **only execute
scripts that are signed by a trusted code signing certificate**.

Default: `false` (signing not required).

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ENFORCE_SCRIPT_SIGNING` | `false` | Set to `true` to require code-signed scripts in Intune |
| `SKIP_SCRIPT_VALIDATION` | `false` | Set to `true` to skip AST + Pester validation (not recommended) |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/remediation/pending-approvals` | List scripts awaiting user approval |
| POST | `/api/remediation/approve/:id` | Approve and deploy a pending script |
| POST | `/api/remediation/reject/:id` | Reject and discard a pending script |

## Flow Comparison: Before vs After

### Before (direct deploy)
```
User asks → Agent generates → Security scan → Agent auto-confirms → Deploy
```

### After (quality pipeline)
```
User asks → Agent generates → Security scan → AST validation → Pester tests
  → User reviews validation results → User clicks Approve → Deploy
```

## Known Limitations

1. **Regex bypass risk** — Obfuscated patterns (backtick splitting, variable invocations)
   can evade Layer 1. Layers 2-4 partially compensate.
2. **No runtime sandbox** — Scripts are not executed in a sandbox before deployment.
   Pester tests validate structure only.
3. **Pester dependency** — Layer 3 requires Pester v5+ installed on the server.
   Without it, only AST validation runs.
4. **PowerShell dependency** — Layers 2-3 require `powershell.exe` on the server.
   On Linux servers, use `pwsh` (PowerShell Core).
