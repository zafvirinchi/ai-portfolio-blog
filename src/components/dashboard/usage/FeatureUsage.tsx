import AnalyticsEmptyState from "@/components/admin/analytics/AnalyticsEmptyState";
import type { MyFeatureUsageRow } from "@/lib/analytics/customer-analytics-service";

export default function FeatureUsage({ features }: { features: MyFeatureUsageRow[] }) {
  if (features.length === 0) {
    return <AnalyticsEmptyState message="No AI feature usage yet. Start by analyzing your resume." />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th scope="col" className="px-5 py-3">
              Feature
            </th>
            <th scope="col" className="px-5 py-3">
              Requests
            </th>
            <th scope="col" className="px-5 py-3">
              Credits Used
            </th>
            <th scope="col" className="px-5 py-3">
              % of Usage
            </th>
            <th scope="col" className="px-5 py-3">
              Last Used
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {features.map((row) => (
            <tr key={row.feature}>
              <td className="px-5 py-3 font-semibold text-slate-800">{row.feature.replace(/_/g, " ")}</td>
              <td className="px-5 py-3 text-slate-600">{row.requests}</td>
              <td className="px-5 py-3 text-slate-600">{row.credits}</td>
              <td className="px-5 py-3 text-slate-600">{row.percentOfUsage}%</td>
              <td className="px-5 py-3 text-slate-600">{row.lastUsed ? new Date(row.lastUsed).toLocaleString() : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
