"use client";

import { useCallback, useEffect, useState } from "react";

import UsageOverview from "@/components/dashboard/usage/UsageOverview";
import FeatureUsage from "@/components/dashboard/usage/FeatureUsage";
import UsageTrend, { UsageTrendPoint } from "@/components/dashboard/usage/UsageTrend";
import RecentActivity from "@/components/dashboard/usage/RecentActivity";
import OrganizationUsage from "@/components/dashboard/usage/OrganizationUsage";
import OrganizationSeats from "@/components/dashboard/usage/OrganizationSeats";
import OrganizationUsers from "@/components/dashboard/usage/OrganizationUsers";
import AnalyticsLoading from "@/components/admin/analytics/AnalyticsLoading";
import AnalyticsError from "@/components/admin/analytics/AnalyticsError";
import AnalyticsEmptyState from "@/components/admin/analytics/AnalyticsEmptyState";
import type { CustomerRangePreset } from "@/lib/analytics/customer-usage-shared";
import type {
  MyUsageSummary,
  MyFeatureUsageRow,
  OrganizationSeatSummary,
  OrganizationUsageSummary,
  OrganizationTopUserSummary,
} from "@/lib/analytics/customer-analytics-service";
import type { RecentActivityRow } from "@/lib/analytics/ai-usage-analytics";
import type { UsageSummary, UsageBalance } from "@/lib/ai/usage/usage-types";
import type { TenantContext } from "@/lib/saas/organization-types";

