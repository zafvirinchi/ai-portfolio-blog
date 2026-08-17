"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { FEATURE_REGISTRY, listFeaturesByCategory } from "@/lib/billing/feature-registry";
import { PLATFORM_PLAN_DEFINITIONS } from "@/lib/billing/platform-plan-registry";
import { PlatformPlanKey, PlatformRole } from "@/lib/billing/platform-schema";
import type { BillingOverview } from "@/lib/billing/entitlement-service";
import PlanComparison, { CATEGORY_LABEL, CATEGORY_ORDER, planKeysForRole, ROLE_LABEL } from "@/components/billing/platform/PlanComparison";
import UsageProgress from "@/components/billing/platform/UsageProgress";

// Phase 18 Milestone 2 — Step 13/14. A new, account-level (individual
// user) billing page — deliberately NOT a duplicate of /billing/*
// (Phase 14's existing organization/team billing area, still reachable
// from the settings header): that area manages a team's shared
// subscription; this one manages the signed-in user's own Job Seeker/
// Recruiter plan, independent of any organization. Every plan/feature
// name rendered below comes directly from the real, existing registries
// (platform-plan-registry.ts, feature-registry.ts) — nothing here
// invents a plan name or feature list of its own.
//
// Phase 19 Milestone 1 — ROLE_LABEL/CATEGORY_LABEL/CATEGORY_ORDER/
// planKeysForRole now live in PlanComparison.tsx (Step 6's reusable
// component), imported here rather than duplicated, so the "Enabled
// Features" summary below and the plan-comparison grid always agree on
// the same category names/order.

// Phase 18 Milestone 5, Step 7 — presentation-only labels for
// BillingOverview.usage's metrics (platform-schema.ts's USAGE_METRICS),
// mirroring this file's own existing ROLE_LABEL/STATUS_BADGE_CLASSNAME
// local-map convention. Never a second usage-metric definition — the
// metric values themselves still come entirely from the real
// getBillingOverview() response.
const USAGE_METRIC_LABEL: Record<string, string> = {
  ATS_CHECKS: "ATS Score Checks",
  JD_MATCHES: "JD Matches",
  AI_REWRITES: "AI Rewrites",
  INTERVIEW_PREPARATIONS: "Interview Preparations",
  MOCK_INTERVIEWS: "Mock Interviews",
  RECRUITER_CANDIDATES: "Candidates Added",
  RECRUITER_EXPORTS: "Candidate Exports",
  // Phase 19 Milestone 2 — resume.ai_assistant's new quota (was
  // UNLIMITED with no metric at all; see platform-plan-registry.ts).
  // No other change was needed here: relevantMetricsForRoles() and the
  // Usage section already render any metric present in a user's own
  // plans generically, from the real getBillingOverview() response.
  AI_CHAT_MESSAGES: "AI Assistant Messages",
  // Phase 19 Milestone 6 — same "no other change needed" note as above:
  // relevantMetricsForRoles()/getBillingOverview() already pick these
  // up generically from the registry now that platform-plan-registry.ts
  // grants them. Presentation-only labels, nothing else.
  LINKEDIN_OPTIMIZATIONS: "LinkedIn Optimizations",
  COVER_LETTERS: "Cover Letters",
};

const STATUS_BADGE_CLASSNAME: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  trialing: "bg-blue-100 text-blue-700",
  past_due: "bg-amber-100 text-amber-700",
  canceled: "bg-red-100 text-red-700",
  unpaid: "bg-red-100 text-red-700",
  incomplete: "bg-slate-100 text-slate-600",
  incomplete_expired: "bg-slate-100 text-slate-600",
};

/** Which usage metrics are ever relevant to a user's own roles — derived entirely from the same PLATFORM_PLAN_DEFINITIONS already imported, never a second metric catalog. getBillingOverview() itself returns a usage row for EVERY metric across ALL roles (Phase 18 M2), so this filters the display down to only what this user's own plans could ever consume. */
function relevantMetricsForRoles(roles: PlatformRole[]): Set<string> {
  const metrics = new Set<string>();
  for (const role of roles) {
    for (const planKey of planKeysForRole(role)) {
      for (const entry of Object.values(PLATFORM_PLAN_DEFINITIONS[planKey].features)) {
        if (entry.metric) metrics.add(entry.metric);
      }
    }
  }
  return metrics;
}

