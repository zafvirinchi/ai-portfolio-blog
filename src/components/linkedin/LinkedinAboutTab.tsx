"use client";

import { useState } from "react";

import { ABOUT_MAX_CHARACTERS, ABOUT_STYLES } from "@/lib/ai/linkedin/linkedin-schema";
import type { AboutStyle } from "@/lib/ai/linkedin/linkedin-schema";
import type { LinkedinRecord } from "@/lib/ai/linkedin/linkedin-types";

const STORY_LABELS: Record<AboutStyle, string> = {
  Professional: "Professional",
  Technical: "Technical",
  Leadership: "Leadership",
  RecruiterFriendly: "Recruiter-Friendly",
};

type Props = {
  linkedinId: string;
  record: LinkedinRecord;
  onUpdated: (record: LinkedinRecord) => void;
};

export default function LinkedinAboutTab({ linkedinId, record, onUpdated }: Props) {
  const [loadingStyle, setLoadingStyle] = useState<AboutStyle | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate(storyType: AboutStyle) {
    setLoadingStyle(storyType);
    setError(null);

    try {
      const response = await fetch(`/api/ai/linkedin/${linkedinId}/about`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storyType }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "About generation failed");
      }

      onUpdated(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "About generation failed.");
    } finally {
      setLoadingStyle(null);
    }
  }

  async function handleAccept(storyType: AboutStyle) {
    const response = await fetch(`/api/ai/linkedin/${linkedinId}/about/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storyType }),
    });

    const data = await response.json();

    if (response.ok) onUpdated(data);
  }

  const generatedStyles = ABOUT_STYLES.filter((style) => record.about[style]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        {ABOUT_STYLES.map((style) => (
          <button
            key={style}
            type="button"
            onClick={() => handleGenerate(style)}
            disabled={loadingStyle === style}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            {loadingStyle === style ? "Generating..." : `Generate ${STORY_LABELS[style]}`}
          </button>
        ))}
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      {generatedStyles.length === 0 && (
        <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          Generate an About section in any story style to see it here.
        </p>
      )}

      <div className="space-y-3">
        {generatedStyles.map((style) => {
          const variant = record.about[style]!;
          const isAccepted = record.acceptedAboutStyle === style;
          const overLimit = variant.characterCount > ABOUT_MAX_CHARACTERS;

          return (
            <div
              key={style}
              className={`rounded-2xl border p-5 shadow-sm ${
                isAccepted ? "border-green-400 bg-green-50/40" : "border-slate-200 bg-white"
              }`}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                  {STORY_LABELS[style]}
                </span>

                <div className="flex items-center gap-3">
                  <span className={`text-xs font-semibold ${overLimit ? "text-red-600" : "text-slate-400"}`}>
                    {variant.characterCount} / {ABOUT_MAX_CHARACTERS}
                  </span>

                  {isAccepted ? (
                    <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
                      Accepted
                    </span>
                  ) : (
                    <button
                      onClick={() => handleAccept(style)}
                      className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700"
                    >
                      Accept
                    </button>
                  )}
                </div>
              </div>

              <p className="whitespace-pre-line text-sm leading-6 text-slate-800">{variant.text}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
