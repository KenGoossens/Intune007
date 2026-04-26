/**
 * Policy Builder — AI-powered policy generation from natural language.
 *
 * Takes a plain English description of desired security/compliance requirements
 * and generates the full Intune policy JSON body using Azure OpenAI.
 * Supports compliance policies and configuration profiles.
 */

import { AzureOpenAI } from "openai";
import { config } from "../config.js";

export type PolicyType = "compliance" | "configuration";
export type PolicyPlatform = "windows10" | "ios" | "android" | "macOS";

export interface GeneratedPolicy {
  displayName: string;
  description: string;
  policyType: PolicyType;
  platform: PolicyPlatform;
  odataType: string;
  settings: Record<string, unknown>;
  fullBody: Record<string, unknown>;
  explanation: string;
  settingsSummary: Array<{ setting: string; value: string; description: string }>;
}

const POLICY_BUILDER_PROMPT = `You are an expert Microsoft Intune security architect following CIS Benchmarks, NIST 800-171, and Microsoft Security Baselines. You generate the MOST SECURE Intune policies from natural language descriptions.

SECURITY-FIRST APPROACH:
- Always recommend the strongest security settings available
- When the user asks for a "basic" or "standard" policy, still use strong security defaults
- Include ALL relevant security settings for the platform, not just what the user explicitly asked for
- Add a "Security Rationale" in the explanation for each setting, referencing industry standards where applicable

SECURITY BEST PRACTICES BY PLATFORM:

Windows 10/11 Compliance (always include these unless explicitly excluded):
- bitLockerEnabled: true (CIS 1.1.1 — Full disk encryption)
- secureBootEnabled: true (CIS 1.1.2 — UEFI Secure Boot)
- codeIntegrityEnabled: true (CIS 1.1.3 — Code integrity validation)
- storageRequireEncryption: true (NIST — Data-at-rest encryption)
- requireHealthyDeviceReport: true (Device Health Attestation)
- earlyLaunchAntiMalwareDriverEnabled: true (ELAM protection)
- passwordRequired: true
- passwordBlockSimple: true (Block "1234", "password", etc.)
- passwordMinimumLength: 12 (NIST 800-63B recommends 8+, CIS recommends 14)
- passwordRequiredType: "alphanumeric"
- passwordMinutesOfInactivityBeforeLock: 5 (CIS 18.9.12)
- passwordExpirationDays: 365 (NIST no longer recommends forced rotation, but annual is reasonable)
- passwordPreviousPasswordBlockCount: 5

Windows 10/11 Configuration (security hardening):
- firewallEnabled: true (CIS 9.1.1)
- firewallBlockAllIncoming: false (true breaks connectivity for most orgs)
- defenderRequireRealTimeMonitoring: true (CIS 18.9.47)
- usbBlocked: false (consider true for high-security environments)
- storageBlockRemovableStorage: true (Data exfiltration prevention)
- screenCaptureBlocked: false (enable for sensitive environments)
- passwordRequired: true
- passwordMinimumLength: 12
- passwordBlockSimple: true

iOS Compliance (security baseline):
- passcodeRequired: true
- passcodeMinimumLength: 6 (Apple minimum)
- passcodeRequiredType: "alphanumeric" for high security, "numeric" for standard
- securityBlockJailbrokenDevices: true (ALWAYS — jailbroken devices are compromised)
- managedEmailProfileRequired: true (Ensure corporate email is managed)

Android Compliance (security baseline):
- passwordRequired: true
- passwordMinimumLength: 6
- passwordRequiredType: "atLeastAlphanumeric"
- securityBlockJailbrokenDevices: true (ALWAYS — rooted devices are compromised)
- storageRequireEncryption: true
- securityPreventInstallAppsFromUnknownSources: true (Block sideloading)

IMPORTANT RULES:

1. Always include the correct @odata.type:
   - Windows compliance: "#microsoft.graph.windows10CompliancePolicy"
   - iOS compliance: "#microsoft.graph.iosCompliancePolicy"
   - Android compliance: "#microsoft.graph.androidCompliancePolicy"
   - macOS compliance: "#microsoft.graph.macOSCompliancePolicy"
   - Windows config: "#microsoft.graph.windows10GeneralConfiguration"
   - iOS config: "#microsoft.graph.iosGeneralDeviceConfiguration"

2. Only use VALID Graph API property names listed above.
3. Infer platform from context (default Windows).
4. Compliance = health requirements, Configuration = restrictions/hardening.
5. Do NOT include scheduledActionsForRule — added automatically.
6. When the user says "secure", "hardened", or "strict" — enable EVERY security setting at maximum strength.
7. When the user says "basic" or "standard" — still enable core security (encryption, password, antimalware) but use moderate values.

Return JSON with these fields:
{
  "displayName": "Short name (max 64 chars)",
  "description": "What this policy enforces",
  "policyType": "compliance" or "configuration",
  "platform": "windows10" | "ios" | "android" | "macOS",
  "odataType": "The @odata.type string",
  "settings": { /* exact Graph API property names and values */ },
  "explanation": "Security rationale for each setting, referencing CIS/NIST where applicable",
  "settingsSummary": [
    { "setting": "BitLocker Encryption", "value": "Required", "description": "CIS 1.1.1 — Full disk encryption prevents data theft from lost/stolen devices" }
  ]
}

Return ONLY the JSON object, no markdown code fences.`;

