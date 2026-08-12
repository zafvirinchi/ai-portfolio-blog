import AnalyticsEmptyState from "@/components/admin/analytics/AnalyticsEmptyState";
import type { RecentActivityRow } from "@/lib/analytics/ai-usage-analytics";

const STATUS_STYLES: Record<string, string> = {
  success: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  blocked: "bg-amber-100 text-amber-700",
};

/**
 * Deliberately renders only feature/timestamp/status/credits — the
 * exact 4 columns getRecentActivityForUser() selects. There is no
 * prompt, response, resume, or document content in this data at all
 * (usage_tracking never stores it), so there's no sensitive field this
 * component could accidentally leak even if the API response were
 * extended later.
 */
export default function RecentActivity({ activity }: { activity: RecentActivityRow[] }) {
  if (activity.length === 0) {
    return <AnalyticsEmptyState message="No AI activity yet." />;
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
              Date/Time
            </th>
            <th scope="col" className="px-5 py-3">
              Status
            </th>
            <th scope="col" className="px-5 py-3">
              Credits
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {activity.map((row, index) => (
            <tr key={index}>
              <td className="px-5 py-3 font-semibold text-slate-800">{row.feature.replace(/_/g, " ")}</td>
              <td className="px-5 py-3 text-slate-600">{new Date(row.createdAt).toLocaleString()}</td>
              <td className="px-5 py-3">
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[row.status] ?? "bg-slate-100 text-slate-600"}`}>{row.status}</span>
              </td>
              <td className="px-5 py-3 text-slate-600">{row.credits}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
