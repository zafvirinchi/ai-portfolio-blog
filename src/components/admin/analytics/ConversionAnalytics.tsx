import StatCard, { formatMetric } from "./StatCard";
import AnalyticsEmptyState from "./AnalyticsEmptyState";
import type { ConversionMetrics } from "@/lib/analytics/analytics-types";

export default function ConversionAnalytics({ conversion }: { conversion: ConversionMetrics }) {
  return (
    <div className="space-y-6">
      <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">{conversion.disclaimer}</p>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Free Organizations" value={conversion.freeToPaid.freeOrganizations} />
        <StatCard label="Paid Organizations" value={conversion.freeToPaid.paidOrganizations} />
        <StatCard label="Free → Paid" value={formatMetric(conversion.freeToPaid.conversionRate)} hint="Current mix, not a cohort rate" />
        <StatCard label="Trial → Paid" value={formatMetric(conversion.trialToPaid)} />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-bold text-slate-700">Feature → Paid Associated Conversion</h2>
        </div>
        {conversion.featureConversion.length === 0 ? (
          <AnalyticsEmptyState />
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Feature</th>
                <th className="px-5 py-3">Used By (orgs)</th>
                <th className="px-5 py-3">Used &amp; Paid (orgs)</th>
                <th className="px-5 py-3">Associated Conversion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {conversion.featureConversion.map((row) => (
                <tr key={row.feature}>
                  <td className="px-5 py-3 font-semibold text-slate-800">{row.feature}</td>
                  <td className="px-5 py-3 text-slate-600">{row.usedByOrgs}</td>
                  <td className="px-5 py-3 text-slate-600">{row.usedAndPaidOrgs}</td>
                  <td className="px-5 py-3 text-slate-600">{formatMetric(row.associatedConversionRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-bold text-slate-700">Funnel (per organization)</h2>
        </div>
        <ul className="divide-y divide-slate-100">
          {conversion.funnel.map((step) => (
            <li key={step.step} className="flex items-center justify-between px-5 py-3 text-sm">
              <div>
                <p className="font-semibold text-slate-800">{step.step}</p>
                <p className="text-xs text-slate-400">{step.source}</p>
              </div>
              <p className="text-lg font-bold text-slate-900">{step.count}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
