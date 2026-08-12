"use client";

import { useCallback, useEffect, useState } from "react";

import CurrentPlanCard from "@/components/dashboard/usage/CurrentPlanCard";
import CreditBalanceCard from "@/components/dashboard/usage/CreditBalanceCard";
import { getUsageLimitWarning } from "@/lib/analytics/customer-usage-shared";
import type { ResolvedSubscription, CreditBalance } from "@/lib/billing/billing-types";
import type { UsageBalance } from "@/lib/ai/usage/usage-types";

export default function BillingOverviewPage() {
  const [subscription, setSubscription] = useState<ResolvedSubscription | null>(null);
  const [creditBalances, setCreditBalances] = useState<CreditBalance[]>([]);
  const [aiBalance, setAiBalance] = useState<UsageBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [meResponse, balanceResponse] = await Promise.all([fetch("/api/billing/me"), fetch("/api/billing/usage/balance")]);
      const data = await meResponse.json();
      const balanceData = await balanceResponse.json();
      setSubscription(data.subscription);
      setCreditBalances(data.creditBalances ?? []);
      setAiBalance(balanceData.balance ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load billing info.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function openPortal() {
    setBusy("portal");
    setError(null);

    try {
      const response = await fetch("/api/billing/portal", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to open billing portal");
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open billing portal.");
      setBusy(null);
    }
  }

  async function cancelSubscription() {
    if (!window.confirm("Cancel your subscription at the end of the current period?")) return;
    setBusy("cancel");
    setError(null);

    try {
      const response = await fetch("/api/billing/subscription/cancel", { method: "POST" });
      if (!response.ok) throw new Error((await response.json()).error || "Cancel failed");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancel failed.");
    } finally {
      setBusy(null);
    }
  }

  async function resumeSubscription() {
    setBusy("resume");
    setError(null);

    try {
      const response = await fetch("/api/billing/subscription/resume", { method: "POST" });
      if (!response.ok) throw new Error((await response.json()).error || "Resume failed");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Resume failed.");
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Loading...</p>;
  if (!subscription) return null;

  return (
    <div className="space-y-6">
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      <CurrentPlanCard subscription={subscription} busy={busy} onManagePayment={openPortal} onCancel={cancelSubscription} onResume={resumeSubscription} />

      {aiBalance && (
        <CreditBalanceCard
          title="Monthly AI Credits"
          monthlyLimit={aiBalance.monthlyLimit}
          used={aiBalance.consumed + aiBalance.reserved}
          remaining={aiBalance.remaining}
          usagePercent={aiBalance.usagePercent}
          resetLabel="Resets"
          resetDate={aiBalance.resetDate}
          warning={getUsageLimitWarning(aiBalance.usagePercent)}
        />
      )}

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-bold text-slate-700">Feature Request Limits This Month</h2>
        </div>
        <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-3">
          {creditBalances.map((balance) => (
            <div key={balance.featureKey}>
              <p className="text-xs uppercase text-slate-400">{balance.featureKey.replace(/_/g, " ")}</p>
              <p className="mt-1 text-lg font-bold text-slate-900">
                {balance.limit === null ? "Unlimited" : `${balance.remaining} / ${balance.limit}`}
              </p>
              {balance.limit !== null && balance.remaining !== null && balance.limit > 0 && balance.remaining / balance.limit <= 0.2 && (
                <p className="text-xs font-semibold text-amber-600">Low</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
