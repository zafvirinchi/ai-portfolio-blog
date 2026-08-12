export default function UsageProgress({ percent, label }: { percent: number; label?: string }) {
  const clamped = Math.min(100, Math.max(0, percent));
  const color = clamped >= 100 || clamped >= 90 ? "bg-red-500" : clamped >= 75 ? "bg-amber-500" : "bg-blue-600";

  return (
    <div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-slate-100"
        role="progressbar"
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? "Usage"}
      >
        <div className={`h-full rounded-full ${color}`} style={{ width: `${clamped}%` }} />
      </div>
      {/* Text equivalent of the bar, not just color — screen readers and low-vision users get the same information as the visual. */}
      <p className="mt-1 text-xs text-slate-500">{Math.round(clamped)}% used</p>
    </div>
  );
}
