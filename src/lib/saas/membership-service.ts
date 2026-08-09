import { supabaseAdmin } from "../supabase/admin";

import * as auditService from "./audit-service";
import { MemberRole } from "./organization-schema";
import { OrganizationInvitation, OrganizationMember, WorkspaceMember } from "./organization-types";

const LOG_PREFIX = "[organization]";
const INVITATION_TTL_DAYS = 7;

export class MembershipService {
  // -------------------------------------------------------------------
  // Organization-level membership
  // -------------------------------------------------------------------

  async addMember(organizationId: string, userId: string, roleKey: MemberRole, invitedBy: string | null, req?: Request): Promise<OrganizationMember> {
    const { data, error } = await supabaseAdmin
      .from("organization_members")
      .upsert(
        { organization_id: organizationId, user_id: userId, role_key: roleKey, status: "active", invited_by: invitedBy },
        { onConflict: "organization_id,user_id" }
      )
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    console.log(`${LOG_PREFIX} Member Added`, { organizationId, userId, roleKey });

    if (req) {
      await auditService.record(req, { action: "Member Added", objectType: "organization_member", objectId: data.id, organizationId });
    }

    return data as OrganizationMember;
  }

  async updateRole(organizationId: string, userId: string, roleKey: MemberRole, req?: Request): Promise<OrganizationMember> {
    const { data, error } = await supabaseAdmin
      .from("organization_members")
      .update({ role_key: roleKey })
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    if (req) {
      await auditService.record(req, { action: "Member Role Updated", objectType: "organization_member", objectId: data.id, organizationId });
    }

    return data as OrganizationMember;
  }

  async removeMember(organizationId: string, userId: string, req?: Request): Promise<void> {
    const { error } = await supabaseAdmin.from("organization_members").delete().eq("organization_id", organizationId).eq("user_id", userId);

    if (error) {
      throw new Error(error.message);
    }

    if (req) {
      await auditService.record(req, { action: "Member Removed", objectType: "organization_member", objectId: userId, organizationId });
    }
  }

  async suspendMember(organizationId: string, userId: string, req?: Request): Promise<OrganizationMember> {
    const { data, error } = await supabaseAdmin
      .from("organization_members")
      .update({ status: "suspended" })
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    if (req) {
      await auditService.record(req, { action: "Member Suspended", objectType: "organization_member", objectId: data.id, organizationId });
    }

    return data as OrganizationMember;
  }

  async listMembers(organizationId: string): Promise<OrganizationMember[]> {
    const { data, error } = await supabaseAdmin
      .from("organization_members")
      .select("*")
      .eq("organization_id", organizationId)
      .order("joined_at", { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return data ?? [];
  }

  // -------------------------------------------------------------------
  // Workspace-level membership
  // -------------------------------------------------------------------

  async addToWorkspace(workspaceId: string, userId: string, roleKey: MemberRole, req?: Request): Promise<WorkspaceMember> {
    const { data, error } = await supabaseAdmin
      .from("workspace_members")
      .upsert({ workspace_id: workspaceId, user_id: userId, role_key: roleKey }, { onConflict: "workspace_id,user_id" })
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    if (req) {
      await auditService.record(req, { action: "Workspace Member Added", objectType: "workspace_member", objectId: data.id });
    }

    return data as WorkspaceMember;
  }

  async removeFromWorkspace(workspaceId: string, userId: string, req?: Request): Promise<void> {
    const { error } = await supabaseAdmin.from("workspace_members").delete().eq("workspace_id", workspaceId).eq("user_id", userId);

    if (error) {
      throw new Error(error.message);
    }

    if (req) {
      await auditService.record(req, { action: "Workspace Member Removed", objectType: "workspace_member", objectId: userId });
    }
  }

  async listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]> {
    const { data, error } = await supabaseAdmin.from("workspace_members").select("*").eq("workspace_id", workspaceId);

    if (error) {
      throw new Error(error.message);
    }

    return data ?? [];
  }

  // -------------------------------------------------------------------
  // Invitations
  // -------------------------------------------------------------------

  async invite(organizationId: string, email: string, roleKey: MemberRole, invitedBy: string, req?: Request): Promise<OrganizationInvitation> {
    const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabaseAdmin
      .from("organization_invitations")
      .insert({ organization_id: organizationId, email, role_key: roleKey, invited_by: invitedBy, expires_at: expiresAt })
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    if (req) {
      await auditService.record(req, { action: "Invitation Created", objectType: "organization_invitation", objectId: data.id, organizationId });
    }

    return data as OrganizationInvitation;
  }

  /** Lazy expiry — same "mark stale on read" pattern as every prior milestone's in-memory TTL, applied here to a real DB row. */
  private async getByToken(token: string): Promise<OrganizationInvitation | null> {
    const { data, error } = await supabaseAdmin.from("organization_invitations").select("*").eq("token", token).maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      return null;
    }

    if (data.status === "pending" && new Date(data.expires_at).getTime() < Date.now()) {
      await supabaseAdmin.from("organization_invitations").update({ status: "expired" }).eq("id", data.id);
      return { ...data, status: "expired" } as OrganizationInvitation;
    }

    return data as OrganizationInvitation;
  }

