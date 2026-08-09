import { supabaseAdmin } from "../supabase/admin";

import { membershipService } from "./membership-service";
import { MemberRole } from "./organization-schema";
import { TeamRosterEntry } from "./organization-types";
import { workspaceService } from "./workspace-service";

// Read-oriented aggregation over membership-service.ts's raw CRUD data
// — distinct responsibility (presentation/search, not mutation).

export async function resolveEmail(userId: string): Promise<string | null> {
  try {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (error || !data.user) return null;
    return data.user.email ?? null;
  } catch {
    return null;
  }
}

export async function getTeamRoster(organizationId: string): Promise<TeamRosterEntry[]> {
  const members = await membershipService.listMembers(organizationId);
  const workspaces = await workspaceService.list(organizationId);

  const workspaceMembersByWorkspace = await Promise.all(
    workspaces.map(async (workspace) => ({
      workspace,
      members: await membershipService.listWorkspaceMembers(workspace.id),
    }))
  );

  const roster: TeamRosterEntry[] = [];

  for (const member of members) {
    const email = await resolveEmail(member.user_id);

    const memberWorkspaces = workspaceMembersByWorkspace
      .map(({ workspace, members: wsMembers }) => {
        const wsMember = wsMembers.find((wm) => wm.user_id === member.user_id);
        return wsMember ? { workspace_id: workspace.id, name: workspace.name, role_key: wsMember.role_key } : null;
      })
      .filter((entry): entry is { workspace_id: string; name: string; role_key: MemberRole } => entry !== null);

    roster.push({
      user_id: member.user_id,
      email,
      role_key: member.role_key,
      status: member.status,
      joined_at: member.joined_at,
      workspaces: memberWorkspaces,
    });
  }

  return roster;
}

export function searchRoster(roster: TeamRosterEntry[], query: string): TeamRosterEntry[] {
  const lower = query.toLowerCase();
  return roster.filter((entry) => (entry.email ?? "").toLowerCase().includes(lower) || entry.role_key.toLowerCase().includes(lower));
}

export function filterRosterByRole(roster: TeamRosterEntry[], role: MemberRole): TeamRosterEntry[] {
  return roster.filter((entry) => entry.role_key === role);
}
