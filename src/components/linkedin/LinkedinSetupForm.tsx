"use client";

import { useState } from "react";

import UpgradePrompt from "@/components/billing/platform/UpgradePrompt";
import { EntitlementErrorInfo, readEntitlementError } from "@/lib/billing/entitlement-client-error";
import type { LinkedinRecord } from "@/lib/ai/linkedin/linkedin-types";

const PROFILE_VARIANT_PRESETS = [
  "Enterprise",
  "Startup",
  "FAANG",
  "AI Engineer",
  "Full Stack",
  "Solution Architect",
  "Technical Lead",
  "Engineering Manager",
];

type Props = {
  resumeId: string;
  rewriteId?: string;
  jdMatchId?: string;
  onStarted: (record: LinkedinRecord) => void;
};

function toLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export default function LinkedinSetupForm({ resumeId, rewriteId, jdMatchId, onStarted }: Props) {
  const [careerGoal, setCareerGoal] = useState("");
  const [targetRole, setTargetRole] = useState("");
  const [industry, setIndustry] = useState("");
  const [yearsOfExperience, setYearsOfExperience] = useState("");
  const [volunteerWork, setVolunteerWork] = useState("");
  const [publications, setPublications] = useState("");
  const [patents, setPatents] = useState("");
  const [licenses, setLicenses] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entitlementError, setEntitlementError] = useState<EntitlementErrorInfo | null>(null);

  async function handleStart() {
    setLoading(true);
    setError(null);
    setEntitlementError(null);

    try {
      const response = await fetch("/api/ai/linkedin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeId,
          rewriteId,
          jdMatchId,
          careerGoal: careerGoal.trim() || undefined,
          targetRole: targetRole.trim() || undefined,
          industry: industry.trim() || undefined,
          yearsOfExperience: yearsOfExperience ? Number(yearsOfExperience) : undefined,
          volunteerWork: toLines(volunteerWork),
          publications: toLines(publications),
          patents: toLines(patents),
          licenses: toLines(licenses),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        const entitlement = readEntitlementError(data, "Failed to start LinkedIn optimizer");
        if (entitlement) {
          setEntitlementError(entitlement);
          return;
        }
        throw new Error(data.error || "Failed to start LinkedIn optimizer");
      }

      onStarted(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start LinkedIn optimizer.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <p className="mb-2 text-sm font-semibold text-slate-700">Target role presets</p>
        <div className="flex flex-wrap gap-2">
          {PROFILE_VARIANT_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setTargetRole(preset)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                targetRole === preset ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {preset}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500">Target role</label>
          <input
            value={targetRole}
            onChange={(event) => setTargetRole(event.target.value)}
            placeholder="e.g. Senior Backend Engineer"
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500">Industry</label>
          <input
            value={industry}
            onChange={(event) => setIndustry(event.target.value)}
            placeholder="e.g. FinTech"
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500">Years of experience</label>
          <input
            type="number"
            value={yearsOfExperience}
            onChange={(event) => setYearsOfExperience(event.target.value)}
            placeholder="Defaults from resume"
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500">Career goal</label>
          <input
            value={careerGoal}
            onChange={(event) => setCareerGoal(event.target.value)}
            placeholder="e.g. Move into a technical leadership role"
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
        </div>
      </div>

      <details className="rounded-xl border border-slate-200 p-3">
        <summary className="cursor-pointer text-sm font-semibold text-slate-600">
          Optional: volunteer work, publications, patents, licenses
        </summary>
        <p className="mt-2 text-xs text-slate-400">
          One per line. These are never invented — only what you enter here will ever appear in your profile.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Volunteer work</label>
            <textarea
              value={volunteerWork}
              onChange={(event) => setVolunteerWork(event.target.value)}
              rows={3}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Publications</label>
            <textarea
              value={publications}
              onChange={(event) => setPublications(event.target.value)}
              rows={3}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Patents</label>
            <textarea
              value={patents}
              onChange={(event) => setPatents(event.target.value)}
              rows={3}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Licenses</label>
            <textarea
              value={licenses}
              onChange={(event) => setLicenses(event.target.value)}
              rows={3}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
            />
          </div>
        </div>
      </details>

      <button
        onClick={handleStart}
        disabled={loading}
        className="w-full rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? "Starting..." : "Start LinkedIn Optimizer"}
      </button>

      {entitlementError && (
        <UpgradePrompt
          featureLabel="LinkedIn Optimizer"
          code={entitlementError.code}
          featureId={entitlementError.featureId}
          message={entitlementError.message}
          limit={entitlementError.limit}
          used={entitlementError.used}
          period={entitlementError.period}
          onRetry={handleStart}
        />
      )}

      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}