// Phase 19 Milestone 4, Step 11 — a checkout/portal return can race
// Stripe's webhook (webhook delivery is inherently async; nothing
// guarantees it lands before the browser's own redirect completes), so
// re-fetching once on mount (M8's original reasoning) isn't actually
// sufficient — the fresh fetch can still read the pre-webhook state.
// This is a SHORT, BOUNDED retry budget — never indefinite polling —
// that stops the instant the resolved plan set actually changes.
const RETURN_RETRY_DELAYS_MS = [2000, 3000, 4000];

function planSignature(overview: BillingOverview): string {
  return overview.plans.map((plan) => `${plan.role}:${plan.planKey}:${plan.status}:${plan.cancelAtPeriodEnd}`).join("|");
}

function PlatformBillingContent() {
  const searchParams = useSearchParams();
  const checkoutStatus = searchParams.get("checkout");
  // Step 11 — the portal's own return marker (route.ts), distinct from
  // checkout's `?checkout=success`: a plan change made inside the
  // Stripe-hosted billing portal (e.g. a downgrade or cancellation)
  // returns here with no OTHER signal that anything just changed.
  const billingUpdated = searchParams.get("billing") === "updated";

  const [overview, setOverview] = useState<BillingOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingPlanKey, setPendingPlanKey] = useState<string | null>(null);
  const [portalPending, setPortalPending] = useState(false);
  const [syncingAfterReturn, setSyncingAfterReturn] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchOverview(): Promise<BillingOverview> {
      const response = await fetch("/api/billing/platform/overview");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to load billing overview");
      return data as BillingOverview;
    }

    async function load() {
      try {
        const initial = await fetchOverview();
        if (cancelled) return;
        setOverview(initial);

        if (checkoutStatus === "success" || billingUpdated) {
          const baseline = planSignature(initial);
          setSyncingAfterReturn(true);

          for (const delay of RETURN_RETRY_DELAYS_MS) {
            await new Promise((resolve) => setTimeout(resolve, delay));
            if (cancelled) return;

            const retried = await fetchOverview();
            if (cancelled) return;

            if (planSignature(retried) !== baseline) {
              setOverview(retried);
              break;
            }
          }

          if (!cancelled) setSyncingAfterReturn(false);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load billing overview.");
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [checkoutStatus, billingUpdated]);

  async function handleUpgrade(planKey: PlatformPlanKey) {
    setActionError(null);
    setPendingPlanKey(planKey);

    try {
      const response = await fetch("/api/billing/platform/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planKey }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to start checkout");

      window.location.href = data.url;
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to start checkout.");
      setPendingPlanKey(null);
    }
  }

  async function handleManageSubscription() {
    setActionError(null);
    setPortalPending(true);

    try {
      const response = await fetch("/api/billing/platform/portal", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to open the billing portal");

      window.location.href = data.url;
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to open the billing portal.");
      setPortalPending(false);
    }
  }

  if (error) {
    return (
      <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">
        {error}
      </div>
    );
  }

  if (!overview) {
    return <div role="status" className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">Loading your billing details...</div>;
  }

  const hasAnyPaidPlan = overview.plans.some((plan) => !plan.isImplicitFree);
  const enabledFeatures = overview.features.filter((feature) => feature.access !== "NONE");
  const relevantMetrics = relevantMetricsForRoles(overview.roles);
  const relevantUsage = overview.usage.filter((entry) => relevantMetrics.has(entry.metric));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">My Billing</h1>
        <p className="mt-1 text-sm text-slate-600">Your personal plan for Job Seeker and Recruiter tools — separate from any organization&apos;s team billing.</p>
      </div>

      {checkoutStatus === "success" && (
        <div role="status" className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-800 shadow-sm">
          Checkout complete — your plan will update shortly once Stripe confirms the subscription.
          {syncingAfterReturn && " Refreshing…"}
        </div>
      )}
      {billingUpdated && (
        <div role="status" className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 shadow-sm">
          Welcome back from the billing portal — your latest plan will appear here shortly.
          {syncingAfterReturn && " Refreshing…"}
        </div>
      )}
      {checkoutStatus === "cancelled" && (
        <div role="status" className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 shadow-sm">
          Checkout was cancelled — no changes were made.
        </div>
      )}
      {actionError && (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-sm">
          {actionError}
        </div>
      )}

      {/* Current Plan */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-bold text-slate-700">Current Plan</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {overview.plans.map((plan) => (
            <div key={plan.role} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{ROLE_LABEL[plan.role]}</p>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_BADGE_CLASSNAME[plan.status] ?? "bg-slate-100 text-slate-600"}`}>{plan.status.replace("_", " ")}</span>
              </div>
              <p className="mt-1 text-lg font-bold text-slate-900">{plan.planName ?? "No plan"}</p>
              {plan.renewalDate && (
                <p className="mt-1 text-xs text-slate-500">
                  {plan.cancelAtPeriodEnd ? "Ends" : "Renews"} {new Date(plan.renewalDate).toLocaleDateString()}
                </p>
              )}
            </div>
          ))}
        </div>

        {enabledFeatures.length > 0 && (
          <div className="mt-5 space-y-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Enabled Features</p>
            {CATEGORY_ORDER.map((category) => {
              const enabledInCategory = listFeaturesByCategory(category).filter((definition) =>
                enabledFeatures.some((feature) => feature.featureId === definition.id)
              );
              if (enabledInCategory.length === 0) return null;

              return (
                <div key={category}>
                  <p className="mb-2 text-xs font-semibold text-slate-500">{CATEGORY_LABEL[category]}</p>
                  <div className="flex flex-wrap gap-2">
                    {enabledInCategory.map((definition) => {
                      const feature = enabledFeatures.find((f) => f.featureId === definition.id)!;
                      return (
                        <span key={feature.featureId} className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                          {FEATURE_REGISTRY[feature.featureId]?.label ?? feature.featureId}
                          {feature.limit !== null && feature.period ? ` (${feature.limit}/${feature.period.toLowerCase()})` : ""}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {hasAnyPaidPlan && (
          <button
            type="button"
            onClick={handleManageSubscription}
            disabled={portalPending}
            aria-label="Manage your subscription"
            className="mt-5 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {portalPending ? "Opening..." : "Manage Subscription"}
          </button>
        )}
      </section>

      {/* Usage — Step 7. Only metrics this user's own roles could ever
          consume (relevantMetricsForRoles), never the full 7-metric
          catalog getBillingOverview() returns for every role. */}
      {relevantUsage.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-bold text-slate-700">Usage This Month</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {relevantUsage.map((entry) => (
              <div key={entry.metric}>
                <UsageProgress label={USAGE_METRIC_LABEL[entry.metric] ?? entry.metric} used={entry.usedThisMonth} limit={entry.limit} period={entry.period} />
                <p className="mt-1 px-1 text-[11px] text-slate-400">
                  {entry.usedToday} today &middot; {entry.usedLifetime} all-time
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Upgrade / Plan Comparison — Step 6. The reusable PlanComparison
          component (extracted this milestone) derives everything from
          PLATFORM_PLAN_DEFINITIONS + FEATURE_REGISTRY — never a second
          plan/feature catalog invented for this page. */}
      {(["JOB_SEEKER", "RECRUITER"] as const)
        .filter((role) => overview.roles.includes(role))
        .map((role) => (
          <div key={role} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <PlanComparison
              role={role}
              currentPlanKey={overview.plans.find((p) => p.role === role)?.planKey ?? null}
              onUpgrade={handleUpgrade}
              pendingPlanKey={pendingPlanKey}
            />
          </div>
        ))}
    </div>
  );
}

export default function PlatformBillingPage() {
  return (
    <Suspense fallback={null}>
      <PlatformBillingContent />
    </Suspense>
  );
}
