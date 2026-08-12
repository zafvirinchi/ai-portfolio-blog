import StatCard, { formatCents } from "./StatCard";
import AnalyticsEmptyState from "./AnalyticsEmptyState";
import type { OrganizationMetrics } from "@/lib/analytics/analytics-types";

export default function OrganizationAnalytics({ organizations }: { organizations: OrganizationMetrics }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Organizations" value={organizations.totalOrganizations} />
        <StatCard label="Active Organizations" value={organizations.activeOrganizations} />
        <StatCard label="Paid Organizations" value={organizations.paidOrganizations} />
        <StatCard label="Total Seats" value={organizations.totalSeats} />
        <StatCard label="Seat Utilization" value={organizations.seatUtilizationPercent === null ? "N/A" : `${organizations.seatUtilizationPercent}%`} hint="Excludes Enterprise (unlimited seats)" />
        <StatCard label="AI Credits Used" value={organizations.aiCreditsUsed} />
        <StatCard label="Estimated AI Cost" value={formatCents(organizations.estimatedAiCostCents)} />
      </div>

      {organizations.organizationsNearLimits.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 shadow-sm">
          <div className="border-b border-amber-200 px-5 py-3">
            <h2 className="text-sm font-bold text-amber-800">Organizations Near Limits</h2>
          </div>
          <ul className="divide-y divide-amber-100">
            {organizations.organizationsNearLimits.map((warning, index) => (
              <li key={index} className="px-5 py-3 text-sm text-amber-800">
                {warning.description}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-bold text-slate-700">Top Organizations</h2>
        </div>
        {organizations.topOrganizations.length === 0 ? (
          <AnalyticsEmptyState />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Organization</th>
                  <th className="px-5 py-3">Plan</th>
                  <th className="px-5 py-3">Seats</th>
                  <th className="px-5 py-3">Active Users</th>
                  <th className="px-5 py-3">AI Credits</th>
                  <th className="px-5 py-3">Est. Cost</th>
                  <th className="px-5 py-3">Usage %</th>
                  <th className="px-5 py-3">Last Activity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {organizations.topOrganizations.map((row) => (
                  <tr key={row.organizationId}>
                    <td className="px-5 py-3 font-semibold text-slate-800">{row.organizationName}</td>
                    <td className="px-5 py-3 text-slate-600">{row.planKey}</td>
                    <td className="px-5 py-3 text-slate-600">{row.seats}</td>
                    <td className="px-5 py-3 text-slate-600">{row.activeUsers}</td>
                    <td className="px-5 py-3 text-slate-600">{row.aiCreditsUsed}</td>
                    <td className="px-5 py-3 text-slate-600">{formatCents(row.estimatedAiCostCents)}</td>
                    <td className="px-5 py-3 text-slate-600">{row.usagePercent === null ? "Unlimited" : `${row.usagePercent}%`}</td>
                    <td className="px-5 py-3 text-slate-600">{row.lastActivity ? new Date(row.lastActivity).toLocaleDateString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
