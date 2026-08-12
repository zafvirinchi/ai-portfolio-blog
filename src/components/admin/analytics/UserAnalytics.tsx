import StatCard from "./StatCard";
import UsageTrendChart from "./UsageTrendChart";
import AnalyticsEmptyState from "./AnalyticsEmptyState";
import type { TopUserRow, UserMetrics } from "@/lib/analytics/analytics-types";

export default function UserAnalytics({ users, topUsers }: { users: UserMetrics; topUsers: TopUserRow[] }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total Users" value={users.totalUsers} />
        <StatCard label="New Users" value={users.newUsers} />
        <StatCard label="Returning Users" value={users.returningUsers} />
        <StatCard label="Paid Users" value={users.paidUsers} />
        <StatCard label="Free Users" value={users.freeUsers} />
        <StatCard label="DAU" value={users.activeUsers.dau} hint={users.activityDefinition.dau} />
        <StatCard label="WAU" value={users.activeUsers.wau} hint={users.activityDefinition.wau} />
        <StatCard label="MAU" value={users.activeUsers.mau} hint={users.activityDefinition.mau} />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Free" value={users.usersByPlan.free} />
        <StatCard label="Professional" value={users.usersByPlan.professional} />
        <StatCard label="Premium" value={users.usersByPlan.premium} />
        <StatCard label="Enterprise" value={users.usersByPlan.enterprise} />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-bold text-slate-700">Active Users Trend</h2>
        </div>
        <UsageTrendChart data={users.activityTrend.map((point) => ({ date: point.date, requests: point.activeUsers, credits: point.activeUsers }))} />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-bold text-slate-700">Top Active Users</h2>
        </div>
        {topUsers.length === 0 ? (
          <AnalyticsEmptyState />
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">User</th>
                <th className="px-5 py-3">Plan</th>
                <th className="px-5 py-3">Organization</th>
                <th className="px-5 py-3">AI Requests</th>
                <th className="px-5 py-3">Credits Used</th>
                <th className="px-5 py-3">Last Activity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {topUsers.map((row) => (
                <tr key={row.userId}>
                  <td className="px-5 py-3 font-semibold text-slate-800">{row.email ?? row.userId.slice(0, 8)}</td>
                  <td className="px-5 py-3 text-slate-600">{row.planKey ?? "free"}</td>
                  <td className="px-5 py-3 text-slate-600">{row.organizationName ?? "—"}</td>
                  <td className="px-5 py-3 text-slate-600">{row.aiRequests}</td>
                  <td className="px-5 py-3 text-slate-600">{row.creditsUsed}</td>
                  <td className="px-5 py-3 text-slate-600">{row.lastActivity ? new Date(row.lastActivity).toLocaleDateString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
