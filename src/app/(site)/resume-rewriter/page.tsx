"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import ChatBox from "@/components/ai/ChatBox";
import UpgradePrompt from "@/components/billing/platform/UpgradePrompt";
import RewriteSectionCard from "@/components/resume-rewriter/RewriteSectionCard";
import RewriteStylePicker from "@/components/resume-rewriter/RewriteStylePicker";
import { EntitlementErrorInfo, readEntitlementError } from "@/lib/billing/entitlement-client-error";
import { downloadExport } from "@/lib/billing/export-download";
import type { RewriteSection, RewriteStyle } from "@/lib/ai/resume-rewriter/rewrite-schema";
import type { RewriteRecord } from "@/lib/ai/resume-rewriter/rewrite-types";

const SECTION_LABELS: { section: RewriteSection; label: string }[] = [
  { section: "summary", label: "Professional Summary" },
  { section: "careerObjective", label: "Career Objective" },
  { section: "experience", label: "Experience" },
  { section: "projects", label: "Projects" },
  { section: "skills", label: "Skills" },
  { section: "achievements", label: "Achievements" },
  { section: "certifications", label: "Certifications" },
];

const SUGGESTIONS = ["Rewrite my experience", "Rewrite in FAANG style", "Make it more technical", "Rewrite for banking domain"];

