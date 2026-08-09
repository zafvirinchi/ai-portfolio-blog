"use client";

import { useCallback, useEffect, useState } from "react";

import type { UsageBalance, UsageSummary } from "@/lib/ai/usage/usage-types";

function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function BarChart({ data, labelKey, valueKey }: { data: Record<string, unknown>[]; labelKey: string; valueKey: string }) {
  if (data.length === 0) {
    return <p className="p-6 text-center text-sm text-slate-500">Not enough data yet to chart.</p>;
  }

  const max = Math.max(...data.map((row) => Number(row[valueKey]) || 0), 1);

  return (
    <div className="space-y-2 p-5">
      {data.map((row) => {
        const value = Number(row[valueKey]) || 0;
        const label = String(row[labelKey]);
        return (
          <div key={label} className="flex items-center gap-3 text-sm">
            <span className="w-40 shrink-0 truncate text-slate-600">{label.replace(/_/g, " ")}</span>
            <div className="h-4 flex-1 overflow-hidden rounded bg-slate-100">
              <div className="h-full rounded bg-blue-600" style={{ width: `${(value / max) * 100}%` }} />
            </div>
            <span className="w-16 shrink-0 text-right font-semibold text-slate-800">{value}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function BillingUsagePage() {
  const [balance, setBalance] = useState<UsageBalance | null>(null);
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [balanceResponse, summaryResponse] = await Promise.all([
        fetch("/api/billing/usage/balance"),
        fetch("/api/billing/usage/summary?days=30"),
      ]);
      const balanceData = await balanceResponse.json();
      const summaryData = await summaryResponse.json();
      setBalance(balanceData.balance ?? null);
      setSummary(summaryData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load usage data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <p className="text-sm text-slate-500">Loading...</p>;

  return (
    <div className="space-y-6">
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-400">Total AI Credits Used</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{summary?.totalCreditsUsed ?? 0}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-400">Credits Remaining</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{balance?.remaining === null || balance?.remaining === undefined ? "Unlimited" : balance.remaining}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-400">Estimated AI Cost (30d)</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{formatCents(summary?.estimatedCostCents ?? 0)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-400">Resets</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{balance ? new Date(balance.resetDate).toLocaleDateString() : "—"}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-bold text-slate-700">Daily Usage (last 30 days)</h2>
        </div>
        {!summary || summary.dailyUsage.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">No AI usage recorded yet this period.</p>
        ) : (
          <BarChart data={summary.dailyUsage as unknown as Record<string, unknown>[]} labelKey="date" valueKey="credits" />
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-bold text-slate-700">Usage by Feature</h2>
        </div>
        {!summary || summary.byFeature.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">No AI usage recorded yet this period.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Feature</th>
                <th className="px-5 py-3">Operations</th>
                <th className="px-5 py-3">Credits Used</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {summary.byFeature.map((row) => (
                <tr key={row.feature}>
                  <td className="px-5 py-3 font-semibold text-slate-800">{row.feature.replace(/_/g, " ")}</td>
                  <td className="px-5 py-3 text-slate-600">{row.operations}</td>
                  <td className="px-5 py-3 text-slate-600">{row.credits}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-bold text-slate-700">Usage by AI Model</h2>
        </div>
        {!summary || summary.byModel.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">No AI usage recorded yet this period.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Model</th>
                <th className="px-5 py-3">Tokens Used</th>
                <th className="px-5 py-3">Credits Used</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {summary.byModel.map((row) => (
                <tr key={row.model}>
                  <td className="px-5 py-3 font-semibold text-slate-800">{row.model}</td>
                  <td className="px-5 py-3 text-slate-600">{row.tokens.toLocaleString()}</td>
                  <td className="px-5 py-3 text-slate-600">{row.credits}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-bold text-slate-700">Usage by Operation</h2>
        </div>
        {!summary || summary.byOperation.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">No AI usage recorded yet this period.</p>
        ) : (
          <BarChart data={summary.byOperation as unknown as Record<string, unknown>[]} labelKey="operation" valueKey="credits" />
        )}
      </div>
    </div>
  );
}
