"use client";

import { useState } from "react";

import type { LinkedinRecord } from "@/lib/ai/linkedin/linkedin-types";

type Props = {
  linkedinId: string;
  record: LinkedinRecord;
  onUpdated: (record: LinkedinRecord) => void;
};

function toLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export default function LinkedinExtrasTab({ linkedinId, record, onUpdated }: Props) {
  const [loadingFeatured, setLoadingFeatured] = useState(false);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);
  const [loadingBanner, setLoadingBanner] = useState(false);
  const [loadingInterests, setLoadingInterests] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [preferredRoles, setPreferredRoles] = useState(record.careerInterests?.preferredRoles.join("\n") ?? "");
  const [preferredIndustries, setPreferredIndustries] = useState(record.careerInterests?.preferredIndustries.join("\n") ?? "");
  const [preferredLocations, setPreferredLocations] = useState(record.careerInterests?.preferredLocations.join("\n") ?? "");
  const [remotePreference, setRemotePreference] = useState(record.careerInterests?.remotePreference ?? "");
  const [relocationPreference, setRelocationPreference] = useState(record.careerInterests?.relocationPreference ?? "");
  const [visaSponsorshipStatement, setVisaSponsorshipStatement] = useState(record.careerInterests?.visaSponsorshipStatement ?? "");

  async function runAction(url: string, setLoading: (value: boolean) => void, body?: unknown) {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(url, {
        method: "POST",
        ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Request failed");
      }

      onUpdated(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-700">Featured Section</h3>
          <button
            onClick={() => runAction(`/api/ai/linkedin/${linkedinId}/featured`, setLoadingFeatured)}
            disabled={loadingFeatured}
            className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {loadingFeatured ? "Building..." : "Build Featured Suggestions"}
          </button>
        </div>

        {(!record.featured || record.featured.items.length === 0) && (
          <p className="rounded-2xl border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500">
            No featured suggestions yet.
          </p>
        )}

        <div className="grid gap-2 sm:grid-cols-2">
          {record.featured?.items.map((item, index) => (
            <div
              key={index}
              className={`rounded-xl border p-4 text-sm shadow-sm ${
                item.isGap ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"
              }`}
            >
              <div className="mb-1 flex items-center gap-2">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-500">
                  {item.type}
                </span>
                {item.isGap && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700">Gap</span>
                )}
              </div>
              <p className="font-semibold text-slate-800">{item.title}</p>
              <p className="text-xs text-slate-500">{item.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-700">Recruiter & Networking Messages</h3>
          <button
            onClick={() => runAction(`/api/ai/linkedin/${linkedinId}/recommendations`, setLoadingRecommendations)}
            disabled={loadingRecommendations}
            className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {loadingRecommendations ? "Generating..." : "Generate Messages"}
          </button>
        </div>

        {(!record.recommendations || record.recommendations.length === 0) && (
          <p className="rounded-2xl border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500">
            No messages generated yet.
          </p>
        )}

        <div className="space-y-2">
          {record.recommendations?.map((msg, index) => (
            <div key={index} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">{msg.type}</span>
              <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{msg.message}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-700">Banner & Personal Branding Bios</h3>
          <button
            onClick={() => runAction(`/api/ai/linkedin/${linkedinId}/banner`, setLoadingBanner)}
            disabled={loadingBanner}
            className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {loadingBanner ? "Generating..." : "Generate Banner & Bios"}
          </button>
        </div>

        {record.bannerTagline && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm font-semibold text-blue-800">
            {record.bannerTagline}
          </div>
        )}

        {(!record.brandingBios || record.brandingBios.length === 0) && !record.bannerTagline && (
          <p className="rounded-2xl border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500">
            No banner/bios generated yet.
          </p>
        )}

        <div className="grid gap-2 sm:grid-cols-2">
          {record.brandingBios?.map((bio, index) => (
            <div key={index} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-500">
                {bio.platform}
              </span>
              <p className="mt-2 text-sm text-slate-700">{bio.bio}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-bold text-slate-700">Career Interests</h3>

        <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Preferred roles (one per line)</label>
            <textarea
              value={preferredRoles}
              onChange={(e) => setPreferredRoles(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Preferred industries (one per line)</label>
            <textarea
              value={preferredIndustries}
              onChange={(e) => setPreferredIndustries(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Preferred locations (one per line)</label>
            <textarea
              value={preferredLocations}
              onChange={(e) => setPreferredLocations(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
            />
          </div>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Remote preference</label>
              <input
                value={remotePreference}
                onChange={(e) => setRemotePreference(e.target.value)}
                placeholder="e.g. Open to remote"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Relocation preference</label>
              <input
                value={relocationPreference}
                onChange={(e) => setRelocationPreference(e.target.value)}
                placeholder="e.g. Open to relocation"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-slate-500">Visa sponsorship statement</label>
            <input
              value={visaSponsorshipStatement}
              onChange={(e) => setVisaSponsorshipStatement(e.target.value)}
              placeholder="e.g. Requires visa sponsorship"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <button
          onClick={() =>
            runAction(`/api/ai/linkedin/${linkedinId}/career-interests`, setLoadingInterests, {
              preferredRoles: toLines(preferredRoles),
              preferredIndustries: toLines(preferredIndustries),
              preferredLocations: toLines(preferredLocations),
              remotePreference,
              relocationPreference,
              visaSponsorshipStatement,
            })
          }
          disabled={loadingInterests}
          className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loadingInterests ? "Saving..." : "Save Career Interests"}
        </button>
      </section>
    </div>
  );
}
