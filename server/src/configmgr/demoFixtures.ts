/**
 * ConfigMgr demo mode — canned AdminService responses.
 *
 * Interception happens at the HTTP boundary, so everything above it runs for
 * real: OData URL building, WMI method paths, request bodies, the response
 * mappers, error handling, the confirmation gate and audit logging. These
 * fixtures are therefore the raw AdminService wire shape (`{ value: [...] }`
 * with PascalCase WMI properties), not the mapped interfaces.
 *
 * The host is under .invalid (RFC 2606), which can never resolve, so a request
 * that escapes interception fails immediately rather than reaching a real site.
 */

export const DEMO_HOST = "configmgr.demo.invalid";
export const DEMO_ADMIN_SERVICE_URL = `https://${DEMO_HOST}/AdminService`;

export function isDemoHost(fullUrl: string): boolean {
  try {
    return new URL(fullUrl).hostname === DEMO_HOST;
  } catch {
    return false;
  }
}

// ─── The fake site ───────────────────────────────────────────────

const SITE = { SiteCode: "DMO", SiteName: "Contoso Demo Site (simulated)", Version: "5.00.9122.1000" };

const COLLECTIONS = [
  { CollectionID: "SMS00001", Name: "All Systems", MemberCount: 214, CollectionType: 2, Comment: "Built-in", LimitToCollectionName: "" },
  { CollectionID: "SMS0003A", Name: "All Desktop and Server Clients", MemberCount: 198, CollectionType: 2, Comment: "Built-in", LimitToCollectionName: "All Systems" },
  { CollectionID: "DMO00012", Name: "Windows 11 Pilot", MemberCount: 24, CollectionType: 2, Comment: "Pilot ring for feature updates", LimitToCollectionName: "All Systems" },
  { CollectionID: "DMO00018", Name: "Finance Workstations", MemberCount: 41, CollectionType: 2, Comment: "Finance department devices", LimitToCollectionName: "All Systems" },
  { CollectionID: "DMO00024", Name: "OSD Staging", MemberCount: 7, CollectionType: 2, Comment: "Prestaged computers awaiting imaging", LimitToCollectionName: "All Systems" },
  { CollectionID: "DMO00031", Name: "Co-management Eligible", MemberCount: 156, CollectionType: 2, Comment: "Devices ready for Intune workload transition", LimitToCollectionName: "All Systems" },
];

const DEVICES = [
  { ResourceID: 16777219, Name: "DMO-FIN-0012", Active: 1 },
  { ResourceID: 16777220, Name: "DMO-FIN-0013", Active: 1 },
  { ResourceID: 16777221, Name: "DMO-ENG-0041", Active: 1 },
  { ResourceID: 16777222, Name: "DMO-ENG-0042", Active: 1 },
  { ResourceID: 16777223, Name: "DMO-HR-0007", Active: 1 },
  { ResourceID: 16777224, Name: "DMO-SRV-0001", Active: 1 },
  { ResourceID: 16777225, Name: "DMO-SRV-0002", Active: 1 },
  { ResourceID: 16777226, Name: "DMO-LAB-0003", Active: 0 },
];

const TOTAL_DEVICES = 214;

/** Which collections each demo device belongs to. */
const MEMBERSHIP: Record<number, string[]> = {
  16777219: ["SMS00001", "SMS0003A", "DMO00018"],
  16777220: ["SMS00001", "SMS0003A", "DMO00018", "DMO00031"],
  16777221: ["SMS00001", "SMS0003A", "DMO00012", "DMO00031"],
  16777222: ["SMS00001", "SMS0003A", "DMO00012"],
  16777223: ["SMS00001", "SMS0003A"],
  16777224: ["SMS00001", "SMS0003A"],
  16777225: ["SMS00001", "SMS0003A"],
  16777226: ["SMS00001", "DMO00024"],
};

