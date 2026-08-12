import AnalyticsEmptyState from "./AnalyticsEmptyState";

export interface UsageTrendPoint {
  date: string;
  requests: number;
  credits: number;
}

/** Real per-day bars only — no interpolation, no invented points for missing days. Consistent with /billing/usage's existing bar-chart visual language (no chart library in this project). */
export default function UsageTrendChart({ data }: { data: UsageTrendPoint[] }) {
  if (data.length === 0) {
    return <AnalyticsEmptyState message="No AI usage recorded yet for this period." />;
  }

  const max = Math.max(...data.map((point) => point.credits), 1);

  return (
    <div className="overflow-x-auto p-5">
      <div className="flex min-w-max items-end gap-2" style={{ height: 160 }}>
        {data.map((point) => (
          <div key={point.date} className="flex w-10 flex-col items-center gap-1" title={`${point.date}: ${point.credits} credits, ${point.requests} requests`}>
            <div className="flex h-32 w-full items-end">
              <div className="w-full rounded-t bg-blue-600" style={{ height: `${Math.max(2, (point.credits / max) * 100)}%` }} />
            </div>
            <span className="text-[10px] text-slate-500">{point.date.slice(5)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
