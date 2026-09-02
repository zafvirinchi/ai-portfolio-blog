"use client";

import { ReactNode, useState } from "react";

import UpgradePrompt from "@/components/billing/platform/UpgradePrompt";
import { EntitlementErrorInfo, readEntitlementError } from "@/lib/billing/entitlement-client-error";
import { downloadExport } from "@/lib/billing/export-download";
import type {
  ChangedBullet,
  RemovedItem,
  ResumeOptimizerResult,
} from "@/lib/ai/job-description/resume-optimizer-schema";

type Props = {
  jdMatchId: string;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Wraps occurrences of `keywords` within `text` in a green highlight — the "Added" legend color. */
function highlightKeywords(text: string, keywords: string[]): ReactNode {
  const nonEmpty = keywords.filter((keyword) => keyword.trim().length > 0);
  if (nonEmpty.length === 0) return text;

  const pattern = new RegExp(`(${nonEmpty.map(escapeRegExp).join("|")})`, "gi");
  const parts = text.split(pattern);

  return parts.map((part, index) =>
    nonEmpty.some((keyword) => keyword.toLowerCase() === part.toLowerCase()) ? (
      <mark key={index} className="rounded bg-green-200 px-0.5 text-green-900">
        {part}
      </mark>
    ) : (
      <span key={index}>{part}</span>
    )
  );
}

function BulletDiffCard({
  bullet,
  insertedKeywords,
}: {
  bullet: ChangedBullet;
  insertedKeywords: string[];
}) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">Modified</span>

      <p className="mt-2 text-xs font-semibold text-slate-400">Original</p>
      <p className="mt-1 text-sm text-slate-500 line-through decoration-slate-300">{bullet.original}</p>

      <p className="mt-3 text-xs font-semibold text-blue-500">Optimized</p>
      <p className="mt-1 text-sm font-medium text-slate-800">{highlightKeywords(bullet.optimized, insertedKeywords)}</p>
    </div>
  );
}

function RemovedCard({ item }: { item: RemovedItem }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50/50 p-4">
      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">Removed</span>
      <p className="mt-2 text-sm text-red-700 line-through decoration-red-300">{item.text}</p>
      <p className="mt-1 text-xs text-red-500">Consolidated as redundant.</p>
    </div>
  );
}

function DiffSection({
  title,
  bullets,
  removedItems,
  insertedKeywords,
}: {
  title: string;
  bullets: ChangedBullet[];
  removedItems: RemovedItem[];
  insertedKeywords: string[];
}) {
  if (bullets.length === 0 && removedItems.length === 0) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-slate-400">{title}</p>
      <div className="space-y-3">
        {bullets.map((bullet, index) => (
          <BulletDiffCard key={`modified-${index}`} bullet={bullet} insertedKeywords={insertedKeywords} />
        ))}
        {removedItems.map((item, index) => (
          <RemovedCard key={`removed-${index}`} item={item} />
        ))}
      </div>
    </div>
  );
}

