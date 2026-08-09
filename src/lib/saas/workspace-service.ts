import { supabaseAdmin } from "../supabase/admin";

import * as auditService from "./audit-service";
import { WorkspaceStatus } from "./organization-schema";
import { Workspace } from "./organization-types";

const LOG_PREFIX = "[organization]";

export interface WorkspaceCreateInput {
  name: string;
  slug: string;
  description?: string | null;
}

export class WorkspaceService {
  async create(organizationId: string, input: WorkspaceCreateInput, createdBy: string, req?: Request): Promise<Workspace> {
    const { data, error } = await supabaseAdmin
      .from("workspaces")
      .insert({
        organization_id: organizationId,
        name: input.name,
        slug: input.slug,
        description: input.description ?? null,
        created_by: createdBy,
      })
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    console.log(`${LOG_PREFIX} Workspace Created`, { workspaceId: data.id, organizationId });

    if (req) {
      await auditService.record(req, { action: "Workspace Created", objectType: "workspace", objectId: data.id, organizationId });
    }

    return data as Workspace;
  }

  async update(workspaceId: string, fields: { name?: string; description?: string | null }, req?: Request): Promise<Workspace> {
    const { data, error } = await supabaseAdmin
      .from("workspaces")
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("id", workspaceId)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    if (req) {
      await auditService.record(req, { action: "Workspace Updated", objectType: "workspace", objectId: workspaceId });
    }

    return data as Workspace;
  }

  async archive(workspaceId: string, req?: Request): Promise<Workspace> {
    return this.setStatus(workspaceId, "archived", req);
  }

  async reactivate(workspaceId: string, req?: Request): Promise<Workspace> {
    return this.setStatus(workspaceId, "active", req);
  }

  private async setStatus(workspaceId: string, status: WorkspaceStatus, req?: Request): Promise<Workspace> {
    const { data, error } = await supabaseAdmin
      .from("workspaces")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", workspaceId)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    if (req) {
      await auditService.record(req, {
        action: status === "archived" ? "Workspace Archived" : "Workspace Reactivated",
        objectType: "workspace",
        objectId: workspaceId,
      });
    }

    return data as Workspace;
  }

  async delete(workspaceId: string, req?: Request): Promise<void> {
    const { error } = await supabaseAdmin.from("workspaces").delete().eq("id", workspaceId);

    if (error) {
      throw new Error(error.message);
    }

    if (req) {
      await auditService.record(req, { action: "Workspace Deleted", objectType: "workspace", objectId: workspaceId });
    }
  }

  async get(workspaceId: string): Promise<Workspace | null> {
    const { data, error } = await supabaseAdmin.from("workspaces").select("*").eq("id", workspaceId).maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    return (data as Workspace) ?? null;
  }

  async list(organizationId: string): Promise<Workspace[]> {
    const { data, error } = await supabaseAdmin
      .from("workspaces")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return data ?? [];
  }
}

export const workspaceService = new WorkspaceService();