function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function BarChart({ data, labelKey, valueKey }: { data: Record<string, unknown>[]; labelKey: string; valueKey: string }) {
  if (data.length === 0) {
    return <AnalyticsEmptyState message="Not enough data yet to chart." />;
  }

  const max = Math.max(...data.map((row) => Number(row[valueKey]) || 0), 1);

  return (
    <div className="space-y-2 p-5">
      {data.map((row) => {
        const value = Number(row[valueKey]) || 0;
        const label = String(row[labelKey]);
        return (
          <div key={label} className="flex items-center gap-3 text-sm">
            <span className="w-40 shrink-0 truncate text-slate-600">{label.replace(/_/g, " ")}</span>
            <div className="h-4 flex-1 overflow-hidden rounded bg-slate-100">
              <div className="h-full rounded bg-blue-600" style={{ width: `${(value / max) * 100}%` }} />
            </div>
            <span className="w-16 shrink-0 text-right font-semibold text-slate-800">{value}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function BillingUsagePage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasOrganization, setHasOrganization] = useState(true);
  const [canManageBilling, setCanManageBilling] = useState(false);

  // Section 2 — existing organization-wide credit/feature/model breakdown (Milestone 3/4), unchanged.
  const [balance, setBalance] = useState<UsageBalance | null>(null);
  const [summary, setSummary] = useState<UsageSummary | null>(null);

  // Section 1 — personal usage (new).
  const [myRange, setMyRange] = useState<CustomerRangePreset>("30d");
  const [myUsage, setMyUsage] = useState<MyUsageSummary | null>(null);
  const [myFeatures, setMyFeatures] = useState<MyFeatureUsageRow[]>([]);
  const [myTrend, setMyTrend] = useState<UsageTrendPoint[]>([]);
  const [myTrendIsRealBillingCycle, setMyTrendIsRealBillingCycle] = useState(false);
  const [myActivity, setMyActivity] = useState<RecentActivityRow[]>([]);

  // Section 3 — organization administration (new, admin-gated).
  const [orgRange, setOrgRange] = useState<CustomerRangePreset>("30d");
  const [orgUsage, setOrgUsage] = useState<OrganizationUsageSummary | null>(null);
  const [orgTrend, setOrgTrend] = useState<UsageTrendPoint[]>([]);
  const [orgSeats, setOrgSeats] = useState<OrganizationSeatSummary | null>(null);
  const [orgTopUsers, setOrgTopUsers] = useState<OrganizationTopUserSummary[]>([]);

  const loadCore = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const meResponse = await fetch("/api/usage/me");
      const me = await meResponse.json();

      if (!meResponse.ok) throw new Error(me.error || "Failed to load usage.");

      if (!me.hasOrganization) {
        setHasOrganization(false);
        return;
      }

      setHasOrganization(true);

      const [balanceResponse, summaryResponse, tenantResponse] = await Promise.all([
        fetch("/api/billing/usage/balance"),
        fetch("/api/billing/usage/summary?days=30"),
        fetch("/api/saas/me"),
      ]);

      const balanceData = await balanceResponse.json();
      const summaryData = await summaryResponse.json();
      const tenantData: { context: TenantContext | null } = await tenantResponse.json();

      setBalance(balanceData.balance ?? null);
      setSummary(summaryData);
      setCanManageBilling(tenantData.context?.permissions.includes("Manage Billing") ?? false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load usage data.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMyUsage = useCallback(async () => {
    const [featuresResponse, trendsResponse, activityResponse] = await Promise.all([
      fetch(`/api/usage/me/features?range=${myRange}`).then((r) => r.json()),
      fetch(`/api/usage/me/trends?range=${myRange}`).then((r) => r.json()),
      fetch(`/api/usage/me/activity?limit=20`).then((r) => r.json()),
    ]);

    const features: MyFeatureUsageRow[] = featuresResponse.features ?? [];
    setMyFeatures(features);
    setMyUsage({
      totalRequests: features.reduce((sum, row) => sum + row.requests, 0),
      totalCredits: features.reduce((sum, row) => sum + row.credits, 0),
      topFeature: features[0]?.feature ?? null, // getMyFeatureUsage already sorts by credits desc
    });
    setMyTrend(trendsResponse.trend ?? []);
    setMyTrendIsRealBillingCycle(Boolean(trendsResponse.range?.isRealBillingCycle));
    setMyActivity(activityResponse.activity ?? []);
  }, [myRange]);

  const loadOrganizationUsage = useCallback(async () => {
    const analyticsResponse = await fetch(`/api/organization/analytics?range=${orgRange}`).then((r) => r.json());
    const usage: OrganizationUsageSummary | undefined = analyticsResponse.usage;

    setOrgUsage(usage ?? null);
    setOrgTrend(usage?.trend ?? []);

    if (canManageBilling && usage) {
      setOrgSeats({
        totalSeats: usage.seatLimit,
        assignedSeats: usage.seats,
        availableSeats: usage.availableSeats,
        utilizationPercent: usage.seatLimit && usage.seatLimit > 0 ? Math.round((usage.seats / usage.seatLimit) * 100) : null,
      });

      const usersResponse = await fetch(`/api/organization/usage/users?range=${orgRange}`).then((r) => r.json());
      setOrgTopUsers(usersResponse.topUsers ?? []);
    }
  }, [orgRange, canManageBilling]);

  useEffect(() => {
    loadCore();
  }, [loadCore]);

  useEffect(() => {
    if (hasOrganization && !loading) loadMyUsage();
  }, [hasOrganization, loading, loadMyUsage]);

  useEffect(() => {
    if (hasOrganization && !loading) loadOrganizationUsage();
  }, [hasOrganization, loading, loadOrganizationUsage]);

  if (loading) return <AnalyticsLoading />;
  if (error) return <AnalyticsError message={error} onRetry={loadCore} />;

  if (!hasOrganization) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <p className="text-lg font-semibold text-slate-900">You don&apos;t belong to an organization.</p>
        <p className="mt-2 text-sm text-slate-500">AI credits and usage are tracked per organization — create or join one from Settings to see your usage here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* Section 1 — My Usage */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-slate-900">My Usage</h2>
          <a href="/api/usage/me/export" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Export My Usage (CSV)
          </a>
        </div>

        {myUsage && <UsageOverview usage={myUsage} />}

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-3">
            <h3 className="text-sm font-bold text-slate-700">My Feature Usage</h3>
          </div>
          <FeatureUsage features={myFeatures} />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white pb-4 shadow-sm">
          <UsageTrend data={myTrend} range={myRange} onRangeChange={setMyRange} isRealBillingCycle={myTrendIsRealBillingCycle} />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-3">
            <h3 className="text-sm font-bold text-slate-700">Recent Activity</h3>
          </div>
          <RecentActivity activity={myActivity} />
        </div>
      </section>

      {/* Section 2 — existing organization-wide AI usage (Milestone 3/4), unchanged */}
      <section className="space-y-4">
        <h2 className="text-lg font-bold text-slate-900">Organization AI Usage</h2>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase text-slate-400">Total AI Credits Used</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{summary?.totalCreditsUsed ?? 0}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase text-slate-400">Credits Remaining</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{balance?.remaining === null || balance?.remaining === undefined ? "Unlimited" : balance.remaining}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase text-slate-400">Estimated AI Cost (30d)</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{formatCents(summary?.estimatedCostCents ?? 0)}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase text-slate-400">Resets</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{balance ? new Date(balance.resetDate).toLocaleDateString() : "—"}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-3">
            <h3 className="text-sm font-bold text-slate-700">Daily Usage (last 30 days)</h3>
          </div>
          {!summary || summary.dailyUsage.length === 0 ? (
            <AnalyticsEmptyState message="No AI usage recorded yet this period." />
          ) : (
            <BarChart data={summary.dailyUsage as unknown as Record<string, unknown>[]} labelKey="date" valueKey="credits" />
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-3">
            <h3 className="text-sm font-bold text-slate-700">Usage by Feature</h3>
          </div>
          {!summary || summary.byFeature.length === 0 ? (
            <AnalyticsEmptyState message="No AI usage recorded yet this period." />
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-5 py-3">
                    Feature
                  </th>
                  <th scope="col" className="px-5 py-3">
                    Operations
                  </th>
                  <th scope="col" className="px-5 py-3">
                    Credits Used
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summary.byFeature.map((row) => (
                  <tr key={row.feature}>
                    <td className="px-5 py-3 font-semibold text-slate-800">{row.feature.replace(/_/g, " ")}</td>
                    <td className="px-5 py-3 text-slate-600">{row.operations}</td>
                    <td className="px-5 py-3 text-slate-600">{row.credits}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-3">
            <h3 className="text-sm font-bold text-slate-700">Usage by AI Model</h3>
          </div>
          {!summary || summary.byModel.length === 0 ? (
            <AnalyticsEmptyState message="No AI usage recorded yet this period." />
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-5 py-3">
                    Model
                  </th>
                  <th scope="col" className="px-5 py-3">
                    Tokens Used
                  </th>
                  <th scope="col" className="px-5 py-3">
                    Credits Used
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summary.byModel.map((row) => (
                  <tr key={row.model}>
                    <td className="px-5 py-3 font-semibold text-slate-800">{row.model}</td>
                    <td className="px-5 py-3 text-slate-600">{row.tokens.toLocaleString()}</td>
                    <td className="px-5 py-3 text-slate-600">{row.credits}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Section 3 — organization administration, admin-gated (new) */}
      {canManageBilling && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-slate-900">Organization Administration</h2>
            <a href="/api/organization/usage/export" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Export Organization Usage (CSV)
            </a>
          </div>

          {orgUsage && <OrganizationUsage usage={orgUsage} trend={orgTrend} range={orgRange} onRangeChange={setOrgRange} />}
          {orgSeats && <OrganizationSeats seats={orgSeats} />}
          <OrganizationUsers users={orgTopUsers} />
        </section>
      )}
    </div>
  );
}