export default function ResumeOptimizerPanel({ jdMatchId }: Props) {
  const [result, setResult] = useState<ResumeOptimizerResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entitlementError, setEntitlementError] = useState<EntitlementErrorInfo | null>(null);

  // Phase 25 Milestone 3 — genuine defect fix: the download buttons below
  // previously used plain <a href> pointing straight at the export API
  // route — the exact bug class already found and fixed elsewhere in this
  // repo (most recently VersionDetail.tsx/DownloadMenu.tsx in Milestones
  // 2-3): a plain link can't intercept a JSON error response (this
  // ephemeral, session-keyed export 404s once the 2-hour result expires),
  // so it would navigate the whole tab to raw JSON instead of showing an
  // error inline.
  const [pendingDownloadFormat, setPendingDownloadFormat] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  async function handleDownload(format: string) {
    setPendingDownloadFormat(format);
    setDownloadError(null);

    const result = await downloadExport(`/api/ai/resume/jd-match/${jdMatchId}/optimize/export?format=${format}`, `optimized-resume.${format === "markdown" ? "md" : format}`);

    if (result && "networkError" in result) {
      setDownloadError(result.networkError);
    } else if (result) {
      setDownloadError(result.message);
    }

    setPendingDownloadFormat(null);
  }

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setEntitlementError(null);

    try {
      const response = await fetch(`/api/ai/resume/jd-match/${jdMatchId}/optimize`, { method: "POST" });
      const data = await response.json();

      if (!response.ok) {
        const entitlement = readEntitlementError(data, "Resume optimization failed");
        if (entitlement) {
          setEntitlementError(entitlement);
          return;
        }
        throw new Error(data.error || "Resume optimization failed");
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Resume optimization failed.");
    } finally {
      setLoading(false);
    }
  }

  if (!result) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-lg font-semibold text-slate-900">Generate an ATS-optimized version of your resume</p>
        <p className="mx-auto mt-2 max-w-xl text-sm text-slate-600">
          Rewrites your summary, skills, experience, projects, and achievements for this job
          description — without inventing anything that isn&apos;t already in your resume.
        </p>

        <button
          onClick={handleGenerate}
          disabled={loading}
          className="mt-5 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Optimizing your resume..." : "Generate Optimized Resume"}
        </button>

        {entitlementError ? (
          <UpgradePrompt
            className="mx-auto mt-4 max-w-xl text-left"
            featureLabel="Resume Optimization"
            code={entitlementError.code}
          featureId={entitlementError.featureId}
            message={entitlementError.message}
            limit={entitlementError.limit}
            used={entitlementError.used}
            period={entitlementError.period}
          />
        ) : (
          error && (
            <div className="mx-auto mt-4 max-w-xl rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Overall Improvement Score</p>
          <p className="mt-1 text-3xl font-bold text-slate-900">{result.overallImprovementScore}/100</p>
        </div>

        <div className="flex flex-wrap gap-4 text-xs font-semibold text-slate-600">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-green-400" /> Added keyword
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> Modified
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400" /> Removed
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold text-slate-700">Download your optimized resume</p>
        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-2">
            {(["markdown", "pdf", "docx"] as const).map((format) => (
              <button
                key={format}
                type="button"
                onClick={() => handleDownload(format)}
                disabled={pendingDownloadFormat === format}
                aria-label={`Download optimized resume as ${format === "markdown" ? "Markdown" : format.toUpperCase()}`}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pendingDownloadFormat === format ? "Downloading..." : format === "markdown" ? "Markdown" : format.toUpperCase()}
              </button>
            ))}
          </div>
          {downloadError && <p className="text-xs font-semibold text-red-600">{downloadError}</p>}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Optimized Professional Summary</p>
        <p className="mt-3 text-sm leading-7 text-slate-700">
          {highlightKeywords(result.optimizedSummary, result.insertedKeywords)}
        </p>
      </div>

      {result.optimizedSkills.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">Optimized Skills</p>
          <div className="space-y-3">
            {result.optimizedSkills.map((group) => (
              <div key={group.category}>
                <p className="mb-1.5 text-sm font-semibold text-slate-700">{group.category}</p>
                <div className="flex flex-wrap gap-2">
                  {group.skills.map((skill) => (
                    <span key={skill} className="rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <DiffSection
        title="Experience"
        bullets={result.optimizedExperience}
        removedItems={result.removedItems.filter((item) => item.section === "experience")}
        insertedKeywords={result.insertedKeywords}
      />

      <DiffSection
        title="Projects"
        bullets={result.optimizedProjects}
        removedItems={result.removedItems.filter((item) => item.section === "project")}
        insertedKeywords={result.insertedKeywords}
      />

      <DiffSection
        title="Achievements"
        bullets={result.optimizedAchievements}
        removedItems={result.removedItems.filter((item) => item.section === "achievement")}
        insertedKeywords={result.insertedKeywords}
      />

      {result.formattingSuggestions.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">Formatting Suggestions</p>
          <ul className="space-y-2 text-sm text-slate-700">
            {result.formattingSuggestions.map((item, index) => (
              <li key={index}>
                <span className="font-semibold">{item.area}:</span> {item.suggestion}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.improvementNotes.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">AI Suggestions</p>
          <ul className="space-y-2 text-sm text-slate-700">
            {result.improvementNotes.map((item, index) => (
              <li key={index}>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                  {item.category}
                </span>
                <span className="ml-2">{item.note}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
