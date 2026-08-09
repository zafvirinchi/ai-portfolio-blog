"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

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

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase text-slate-400">Current Plan</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{subscription.plan.name}</p>
            <p className="mt-1 text-sm text-slate-500">
              Status: {subscription.status}
              {subscription.current_period_end && ` · Renews ${new Date(subscription.current_period_end).toLocaleDateString()}`}
              {subscription.cancel_at && ` · Cancels ${new Date(subscription.cancel_at).toLocaleDateString()}`}
            </p>
          </div>

          <div className="flex gap-2">
            <Link href="/billing/plans" className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
              {subscription.isImplicitFree ? "Upgrade Plan" : "Change Plan"}
            </Link>
            {!subscription.isImplicitFree && (
              <button
                onClick={openPortal}
                disabled={busy === "portal"}
                className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Manage Payment Method
              </button>
            )}
          </div>
        </div>

        {!subscription.isImplicitFree && (
          <div className="mt-4">
            {subscription.cancel_at ? (
              <button onClick={resumeSubscription} disabled={busy === "resume"} className="text-xs font-semibold text-blue-600 hover:underline">
                Resume subscription
              </button>
            ) : (
              <button onClick={cancelSubscription} disabled={busy === "cancel"} className="text-xs font-semibold text-red-600 hover:underline">
                Cancel subscription
              </button>
            )}
          </div>
        )}
      </div>

      {aiBalance && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-slate-700">Monthly AI Credits</h2>
            <Link href="/billing/usage" className="text-xs font-semibold text-blue-600 hover:underline">
              View Usage Dashboard
            </Link>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs uppercase text-slate-400">Monthly Credits</p>
              <p className="mt-1 text-lg font-bold text-slate-900">{aiBalance.monthlyLimit === null ? "Unlimited" : aiBalance.monthlyLimit}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-slate-400">Used</p>
              <p className="mt-1 text-lg font-bold text-slate-900">{aiBalance.consumed + aiBalance.reserved}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-slate-400">Remaining</p>
              <p className="mt-1 text-lg font-bold text-slate-900">{aiBalance.remaining === null ? "Unlimited" : aiBalance.remaining}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-slate-400">Resets</p>
              <p className="mt-1 text-lg font-bold text-slate-900">{new Date(aiBalance.resetDate).toLocaleDateString()}</p>
            </div>
          </div>

          {aiBalance.usagePercent !== null && (
            <div className="mt-4">
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${aiBalance.usagePercent >= 90 ? "bg-red-500" : aiBalance.usagePercent >= 70 ? "bg-amber-500" : "bg-blue-600"}`}
                  style={{ width: `${aiBalance.usagePercent}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-slate-500">{aiBalance.usagePercent}% used</p>
              {aiBalance.usagePercent >= 100 ? (
                <p className="mt-2 text-sm font-semibold text-red-600">
                  Your AI credits are exhausted.{" "}
                  <Link href="/billing/plans" className="underline">
                    Upgrade Plan
                  </Link>
                </p>
              ) : aiBalance.usagePercent >= 80 && aiBalance.remaining !== null ? (
                <p className="mt-2 text-sm font-semibold text-amber-600">You have {aiBalance.remaining} AI credits remaining.</p>
              ) : null}
            </div>
          )}
        </div>
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
