"use client";

import { useState } from "react";

import type { FeatureCost, ModelPricing } from "@/lib/ai/usage/usage-types";

type Props = {
  initialFeatureCosts: FeatureCost[];
  initialModelPricing: ModelPricing[];
};

// Minimal admin config UI (spec explicitly allows "service/API layer +
// minimal UI" when a full admin UI is too large for the milestone).
// Note: usage-policy.ts's config lives in-memory (a Map), not a DB
// table — edits here apply for the life of this server process, not
// persisted across restarts/redeploys. Documented as a known
// limitation in the milestone doc.
export default function UsagePolicyEditor({ initialFeatureCosts, initialModelPricing }: Props) {
  const [featureCosts, setFeatureCosts] = useState(initialFeatureCosts);
  const [modelPricing, setModelPricing] = useState(initialModelPricing);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function saveFeatureCost(feature: string, fixedCredits: number) {
    setBusy(feature);
    setMessage(null);

    try {
      const response = await fetch("/api/billing/usage/admin/feature-costs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feature, fixedCredits }),
      });
      if (!response.ok) throw new Error((await response.json()).error || "Update failed");
      setMessage(`${feature} cost updated.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setBusy(null);
    }
  }

  async function saveModelPricing(pricing: ModelPricing) {
    setBusy(pricing.model);
    setMessage(null);

    try {
      const response = await fetch("/api/billing/usage/admin/model-pricing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pricing),
      });
      if (!response.ok) throw new Error((await response.json()).error || "Update failed");
      setMessage(`${pricing.model} pricing updated.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Usage Policy Configuration</h2>
        <p className="mt-1 text-xs text-slate-500">
          Edits apply immediately to new requests, in-memory for this server process (not yet persisted to the database — a future
          extension).
        </p>
      </div>

      {message && <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">{message}</div>}

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-3">
          <h3 className="text-sm font-bold text-slate-700">Feature Fixed Costs (credits)</h3>
        </div>
        <table className="w-full text-left text-sm">
          <tbody className="divide-y divide-slate-100">
            {featureCosts.map((row, index) => (
              <tr key={row.feature}>
                <td className="px-5 py-2 text-slate-700">{row.feature.replace(/_/g, " ")}</td>
                <td className="px-5 py-2">
                  <input
                    type="number"
                    min={0}
                    value={row.fixedCredits}
                    onChange={(event) => {
                      const next = [...featureCosts];
                      next[index] = { ...row, fixedCredits: Number(event.target.value) };
                      setFeatureCosts(next);
                    }}
                    className="w-24 rounded-lg border border-slate-300 px-2 py-1"
                  />
                </td>
                <td className="px-5 py-2">
                  <button
                    onClick={() => saveFeatureCost(row.feature, row.fixedCredits)}
                    disabled={busy === row.feature}
                    className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    Save
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-3">
          <h3 className="text-sm font-bold text-slate-700">Model Pricing (cents / million tokens)</h3>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-2">Model</th>
              <th className="px-5 py-2">Input</th>
              <th className="px-5 py-2">Output</th>
              <th className="px-5 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {modelPricing.map((row, index) => (
              <tr key={row.model}>
                <td className="px-5 py-2 text-slate-700">{row.model}</td>
                <td className="px-5 py-2">
                  <input
                    type="number"
                    min={0}
                    value={row.inputPricePerMillionCents}
                    onChange={(event) => {
                      const next = [...modelPricing];
                      next[index] = { ...row, inputPricePerMillionCents: Number(event.target.value) };
                      setModelPricing(next);
                    }}
                    className="w-24 rounded-lg border border-slate-300 px-2 py-1"
                  />
                </td>
                <td className="px-5 py-2">
                  <input
                    type="number"
                    min={0}
                    value={row.outputPricePerMillionCents}
                    onChange={(event) => {
                      const next = [...modelPricing];
                      next[index] = { ...row, outputPricePerMillionCents: Number(event.target.value) };
                      setModelPricing(next);
                    }}
                    className="w-24 rounded-lg border border-slate-300 px-2 py-1"
                  />
                </td>
                <td className="px-5 py-2">
                  <button
                    onClick={() => saveModelPricing(modelPricing[index])}
                    disabled={busy === row.model}
                    className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    Save
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
