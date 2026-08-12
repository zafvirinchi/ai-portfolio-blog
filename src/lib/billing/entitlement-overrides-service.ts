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

export async function revokeOverride(overrideId: string): Promise<void> {
  const { error } = await supabaseAdmin.from(TABLE).update({ revoked_at: new Date().toISOString() }).eq("id", overrideId);

  if (error) {
    throw new Error(error.message);
  }

  console.log(`${LOG_PREFIX} Override Revoked`, { overrideId });
}
