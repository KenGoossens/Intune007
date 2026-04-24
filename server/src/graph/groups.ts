/**
 * Groups — Azure AD / Entra ID group operations via Microsoft Graph API.
 *
 * Enables the agent to query groups, list members, create security groups,
 * and add devices/users as members — essential for targeting policies and
 * app assignments.
 *
 * Graph API Reference:
 *   https://learn.microsoft.com/en-us/graph/api/resources/group
 *
 * Required Permissions:
 *   Group.Read.All           (list groups, members)
 *   Group.ReadWrite.All      (create groups, add members)
 *   GroupMember.ReadWrite.All (add members)
 */

import { getGraphClient, fetchWithPagination } from "./client.js";

const GROUP_SELECT_FIELDS = [
  "id",
  "displayName",
  "description",
  "groupTypes",
  "membershipRule",
  "membershipRuleProcessingState",
  "securityEnabled",
  "mailEnabled",
  "mail",
  "createdDateTime",
].join(",");

const MEMBER_SELECT_FIELDS = [
  "id",
  "displayName",
  "userPrincipalName",
  "deviceId",
  "operatingSystem",
  "@odata.type",
].join(",");

export interface GroupInfo {
  id: string;
  displayName: string;
  description: string;
  groupTypes: string[];
  membershipRule: string | null;
  membershipRuleProcessingState: string | null;
  securityEnabled: boolean;
  mailEnabled: boolean;
  mail: string | null;
  createdDateTime: string;
}

export interface GroupMember {
  id: string;
  displayName: string;
  userPrincipalName?: string;
  deviceId?: string;
  operatingSystem?: string;
  odataType: string;
}

/**
 * List Azure AD groups with optional OData filtering.
 */
export async function getGroups(options?: {
  filter?: string;
  top?: number;
  search?: string;
}): Promise<{ items: GroupInfo[]; totalCount: number }> {
  const client = getGraphClient();

  if (options?.search) {
    // ConsistencyLevel: eventual is required for $search
    const request = client
      .api("/groups")
      .header("ConsistencyLevel", "eventual")
      .search(`"displayName:${options.search}"`)
      .select(GROUP_SELECT_FIELDS)
      .top(options?.top ?? 50);

    const response = await request.get();
    const items = response.value || [response];
    return { items, totalCount: items.length };
  }

  return fetchWithPagination<GroupInfo>(client, "/groups", {
    filter: options?.filter,
    select: GROUP_SELECT_FIELDS,
    top: options?.top,
  });
}

/**
 * Get members of a specific group.
 */
export async function getGroupMembers(
  groupId: string,
  options?: { top?: number }
): Promise<{ items: GroupMember[]; totalCount: number }> {
  const client = getGraphClient();
  const result = await fetchWithPagination<Record<string, unknown>>(
    client,
    `/groups/${groupId}/members`,
    {
      select: MEMBER_SELECT_FIELDS,
      top: options?.top,
    }
  );

  const members: GroupMember[] = result.items.map((m) => ({
    id: String(m.id || ""),
    displayName: String(m.displayName || ""),
    userPrincipalName: m.userPrincipalName ? String(m.userPrincipalName) : undefined,
    deviceId: m.deviceId ? String(m.deviceId) : undefined,
    operatingSystem: m.operatingSystem ? String(m.operatingSystem) : undefined,
    odataType: String(m["@odata.type"] || "unknown"),
  }));

  return { items: members, totalCount: result.totalCount };
}

/**
 * Create a new Azure AD security group.
 */
export async function createGroup(params: {
  displayName: string;
  description: string;
  mailNickname?: string;
}): Promise<GroupInfo> {
  const client = getGraphClient();

  const mailNickname = params.mailNickname
    || params.displayName.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();

  const body = {
    displayName: params.displayName,
    description: params.description,
    mailEnabled: false,
    mailNickname: mailNickname,
    securityEnabled: true,
  };

  const result = await client.api("/groups").post(body);
  return result as GroupInfo;
}

/**
 * Add a member (user or device) to a group.
 * The memberId should be the directory object ID.
 */
export async function addGroupMember(
  groupId: string,
  memberId: string
): Promise<{ success: boolean; message: string }> {
  const client = getGraphClient();

  await client.api(`/groups/${groupId}/members/$ref`).post({
    "@odata.id": `https://graph.microsoft.com/v1.0/directoryObjects/${memberId}`,
  });

  return {
    success: true,
    message: `Member ${memberId} added to group ${groupId} successfully.`,
  };
}
