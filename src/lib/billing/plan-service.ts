import { supabaseAdmin } from "../supabase/admin";

import { PLAN_KEYS, PlanKey } from "./billing-schema";
import { Plan } from "./billing-types";

const LOG_PREFIX = "[billing]";

// Static plan catalog — same shape/role as saas/organization-schema.ts's
// DEFAULT_ROLE_PERMISSIONS constant. Seeded into the real `plans` table
// (seedPlans()) so subscriptions.plan_id can reference a real row, but
// every read path here also falls back to this constant directly if the
// table is empty/unseeded, so nothing hard-fails before seedPlans() has
// run once.
export const PLAN_DEFINITIONS: Record<PlanKey, Omit<Plan, "id" | "created_at">> = {
  free: {
    key: "free",
    name: "Free",
    monthly_price_cents: 0,
    yearly_price_cents: 0,
    limits: {
      resume_upload: 3,
      resume_rewrite: 2,
      jd_match: 3,
      ats_report: 3,
      mock_interview: 1,
      ai_chat: 30,
      knowledge_upload: 2,
      organization_seats: 2,
      storage_mb: 50,
    },
    priority_support: false,
    api_access: false,
  },
  professional: {
    key: "professional",
    name: "Professional",
    monthly_price_cents: 1900,
    yearly_price_cents: 19000,
    limits: {
      resume_upload: 20,
      resume_rewrite: 15,
      jd_match: 20,
      ats_report: 20,
      mock_interview: 10,
      ai_chat: 300,
      knowledge_upload: 20,
      organization_seats: 5,
      storage_mb: 500,
    },
    priority_support: false,
    api_access: false,
  },
  premium: {
    key: "premium",
    name: "Premium",
    monthly_price_cents: 4900,
    yearly_price_cents: 49000,
    limits: {
      resume_upload: 100,
      resume_rewrite: 75,
      jd_match: 100,
      ats_report: 100,
      mock_interview: 50,
      ai_chat: 1500,
      knowledge_upload: 100,
      organization_seats: 20,
      storage_mb: 5000,
    },
    priority_support: true,
    api_access: false,
  },
  enterprise: {
    key: "enterprise",
    name: "Enterprise",
    monthly_price_cents: 19900,
    yearly_price_cents: 199000,
    limits: {
      resume_upload: null,
      resume_rewrite: null,
      jd_match: null,
      ats_report: null,
      mock_interview: null,
      ai_chat: null,
      knowledge_upload: null,
      organization_seats: null,
      storage_mb: null,
    },
    priority_support: true,
    api_access: true,
  },
};

function fallbackPlan(key: PlanKey): Plan {
  return { id: key, created_at: new Date(0).toISOString(), ...PLAN_DEFINITIONS[key] };
}

/** Upserts the 4 plan rows from PLAN_DEFINITIONS — safe to call repeatedly (idempotent on key). Called before any operation that needs a real plans.id (e.g. creating a subscription). */
export async function seedPlans(): Promise<void> {
  const rows = PLAN_KEYS.map((key) => ({
    key,
    name: PLAN_DEFINITIONS[key].name,
    monthly_price_cents: PLAN_DEFINITIONS[key].monthly_price_cents,
    yearly_price_cents: PLAN_DEFINITIONS[key].yearly_price_cents,
    limits: PLAN_DEFINITIONS[key].limits,
    priority_support: PLAN_DEFINITIONS[key].priority_support,
    api_access: PLAN_DEFINITIONS[key].api_access,
  }));

  const { error } = await supabaseAdmin.from("plans").upsert(rows, { onConflict: "key" });

  if (error) {
    throw new Error(error.message);
  }

  console.log(`${LOG_PREFIX} Plans Seeded`, { count: rows.length });
}

/**
 * Falls back to the static PLAN_DEFINITIONS on ANY query failure — not
 * just "no rows" — since the most common real-world failure here is
 * the `plans` table not existing yet (migration not run), which
 * Supabase/PostgREST surfaces as a query error (PGRST205), not empty
 * data. Read paths must never hard-fail before the migration has run.
 */
export async function getPlanByKey(key: PlanKey): Promise<Plan> {
  const { data, error } = await supabaseAdmin.from("plans").select("*").eq("key", key).maybeSingle();

  if (error) {
    console.error(`${LOG_PREFIX} Plan lookup failed, using static fallback`, error);
    return fallbackPlan(key);
  }

  return data ? (data as Plan) : fallbackPlan(key);
}

export async function getPlanById(id: string): Promise<Plan | null> {
  const { data, error } = await supabaseAdmin.from("plans").select("*").eq("id", id).maybeSingle();

  if (error) {
    console.error(`${LOG_PREFIX} Plan lookup by id failed`, error);
    return null;
  }

  return (data as Plan) ?? null;
}

export async function listPlans(): Promise<Plan[]> {
  const { data, error } = await supabaseAdmin.from("plans").select("*").order("monthly_price_cents", { ascending: true });

  if (error) {
    console.error(`${LOG_PREFIX} Plan listing failed, using static fallback`, error);
    return PLAN_KEYS.map(fallbackPlan);
  }

  if (!data || data.length === 0) {
    return PLAN_KEYS.map(fallbackPlan);
  }

  return data as Plan[];
}
