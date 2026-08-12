import AnalyticsEmptyState from "./AnalyticsEmptyState";
import type { FeatureMetrics } from "@/lib/analytics/analytics-types";

export default function FeatureAnalytics({ features }: { features: FeatureMetrics }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-3">
        <h2 className="text-sm font-bold text-slate-700">Feature Adoption</h2>
        <p className="mt-0.5 text-xs text-slate-500">Ranked by AI requests in the selected range. Recruiter Workspace and Organization Features have no distinct AI-metered call site yet.</p>
      </div>
      {features.features.length === 0 ? (
        <AnalyticsEmptyState />
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3">Feature</th>
              <th className="px-5 py-3">Users</th>
              <th className="px-5 py-3">Requests</th>
              <th className="px-5 py-3">Credits</th>
              <th className="px-5 py-3">Last Used</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {features.features.map((row) => (
              <tr key={row.feature} className={row.tracked ? "" : "opacity-60"}>
                <td className="px-5 py-3 font-semibold text-slate-800">{row.label}</td>
                <td className="px-5 py-3 text-slate-600">{row.tracked ? row.users : "Not tracked"}</td>
                <td className="px-5 py-3 text-slate-600">{row.tracked ? row.requests : "—"}</td>
                <td className="px-5 py-3 text-slate-600">{row.tracked ? row.credits : "—"}</td>
                <td className="px-5 py-3 text-slate-600">{row.lastUsed ? new Date(row.lastUsed).toLocaleDateString() : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
