"use client";

import { FEATURE_REGISTRY, FeatureCategory, listFeaturesByCategory } from "@/lib/billing/feature-registry";
import { PLATFORM_PLAN_DEFINITIONS } from "@/lib/billing/platform-plan-registry";
import { PlatformPlanKey, PlatformRole, STRIPE_BACKED_PLAN_KEYS } from "@/lib/billing/platform-schema";

// Phase 19 Milestone 1, Step 6 — extracted from /settings/billing/page.tsx
// (the only caller until now) into its own reusable component, per this
// milestone's explicit request for a genuinely reusable comparison
// piece rather than markup inlined into one page. Every plan/feature
// name, limit, and "Unlimited" label still comes directly from
// PLATFORM_PLAN_DEFINITIONS/FEATURE_REGISTRY at render time — nothing
// here is a second plan/feature catalog, and "Unlimited" is only ever
// shown when the real entitlement definition's access is genuinely
// UNLIMITED (never inferred or assumed).

export const ROLE_LABEL: Record<PlatformRole, string> = { JOB_SEEKER: "Job Seeker", RECRUITER: "Recruiter", ADMIN: "Admin" };

// Product-facing names for FEATURE_REGISTRY's existing `category` field
// (Phase 18 M1) — Step 4's suggested grouping maps almost exactly onto
// the categories that already existed (resume/job/interview/recruiter);
// only the display labels are new, never a new grouping dimension.
export const CATEGORY_LABEL: Record<FeatureCategory, string> = {
  resume: "Resume Intelligence",
  job: "Job Matching",
  interview: "Interview Intelligence",
  recruiter: "Recruiter Intelligence",
};
export const CATEGORY_ORDER: FeatureCategory[] = ["resume", "job", "interview", "recruiter"];

export function planKeysForRole(role: PlatformRole): PlatformPlanKey[] {
  return Object.values(PLATFORM_PLAN_DEFINITIONS)
    .filter((plan) => plan.role === role)
    .map((plan) => plan.key);
}

export interface PlanComparisonProps {
  role: PlatformRole;
  /** The role's currently-resolved plan key (BillingOverview.plans[n].planKey for this role), or null if it couldn't be resolved. */
  currentPlanKey: PlatformPlanKey | null;
  onUpgrade: (planKey: PlatformPlanKey) => void;
  pendingPlanKey?: string | null;
}

export default function PlanComparison({ role, currentPlanKey, onUpgrade, pendingPlanKey = null }: PlanComparisonProps) {
  const planKeys = planKeysForRole(role);

  return (
    <section aria-labelledby={`plan-comparison-${role}`}>
      <h2 id={`plan-comparison-${role}`} className="text-sm font-bold text-slate-700">
        {ROLE_LABEL[role]} Plans
      </h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {planKeys.map((planKey) => {
          const plan = PLATFORM_PLAN_DEFINITIONS[planKey];
          const isCurrent = currentPlanKey === planKey;
          const isStripeBacked = (STRIPE_BACKED_PLAN_KEYS as readonly string[]).includes(planKey);

          return (
            <div key={planKey} className={`flex flex-col rounded-xl border p-4 ${isCurrent ? "border-blue-400 bg-blue-50" : "border-slate-200"}`}>
              <p className="font-semibold text-slate-900">{plan.name}</p>

              {CATEGORY_ORDER.map((category) => {
                const includedInCategory = listFeaturesByCategory(category).filter((definition) => {
                  const entitlement = plan.features[definition.id];
                  return entitlement && entitlement.access !== "NONE";
                });
                if (includedInCategory.length === 0) return null;

                return (
                  <div key={category} className="mt-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{CATEGORY_LABEL[category]}</p>
                    <ul className="mt-1 space-y-1 text-xs text-slate-600">
                      {includedInCategory.map((definition) => {
                        const entitlement = plan.features[definition.id]!;
                        return (
                          <li key={definition.id} className="flex items-baseline justify-between gap-2">
                            <span>{FEATURE_REGISTRY[definition.id]?.label ?? definition.id}</span>
                            <span className="shrink-0 text-slate-400">
                              {entitlement.access === "UNLIMITED" ? "Unlimited" : `${entitlement.limit}/${(entitlement.period ?? "MONTH").toLowerCase()}`}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}

              <div className="mt-auto pt-4">
                {isCurrent ? (
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Current Plan</p>
                ) : isStripeBacked ? (
                  <button
                    type="button"
                    onClick={() => onUpgrade(planKey)}
                    disabled={pendingPlanKey === planKey}
                    aria-label={`Upgrade to ${plan.name}`}
                    className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {pendingPlanKey === planKey ? "Starting checkout..." : "Upgrade"}
                  </button>
                ) : (
                  <p className="text-xs text-slate-400">Free, always included</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
