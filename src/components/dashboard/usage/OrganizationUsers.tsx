import AnalyticsEmptyState from "@/components/admin/analytics/AnalyticsEmptyState";
import type { OrganizationTopUserSummary } from "@/lib/analytics/customer-analytics-service";

/** Admin-only — the page only renders this component at all when the caller's own session-derived permissions include "Manage Billing"; the underlying API route enforces the same gate server-side regardless. */
export default function OrganizationUsers({ users }: { users: OrganizationTopUserSummary[] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-3">
        <h2 className="text-sm font-bold text-slate-700">Top Organization Users</h2>
        <p className="mt-0.5 text-xs text-slate-500">Visible to organization administrators only.</p>
      </div>
      {users.length === 0 ? (
        <AnalyticsEmptyState />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-5 py-3">
                  User
                </th>
                <th scope="col" className="px-5 py-3">
                  AI Requests
                </th>
                <th scope="col" className="px-5 py-3">
                  Credits Used
                </th>
                <th scope="col" className="px-5 py-3">
                  Features Used
                </th>
                <th scope="col" className="px-5 py-3">
                  Last Activity
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((row) => (
                <tr key={row.userId}>
                  <td className="px-5 py-3 font-semibold text-slate-800">{row.email ?? row.userId.slice(0, 8)}</td>
                  <td className="px-5 py-3 text-slate-600">{row.aiRequests}</td>
                  <td className="px-5 py-3 text-slate-600">{row.creditsUsed}</td>
                  <td className="px-5 py-3 text-slate-600">{row.featuresUsed.map((f) => f.replace(/_/g, " ")).join(", ")}</td>
                  <td className="px-5 py-3 text-slate-600">{row.lastActivity ? new Date(row.lastActivity).toLocaleDateString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
