import { InvitationStatus, MemberRole, MembershipStatus, OrgStatus, Permission, WorkspaceStatus } from "./organization-schema";

// Non-schema row/wrapper types — mirrors every prior milestone's
// *-types.ts role relative to its own *-schema.ts, adapted here to
// real Supabase row shapes rather than in-memory records.

export interface Organization {
  id: string;
  name: string;
  slug: string;
  status: OrgStatus;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface OrganizationRole {
  id: string;
  organization_id: string;
  role_key: MemberRole;
  permissions: Permission[];
  created_at: string;
}

export interface OrganizationMember {
  id: string;
  organization_id: string;
  user_id: string;
  role_key: MemberRole;
  status: MembershipStatus;
  invited_by: string | null;
  joined_at: string;
}

export interface OrganizationInvitation {
  id: string;
  organization_id: string;
  email: string;
  role_key: MemberRole;
  status: InvitationStatus;
  token: string;
  invited_by: string;
  expires_at: string;
  created_at: string;
  responded_at: string | null;
}

export interface Workspace {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  description: string | null;
  status: WorkspaceStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceMember {
  id: string;
  workspace_id: string;
  user_id: string;
  role_key: MemberRole;
  added_at: string;
}

export interface ActivityLogEntry {
  id: string;
  organization_id: string | null;
  workspace_id: string | null;
  user_id: string | null;
  activity_type: string;
  description: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AuditLogEntry {
  id: string;
  organization_id: string | null;
  user_id: string | null;
  action: string;
  object_type: string | null;
  object_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

// Resolved server-side by tenant-context.ts from the Supabase auth
// session + active_org_id cookie — never supplied by the client.
export interface TenantContext {
  userId: string;
  email: string | null;
  organizationId: string;
  role: MemberRole;
  permissions: Permission[];
}

export interface OrganizationWithMembership extends Organization {
  role: MemberRole;
}

export interface TeamRosterEntry {
  user_id: string;
  email: string | null;
  role_key: MemberRole;
  status: MembershipStatus;
  joined_at: string;
  workspaces: { workspace_id: string; name: string; role_key: MemberRole }[];
}
