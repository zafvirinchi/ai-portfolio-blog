import { supabaseAdmin } from "../supabase/admin";

import { FeatureId } from "./platform-schema";

const LOG_PREFIX = "[billing:overrides]";
const TABLE = "platform_entitlement_overrides";

export type OverrideAccess = "GRANTED" | "REVOKED";

export interface EntitlementOverride {
  id: string;
  user_id: string;
  feature_id: FeatureId | string;
  access: OverrideAccess;
  reason: string | null;
  granted_by: string | null;
  expires_at: string | null;
  created_at: string;
  revoked_at: string | null;
}

/**
 * Falls back to "no overrides" on ANY query failure — including the
 * table not existing yet (pre-migration) — mirroring
 * subscription-service.ts's getActiveSubscription() precedent: a read
 * failure here must degrade to the plan matrix's own answer, never
 * throw and break the feature it's layered on top of.
 */
export async function listActiveOverrides(userId: string): Promise<EntitlementOverride[]> {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);

  if (error) {
    console.error(`${LOG_PREFIX} Override lookup failed, treating as none`, error);
    return [];
  }

  return (data ?? []) as EntitlementOverride[];
}

/**
 * Phase 18 Milestone 3 — the FULL history for one user, including
 * deactivated and expired rows, ordered newest-first: the admin control
 * plane needs to show "what was granted/revoked and when", not just
 * "what's currently in effect" (listActiveOverrides() above remains the
 * one used by getEntitlement() itself, unchanged). Same fail-closed-to-
 * empty-list behavior on a query error as every other read in this file.
 */
export async function listAllOverridesForUser(userId: string): Promise<EntitlementOverride[]> {
  const { data, error } = await supabaseAdmin.from(TABLE).select("*").eq("user_id", userId).order("created_at", { ascending: false });

  if (error) {
    console.error(`${LOG_PREFIX} Override history lookup failed, treating as none`, error);
    return [];
  }

  return (data ?? []) as EntitlementOverride[];
}

/**
 * Admin-only (enforced by every caller — entitlement-service.ts's
 * grantOverride()/revokeOverride() — via persona-service.ts's isAdmin(),
 * never by this function itself). grantedBy is always the ACTING
 * admin's own server-derived userId, never client-supplied.
 */
export async function createOverride(input: {
  userId: string;
  featureId: FeatureId;
  access: OverrideAccess;
  reason?: string;
  grantedBy: string;
  expiresAt?: string | null;
}): Promise<EntitlementOverride> {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .insert({
      user_id: input.userId,
      feature_id: input.featureId,
      access: input.access,
      reason: input.reason ?? null,
      granted_by: input.grantedBy,
      expires_at: input.expiresAt ?? null,
    })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  console.log(`${LOG_PREFIX} Override Created`, { userId: input.userId, featureId: input.featureId, access: input.access });

  return data as EntitlementOverride;
}

/** Phase 18 Milestone 3 — lets the admin "deactivate an override" API resolve which user an overrideId belongs to (for the audit-log target and an ownership sanity check) without the caller having to already know it. */
export async function getOverrideById(overrideId: string): Promise<EntitlementOverride | null> {
  const { data, error } = await supabaseAdmin.from(TABLE).select("*").eq("id", overrideId).maybeSingle();

  if (error) {
    console.error(`${LOG_PREFIX} Override lookup by id failed`, error);
    return null;
  }

  return (data as EntitlementOverride) ?? null;
}

export async function revokeOverride(overrideId: string): Promise<void> {
  const { error } = await supabaseAdmin.from(TABLE).update({ revoked_at: new Date().toISOString() }).eq("id", overrideId);

  if (error) {
    throw new Error(error.message);
  }

  console.log(`${LOG_PREFIX} Override Revoked`, { overrideId });
}
