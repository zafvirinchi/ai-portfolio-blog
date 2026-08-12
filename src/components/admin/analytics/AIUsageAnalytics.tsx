import StatCard, { formatCents } from "./StatCard";
import UsageTrendChart from "./UsageTrendChart";
import AnalyticsEmptyState from "./AnalyticsEmptyState";
import type { AIUsageMetrics } from "@/lib/analytics/analytics-types";

export default function AIUsageAnalytics({ aiUsage }: { aiUsage: AIUsageMetrics }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total AI Requests" value={aiUsage.totalRequests} />
        <StatCard label="Total Credits" value={aiUsage.totalCredits} />
        <StatCard label="Total Tokens" value={aiUsage.totalTokens.toLocaleString()} />
        <StatCard label="Input Tokens" value={aiUsage.inputTokens.toLocaleString()} />
        <StatCard label="Output Tokens" value={aiUsage.outputTokens.toLocaleString()} />
        <StatCard label="Estimated AI Cost" value={formatCents(aiUsage.estimatedCostCents)} />
        <StatCard label="Successful Requests" value={aiUsage.successfulRequests} />
        <StatCard label="Failed Requests" value={aiUsage.failedRequests} />
        <StatCard label="Avg. Duration" value={aiUsage.averageDurationMs === null ? "N/A" : `${aiUsage.averageDurationMs} ms`} />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-bold text-slate-700">Daily AI Usage</h2>
        </div>
        <UsageTrendChart data={aiUsage.dailyTrend} />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-bold text-slate-700">Usage by Feature</h2>
        </div>
        {aiUsage.byFeature.length === 0 ? (
          <AnalyticsEmptyState />
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Feature</th>
                <th className="px-5 py-3">Requests</th>
                <th className="px-5 py-3">Credits</th>
                <th className="px-5 py-3">Tokens</th>
                <th className="px-5 py-3">Est. Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {aiUsage.byFeature.map((row) => (
                <tr key={row.feature}>
                  <td className="px-5 py-3 font-semibold text-slate-800">{row.feature.replace(/_/g, " ")}</td>
                  <td className="px-5 py-3 text-slate-600">{row.requests}</td>
                  <td className="px-5 py-3 text-slate-600">{row.credits}</td>
                  <td className="px-5 py-3 text-slate-600">{row.tokens.toLocaleString()}</td>
                  <td className="px-5 py-3 text-slate-600">{formatCents(row.estimatedCostCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-bold text-slate-700">Usage by Model</h2>
        </div>
        {aiUsage.byModel.length === 0 ? (
          <AnalyticsEmptyState />
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Model</th>
                <th className="px-5 py-3">Requests</th>
                <th className="px-5 py-3">Input Tokens</th>
                <th className="px-5 py-3">Output Tokens</th>
                <th className="px-5 py-3">Est. Cost</th>
                <th className="px-5 py-3">Avg. Duration</th>
                <th className="px-5 py-3">Failure Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {aiUsage.byModel.map((row) => (
                <tr key={row.model}>
                  <td className="px-5 py-3 font-semibold text-slate-800">{row.model}</td>
                  <td className="px-5 py-3 text-slate-600">{row.requests}</td>
                  <td className="px-5 py-3 text-slate-600">{row.inputTokens.toLocaleString()}</td>
                  <td className="px-5 py-3 text-slate-600">{row.outputTokens.toLocaleString()}</td>
                  <td className="px-5 py-3 text-slate-600">{formatCents(row.estimatedCostCents)}</td>
                  <td className="px-5 py-3 text-slate-600">{row.averageDurationMs === null ? "N/A" : `${row.averageDurationMs} ms`}</td>
                  <td className="px-5 py-3 text-slate-600">{Math.round(row.failureRate * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
