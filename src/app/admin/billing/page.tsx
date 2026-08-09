import { supabaseAdmin } from "@/lib/supabase/admin";
import { listPlans } from "@/lib/billing/plan-service";
import type { Plan, Subscription } from "@/lib/billing/billing-types";

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export default async function AdminBillingPage() {
  const [plans, { data: subscriptions }, { data: payments }, { data: creditRows }] = await Promise.all([
    listPlans(),
    supabaseAdmin.from("subscriptions").select("*"),
    supabaseAdmin.from("payments").select("amount_cents, status"),
    supabaseAdmin.from("credit_transactions").select("feature_key, amount"),
  ]);

  const planById = new Map<string, Plan>(plans.map((plan) => [plan.id, plan]));
  const allSubscriptions = (subscriptions ?? []) as Subscription[];

  const active = allSubscriptions.filter((sub) => sub.status === "active" || sub.status === "trialing");
  const cancelled = allSubscriptions.filter((sub) => sub.status === "canceled");

  const mrrCents = active.reduce((sum, sub) => {
    const plan = planById.get(sub.plan_id);
    if (!plan) return sum;
    const monthly = sub.billing_interval === "yearly" ? Math.round(plan.yearly_price_cents / 12) : plan.monthly_price_cents;
    return sum + monthly;
  }, 0);

  const arrCents = mrrCents * 12;

  const totalRevenueCents = (payments ?? []).filter((p) => p.status === "succeeded").reduce((sum, p) => sum + p.amount_cents, 0);

  const churnRate = active.length + cancelled.length > 0 ? cancelled.length / (active.length + cancelled.length) : 0;
  const arpuCents = active.length > 0 ? Math.round(totalRevenueCents / active.length) : 0;

  const creditConsumption = new Map<string, number>();
  for (const row of creditRows ?? []) {
    if (row.amount < 0) {
      creditConsumption.set(row.feature_key, (creditConsumption.get(row.feature_key) ?? 0) + Math.abs(row.amount));
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Billing Overview</h1>
        <p className="mt-1 text-sm text-slate-500">Real calculations over whatever subscriptions/payments actually exist — shows zeros until Stripe test-mode keys are configured and a real checkout happens.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard label="MRR" value={formatCents(mrrCents)} />
        <StatCard label="ARR" value={formatCents(arrCents)} />
        <StatCard label="Total Revenue" value={formatCents(totalRevenueCents)} />
        <StatCard label="Active Subscriptions" value={active.length} />
        <StatCard label="Cancelled Subscriptions" value={cancelled.length} />
        <StatCard label="Churn Rate" value={`${(churnRate * 100).toFixed(1)}%`} />
        <StatCard label="ARPU" value={formatCents(arpuCents)} />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-bold text-slate-700">Credit Consumption (all-time)</h2>
        </div>
        {creditConsumption.size === 0 ? (
          <p className="p-5 text-sm text-slate-500">No credits consumed yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Feature</th>
                <th className="px-5 py-3">Credits Consumed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[...creditConsumption.entries()].map(([featureKey, total]) => (
                <tr key={featureKey}>
                  <td className="px-5 py-3 font-semibold text-slate-800">{featureKey.replace(/_/g, " ")}</td>
                  <td className="px-5 py-3 text-slate-600">{total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
