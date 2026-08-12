import StatCard, { formatCents, formatMetric } from "./StatCard";
import AnalyticsEmptyState from "./AnalyticsEmptyState";
import type { AnomalyEvent, OverviewMetrics } from "@/lib/analytics/analytics-types";

const SEVERITY_STYLES: Record<AnomalyEvent["severity"], string> = {
  info: "border-slate-200 bg-slate-50 text-slate-700",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  critical: "border-red-200 bg-red-50 text-red-800",
};

export default function AnalyticsOverview({ overview, anomalies }: { overview: OverviewMetrics; anomalies: AnomalyEvent[] }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Total Users" value={overview.totalUsers} />
        <StatCard label="Active Users (MAU)" value={overview.activeUsers} />
        <StatCard label="New Users" value={overview.newUsers} />
        <StatCard label="Paid Users" value={overview.paidUsers} />
        <StatCard label="Active Subscriptions" value={overview.activeSubscriptions} />
        <StatCard label="MRR" value={formatCents(overview.mrrCents)} />
        <StatCard label="ARR" value={formatCents(overview.arrCents)} />
        <StatCard label="Churn Rate" value={formatMetric(overview.churnRate)} />
        <StatCard label="AI Credits Used" value={overview.aiCreditsUsed} />
        <StatCard label="Estimated AI Cost" value={formatCents(overview.estimatedAiCostCents)} hint="Estimated — not an actual accounting cost." />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-bold text-slate-700">Anomalies &amp; Limit Warnings</h2>
          <p className="mt-0.5 text-xs text-slate-500">Rule-based checks over the last 24 hours vs. the trailing 7 days — not AI-generated.</p>
        </div>
        {anomalies.length === 0 ? (
          <AnalyticsEmptyState message="No anomalies detected." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {anomalies.map((anomaly, index) => (
              <li key={index} className="p-4">
                <div className={`rounded-lg border px-3 py-2 text-sm ${SEVERITY_STYLES[anomaly.severity]}`}>
                  <span className="mr-2 rounded-full bg-white/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">{anomaly.severity}</span>
                  {anomaly.description}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
