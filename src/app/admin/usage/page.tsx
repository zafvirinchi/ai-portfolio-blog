import { supabaseAdmin } from "@/lib/supabase/admin";
import { listFeatureCosts } from "@/lib/ai/usage/usage-policy";
import { listModelPricing } from "@/lib/ai/usage/usage-policy";
import UsagePolicyEditor from "@/components/admin/UsagePolicyEditor";

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

function last30DaysIso(): string {
  return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
}

export default async function AdminUsagePage() {
  const since30d = last30DaysIso();

  const { data: rows } = await supabaseAdmin.from("usage_tracking").select("*").gte("created_at", since30d).order("created_at", { ascending: false });

  const data = rows ?? [];

  const totalCreditsUsed = data.reduce((sum, row) => sum + (row.actual_credits ?? 0), 0);
  const totalRequests = data.length;
  const failedRequests = data.filter((row) => row.status === "failed" || row.status === "blocked").length;
  const activeUsers = new Set(data.map((row) => row.user_id).filter(Boolean)).size;
  const estimatedCostCents = Math.round(totalCreditsUsed);

  const byFeature = new Map<string, number>();
  const byModel = new Map<string, number>();
  const byOrganization = new Map<string, number>();
  const byDay = new Map<string, number>();

  for (const row of data) {
    const credits = row.actual_credits ?? 0;
    byFeature.set(row.feature_key, (byFeature.get(row.feature_key) ?? 0) + credits);
    if (row.model) byModel.set(row.model, (byModel.get(row.model) ?? 0) + credits);
    byOrganization.set(row.organization_id, (byOrganization.get(row.organization_id) ?? 0) + credits);
    const day = row.created_at.slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + credits);
  }

  const featureCosts = listFeatureCosts();
  const modelPricing = listModelPricing();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">AI Usage Overview</h1>
        <p className="mt-1 text-sm text-slate-500">Platform-wide AI usage metrics, last 30 days. Real calculations over whatever usage has actually occurred.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Total AI Credits Used" value={totalCreditsUsed} />
        <StatCard label="Total AI Requests" value={totalRequests} />
        <StatCard label="Active AI Users" value={activeUsers} />
        <StatCard label="Failed AI Requests" value={failedRequests} />
        <StatCard label="Estimated AI Cost" value={formatCents(estimatedCostCents)} />
        <StatCard label="Avg. Cost / User" value={formatCents(activeUsers > 0 ? Math.round(estimatedCostCents / activeUsers) : 0)} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-3">
            <h2 className="text-sm font-bold text-slate-700">Usage by Feature</h2>
          </div>
          {byFeature.size === 0 ? (
            <p className="p-5 text-sm text-slate-500">No usage recorded yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {[...byFeature.entries()].map(([feature, credits]) => (
                <li key={feature} className="flex justify-between px-5 py-2 text-sm">
                  <span className="text-slate-700">{feature.replace(/_/g, " ")}</span>
                  <span className="font-semibold text-slate-900">{credits}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-3">
            <h2 className="text-sm font-bold text-slate-700">Usage by Model</h2>
          </div>
          {byModel.size === 0 ? (
            <p className="p-5 text-sm text-slate-500">No usage recorded yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {[...byModel.entries()].map(([model, credits]) => (
                <li key={model} className="flex justify-between px-5 py-2 text-sm">
                  <span className="text-slate-700">{model}</span>
                  <span className="font-semibold text-slate-900">{credits}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-3">
            <h2 className="text-sm font-bold text-slate-700">Usage by Organization</h2>
          </div>
          {byOrganization.size === 0 ? (
            <p className="p-5 text-sm text-slate-500">No usage recorded yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {[...byOrganization.entries()].map(([organizationId, credits]) => (
                <li key={organizationId} className="flex justify-between px-5 py-2 text-sm">
                  <span className="text-slate-700">{organizationId.slice(0, 8)}</span>
                  <span className="font-semibold text-slate-900">{credits}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-3">
            <h2 className="text-sm font-bold text-slate-700">Usage by Day</h2>
          </div>
          {byDay.size === 0 ? (
            <p className="p-5 text-sm text-slate-500">No usage recorded yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {[...byDay.entries()]
                .sort((a, b) => b[0].localeCompare(a[0]))
                .map(([day, credits]) => (
                  <li key={day} className="flex justify-between px-5 py-2 text-sm">
                    <span className="text-slate-700">{day}</span>
                    <span className="font-semibold text-slate-900">{credits}</span>
                  </li>
                ))}
            </ul>
          )}
        </div>
      </div>

      <UsagePolicyEditor initialFeatureCosts={featureCosts} initialModelPricing={modelPricing} />
    </div>
  );
}