const DEPLOYMENTS = [
  { DeploymentID: "DMO20001", AssignmentID: 20001, SoftwareName: "Microsoft 365 Apps for enterprise", CollectionName: "All Desktop and Server Clients", DeploymentIntent: 1, FeatureType: 1, NumberTargeted: 198, NumberSuccess: 181, NumberErrors: 4, NumberInProgress: 9, NumberUnknown: 4 },
  { DeploymentID: "DMO20002", AssignmentID: 20002, SoftwareName: "7-Zip 24.08", CollectionName: "All Desktop and Server Clients", DeploymentIntent: 2, FeatureType: 1, NumberTargeted: 198, NumberSuccess: 142, NumberErrors: 1, NumberInProgress: 2, NumberUnknown: 53 },
  { DeploymentID: "DMO20003", AssignmentID: 20003, SoftwareName: "Windows 11 23H2 Feature Update", CollectionName: "Windows 11 Pilot", DeploymentIntent: 1, FeatureType: 5, NumberTargeted: 24, NumberSuccess: 19, NumberErrors: 2, NumberInProgress: 3, NumberUnknown: 0 },
  { DeploymentID: "DMO20004", AssignmentID: 20004, SoftwareName: "Notepad++ 8.6.9", CollectionName: "Finance Workstations", DeploymentIntent: 2, FeatureType: 1, NumberTargeted: 41, NumberSuccess: 33, NumberErrors: 0, NumberInProgress: 1, NumberUnknown: 7 },
];

const APPLICATIONS = [
  { CI_ID: 16801, LocalizedDisplayName: "Microsoft 365 Apps for enterprise", Manufacturer: "Microsoft", SoftwareVersion: "16.0.17928", NumberOfDeployments: 1, NumberOfDevicesWithApp: 181, IsDeployed: true, DateCreated: "2026-02-11T09:14:00Z" },
  { CI_ID: 16842, LocalizedDisplayName: "7-Zip", Manufacturer: "Igor Pavlov", SoftwareVersion: "24.08", NumberOfDeployments: 1, NumberOfDevicesWithApp: 142, IsDeployed: true, DateCreated: "2026-03-02T13:40:00Z" },
  { CI_ID: 16877, LocalizedDisplayName: "Notepad++", Manufacturer: "Notepad++ Team", SoftwareVersion: "8.6.9", NumberOfDeployments: 1, NumberOfDevicesWithApp: 33, IsDeployed: true, DateCreated: "2026-05-19T08:05:00Z" },
  { CI_ID: 16903, LocalizedDisplayName: "Contoso Expenses", Manufacturer: "Contoso", SoftwareVersion: "3.2.1", NumberOfDeployments: 0, NumberOfDevicesWithApp: 0, IsDeployed: false, DateCreated: "2026-08-27T15:22:00Z" },
];

/**
 * Per-device deployment failures. Codes are real, documented ones so the
 * error table resolves them — except DMO20003's second row, which carries a
 * deliberately unrecognised code so the "I don't know this one" path is
 * demonstrable rather than theoretical.
 */
const DEPLOYMENT_ERRORS_BY_ASSIGNMENT: Record<number, Record<string, unknown>[]> = {
  // Microsoft 365 Apps — 4 errors
  20001: [
    { MachineName: "DMO-FIN-0012", MachineID: 16777219, StatusType: 5, EnforcementState: 11, ErrorCode: -2016410844 }, // 0x87D00324
    { MachineName: "DMO-ENG-0041", MachineID: 16777221, StatusType: 5, EnforcementState: 11, ErrorCode: -2016410844 }, // 0x87D00324
    { MachineName: "DMO-HR-0007", MachineID: 16777223, StatusType: 5, EnforcementState: 2, ErrorCode: -2016410105 },   // 0x87D00607
    { MachineName: "DMO-SRV-0002", MachineID: 16777225, StatusType: 5, EnforcementState: 11, ErrorCode: 1603 },
  ],
  // 7-Zip — 1 error
  20002: [
    { MachineName: "DMO-LAB-0003", MachineID: 16777226, StatusType: 5, EnforcementState: 14, ErrorCode: -2016407033 }, // 0x87D01107
  ],
  // Windows 11 feature update — 2 errors, one deliberately unknown
  20003: [
    { MachineName: "DMO-ENG-0042", MachineID: 16777222, StatusType: 5, EnforcementState: 5, ErrorCode: -2016411001 },  // 0x87D00287 — not in the table
    { MachineName: "DMO-FIN-0013", MachineID: 16777220, StatusType: 5, EnforcementState: 11, ErrorCode: 1618 },
  ],
  20004: [],
};