/**
 * Benchmark-specific overlay instructions.
 * Each benchmark adds/adjusts settings on top of the base prompt.
 */
const BENCHMARK_OVERLAYS: Record<string, string> = {
  cis_l1: `BENCHMARK: CIS Microsoft Intune Benchmark Level 1 (L1)
Apply CIS Level 1 settings — these are practical security settings that can be applied to most organizations without significant impact on functionality.
Key L1 requirements:
- Password minimum length: 14 characters (CIS 1.1.1)
- Password complexity: alphanumeric required (CIS 1.1.2)
- BitLocker encryption required (CIS 1.2.1)
- Secure Boot enabled (CIS 1.2.2)
- Firewall enabled on all profiles (CIS 9.1.1, 9.2.1, 9.3.1)
- Windows Defender real-time protection (CIS 18.9.47.4.1)
- Screen lock after 5 minutes inactivity (CIS 18.9.12)
- Block simple passwords (CIS 1.1.3)
Reference each setting with its CIS control number in the settingsSummary.`,

  cis_l2: `BENCHMARK: CIS Microsoft Intune Benchmark Level 2 (L2)
Apply CIS Level 2 settings — these are stricter settings for high-security environments. Includes ALL L1 settings plus additional hardening.
Additional L2 requirements beyond L1:
- Block USB/removable storage (CIS 18.9.12.1)
- Block camera (CIS 18.9.13.1)
- Block Bluetooth (CIS 18.9.14.1)
- Block cloud sync (CIS 18.9.15.1)
- Block screen capture (CIS 18.9.16.1)
- Password minimum length: 14+ characters
- Password expiration: 60 days
- Password history: 24 remembered
- Code integrity required (CIS 1.2.3)
- Early launch antimalware required (CIS 1.2.4)
Reference each setting with its CIS control number.`,

  nist_800_171: `BENCHMARK: NIST SP 800-171 Rev 2 (Controlled Unclassified Information)
Apply settings aligned with NIST 800-171 for protecting CUI in non-federal systems.
Key NIST 800-171 families to address:
- 3.1 Access Control: Require authentication, limit sessions, lock after inactivity
- 3.5 Identification & Authentication: Minimum 12-char passwords, complexity, MFA support
- 3.8 Media Protection: Block removable storage, require encryption
- 3.13 System & Communications Protection: Enable firewall, encryption in transit/at rest
- 3.14 System & Information Integrity: Enable antimalware, system monitoring
- BitLocker/FileVault required (3.8.6)
- Minimum password length: 12 (3.5.7)
Reference each setting with its NIST 800-171 control family.`,

  iso_27001: `BENCHMARK: ISO/IEC 27001:2022 Annex A Controls
Apply settings aligned with ISO 27001 information security controls.
Key Annex A controls to address:
- A.8.1 User endpoint devices: Require encryption, passcode, auto-lock
- A.8.5 Secure authentication: Strong passwords, complexity requirements
- A.8.7 Protection against malware: Enable real-time antimalware
- A.8.8 Management of technical vulnerabilities: Require OS updates, health attestation
- A.8.9 Configuration management: Enforce security baselines
- A.8.20 Networks security: Enable firewall, block unnecessary interfaces
- A.8.24 Use of cryptography: Full disk encryption, secure boot
Reference each setting with its ISO 27001 Annex A control number.`,

  essential_eight: `BENCHMARK: Australian Essential Eight (ACSC)
Apply settings aligned with the Australian Cyber Security Centre Essential Eight Maturity Model.
Key Essential Eight strategies to address:
- E1 Application Control: Block unknown apps (where possible via Intune)
- E2 Patch Applications: Require minimum OS version
- E3 Configure Microsoft Office Macros: Block macros (via configuration profile)
- E4 User Application Hardening: Block Flash, Java, ads
- E5 Restrict Administrative Privileges: Standard user context
- E6 Patch Operating Systems: Require current OS, health attestation
- E7 Multi-Factor Authentication: MFA support (note: CA policy, not device policy)
- E8 Regular Backups: Not directly configurable via Intune
Reference each setting with its Essential Eight strategy number.`,

  hipaa: `BENCHMARK: HIPAA Security Rule (Healthcare)
Apply settings aligned with HIPAA Security Rule for protecting ePHI.
Key HIPAA safeguards to address:
- 164.312(a)(1) Access Control: Unique user identification, automatic logoff
- 164.312(a)(2)(iv) Encryption and Decryption: Full disk encryption required
- 164.312(c)(1) Integrity: Code integrity, secure boot, health attestation
- 164.312(d) Authentication: Strong passwords, minimum 8 characters (recommend 12+)
- 164.312(e)(1) Transmission Security: Firewall enabled
- 164.308(a)(5)(ii)(B) Protection from Malicious Software: Real-time antimalware
- Screen lock after 5 minutes maximum (HIPAA best practice)
- Block removable storage (ePHI data loss prevention)
Reference each setting with its HIPAA regulation section.`,

  zero_trust: `BENCHMARK: Microsoft Zero Trust Security Model
Apply settings aligned with Zero Trust principles: "Never trust, always verify."
Zero Trust device requirements:
- Device MUST be compliant to access resources
- Full disk encryption required (verify device encryption)
- Secure Boot + Code Integrity + TPM required (hardware attestation)
- Health attestation required (verify device health before access)
- Real-time antimalware required (continuous threat protection)
- Strong authentication: 14+ character passwords, block simple passwords
- Auto-lock after 5 minutes inactivity
- Block removable storage (prevent data exfiltration)
- OS must be current version (patch compliance)
- Firewall must be enabled
ALL settings should be at maximum security. Zero Trust means the device proves its health before getting access.
Reference each setting with its Zero Trust principle (Verify explicitly, Use least privilege, Assume breach).`,

  custom: `BENCHMARK: Custom / Organization-Specific
Apply the most reasonable security settings based on the user's specific requirements.
Use industry best practices as defaults but follow the user's explicit instructions for any customizations.
Reference CIS/NIST where applicable but note this is a custom configuration.`,
};

