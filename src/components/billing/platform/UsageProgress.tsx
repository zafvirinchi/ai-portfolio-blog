import { describeResetDate } from "@/lib/billing/entitlement-client-error";

// Phase 19 Milestone 4, Steps 2-4 — presentation-only usage visualization
// for /settings/billing. Every number rendered here (used/limit/period)
// comes straight from getBillingOverview()'s own usage rows (Phase 19
// M4's new per-metric limit/period, itself derived from the same
// mostPermissive()/featuresUsingMetric() resolution checkQuota() already
// enforces — see entitlement-service.ts) — nothing here recomputes
// entitlement, invents a limit, or changes what checkQuota()/
// requireQuota() actually allow. A near-quota warning threshold is
// purely a color/copy change at render time; it can never itself grant
// or deny access.
export interface UsageProgressProps {
  label: string;
  used: number;
  /** null = unlimited (ADMIN bypass, an UNLIMITED plan tier, or an active override). */
  limit: number | null;
  period: string | null;
  className?: string;
}

type Severity = "unlimited" | "not-included" | "normal" | "approaching" | "nearly-exhausted" | "exhausted";

function severityFor(used: number, limit: number | null): Severity {
  if (limit === null) return "unlimited";
  if (limit === 0) return "not-included";
  const percent = (used / limit) * 100;
  if (percent >= 100) return "exhausted";
  if (percent >= 90) return "nearly-exhausted";
  if (percent >= 70) return "approaching";
  return "normal";
}

const BAR_CLASSNAME: Record<Severity, string> = {
  unlimited: "bg-blue-500",
  "not-included": "bg-slate-300",
  normal: "bg-blue-500",
  approaching: "bg-amber-500",
  "nearly-exhausted": "bg-red-500",
  exhausted: "bg-red-600",
};

const STATUS_TEXT_CLASSNAME: Record<Severity, string> = {
  unlimited: "text-blue-700",
  "not-included": "text-slate-500",
  normal: "text-slate-500",
  approaching: "text-amber-700",
  "nearly-exhausted": "text-red-700",
  exhausted: "text-red-700",
};

const STATUS_LABEL: Partial<Record<Severity, string>> = {
  approaching: "Approaching limit",
  "nearly-exhausted": "Nearly exhausted",
  exhausted: "Limit reached",
};

export default function UsageProgress({ label, used, limit, period, className = "" }: UsageProgressProps) {
  const severity = severityFor(used, limit);
  const percent = limit !== null && limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : null;
  const remaining = limit !== null && limit > 0 ? Math.max(0, limit - used) : null;
  const resetText = severity !== "unlimited" && severity !== "not-included" ? describeResetDate(period) : null;
  const statusLabel = STATUS_LABEL[severity];

  return (
    <div className={`rounded-xl border border-slate-100 bg-slate-50 p-4 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{label}</p>
        {statusLabel && <span className={`text-[10px] font-bold uppercase ${STATUS_TEXT_CLASSNAME[severity]}`}>{statusLabel}</span>}
      </div>

      <p className="mt-1 text-lg font-bold text-slate-900">{used}</p>

      {severity === "unlimited" && <p className="mt-1 text-xs font-medium text-blue-700">Unlimited</p>}

      {severity === "not-included" && <p className="mt-1 text-xs text-slate-500">Not included on your current plan.</p>}

      {percent !== null && limit !== null && (
        <>
          <div
            role="progressbar"
            aria-label={`${label}: ${used} of ${limit} used${period ? ` this ${period.toLowerCase()}` : ""}`}
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200"
          >
            <div className={`h-full rounded-full transition-[width] ${BAR_CLASSNAME[severity]}`} style={{ width: `${percent}%` }} />
          </div>
          <p className={`mt-1 text-xs font-medium ${STATUS_TEXT_CLASSNAME[severity]}`}>
            {used}/{limit} used ({percent}%) &middot; {remaining} remaining{period ? ` this ${period.toLowerCase()}` : ""}
          </p>
        </>
      )}

      {resetText && <p className="mt-1 text-xs text-slate-400">{resetText}</p>}
    </div>
  );
}
