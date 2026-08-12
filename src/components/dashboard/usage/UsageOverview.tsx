import type { MyUsageSummary } from "@/lib/analytics/customer-analytics-service";

export default function UsageOverview({ usage }: { usage: MyUsageSummary }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Your AI Requests</p>
        <p className="mt-1 text-2xl font-bold text-slate-900">{usage.totalRequests}</p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Your Credits Used</p>
        <p className="mt-1 text-2xl font-bold text-slate-900">{usage.totalCredits}</p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Most Used Feature</p>
        <p className="mt-1 text-2xl font-bold text-slate-900">{usage.topFeature ? usage.topFeature.replace(/_/g, " ") : "—"}</p>
      </div>
    </div>
  );
}
