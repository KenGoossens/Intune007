/**
 * App Management — Remove apps from Intune (assignments first, then app).
 *
 * The correct sequence to fully remove an app from Intune is:
 *   1. Remove ALL assignments (required/available/uninstall)
 *   2. Delete the app itself
 *
 * If you skip step 1, the DELETE will fail with a 409 Conflict.
 *
 * Graph API:
 *   GET    /deviceAppManagement/mobileApps/{id}/assignments
 *   DELETE /deviceAppManagement/mobileApps/{id}/assignments/{assignmentId}
 *   DELETE /deviceAppManagement/mobileApps/{id}
 *
 * Required Permission: DeviceManagementApps.ReadWrite.All
 */

import { getGraphClient, fetchWithPagination } from "./client.js";

const BETA = "https://graph.microsoft.com/beta";

export interface AppRemovalStep {
  step: string;
  status: "success" | "failed" | "skipped";
  detail: string;
}

export interface AppRemovalResult {
  appId: string;
  appName: string;
  success: boolean;
  steps: AppRemovalStep[];
  summary: string;
}

/**
 * Get all assignments for an app.
 */
export async function getAppAssignments(
  appId: string
): Promise<Array<Record<string, unknown>>> {
  const client = getGraphClient();
  const result = await fetchWithPagination<Record<string, unknown>>(
    client,
    `${BETA}/deviceAppManagement/mobileApps/${appId}/assignments`,
    { maxItems: 100 }
  );
  return result.items;
}

/**
 * Remove a single assignment from an app.
 */
async function removeAssignment(
  appId: string,
  assignmentId: string
): Promise<void> {
  const client = getGraphClient();
  await client
    .api(`${BETA}/deviceAppManagement/mobileApps/${appId}/assignments/${assignmentId}`)
    .delete();
}

/**
 * Full app removal pipeline:
 *   1. Get app details (verify it exists)
 *   2. Remove all assignments
 *   3. Delete the app
 */
export async function removeApp(appId: string): Promise<AppRemovalResult> {
  const client = getGraphClient();
  const steps: AppRemovalStep[] = [];
  let appName = appId;

  // Step 1: Verify app exists and get its name
  try {
    const app = await client
      .api(`${BETA}/deviceAppManagement/mobileApps/${appId}`)
      .select("id,displayName")
      .get();
    appName = String(app.displayName || appId);
    steps.push({
      step: "Verify App",
      status: "success",
      detail: `Found app: "${appName}"`,
    });
  } catch (err: unknown) {
    return {
      appId,
      appName,
      success: false,
      steps: [{
        step: "Verify App",
        status: "failed",
        detail: `App not found: ${err instanceof Error ? err.message : String(err)}`,
      }],
      summary: `App ${appId} not found in Intune.`,
    };
  }

  // Step 2: Remove all assignments
  try {
    const assignments = await getAppAssignments(appId);

    if (assignments.length === 0) {
      steps.push({
        step: "Remove Assignments",
        status: "skipped",
        detail: "No assignments found — app is not assigned to any group.",
      });
    } else {
      let removed = 0;
      let failed = 0;

      for (const assignment of assignments) {
        const aId = String(assignment.id);
        try {
          await removeAssignment(appId, aId);
          removed++;
        } catch {
          failed++;
        }
      }

      if (failed > 0) {
        steps.push({
          step: "Remove Assignments",
          status: "failed",
          detail: `Removed ${removed} of ${assignments.length} assignments. ${failed} failed — the app cannot be deleted until all assignments are removed.`,
        });
        return {
          appId,
          appName,
          success: false,
          steps,
          summary: `Failed to remove all assignments for "${appName}". ${failed} assignment(s) could not be removed.`,
        };
      }

      steps.push({
        step: "Remove Assignments",
        status: "success",
        detail: `Removed all ${removed} assignment(s).`,
      });
    }
  } catch (err: unknown) {
    steps.push({
      step: "Remove Assignments",
      status: "failed",
      detail: `Error fetching assignments: ${err instanceof Error ? err.message : String(err)}`,
    });
    return {
      appId,
      appName,
      success: false,
      steps,
      summary: `Failed to query assignments for "${appName}".`,
    };
  }

  // Step 3: Delete the app
  try {
    await client
      .api(`${BETA}/deviceAppManagement/mobileApps/${appId}`)
      .delete();

    steps.push({
      step: "Delete App",
      status: "success",
      detail: `App "${appName}" deleted from Intune.`,
    });

    return {
      appId,
      appName,
      success: true,
      steps,
      summary: `Successfully removed "${appName}" from Intune (assignments cleared, app deleted).`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    steps.push({
      step: "Delete App",
      status: "failed",
      detail: `Delete failed: ${msg.substring(0, 200)}`,
    });
    return {
      appId,
      appName,
      success: false,
      steps,
      summary: `Assignments were removed but app deletion failed: ${msg.substring(0, 100)}`,
    };
  }
}

/**
 * Rename a single app in Intune.
 * PATCH /deviceAppManagement/mobileApps/{id}
 */
export async function renameApp(
  appId: string,
  newName: string
): Promise<{ appId: string; oldName: string; newName: string; success: boolean; error?: string }> {
  const client = getGraphClient();

  // Get current name + @odata.type
  const app = await client
    .api(`${BETA}/deviceAppManagement/mobileApps/${appId}`)
    .select("id,displayName")
    .get();

  const oldName = String(app.displayName || "");
  const odataType = app["@odata.type"] || "#microsoft.graph.win32LobApp";

  try {
    await client
      .api(`${BETA}/deviceAppManagement/mobileApps/${appId}`)
      .patch({
        "@odata.type": odataType,
        displayName: newName,
      });

    return { appId, oldName, newName, success: true };
  } catch (err: unknown) {
    return {
      appId,
      oldName,
      newName,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Bulk find-and-replace in app names across ALL managed apps.
 * For each app whose displayName contains `search`, replaces it with `replace`.
 */
export async function bulkRenameApps(
  search: string,
  replace: string
): Promise<{
  totalApps: number;
  matchedApps: number;
  renamedApps: number;
  failedApps: number;
  results: Array<{ appId: string; oldName: string; newName: string; success: boolean; error?: string }>;
}> {
  const client = getGraphClient();

  // Get all apps
  const apps = await fetchWithPagination<Record<string, unknown>>(
    client,
    `${BETA}/deviceAppManagement/mobileApps`,
    { select: "id,displayName", maxItems: 200 }
  );

  // Find apps that contain the search string
  const matched = apps.items.filter((app) => {
    const name = String(app.displayName || "");
    return name.includes(search);
  });

  const results: Array<{ appId: string; oldName: string; newName: string; success: boolean; error?: string }> = [];

  // Rename each matched app
  for (const app of matched) {
    const oldName = String(app.displayName || "");
    const newName = oldName.split(search).join(replace); // replaceAll equivalent
    const result = await renameApp(String(app.id), newName);
    results.push(result);
  }

  return {
    totalApps: apps.items.length,
    matchedApps: matched.length,
    renamedApps: results.filter((r) => r.success).length,
    failedApps: results.filter((r) => !r.success).length,
    results,
  };
}
