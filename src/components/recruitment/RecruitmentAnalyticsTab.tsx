"use client";

import { useCallback, useEffect, useState } from "react";

import type { PipelineAnalytics } from "@/lib/ai/recruitment/pipeline-types";

type Props = {
  jobId: string | null;
};

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

export default function RecruitmentAnalyticsTab({ jobId }: Props) {
  const [scope, setScope] = useState<"job" | "all">("job");
  const [analytics, setAnalytics] = useState<PipelineAnalytics | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const url = scope === "job" && jobId ? `/api/ai/recruitment/jobs/${jobId}/analytics` : "/api/ai/recruitment/analytics";
      const response = await fetch(url);
      setAnalytics(await response.json());
    } finally {
      setLoading(false);
    }
  }, [jobId, scope]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        <button
          onClick={() => setScope("job")}
          disabled={!jobId}
          className={`rounded-xl px-4 py-2 text-sm font-semibold ${scope === "job" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
        >
          Selected Job
        </button>
        <button
          onClick={() => setScope("all")}
          className={`rounded-xl px-4 py-2 text-sm font-semibold ${scope === "all" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
        >
          All Jobs
        </button>
      </div>

      {loading || !analytics ? (
        <p className="text-sm text-slate-500">Loading analytics...</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard label="Applications" value={analytics.applications} />
            <StatCard label="Shortlisted" value={analytics.shortlisted} />
            <StatCard label="Rejected" value={analytics.rejected} />
            <StatCard label="Offers" value={analytics.offers} />
            <StatCard label="Hired" value={analytics.hired} />
            <StatCard label="Average ATS" value={analytics.averageAts ?? "N/A"} />
            <StatCard label="Average JD Match" value={analytics.averageJdMatch ?? "N/A"} />
            <StatCard label="Avg. Time To Hire" value={analytics.averageTimeToHireDays !== null ? `${analytics.averageTimeToHireDays}d` : "N/A"} />
            <StatCard label="Conversion Rate" value={analytics.conversionRate !== null ? `${analytics.conversionRate}%` : "N/A"} />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h4 className="mb-3 text-xs font-bold uppercase text-slate-500">Hiring Funnel</h4>
            <div className="space-y-2">
              {analytics.hiringFunnel.map((entry) => {
                const max = analytics.hiringFunnel[0]?.count || 1;
                const width = Math.max(4, Math.round((entry.count / max) * 100));
                return (
                  <div key={entry.stage} className="flex items-center gap-3 text-sm">
                    <span className="w-40 flex-shrink-0 text-slate-600">{entry.stage}</span>
                    <div className="h-4 flex-1 rounded-full bg-slate-100">
                      <div className="h-4 rounded-full bg-blue-500" style={{ width: `${width}%` }} />
                    </div>
                    <span className="w-8 text-right font-semibold text-slate-700">{entry.count}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h4 className="mb-3 text-xs font-bold uppercase text-slate-500">Stage Distribution</h4>
            <div className="flex flex-wrap gap-2">
              {analytics.stageDistribution.map((entry) => (
                <span key={entry.stage} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                  {entry.stage}: {entry.count}
                </span>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
