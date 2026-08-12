import type { UsageLimitWarning as UsageLimitWarningValue } from "@/lib/analytics/customer-usage-shared";

export default function UsageLimitWarning({ warning }: { warning: UsageLimitWarningValue | null }) {
  if (!warning) return null;

  const isSevere = warning.threshold >= 90;

  return (
    <div
      role="alert"
      className={`mt-3 rounded-xl border p-3 text-sm font-semibold ${isSevere ? "border-red-200 bg-red-50 text-red-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}
    >
      {warning.message}
    </div>
  );
}
