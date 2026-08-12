import AnalyticsEmptyState from "./AnalyticsEmptyState";

export interface RevenueTrendPoint {
  date: string;
  grossCents: number;
  refundsCents: number;
}

function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

/** Gross revenue per day as bars, refunds called out separately per point (a stacked/dual-axis chart here would be the "misleading dual-axis" the spec warns against, so refunds are a plain number under each bar instead). */
export default function RevenueTrendChart({ data }: { data: RevenueTrendPoint[] }) {
  if (data.length === 0) {
    return <AnalyticsEmptyState message="No payments recorded yet for this period." />;
  }

  const max = Math.max(...data.map((point) => point.grossCents), 1);

  return (
    <div className="overflow-x-auto p-5">
      <div className="flex min-w-max items-end gap-2" style={{ height: 180 }}>
        {data.map((point) => (
          <div
            key={point.date}
            className="flex w-14 flex-col items-center gap-1"
            title={`${point.date}: ${formatCents(point.grossCents)} gross${point.refundsCents > 0 ? `, ${formatCents(point.refundsCents)} refunded` : ""}`}
          >
            <div className="flex h-32 w-full items-end">
              <div className="w-full rounded-t bg-emerald-600" style={{ height: `${Math.max(2, (point.grossCents / max) * 100)}%` }} />
            </div>
            <span className="text-[10px] text-slate-500">{point.date.slice(5)}</span>
            {point.refundsCents > 0 && <span className="text-[9px] text-red-500">-{formatCents(point.refundsCents)}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
