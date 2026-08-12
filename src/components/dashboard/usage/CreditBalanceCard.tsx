import UsageProgress from "./UsageProgress";
import UsageLimitWarning from "./UsageLimitWarning";
import UpgradePrompt from "./UpgradePrompt";
import type { UsageLimitWarning as UsageLimitWarningValue } from "@/lib/analytics/customer-usage-shared";

export interface CreditBalanceCardProps {
  title?: string;
  monthlyLimit: number | null;
  used: number;
  remaining: number | null;
  usagePercent: number | null;
  resetLabel: string;
  resetDate: string;
  warning: UsageLimitWarningValue | null;
}

/**
 * Every number here comes straight from the server (usage-service.ts's
 * authoritative getBalance(), or its organization-scoped counterpart)
 * — this component never computes a balance itself, per the spec's
 * "the client must not calculate the authoritative balance" rule.
 */
export default function CreditBalanceCard({ title = "AI Credits", monthlyLimit, used, remaining, usagePercent, resetLabel, resetDate, warning }: CreditBalanceCardProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-sm font-bold text-slate-700">{title}</h2>

      <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <p className="text-xs uppercase text-slate-400">Monthly Credits</p>
          <p className="mt-1 text-lg font-bold text-slate-900">{monthlyLimit === null ? "Unlimited" : monthlyLimit.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-slate-400">Used</p>
          <p className="mt-1 text-lg font-bold text-slate-900">{used.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-slate-400">Remaining</p>
          <p className="mt-1 text-lg font-bold text-slate-900">{remaining === null ? "Unlimited" : remaining.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-slate-400">{resetLabel}</p>
          <p className="mt-1 text-lg font-bold text-slate-900">{new Date(resetDate).toLocaleDateString()}</p>
        </div>
      </div>

      {usagePercent !== null && (
        <div className="mt-4">
          <UsageProgress percent={usagePercent} label={`${title} usage`} />
        </div>
      )}

      <UsageLimitWarning warning={warning} />
      {warning && warning.threshold >= 90 && <UpgradePrompt />}
    </div>
  );
}
