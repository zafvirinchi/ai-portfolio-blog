"use client";

import { useCallback, useEffect, useState } from "react";

import type { Plan } from "@/lib/billing/billing-types";
import type { BillingInterval } from "@/lib/billing/billing-schema";

function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

const FEATURE_ROWS: { key: keyof Plan["limits"]; label: string }[] = [
  { key: "resume_upload", label: "Resume Uploads / mo" },
  { key: "resume_rewrite", label: "Resume Rewrites / mo" },
  { key: "jd_match", label: "JD Matches / mo" },
  { key: "ats_report", label: "ATS Reports / mo" },
  { key: "mock_interview", label: "Mock Interviews / mo" },
  { key: "ai_chat", label: "AI Chat Credits / mo" },
  { key: "knowledge_upload", label: "Knowledge Uploads / mo" },
  { key: "organization_seats", label: "Organization Seats" },
  { key: "storage_mb", label: "Storage (MB)" },
];

export default function BillingPlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const [couponCode, setCouponCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/billing/plans");
      const data = await response.json();
      setPlans(data);
    } catch {
      setError("Failed to load plans.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleUpgrade(planKey: string) {
    if (planKey === "free") return;
    setBusy(planKey);
    setError(null);

    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planKey, billingInterval: interval, couponCode: couponCode.trim() || undefined }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Checkout failed");
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed.");
      setBusy(null);
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Loading...</p>;

  return (
    <div className="space-y-6">
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="inline-flex rounded-xl border border-slate-300 bg-white p-1">
          <button
            onClick={() => setInterval("monthly")}
            className={`rounded-lg px-4 py-1.5 text-sm font-semibold ${interval === "monthly" ? "bg-blue-600 text-white" : "text-slate-600"}`}
          >
            Monthly
          </button>
          <button
            onClick={() => setInterval("yearly")}
            className={`rounded-lg px-4 py-1.5 text-sm font-semibold ${interval === "yearly" ? "bg-blue-600 text-white" : "text-slate-600"}`}
          >
            Yearly
          </button>
        </div>

        <input
          value={couponCode}
          onChange={(event) => setCouponCode(event.target.value)}
          placeholder="Coupon code (optional)"
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {plans.map((plan) => (
          <div key={plan.key} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900">{plan.name}</h3>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              {formatCents(interval === "yearly" ? plan.yearly_price_cents : plan.monthly_price_cents)}
              <span className="text-sm font-normal text-slate-500">/{interval === "yearly" ? "yr" : "mo"}</span>
            </p>

            <ul className="mt-4 flex-1 space-y-1 text-xs text-slate-600">
              {FEATURE_ROWS.map((row) => (
                <li key={row.key}>
                  {row.label}: {plan.limits[row.key] === null ? "Unlimited" : plan.limits[row.key]}
                </li>
              ))}
              <li>Priority Support: {plan.priority_support ? "Yes" : "No"}</li>
              <li>API Access: {plan.api_access ? "Yes" : "No"}</li>
            </ul>

            <button
              onClick={() => handleUpgrade(plan.key)}
              disabled={plan.key === "free" || busy === plan.key}
              className="mt-4 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {plan.key === "free" ? "Current default" : busy === plan.key ? "Redirecting..." : "Choose Plan"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
