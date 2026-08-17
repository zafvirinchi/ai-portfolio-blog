import Link from "next/link";

import PlatformOverrideManager from "@/components/admin/PlatformOverrideManager";
import PlatformRoleManager from "@/components/admin/PlatformRoleManager";
import { getPlatformUserDetail } from "@/lib/billing/platform-admin-service";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// Phase 18 Milestone 3 — Scope D/G. A server component calling
// getPlatformUserDetail() directly, matching the existing admin-page
// convention (/admin/billing, /admin/saas both call their own service
// functions server-side rather than fetching their own API) — the
// mutating parts (role/override management) are the two client
// components above, which go through the real API routes.
export default async function PlatformUserDetailPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user: viewer },
  } = await supabase.auth.getUser();

  const detail = await getPlatformUserDetail(userId);

  if (!detail) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
        No user exists with that id.
        <div className="mt-4">
          <Link href="/admin/platform/users" className="text-sm font-semibold text-blue-600 hover:underline">
            Back to search
          </Link>
        </div>
      </div>
    );
  }

  const grantedFeatures = detail.entitlements.filter((entitlement) => entitlement.access !== "NONE");

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/platform/users" className="text-sm font-semibold text-blue-600 hover:underline">
          &larr; Back to search
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">{detail.email ?? detail.userId}</h1>
        <p className="text-xs text-slate-500">
          {detail.userId} &middot; joined {new Date(detail.createdAt).toLocaleDateString()}
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-bold text-slate-700">Roles</h2>
        <div className="mt-4">
          <PlatformRoleManager userId={detail.userId} currentRoles={detail.roles} viewerUserId={viewer?.id ?? ""} />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-bold text-slate-700">Effective Plans</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {detail.plans.map((plan) => (
            <div key={plan.role} className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{plan.role}</p>
              <p className="font-semibold text-slate-900">{plan.planKey ?? "No plan"}</p>
              <p className="text-xs text-slate-500">
                {plan.status} {plan.isImplicitFree ? "(implicit free)" : "(Stripe-backed)"}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-bold text-slate-700">Effective Entitlements ({grantedFeatures.length} of {detail.entitlements.length} features enabled)</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                <th scope="col" className="py-2 font-semibold">Feature</th>
                <th scope="col" className="py-2 font-semibold">Access</th>
                <th scope="col" className="py-2 font-semibold">Source</th>
              </tr>
            </thead>
            <tbody>
              {detail.entitlements.map((entitlement) => (
                <tr key={entitlement.featureId} className="border-b border-slate-50 last:border-0">
                  <td className="py-2 text-slate-700">{entitlement.featureId}</td>
                  <td className="py-2 text-slate-500">{entitlement.access}</td>
                  <td className="py-2 text-slate-500">{entitlement.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-bold text-slate-700">Entitlement Overrides</h2>
        <p className="mt-1 text-xs text-slate-500">A GRANTED override unlocks a feature (and any quota tied to it) regardless of plan; a REVOKED override blocks it even on a paid plan.</p>
        <div className="mt-4">
          <PlatformOverrideManager userId={detail.userId} overrides={detail.overrides} />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-bold text-slate-700">Billing</h2>
        {detail.billingCustomer ? (
          <div className="mt-4 space-y-4">
            <p className="text-xs text-slate-500">Stripe customer: <span className="font-mono">{detail.billingCustomer.stripe_customer_id}</span></p>
            {detail.subscriptions.length === 0 ? (
              <p className="text-sm text-slate-400">No subscriptions on record.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                    <th scope="col" className="py-2 font-semibold">Plan</th>
                    <th scope="col" className="py-2 font-semibold">Status</th>
                    <th scope="col" className="py-2 font-semibold">Renews/Ends</th>
                    <th scope="col" className="py-2 font-semibold">Cancel at period end</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.subscriptions.map((subscription) => (
                    <tr key={subscription.id} className="border-b border-slate-50 last:border-0">
                      <td className="py-2 text-slate-700">{subscription.plan_id}</td>
                      <td className="py-2 text-slate-500">{subscription.status}</td>
                      <td className="py-2 text-slate-500">{subscription.current_period_end ? new Date(subscription.current_period_end).toLocaleDateString() : "—"}</td>
                      <td className="py-2 text-slate-500">{subscription.cancel_at_period_end ? "Yes" : "No"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-400">No Stripe billing account for this user yet — always FREE until one exists (never fabricated).</p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-bold text-slate-700">Usage</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {detail.usage.map((summary) => (
            <div key={summary.metric} className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{summary.metric}</p>
              <p className="text-slate-700">Today: {summary.usedToday} &middot; Month: {summary.usedThisMonth} &middot; Lifetime: {summary.usedLifetime}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-bold text-slate-700">Admin Action History</h2>
        {detail.auditLog.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">No administrative actions recorded for this user yet.</p>
        ) : (
          <ul className="mt-4 space-y-2 text-sm">
            {detail.auditLog.map((entry) => (
              <li key={entry.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <span className="font-semibold text-slate-700">{entry.action}</span>
                <span className="ml-2 text-xs text-slate-400">{new Date(entry.created_at).toLocaleString()} by {entry.user_id}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
