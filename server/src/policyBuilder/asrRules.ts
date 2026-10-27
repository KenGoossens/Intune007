/**
 * Attack Surface Reduction (ASR) rule definitions for the Settings Catalog.
 *
 * Setting IDs and option suffixes were read from the live Graph beta
 * `configurationPolicyTemplates` ASR template, not transcribed by hand.
 *
 * ASR settings are not top-level capable — `rootDefinitionId` on each rule
 * points at ASR_GROUP_SETTING_ID — so they must be nested inside a group
 * setting collection instance. See buildAsrSettings().
 */

export const ASR_GROUP_SETTING_ID =
  "device_vendor_msft_policy_config_defender_attacksurfacereductionrules";

const SETTING_PREFIX = `${ASR_GROUP_SETTING_ID}_`;

export const ASR_RULE_MODES = ["off", "block", "audit", "warn"] as const;
export type AsrRuleMode = (typeof ASR_RULE_MODES)[number];

export interface AsrRuleDefinition {
  /** Stable short key used in the agent tool schema and NL prompt. */
  name: string;
  /** Settings Catalog slug, appended to SETTING_PREFIX to form the setting ID. */
  slug: string;
  /** Microsoft's display name for the rule. */
  displayName: string;
}

export const ASR_RULES: readonly AsrRuleDefinition[] = [
  {
    name: "block_vulnerable_signed_drivers",
    slug: "blockabuseofexploitedvulnerablesigneddrivers",
    displayName: "Block abuse of exploited vulnerable signed drivers",
  },
  {
    name: "block_adobe_reader_child_processes",
    slug: "blockadobereaderfromcreatingchildprocesses",
    displayName: "Block Adobe Reader from creating child processes",
  },
  {
    name: "block_office_child_processes",
    slug: "blockallofficeapplicationsfromcreatingchildprocesses",
    displayName: "Block all Office applications from creating child processes",
  },
  {
    name: "block_credential_stealing_lsass",
    slug: "blockcredentialstealingfromwindowslocalsecurityauthoritysubsystem",
    displayName:
      "Block credential stealing from the Windows local security authority subsystem",
  },
  {
    name: "block_executable_content_email",
    slug: "blockexecutablecontentfromemailclientandwebmail",
    displayName: "Block executable content from email client and webmail",
  },
  {
    name: "block_untrusted_executables",
    slug: "blockexecutablefilesrunningunlesstheymeetprevalenceagetrustedlistcriterion",
    displayName:
      "Block executable files from running unless they meet a prevalence, age, or trusted list criterion",
  },
  {
    name: "block_obfuscated_scripts",
    slug: "blockexecutionofpotentiallyobfuscatedscripts",
    displayName: "Block execution of potentially obfuscated scripts",
  },
  {
    name: "block_js_vbs_downloaded_content",
    slug: "blockjavascriptorvbscriptfromlaunchingdownloadedexecutablecontent",
    displayName:
      "Block JavaScript or VBScript from launching downloaded executable content",
  },
  {
    name: "block_office_executable_content",
    slug: "blockofficeapplicationsfromcreatingexecutablecontent",
    displayName: "Block Office applications from creating executable content",
  },
  {
    name: "block_office_code_injection",
    slug: "blockofficeapplicationsfrominjectingcodeintootherprocesses",
    displayName: "Block Office applications from injecting code into other processes",
  },
  {
    name: "block_outlook_child_processes",
    slug: "blockofficecommunicationappfromcreatingchildprocesses",
    displayName: "Block Office communication application from creating child processes",
  },
  {
    name: "block_wmi_persistence",
    slug: "blockpersistencethroughwmieventsubscription",
    displayName: "Block persistence through WMI event subscription",
  },
  {
    name: "block_psexec_wmi_process_creation",
    slug: "blockprocesscreationsfrompsexecandwmicommands",
    displayName: "Block process creations originating from PSExec and WMI commands",
  },
  {
    name: "block_safe_mode_reboot",
    slug: "blockrebootingmachineinsafemode",
    displayName: "Block rebooting machine in Safe Mode",
  },
  {
    name: "block_untrusted_usb_processes",
    slug: "blockuntrustedunsignedprocessesthatrunfromusb",
    displayName: "Block untrusted and unsigned processes that run from USB",
  },
  {
    name: "block_copied_system_tools",
    slug: "blockuseofcopiedorimpersonatedsystemtools",
    displayName: "Block use of copied or impersonated system tools",
  },
  {
    name: "block_webshell_creation",
    slug: "blockwebshellcreationforservers",
    displayName: "Block Webshell creation for Servers",
  },
  {
    name: "block_win32_api_office_macros",
    slug: "blockwin32apicallsfromofficemacros",
    displayName: "Block Win32 API calls from Office macros",
  },
  {
    name: "advanced_ransomware_protection",
    slug: "useadvancedprotectionagainstransomware",
    displayName: "Use advanced protection against ransomware",
  },
] as const;

export const ASR_RULE_BY_NAME: ReadonlyMap<string, AsrRuleDefinition> = new Map(
  ASR_RULES.map((rule) => [rule.name, rule])
);

export interface AsrRuleSelection {
  rule: string;
  mode: AsrRuleMode;
}

export function isAsrRuleMode(value: unknown): value is AsrRuleMode {
  return ASR_RULE_MODES.includes(value as AsrRuleMode);
}

/**
 * Builds the `settings` array for a Settings Catalog ASR policy.
 * Throws on an unknown rule name or mode so a bad selection fails before
 * anything reaches Graph.
 */
export function buildAsrSettings(selections: AsrRuleSelection[]): Record<string, unknown>[] {
  if (!selections.length) {
    throw new Error("At least one ASR rule must be specified");
  }

  const children = selections.map(({ rule, mode }) => {
    const definition = ASR_RULE_BY_NAME.get(rule);
    if (!definition) {
      throw new Error(
        `Unknown ASR rule "${rule}". Valid rules: ${[...ASR_RULE_BY_NAME.keys()].join(", ")}`
      );
    }
    if (!isAsrRuleMode(mode)) {
      throw new Error(
        `Invalid mode "${mode}" for ASR rule "${rule}". Valid modes: ${ASR_RULE_MODES.join(", ")}`
      );
    }

    const settingId = `${SETTING_PREFIX}${definition.slug}`;
    return {
      "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
      settingDefinitionId: settingId,
      choiceSettingValue: {
        "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingValue",
        value: `${settingId}_${mode}`,
        children: [],
      },
    };
  });

  return [
    {
      "@odata.type": "#microsoft.graph.deviceManagementConfigurationSetting",
      settingInstance: {
        "@odata.type":
          "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
        settingDefinitionId: ASR_GROUP_SETTING_ID,
        groupSettingCollectionValue: [{ children }],
      },
    },
  ];
}

/** Graph body for POST /deviceManagement/configurationPolicies. */
export function buildAsrPolicyBody(
  displayName: string,
  description: string,
  selections: AsrRuleSelection[]
): Record<string, unknown> {
  return {
    name: displayName,
    description,
    platforms: "windows10",
    technologies: "mdm",
    settings: buildAsrSettings(selections),
  };
}
