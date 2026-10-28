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
  { DeploymentID: "DMO20001", SoftwareName: "Microsoft 365 Apps for enterprise", CollectionName: "All Desktop and Server Clients", DeploymentIntent: 1, FeatureType: 1, NumberTargeted: 198, NumberSuccess: 181, NumberErrors: 4, NumberInProgress: 9, NumberUnknown: 4 },
  { DeploymentID: "DMO20002", SoftwareName: "7-Zip 24.08", CollectionName: "All Desktop and Server Clients", DeploymentIntent: 2, FeatureType: 1, NumberTargeted: 198, NumberSuccess: 142, NumberErrors: 1, NumberInProgress: 2, NumberUnknown: 53 },
  { DeploymentID: "DMO20003", SoftwareName: "Windows 11 23H2 Feature Update", CollectionName: "Windows 11 Pilot", DeploymentIntent: 1, FeatureType: 5, NumberTargeted: 24, NumberSuccess: 19, NumberErrors: 2, NumberInProgress: 3, NumberUnknown: 0 },
  { DeploymentID: "DMO20004", SoftwareName: "Notepad++ 8.6.9", CollectionName: "Finance Workstations", DeploymentIntent: 2, FeatureType: 1, NumberTargeted: 41, NumberSuccess: 33, NumberErrors: 0, NumberInProgress: 1, NumberUnknown: 7 },
];

const APPLICATIONS = [
  { CI_ID: 16801, LocalizedDisplayName: "Microsoft 365 Apps for enterprise", Manufacturer: "Microsoft", SoftwareVersion: "16.0.17928", NumberOfDeployments: 1, NumberOfDevicesWithApp: 181, IsDeployed: true, DateCreated: "2026-02-11T09:14:00Z" },
  { CI_ID: 16842, LocalizedDisplayName: "7-Zip", Manufacturer: "Igor Pavlov", SoftwareVersion: "24.08", NumberOfDeployments: 1, NumberOfDevicesWithApp: 142, IsDeployed: true, DateCreated: "2026-03-02T13:40:00Z" },
  { CI_ID: 16877, LocalizedDisplayName: "Notepad++", Manufacturer: "Notepad++ Team", SoftwareVersion: "8.6.9", NumberOfDeployments: 1, NumberOfDevicesWithApp: 33, IsDeployed: true, DateCreated: "2026-05-19T08:05:00Z" },
  { CI_ID: 16903, LocalizedDisplayName: "Contoso Expenses", Manufacturer: "Contoso", SoftwareVersion: "3.2.1", NumberOfDeployments: 0, NumberOfDevicesWithApp: 0, IsDeployed: false, DateCreated: "2026-08-27T15:22:00Z" },
];

const CMPIVOT_ROWS = [
  { Device: "DMO-FIN-0012", Name: "wuauserv", State: "Running", StartMode: "Auto" },
  { Device: "DMO-FIN-0012", Name: "CcmExec", State: "Running", StartMode: "Auto" },
  { Device: "DMO-FIN-0012", Name: "BITS", State: "Stopped", StartMode: "Manual" },
];

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
      return { OperationId: 884422, simulated: true };
    }
  }

  // ─── CMPivot result polling ───
  if (path.includes("CMPivotResult")) {
    return { value: [{ Result: CMPIVOT_ROWS }] };
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
  if (path.includes("SMS_Site")) return { value: [SITE] };
  if (path.includes("SMS_Collection")) return { value: COLLECTIONS };
  if (path.includes("SMS_DeploymentSummary")) return { value: DEPLOYMENTS };
  if (path.includes("SMS_Application")) return { value: APPLICATIONS };

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
