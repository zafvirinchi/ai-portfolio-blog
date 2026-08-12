import UsageTrend, { UsageTrendPoint } from "./UsageTrend";
import type { OrganizationUsageSummary } from "@/lib/analytics/customer-analytics-service";
import type { CustomerRangePreset } from "@/lib/analytics/customer-usage-shared";

// Deliberately does NOT re-render a credit-balance card — the existing
// "Organization AI Usage" section on this page (Milestone 3/4, backed
// by /api/billing/usage/balance) already shows Total/Used/Remaining/
// Resets for the same shared credit pool. Duplicating that here would
// put two numbers for the same thing on one page. This component adds
// only what's genuinely new: active-user/seat KPIs and an
// organization-scoped usage trend with the customer-safe 4-preset
// range selector.
export default function OrganizationUsage({
  usage,
  trend,
  range,
  onRangeChange,
}: {
  usage: OrganizationUsageSummary;
  trend: UsageTrendPoint[];
  range: CustomerRangePreset;
  onRangeChange: (range: CustomerRangePreset) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Active Users</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{usage.activeUsers}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Assigned Seats</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{usage.seats}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">AI Credits Used</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{usage.aiCreditsUsed}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Last Activity</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{usage.lastActivity ? new Date(usage.lastActivity).toLocaleDateString() : "—"}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white pb-4 shadow-sm">
        <UsageTrend data={trend} range={range} onRangeChange={onRangeChange} />
      </div>
    </div>
  );
}