  async getInvitationByToken(token: string): Promise<OrganizationInvitation | null> {
    return this.getByToken(token);
  }

  async accept(token: string, userId: string, req?: Request): Promise<OrganizationInvitation> {
    const invitation = await this.getByToken(token);

    if (!invitation) {
      throw new Error("Invitation not found.");
    }

    if (invitation.status !== "pending") {
      throw new Error(`This invitation is ${invitation.status} and can no longer be accepted.`);
    }

    await this.addMember(invitation.organization_id, userId, invitation.role_key, invitation.invited_by, req);

    const { data, error } = await supabaseAdmin
      .from("organization_invitations")
      .update({ status: "accepted", responded_at: new Date().toISOString() })
      .eq("id", invitation.id)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    if (req) {
      await auditService.record(req, {
        action: "Invitation Accepted",
        objectType: "organization_invitation",
        objectId: invitation.id,
        organizationId: invitation.organization_id,
        userId,
      });
    }

    return data as OrganizationInvitation;
  }

  async reject(token: string, req?: Request): Promise<OrganizationInvitation> {
    const invitation = await this.getByToken(token);

    if (!invitation) {
      throw new Error("Invitation not found.");
    }

    if (invitation.status !== "pending") {
      throw new Error(`This invitation is ${invitation.status}.`);
    }

    const { data, error } = await supabaseAdmin
      .from("organization_invitations")
      .update({ status: "rejected", responded_at: new Date().toISOString() })
      .eq("id", invitation.id)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    if (req) {
      await auditService.record(req, {
        action: "Invitation Rejected",
        objectType: "organization_invitation",
        objectId: invitation.id,
        organizationId: invitation.organization_id,
      });
    }

    return data as OrganizationInvitation;
  }

  async revoke(invitationId: string, req?: Request): Promise<OrganizationInvitation> {
    const { data, error } = await supabaseAdmin
      .from("organization_invitations")
      .update({ status: "revoked", responded_at: new Date().toISOString() })
      .eq("id", invitationId)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    if (req) {
      await auditService.record(req, {
        action: "Invitation Revoked",
        objectType: "organization_invitation",
        objectId: invitationId,
        organizationId: data.organization_id,
      });
    }

    return data as OrganizationInvitation;
  }

  async listInvitations(organizationId: string): Promise<OrganizationInvitation[]> {
    const { data, error } = await supabaseAdmin
      .from("organization_invitations")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    const now = Date.now();
    const results = data ?? [];

    for (const invitation of results) {
      if (invitation.status === "pending" && new Date(invitation.expires_at).getTime() < now) {
        invitation.status = "expired";
      }
    }

    return results;
  }
}

export const membershipService = new MembershipService();