function ResumeRewriterContent() {
  const searchParams = useSearchParams();
  const resumeId = searchParams.get("resumeId");

  const [record, setRecord] = useState<RewriteRecord | null>(null);
  const [style, setStyle] = useState<RewriteStyle>("Professional");
  const [targetContext, setTargetContext] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [entitlementError, setEntitlementError] = useState<EntitlementErrorInfo | null>(null);

  // Phase 25 Milestone 3 — genuine defect fix: the download buttons below
  // previously used plain <a href> pointing straight at the export API
  // route — the exact bug class already found and fixed elsewhere in this
  // repo (most recently VersionDetail.tsx/DownloadMenu.tsx/
  // ResumeOptimizerPanel.tsx in Milestones 2-3): a plain link can't
  // intercept a JSON error response (this ephemeral, session-keyed export
  // 404s once the 2-hour rewrite session expires), so it would navigate
  // the whole tab to raw JSON instead of showing an error inline.
  const [pendingDownloadFormat, setPendingDownloadFormat] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  async function handleDownload(format: string) {
    if (!record) return;
    setPendingDownloadFormat(format);
    setDownloadError(null);

    const result = await downloadExport(`/api/ai/resume-rewriter/${record.rewriteId}/export?format=${format}`, `resume.${format === "markdown" ? "md" : format}`);

    if (result && "networkError" in result) {
      setDownloadError(result.networkError);
    } else if (result) {
      setDownloadError(result.message);
    }

    setPendingDownloadFormat(null);
  }

  async function refresh(rewriteId: string) {
    const response = await fetch(`/api/ai/resume-rewriter/${rewriteId}`);
    const data = await response.json();
    if (response.ok) setRecord(data);
  }

  async function handleStart() {
    if (!resumeId) return;

    setLoading("start");
    setError(null);
    setEntitlementError(null);

    try {
      const response = await fetch("/api/ai/resume-rewriter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeId }),
      });
      const data = await response.json();

      if (!response.ok) {
        const entitlement = readEntitlementError(data, "Failed to start");
        if (entitlement) {
          setEntitlementError(entitlement);
          return;
        }
        throw new Error(data.error || "Failed to start");
      }
      setRecord(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start.");
    } finally {
      setLoading(null);
    }
  }

  async function handleRewriteSection(section: RewriteSection, itemIndex?: number) {
    if (!record) return;

    const loadingKey = typeof itemIndex === "number" ? `${section}-item-${itemIndex}` : section;
    setLoading(loadingKey);
    setError(null);

    try {
      const response = await fetch(`/api/ai/resume-rewriter/${record.rewriteId}/section`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section, style, targetContext: targetContext || undefined, itemIndex }),
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "Rewrite failed");
      await refresh(record.rewriteId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rewrite failed.");
    } finally {
      setLoading(null);
    }
  }

  async function handleSectionAction(section: RewriteSection, action: "accept" | "reject" | "restore", extra?: Record<string, unknown>) {
    if (!record) return;

    setLoading(action === "restore" ? `${section}-restore` : `${section}-${action}`);
    setError(null);

    try {
      const response = await fetch(`/api/ai/resume-rewriter/${record.rewriteId}/section/${section}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "Action failed");
      await refresh(record.rewriteId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setLoading(null);
    }
  }

  async function handleWholeResume() {
    if (!record) return;

    setLoading("whole-resume");
    setError(null);

    try {
      const response = await fetch(`/api/ai/resume-rewriter/${record.rewriteId}/whole-resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ style, targetContext: targetContext || undefined }),
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "Whole-resume rewrite failed");
      await refresh(record.rewriteId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Whole-resume rewrite failed.");
    } finally {
      setLoading(null);
    }
  }

  async function handleReset() {
    if (!record) return;

    setLoading("reset");
    setError(null);

    try {
      const response = await fetch(`/api/ai/resume-rewriter/${record.rewriteId}/whole-resume/reset`, { method: "POST" });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "Reset failed");
      setRecord(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed.");
    } finally {
      setLoading(null);
    }
  }

  if (!resumeId) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-lg font-semibold text-slate-900">Upload a resume first</p>
        <p className="mt-2 text-sm text-slate-600">The Resume Rewrite Engine needs a parsed resume to work from.</p>
        <Link
          href="/resume-analyzer"
          className="mt-5 inline-block rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Go to Resume Analyzer
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <RewriteStylePicker
        style={style}
        onStyleChange={setStyle}
        targetContext={targetContext}
        onTargetContextChange={setTargetContext}
      />

      {!record ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <button
            type="button"
            onClick={handleStart}
            disabled={loading === "start"}
            className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading === "start" ? "Starting..." : "Start Rewriting"}
          </button>
          {entitlementError ? (
            <UpgradePrompt
              className="mx-auto mt-4 max-w-xl text-left"
              featureLabel="Resume Rewriting"
              code={entitlementError.code}
          featureId={entitlementError.featureId}
              message={entitlementError.message}
              limit={entitlementError.limit}
              used={entitlementError.used}
              period={entitlementError.period}
            />
          ) : (
            error && <div role="alert" className="mx-auto mt-4 max-w-xl rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
          )}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-700">Whole resume</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleWholeResume}
                disabled={loading === "whole-resume"}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {loading === "whole-resume" ? "Rewriting..." : "Rewrite Entire Resume"}
              </button>
              <button
                type="button"
                onClick={handleReset}
                disabled={loading === "reset"}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Reset
              </button>
              <Link
                href={`/linkedin-optimizer?resumeId=${resumeId}&rewriteId=${record.rewriteId}`}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Optimize my LinkedIn
              </Link>
              {(["markdown", "pdf", "docx", "html"] as const).map((format) => (
                <button
                  key={format}
                  type="button"
                  onClick={() => handleDownload(format)}
                  disabled={pendingDownloadFormat === format}
                  aria-label={`Download resume as ${format === "markdown" ? "Markdown" : format.toUpperCase()}`}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pendingDownloadFormat === format ? "Downloading..." : format === "markdown" ? "Markdown" : format.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
          {downloadError && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{downloadError}</div>}

          {SECTION_LABELS.map(({ section, label }) => (
            <RewriteSectionCard
              key={section}
              section={section}
              label={label}
              state={record.sections[section] ?? null}
              loading={loading}
              onRewrite={(itemIndex) => handleRewriteSection(section, itemIndex)}
              onAction={(action, extra) => handleSectionAction(section, action, extra)}
            />
          ))}

          <ChatBox
            resumeId={resumeId}
            rewriteId={record.rewriteId}
            title="Resume Rewrite Assistant"
            subtitle='Try "rewrite my experience", "make it more technical", or "FAANG style"'
            placeholder="Ask to rewrite a section, in a style, for a domain..."
            suggestions={SUGGESTIONS}
            emptyStateTitle="Chat alongside your rewrite"
            emptyStateBody="You can also use the section cards above directly."
          />
        </>
      )}
    </div>
  );
}

export default function ResumeRewriterPage() {
  return (
    <section className="min-h-screen bg-slate-50 px-6 py-16">
      <div className="mx-auto max-w-5xl">
        <div className="mb-10 text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-blue-600">Resume Rewriter</p>

          <h1 className="mt-4 text-4xl font-bold text-slate-950 sm:text-5xl">Recruiter-grade resume rewriting</h1>

          <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600">
            Rewrite any section — or your entire resume — in the style that fits, without ever inventing anything that
            isn&apos;t already true.
          </p>
        </div>

        <Suspense fallback={null}>
          <ResumeRewriterContent />
        </Suspense>
      </div>
    </section>
  );
}
