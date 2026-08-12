import StatCard, { formatCents } from "./StatCard";
import RevenueTrendChart from "./RevenueTrendChart";
import AnalyticsEmptyState from "./AnalyticsEmptyState";
import type { RevenueMetrics } from "@/lib/analytics/analytics-types";

export default function RevenueAnalytics({ revenue }: { revenue: RevenueMetrics }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Gross Revenue" value={formatCents(revenue.grossRevenueCents)} />
        <StatCard label="Net Revenue" value={formatCents(revenue.netRevenueCents)} hint="Gross minus refunds" />
        <StatCard label="Recurring Revenue" value={formatCents(revenue.recurringRevenueCents)} />
        <StatCard label="One-time Revenue" value={formatCents(revenue.oneTimeRevenueCents)} hint="No one-time-purchase feature exists yet" />
        <StatCard label="Refunds" value={formatCents(revenue.refundsCents)} />
        <StatCard label="Discounts" value={formatCents(revenue.discountsCents)} />
        <StatCard label="Taxes" value={formatCents(revenue.taxesCents)} />
        <StatCard label="Failed Payments" value={formatCents(revenue.failedPaymentsCents)} hint={`${revenue.failedPaymentsCount} attempt(s)`} />
        <StatCard label="MRR" value={formatCents(revenue.mrrCents)} hint="Current, not range-scoped" />
        <StatCard label="ARR" value={formatCents(revenue.arrCents)} hint="MRR × 12" />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-bold text-slate-700">Revenue Trend</h2>
        </div>
        <RevenueTrendChart data={revenue.revenueTrend} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-3">
            <h2 className="text-sm font-bold text-slate-700">Revenue by Plan</h2>
          </div>
          {revenue.revenueByPlan.length === 0 ? (
            <AnalyticsEmptyState />
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Plan</th>
                  <th className="px-5 py-3">Subscriptions</th>
                  <th className="px-5 py-3">MRR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {revenue.revenueByPlan.map((row) => (
                  <tr key={row.planKey}>
                    <td className="px-5 py-3 font-semibold text-slate-800">{row.planName}</td>
                    <td className="px-5 py-3 text-slate-600">{row.subscriptions}</td>
                    <td className="px-5 py-3 text-slate-600">{formatCents(row.mrrCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-3">
            <h2 className="text-sm font-bold text-slate-700">Revenue by Organization</h2>
          </div>
          {revenue.revenueByOrganization.length === 0 ? (
            <AnalyticsEmptyState />
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Organization</th>
                  <th className="px-5 py-3">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {revenue.revenueByOrganization.slice(0, 20).map((row) => (
                  <tr key={row.organizationId}>
                    <td className="px-5 py-3 font-semibold text-slate-800">{row.organizationName}</td>
                    <td className="px-5 py-3 text-slate-600">{formatCents(row.totalCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