/**
 * Generate an Intune policy from a natural language description.
 */
export async function generatePolicy(prompt: string, benchmark?: string): Promise<GeneratedPolicy> {
  const client = new AzureOpenAI({
    apiKey: config.azureOpenAI.apiKey,
    endpoint: config.azureOpenAI.endpoint,
    deployment: config.azureOpenAI.deployment,
    apiVersion: config.azureOpenAI.apiVersion,
  });

  const benchmarkOverlay = benchmark && BENCHMARK_OVERLAYS[benchmark]
    ? `\n\n${BENCHMARK_OVERLAYS[benchmark]}`
    : "";

  const completion = await client.chat.completions.create({
    model: config.azureOpenAI.deployment,
    messages: [
      { role: "system", content: POLICY_BUILDER_PROMPT + benchmarkOverlay },
      { role: "user", content: prompt },
    ],
  });

  const content = completion.choices[0]?.message?.content || "";

  // Remove markdown code fences if present
  const cleaned = content
    .replace(/^```json?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const parsed = JSON.parse(cleaned) as GeneratedPolicy;

  if (!parsed.settings || !parsed.odataType) {
    throw new Error("AI response missing required fields (settings or odataType)");
  }

  // Build the full Graph API body
  const fullBody: Record<string, unknown> = {
    "@odata.type": parsed.odataType,
    displayName: parsed.displayName || "Intune007 Policy",
    description: parsed.description || prompt,
    ...parsed.settings,
  };

  // Compliance policies MUST have scheduledActionsForRule with a block action.
  // Without this, Intune rejects the policy with:
  // "Compliance policy must have one and only one block scheduled action"
  if (parsed.policyType === "compliance" && !fullBody.scheduledActionsForRule) {
    fullBody.scheduledActionsForRule = [
      {
        ruleName: "PasswordRequired",
        scheduledActionConfigurations: [
          {
            actionType: "block",
            gracePeriodHours: 24,
            notificationTemplateId: "",
            notificationMessageCCList: [],
          },
        ],
      },
    ];
  }

  return {
    displayName: parsed.displayName || "Intune007 Policy",
    description: parsed.description || prompt,
    policyType: parsed.policyType || "compliance",
    platform: parsed.platform || "windows10",
    odataType: parsed.odataType,
    settings: parsed.settings,
    fullBody,
    explanation: parsed.explanation || "",
    settingsSummary: parsed.settingsSummary || [],
  };
}
