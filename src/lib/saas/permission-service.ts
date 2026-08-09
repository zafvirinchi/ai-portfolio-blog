import { supabaseAdmin } from "../supabase/admin";

import { DEFAULT_ROLE_PERMISSIONS, MemberRole, Permission } from "./organization-schema";
import { OrganizationRole, TenantContext } from "./organization-types";

const LOG_PREFIX = "[organization]";

/** DB-backed — reads that organization's own organization_roles row, falling back to the built-in default if somehow missing. */
export async function hasPermission(organizationId: string, roleKey: MemberRole, permission: Permission): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("organization_roles")
    .select("permissions")
    .eq("organization_id", organizationId)
    .eq("role_key", roleKey)
    .maybeSingle();

  const permissions = (data?.permissions as Permission[] | undefined) ?? DEFAULT_ROLE_PERMISSIONS[roleKey];

  return permissions.includes(permission);
}

/** Cheap, no DB round-trip — tenant-context.ts already resolved permissions onto the TenantContext. */
export function contextHasPermission(context: TenantContext, permission: Permission): boolean {
  return context.permissions.includes(permission);
}

export function requirePermission(context: TenantContext, permission: Permission): void {
  if (!contextHasPermission(context, permission)) {
    throw new Error(`Missing required permission: ${permission}`);
  }
}

export async function updateRolePermissions(organizationId: string, roleKey: MemberRole, permissions: Permission[]): Promise<void> {
  const { error } = await supabaseAdmin
    .from("organization_roles")
    .update({ permissions })
    .eq("organization_id", organizationId)
    .eq("role_key", roleKey);

  if (error) {
    throw new Error(error.message);
  }

  console.log(`${LOG_PREFIX} Permission Updated`, { organizationId, roleKey, permissions });
}

export async function listRoles(organizationId: string): Promise<OrganizationRole[]> {
  const { data, error } = await supabaseAdmin
    .from("organization_roles")
    .select("*")
    .eq("organization_id", organizationId)
    .order("role_key", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}
