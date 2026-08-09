import { supabaseAdmin } from "../supabase/admin";

import * as auditService from "./audit-service";
import { DEFAULT_ROLE_PERMISSIONS, MEMBER_ROLES, OrgStatus } from "./organization-schema";
import { Organization } from "./organization-types";

const LOG_PREFIX = "[organization]";

export interface OrganizationCreateInput {
  name: string;
  slug: string;
}

export class OrganizationService {
  async create(input: OrganizationCreateInput, ownerId: string, req?: Request): Promise<Organization> {
    const { data: org, error } = await supabaseAdmin
      .from("organizations")
      .insert({ name: input.name, slug: input.slug, owner_id: ownerId })
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    // Seed this org's own organization_roles from DEFAULT_ROLE_PERMISSIONS — design decision 3.
    const roleRows = MEMBER_ROLES.map((roleKey) => ({
      organization_id: org.id,
      role_key: roleKey,
      permissions: DEFAULT_ROLE_PERMISSIONS[roleKey],
    }));

    const { error: rolesError } = await supabaseAdmin.from("organization_roles").insert(roleRows);

    if (rolesError) {
      throw new Error(rolesError.message);
    }

    const { error: memberError } = await supabaseAdmin.from("organization_members").insert({
      organization_id: org.id,
      user_id: ownerId,
      role_key: "Owner",
      status: "active",
    });

    if (memberError) {
      throw new Error(memberError.message);
    }

    console.log(`${LOG_PREFIX} Organization Created`, { organizationId: org.id, name: org.name });

    if (req) {
      await auditService.record(req, {
        action: "Organization Created",
        objectType: "organization",
        objectId: org.id,
        organizationId: org.id,
        userId: ownerId,
      });
    }

    return org as Organization;
  }

  async rename(organizationId: string, name: string, req?: Request): Promise<Organization> {
    const { data, error } = await supabaseAdmin
      .from("organizations")
      .update({ name, updated_at: new Date().toISOString() })
      .eq("id", organizationId)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    if (req) {
      await auditService.record(req, { action: "Organization Renamed", objectType: "organization", objectId: organizationId });
    }

    return data as Organization;
  }

  async delete(organizationId: string, req?: Request): Promise<void> {
    await this.setStatus(organizationId, "deleted", req);
  }

  async suspend(organizationId: string, req?: Request): Promise<Organization> {
    return this.setStatus(organizationId, "suspended", req);
  }

  async reactivate(organizationId: string, req?: Request): Promise<Organization> {
    return this.setStatus(organizationId, "active", req);
  }

  private async setStatus(organizationId: string, status: OrgStatus, req?: Request): Promise<Organization> {
    const { data, error } = await supabaseAdmin
      .from("organizations")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", organizationId)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    if (req) {
      const action = status === "suspended" ? "Organization Suspended" : status === "active" ? "Organization Reactivated" : "Organization Deleted";
      await auditService.record(req, { action, objectType: "organization", objectId: organizationId });
    }

    return data as Organization;
  }

  async transferOwnership(organizationId: string, newOwnerId: string, req?: Request): Promise<Organization> {
    const { data: org, error: orgError } = await supabaseAdmin.from("organizations").select("owner_id").eq("id", organizationId).maybeSingle();

    if (orgError) {
      throw new Error(orgError.message);
    }

    if (!org) {
      throw new Error("Organization not found.");
    }

    const previousOwnerId = org.owner_id as string;

    const { data: updatedOrg, error } = await supabaseAdmin
      .from("organizations")
      .update({ owner_id: newOwnerId, updated_at: new Date().toISOString() })
      .eq("id", organizationId)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    const { error: upsertError } = await supabaseAdmin
      .from("organization_members")
      .upsert(
        { organization_id: organizationId, user_id: newOwnerId, role_key: "Owner", status: "active" },
        { onConflict: "organization_id,user_id" }
      );

    if (upsertError) {
      throw new Error(upsertError.message);
    }

    if (previousOwnerId && previousOwnerId !== newOwnerId) {
      const { error: demoteError } = await supabaseAdmin
        .from("organization_members")
        .update({ role_key: "Admin" })
        .eq("organization_id", organizationId)
        .eq("user_id", previousOwnerId);

      if (demoteError) {
        throw new Error(demoteError.message);
      }
    }

    if (req) {
      await auditService.record(req, { action: "Ownership Transferred", objectType: "organization", objectId: organizationId });
    }

    return updatedOrg as Organization;
  }

  async get(organizationId: string): Promise<Organization | null> {
    const { data, error } = await supabaseAdmin.from("organizations").select("*").eq("id", organizationId).maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    return (data as Organization) ?? null;
  }

  async getBySlug(slug: string): Promise<Organization | null> {
    const { data, error } = await supabaseAdmin.from("organizations").select("*").eq("slug", slug).maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    return (data as Organization) ?? null;
  }

  async listAll(): Promise<Organization[]> {
    const { data, error } = await supabaseAdmin.from("organizations").select("*").neq("status", "deleted").order("created_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return data ?? [];
  }
}

export const organizationService = new OrganizationService();