/** Non-error assets, used when the full status breakdown is requested. */
const DEPLOYMENT_ASSETS_BY_ASSIGNMENT: Record<number, Record<string, unknown>[]> = {
  20001: [
    { MachineName: "DMO-FIN-0013", MachineID: 16777220, StatusType: 1, EnforcementState: 10 },
    { MachineName: "DMO-ENG-0042", MachineID: 16777222, StatusType: 1, EnforcementState: 10 },
    { MachineName: "DMO-SRV-0001", MachineID: 16777224, StatusType: 2, EnforcementState: 8 },
  ],
  20002: [
    { MachineName: "DMO-FIN-0012", MachineID: 16777219, StatusType: 1, EnforcementState: 10 },
    { MachineName: "DMO-ENG-0041", MachineID: 16777221, StatusType: 4, EnforcementState: 0 },
  ],
  20003: [
    { MachineName: "DMO-ENG-0041", MachineID: 16777221, StatusType: 1, EnforcementState: 10 },
  ],
  20004: [
    { MachineName: "DMO-FIN-0012", MachineID: 16777219, StatusType: 1, EnforcementState: 10 },
  ],
};

/**
 * CMPivot results, keyed by the entity the query asks for.
 *
 * CMPivot claims to be a live measurement of one device, so returning rows
 * that do not answer the query asked is worse than returning nothing: a
 * service list in response to `OS` is not sample data, it is a wrong answer.
 * Anything not listed here is refused rather than answered with these rows.
 */
const CMPIVOT_RESULTS: Record<string, (device: string) => Record<string, unknown>[]> = {
  os: (Device) => [
    {
      Device,
      Caption: "Microsoft Windows 11 Enterprise",
      Version: "10.0.26100",
      BuildNumber: "26100",
      InstallDate: "2026-03-14T09:12:00Z",
    },
  ],
  service: (Device) => [
    { Device, Name: "wuauserv", State: "Running", StartMode: "Auto" },
    { Device, Name: "CcmExec", State: "Running", StartMode: "Auto" },
    { Device, Name: "BITS", State: "Stopped", StartMode: "Manual" },
  ],
  process: (Device) => [
    { Device, Name: "CcmExec.exe", ProcessId: 3124, MemoryMB: 142 },
    { Device, Name: "explorer.exe", ProcessId: 5208, MemoryMB: 96 },
    { Device, Name: "OUTLOOK.EXE", ProcessId: 7744, MemoryMB: 412 },
  ],
  installedsoftware: (Device) => [
    { Device, ProductName: "Microsoft 365 Apps for enterprise", ProductVersion: "16.0.17928", Publisher: "Microsoft" },
    { Device, ProductName: "7-Zip", ProductVersion: "24.08", Publisher: "Igor Pavlov" },
    { Device, ProductName: "Configuration Manager Client", ProductVersion: "5.00.9122.1025", Publisher: "Microsoft" },
  ],
  disk: (Device) => [
    { Device, DeviceID: "C:", SizeGB: 475, FreeSpaceGB: 212 },
    { Device, DeviceID: "D:", SizeGB: 100, FreeSpaceGB: 94 },
  ],
  logicaldisk: (Device) => [
    { Device, DeviceID: "C:", SizeGB: 475, FreeSpaceGB: 212 },
    { Device, DeviceID: "D:", SizeGB: 100, FreeSpaceGB: 94 },
  ],
  ipconfig: (Device) => [
    { Device, IPAddress: "10.24.8.41", DefaultGateway: "10.24.8.1", MACAddress: "00:15:5D:3A:1C:77" },
  ],
};

