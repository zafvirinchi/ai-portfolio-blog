import { AsyncLocalStorage } from "node:async_hooks";
import { cookies } from "next/headers";

import { createSupabaseServerClient } from "../supabase-server";
import { supabaseAdmin } from "../supabase/admin";

import { MemberRole, Permission } from "./organization-schema";
import { Organization, OrganizationMember, TenantContext } from "./organization-types";

export const ACTIVE_ORG_COOKIE_NAME = "active_org_id";

// Design decision 9 — resolved automatically server-side from cookies,
// never supplied by the client (unlike every prior milestone's xMode/
// xId ChatBox prop, since organization identity is genuinely tied to
// login state, not a per-page session ID).
export const organizationRequestContext = new AsyncLocalStorage<{
  organizationId: string;
  userId: string;
  role: MemberRole;
}>();

async function resolvePermissions(organizationId: string, roleKey: MemberRole): Promise<Permission[]> {
  const { data } = await supabaseAdmin
    .from("organization_roles")
    .select("permissions")
    .eq("organization_id", organizationId)
    .eq("role_key", roleKey)
    .maybeSingle();

  return (data?.permissions as Permission[] | undefined) ?? [];
}

/**
 * Resolves the logged-in Supabase Auth user (if any) + their currently
 * active organization (active_org_id cookie, falling back to their
 * first membership) + role + permissions for that org. Returns null
 * whenever there's no session or no active organization membership at
 * all — every caller must treat null as "behave exactly as this
 * milestone found it" (see plan design decision 6: every existing
 * public AI route stays fully anonymous-usable).
 */
export async function getTenantContext(): Promise<TenantContext | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const cookieStore = await cookies();
  const cookieOrgId = cookieStore.get(ACTIVE_ORG_COOKIE_NAME)?.value ?? null;

  let membership: OrganizationMember | null = null;

  if (cookieOrgId) {
    const { data } = await supabaseAdmin
      .from("organization_members")
      .select("*")
      .eq("organization_id", cookieOrgId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    membership = data;
  }

  if (!membership) {
    const { data } = await supabaseAdmin
      .from("organization_members")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("joined_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    membership = data;
  }

  if (!membership) return null;

  const { data: org } = await supabaseAdmin
    .from("organizations")
    .select("status")
    .eq("id", membership.organization_id)
    .maybeSingle();

  // A suspended/deleted organization blocks all member access —
  // enforced here, application-level, matching every existing table's
  // no-RLS security model in this project.
  if (!org || org.status === "suspended" || org.status === "deleted") return null;

  const permissions = await resolvePermissions(membership.organization_id, membership.role_key);

  return {
    userId: user.id,
    email: user.email ?? null,
    organizationId: membership.organization_id,
    role: membership.role_key,
    permissions,
  };
}

export async function requireTenantContext(): Promise<TenantContext> {
  const context = await getTenantContext();

  if (!context) {
    throw new Error("Not authenticated, or no active organization membership.");
  }

  return context;
}

/** Every organization the current Supabase Auth user belongs to — backs the org switcher UI. */
export async function listMyOrganizations(): Promise<{ organization: Organization; role: MemberRole }[]> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data: memberships } = await supabaseAdmin
    .from("organization_members")
    .select("organization_id, role_key")
    .eq("user_id", user.id)
    .eq("status", "active");

  if (!memberships || memberships.length === 0) return [];

  const { data: organizations } = await supabaseAdmin
    .from("organizations")
    .select("*")
    .in(
      "id",
      memberships.map((m) => m.organization_id)
    )
    .neq("status", "deleted");

  if (!organizations) return [];

  return organizations
    .map((org) => {
      const membership = memberships.find((m) => m.organization_id === org.id);
      return membership ? { organization: org as Organization, role: membership.role_key as MemberRole } : null;
    })
    .filter((entry): entry is { organization: Organization; role: MemberRole } => entry !== null);
}

/** Verifies the current user really belongs to organizationId before the switch route trusts it enough to set the cookie. */
export async function verifyMembership(organizationId: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return false;

  const { data } = await supabaseAdmin
    .from("organization_members")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  return Boolean(data);
}