/** The CMPivot entity a query asks about, e.g. "OS | project Caption" → "os". */
function cmPivotEntity(query: string): string {
  return String(query || "")
    .trim()
    .split("|")[0]
    .trim()
    .split(/\s+/)[0]
    .toLowerCase();
}

/** Operation ID → what was actually asked, so the result can answer that query. */
const cmPivotOperations = new Map<number, { entity: string; device: string }>();
let nextCmPivotOperationId = 880000;

// ─── Dispatch ────────────────────────────────────────────────────

function deviceByName(name: string): { ResourceID: number; Name: string } | undefined {
  return DEVICES.find((d) => d.Name.toLowerCase() === name.toLowerCase());
}

function collectionById(id: string) {
  return COLLECTIONS.find((c) => c.CollectionID.toLowerCase() === id.toLowerCase());
}

/**
 * Resolve a canned response for a demo AdminService request.
 * Throws for an unrecognised route so a gap surfaces instead of returning {}.
 */
export function demoResponse(
  method: string,
  fullUrl: string,
  body?: unknown
): Record<string, unknown> {
  const url = new URL(fullUrl);
  const path = decodeURIComponent(url.pathname);
  const search = decodeURIComponent(url.search);
  const upper = method.toUpperCase();

  // ─── Writes ───
  if (upper === "POST") {
    if (path.includes("ImportMachineEntry")) {
      const input = (body ?? {}) as Record<string, unknown>;
      return {
        MachineExists: false,
        ResourceID: 16777240,
        SMSUniqueIdentifier: "GUID:9A1C2E44-DEMO-4F2B-9C11-SIMULATEDREC",
        NetbiosName: input.NetbiosName,
        simulated: true,
      };
    }
    if (path.includes("AddMembershipRule")) {
      return { ReturnValue: 0, QueryID: 0, simulated: true };
    }
    if (path.includes("RunCMPivot")) {
      // Remember what was asked so the result can answer that query rather
      // than returning a canned list regardless of the question.
      const input = (body ?? {}) as Record<string, unknown>;
      const deviceMatch = path.match(/Device\((\d+)\)/);
      const resourceId = deviceMatch ? Number(deviceMatch[1]) : 0;
      const device = DEVICES.find((d) => d.ResourceID === resourceId)?.Name ?? "Unknown device";
      const operationId = nextCmPivotOperationId++;
      cmPivotOperations.set(operationId, {
        entity: cmPivotEntity(String(input.InputQuery ?? "")),
        device,
      });
      return { OperationId: operationId, simulated: true };
    }
  }

  // ─── CMPivot result polling ───
  if (path.includes("CMPivotResult")) {
    const opMatch = path.match(/OperationId=(\d+)/) ?? search.match(/OperationId=(\d+)/);
    const op = opMatch ? cmPivotOperations.get(Number(opMatch[1])) : undefined;
    const device = op?.device ?? "Unknown device";
    const builder = op ? CMPIVOT_RESULTS[op.entity] : undefined;

    if (!builder) {
      // Refuse rather than answer a question this demo cannot answer.
      return {
        value: [
          {
            Result: [
              {
                Device: device,
                Simulated: "Not available",
                Detail: op
                  ? `Demo mode has no simulated result for the CMPivot entity '${op.entity}'. CMPivot runs live on a real device, so nothing can be measured here. Connect a ConfigMgr site to run it for real.`
                  : "Demo mode could not match this CMPivot operation to a query.",
                SupportedInDemo: Object.keys(CMPIVOT_RESULTS).sort().join(", "),
              },
            ],
          },
        ],
      };
    }

    return { value: [{ Result: builder(device) }] };
  }

  // ─── Collection membership for one device ───
  if (path.includes("ResourceCollectionMembership")) {
    const match = path.match(/Device\((\d+)\)/);
    const resourceId = match ? Number(match[1]) : 0;
    const ids = MEMBERSHIP[resourceId] ?? ["SMS00001"];
    return {
      value: ids
        .map((id) => collectionById(id))
        .filter(Boolean)
        .map((c) => ({ Collection: { CollectionID: c!.CollectionID, Name: c!.Name } })),
    };
  }

  // ─── Reads ───
  // Order matters: dispatch is by substring, so the specific classes below
  // must be tested BEFORE the broader SMS_Collection / SMS_Application ones,
  // which would otherwise swallow them.
  if (path.includes("SMS_FullCollectionMembership")) {
    const match = search.match(/CollectionID eq '([^']*)'/);
    const collectionId = match ? match[1].replace(/''/g, "'") : "";
    const members = DEVICES.filter((d) =>
      (MEMBERSHIP[d.ResourceID] ?? []).some(
        (c) => c.toLowerCase() === collectionId.toLowerCase()
      )
    );
    return {
      value: members.map((d) => ({
        ResourceID: d.ResourceID,
        Name: d.Name,
        CollectionID: collectionId,
        IsActive: d.Active === 1,
        IsClient: true,
        ClientVersion: "5.00.9122.1025",
        SiteCode: SITE.SiteCode,
        Domain: "CONTOSO",
        DeviceCategory: "",
      })),
    };
  }

  if (path.includes("SMS_AppDeploymentErrorAssetDetails")) {
    const match = search.match(/AssignmentID eq (\d+)/);
    const id = match ? Number(match[1]) : 0;
    return { value: DEPLOYMENT_ERRORS_BY_ASSIGNMENT[id] ?? [] };
  }

  if (path.includes("SMS_AppDeploymentAssetDetails")) {
    const match = search.match(/AssignmentID eq (\d+)/);
    const id = match ? Number(match[1]) : 0;
    return { value: DEPLOYMENT_ASSETS_BY_ASSIGNMENT[id] ?? [] };
  }

  if (path.includes("SMS_Site")) return { value: [SITE] };
  if (path.includes("SMS_Collection")) return { value: COLLECTIONS };
  if (path.includes("SMS_DeploymentSummary")) return { value: DEPLOYMENTS };
  if (path.includes("SMS_Application")) {
    // A CI_ID filter means the detail view wants one application.
    const match = search.match(/CI_ID eq (\d+)/);
    if (match) {
      const ciId = Number(match[1]);
      const app = APPLICATIONS.find((a) => a.CI_ID === ciId);
      return {
        value: app
          ? [{
              ...app,
              LocalizedDescription: `${app.LocalizedDisplayName} deployed from the simulated Contoso demo site.`,
              DateLastModified: "2026-10-02T11:18:00Z",
              CreatedBy: "CONTOSO\\\\cmadmin",
              IsEnabled: true,
              IsSuperseded: false,
              NumberOfDeviceswithFailure: ciId === 16801 ? 4 : 0,
            }]
          : [],
      };
    }
    return { value: APPLICATIONS };
  }

  if (path.includes("SMS_R_System")) {
    // Exact count: the site honours $count, so the fallback page never runs.
    if (search.includes("$count=true")) {
      return { "@odata.count": TOTAL_DEVICES, value: [] };
    }
    // Device-name resolution used before a membership or write operation.
    const nameMatch = search.match(/Name eq '([^']*)'/);
    if (nameMatch) {
      const found = deviceByName(nameMatch[1].replace(/''/g, "'"));
      return { value: found ? [{ ResourceID: found.ResourceID, Name: found.Name }] : [] };
    }
    return { value: DEVICES };
  }

  throw new Error(`Demo mode has no fixture for ${upper} ${path}`);
}
