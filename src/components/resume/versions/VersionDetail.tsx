"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import type { ResumeVersionRecord, VersionComparison } from "@/lib/ai/resume-versions/resume-version-types";
import { resumeScorer } from "@/lib/ai/resume/resume-score";
import { toDynamicResumeDocument, checkResumeQuality, computeSectionCompleteness, computeContactQuality, buildQualityGateReport } from "@/lib/ai/resume-versions/dynamic";
import type { IssueSeverity, ReadinessLevel } from "@/lib/ai/resume-versions/dynamic";
import { DEFAULT_TEMPLATE_SETTINGS } from "@/lib/ai/resume-versions/templates/template-schema";
import { resolveTemplateStyles } from "@/lib/ai/resume-versions/templates/template-styles";
import ResumeBuilder from "@/components/resume/builder/ResumeBuilder";
import ResumeAtsScore from "@/components/resume/ResumeAtsScore";
import JdOptimizationReview from "./JdOptimizationReview";

const SECTION_STATUS_CLASSNAME: Record<string, string> = {
  Complete: "bg-green-50 text-green-700",
  Missing: "bg-red-50 text-red-700",
  Optional: "bg-slate-100 text-slate-500",
};

const READINESS_DISPLAY: Record<ReadinessLevel, { label: string; emoji: string; className: string }> = {
  READY: { label: "Ready to Apply", emoji: "🟢", className: "bg-green-50 text-green-800 border-green-200" },
  NEEDS_IMPROVEMENT: { label: "Needs Improvement", emoji: "🟡", className: "bg-amber-50 text-amber-800 border-amber-200" },
  NEEDS_REVIEW: { label: "Needs Review", emoji: "🔴", className: "bg-red-50 text-red-800 border-red-200" },
};

const SEVERITY_CLASSNAME: Record<IssueSeverity, string> = {
  critical: "bg-red-100 text-red-700",
  high: "bg-orange-100 text-orange-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-slate-100 text-slate-600",
};

export default function VersionDetail({ versionId }: { versionId: string }) {
  const [version, setVersion] = useState<ResumeVersionRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [tab, setTab] = useState<"overview" | "builder">("overview");

  const [restoring, setRestoring] = useState(false);
  const [masterComparison, setMasterComparison] = useState<VersionComparison | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNeedsLogin(false);

    try {
      const response = await fetch(`/api/ai/resume/versions/${versionId}`);

      if (response.status === 401) {
        setNeedsLogin(true);
        return;
      }

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to load this resume version");

      setVersion(data.version);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load this resume version.");
    } finally {
      setLoading(false);
    }
  }, [versionId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRestoreAsMaster() {
    if (!window.confirm("You are about to make this version your Master Resume.\nYour current master will be preserved in version history.")) return;
    setRestoring(true);

    try {
      const response = await fetch(`/api/ai/resume/versions/${versionId}/restore`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Restore failed");
      setVersion(data.version);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Restore failed.");
    } finally {
      setRestoring(false);
    }
  }

  async function handleCompareWithMaster() {
    setError(null);

    try {
      const listResponse = await fetch("/api/ai/resume/versions");
      const listData = await listResponse.json();
      const master = (listData.versions ?? []).find((entry: { isMaster: boolean }) => entry.isMaster);

      if (!master) {
        setError("No master resume exists to compare with.");
        return;
      }

      const response = await fetch("/api/ai/resume/versions/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionAId: master.id, versionBId: versionId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Comparison failed");
      setMasterComparison(data.comparison);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Comparison failed.");
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Loading...</p>;

  if (needsLogin) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-lg font-semibold text-slate-900">Sign in to view this resume version.</p>
        <Link href="/login" className="mt-4 inline-block rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
          Sign In
        </Link>
      </div>
    );
  }

  if (error && !version) {
    return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>;
  }

  if (!version) return null;

  const { resumeData } = version;

  // Phase 15 Milestone 7 — the ATS Explainability dashboard, computed
  // fresh from data already on this version (zero new API calls, zero
  // LLM calls): resumeScorer.score() is the exact same deterministic,
  // dependency-free function Milestone 2's saveDynamicDocument() uses
  // to compute the persisted ats_score, so freshAtsScore.overall
  // always matches version.atsScore — this just recovers the FULL
  // breakdown that only `.overall` survives persistence as. The
  // dynamic document is the same lazy-migration getDynamicDocument()
  // already uses server-side (sectionsData if the builder has ever
  // been opened, otherwise derived from resumeData) — reused here
  // purely for Section Completeness / Contact Quality, never written.
  const freshAtsScore = resumeScorer.score(resumeData);
  const dynamicDocument = version.sectionsData ?? toDynamicResumeDocument(resumeData);
  const templateStyles = resolveTemplateStyles(version.templateSettings ?? DEFAULT_TEMPLATE_SETTINGS);
  const qualityReport = checkResumeQuality(dynamicDocument, templateStyles);
  const sectionCompleteness = computeSectionCompleteness(dynamicDocument);
  const contactQuality = computeContactQuality(dynamicDocument.personalInformation);
  // Phase 15 Milestone 10 — the final pre-export gate. Reuses the SAME
  // document/templateSettings/qualityReport already computed above for
  // the panels below it — no second scoring pass, no new LLM call.
  const qualityGate = buildQualityGateReport({ document: dynamicDocument, templateSettings: version.templateSettings ?? DEFAULT_TEMPLATE_SETTINGS, qualityReport });

  return (
    <div className="space-y-6">
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            {version.isMaster && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">★ Master Resume</span>}
            <h1 className="text-xl font-bold text-slate-900">{version.versionName}</h1>
          </div>
          <p className="mt-1 text-sm text-slate-500">{[version.targetJobTitle, version.targetCompany, version.targetLocation].filter(Boolean).join(" · ") || "No target role set"}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <a href={`/api/ai/resume/versions/${versionId}/export?format=pdf`} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Download PDF
          </a>
          <a href={`/api/ai/resume/versions/${versionId}/export?format=docx`} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Download DOCX
          </a>
          {/* Phase 17 Milestone 2 — only the opaque version id is ever passed; no resume content in the URL. */}
          <Link
            href={`/interview-preparation?resumeVersionId=${versionId}`}
            aria-label="Start Interview Preparation from this resume version"
            className="rounded-xl border border-blue-300 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
          >
            Prepare Interview
          </Link>
          {!version.isMaster && (
            <button onClick={handleRestoreAsMaster} disabled={restoring} className="rounded-xl border border-amber-300 px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-50">
              {restoring ? "Restoring..." : "Restore as Master"}
            </button>
          )}
          {!version.isMaster && (
            <button onClick={handleCompareWithMaster} className="rounded-xl border border-purple-300 px-4 py-2 text-sm font-semibold text-purple-700 hover:bg-purple-50">
              Compare with Master
            </button>
          )}
          <Link href="/resume-analyzer/versions" className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200">
            All Versions
          </Link>
        </div>
      </div>

      <div className="flex gap-2 border-b border-slate-200">
        <button
          onClick={() => setTab("overview")}
          className={`border-b-2 px-4 py-2 text-sm font-semibold ${tab === "overview" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}
        >
          Overview
        </button>
        <button
          onClick={() => setTab("builder")}
          className={`border-b-2 px-4 py-2 text-sm font-semibold ${tab === "builder" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}
        >
          Resume Builder
        </button>
      </div>

      {tab === "builder" && <ResumeBuilder versionId={versionId} />}

      {tab === "overview" && (
      <>
      {version.jobDescriptionText && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase text-slate-400">JD Match</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{version.jdMatchScore ?? "—"}</p>
            {/* JD ATS and general ATS are always shown separately (§23) — never combined into one number. */}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase text-slate-400">Matched Skills</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{version.matchedSkills.length}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase text-slate-400">Missing Skills</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{version.missingSkills.length}</p>
          </div>
        </div>
      )}

      <ResumeAtsScore score={freshAtsScore} quality={qualityReport} onOpenSection={() => setTab("builder")} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-bold text-slate-700">Section Completeness</h2>
          <ul className="mt-3 space-y-1.5">
            {sectionCompleteness.map((row) => (
              <li key={row.type} className="flex items-center justify-between text-sm">
                <span className="text-slate-600">{row.label}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${SECTION_STATUS_CLASSNAME[row.status]}`}>{row.status === "Complete" ? `Complete (${row.entryCount})` : row.status}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-bold text-slate-700">Contact Quality</h2>
          <ul className="mt-3 space-y-1.5">
            {contactQuality.map((row) => (
              <li key={row.field} className="flex items-center justify-between text-sm">
                <span className="text-slate-600">{row.label}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${row.present ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-400"}`}>{row.present ? "Present" : "Missing"}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {masterComparison && (
        <div className="rounded-2xl border border-purple-200 bg-purple-50 p-5">
          <h3 className="text-sm font-bold text-purple-800">
            vs. Master — ATS {masterComparison.versionA.atsScore ?? "—"} → {masterComparison.versionB.atsScore ?? "—"}
            {masterComparison.atsScoreDelta !== null && ` (${masterComparison.atsScoreDelta >= 0 ? "+" : ""}${masterComparison.atsScoreDelta})`}
          </h3>
          {masterComparison.skillsAdded.length > 0 && <p className="mt-2 text-sm text-green-700">Skills Added: {masterComparison.skillsAdded.join(", ")}</p>}
          {masterComparison.skillsRemoved.length > 0 && <p className="mt-1 text-sm text-red-700">Skills Removed: {masterComparison.skillsRemoved.join(", ")}</p>}
        </div>
      )}

      {(version.matchedSkills.length > 0 || version.missingSkills.length > 0) && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-bold text-slate-700">Skill Match</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase text-slate-400">Matched</p>
              <p className="mt-1 text-sm text-green-700">{version.matchedSkills.join(", ") || "—"}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-slate-400">Missing</p>
              <p className="mt-1 text-sm text-red-700">{version.missingSkills.join(", ") || "—"}</p>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-bold text-slate-700">Professional Summary</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">{version.optimizedSections?.optimizedSummary ?? resumeData.summary ?? "—"}</p>
        {version.optimizedSections && <p className="mt-2 text-xs font-semibold text-blue-600">Showing JD-optimized version</p>}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-bold text-slate-700">Experience</h2>
        <div className="mt-3 space-y-4">
          {resumeData.workExperience.map((job, index) => (
            <div key={index}>
              <p className="font-semibold text-slate-800">
                {job.title} — {job.company}
              </p>
              <p className="text-xs text-slate-400">
                {job.location ?? ""} {job.startDate ?? ""} - {job.isCurrent ? "Present" : (job.endDate ?? "")}
              </p>
              <ul className="mt-1 list-disc pl-5 text-sm text-slate-600">
                {job.description.map((line, lineIndex) => (
                  <li key={lineIndex}>{line}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {resumeData.projects.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-bold text-slate-700">Projects</h2>
          <div className="mt-3 space-y-2">
            {resumeData.projects.map((project, index) => (
              <div key={index}>
                <p className="font-semibold text-slate-800">{project.name}</p>
                <p className="text-sm text-slate-600">{project.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-bold text-slate-700">Skills</h2>
        <p className="mt-2 text-sm text-slate-600">{(version.optimizedSections?.optimizedSkills ?? [...resumeData.skills, ...resumeData.technicalSkills]).join(", ") || "—"}</p>
      </div>

      {resumeData.education.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-bold text-slate-700">Education</h2>
          <div className="mt-3 space-y-2">
            {resumeData.education.map((entry, index) => (
              <p key={index} className="text-sm text-slate-600">
                {entry.degree} — {entry.institution}
              </p>
            ))}
          </div>
        </div>
      )}

      {resumeData.certifications.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-bold text-slate-700">Certifications</h2>
          <p className="mt-2 text-sm text-slate-600">{resumeData.certifications.map((cert) => cert.name).join(", ")}</p>
        </div>
      )}

      {resumeData.achievements.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-bold text-slate-700">Achievements</h2>
          <ul className="mt-2 list-disc pl-5 text-sm text-slate-600">
            {resumeData.achievements.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {version.optimizedSections && version.optimizedSections.improvementSuggestions.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-bold text-slate-700">Optimization Summary</h2>
          <div className="mt-3 space-y-3">
            {version.optimizedSections.improvementSuggestions.map((suggestion, index) => (
              <div key={index} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <p className="text-sm font-semibold text-slate-800">
                  {suggestion.title}{" "}
                  <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-700">{suggestion.priority}</span>{" "}
                  {/* AI-suggested wording/content improvements the user reviews before applying — never a new employer/degree/certification/date (Protected Facts), so always Safe. */}
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600">Safe Fix — Review Before Applying</span>
                </p>
                <p className="mt-1 text-xs text-slate-500">{suggestion.why}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <JdOptimizationReview versionId={versionId} isMaster={version.isMaster} onNavigateToBuilder={() => setTab("builder")} onApplied={load} />

      {/*
        Phase 15 Milestone 10 — the Final Resume Quality Gate. The last
        stop before export: "is this resume ready to submit," not
        "can AI make it better" (§2) — optimization happens above, via
        the existing JdOptimizationReview flow. Reuses the exact same
        export links the header buttons already use — no new export
        endpoint.
      */}
      <div className={`rounded-2xl border p-6 shadow-sm ${READINESS_DISPLAY[qualityGate.readiness].className}`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest opacity-70">Resume Readiness</p>
            <p className="mt-1 text-2xl font-bold">
              {READINESS_DISPLAY[qualityGate.readiness].emoji} {READINESS_DISPLAY[qualityGate.readiness].label}
            </p>
          </div>
          <div className="flex flex-wrap gap-4 text-sm font-semibold">
            <span>ATS {freshAtsScore.overall}</span>
            {version.jobDescriptionText && <span>JD Match {version.jdMatchScore ?? "—"}%</span>}
            <span>Completeness {sectionCompleteness.filter((r) => r.status !== "Missing").length}/{sectionCompleteness.length}</span>
          </div>
        </div>

        {qualityGate.issues.length === 0 ? (
          <p className="mt-4 text-sm font-medium">✓ No issues found — this resume is ready to submit.</p>
        ) : (
          <div className="mt-4 space-y-2">
            {qualityGate.issues.map((issue) => (
              <div key={issue.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/60 bg-white/60 p-3 text-sm">
                <div>
                  <span className={`mr-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${SEVERITY_CLASSNAME[issue.severity]}`}>{issue.severity}</span>
                  <span className="font-semibold text-slate-800">{issue.title}</span>
                  <p className="mt-0.5 text-xs text-slate-500">{issue.description}</p>
                </div>
                {issue.actionable && (
                  <button
                    type="button"
                    onClick={() => setTab("builder")}
                    aria-label={`Fix: ${issue.title}`}
                    className="whitespace-nowrap rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                  >
                    Open Builder
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <a
            href={qualityGate.exportSafe ? `/api/ai/resume/versions/${versionId}/export?format=pdf` : undefined}
            aria-label="Download resume as PDF"
            aria-disabled={!qualityGate.exportSafe}
            className={`rounded-xl px-5 py-2.5 text-sm font-semibold ${qualityGate.exportSafe ? "bg-blue-600 text-white hover:bg-blue-700" : "cursor-not-allowed bg-slate-200 text-slate-400"}`}
          >
            Download PDF
          </a>
          <a
            href={qualityGate.exportSafe ? `/api/ai/resume/versions/${versionId}/export?format=docx` : undefined}
            aria-label="Download resume as DOCX"
            aria-disabled={!qualityGate.exportSafe}
            className={`rounded-xl px-5 py-2.5 text-sm font-semibold ${qualityGate.exportSafe ? "bg-blue-600 text-white hover:bg-blue-700" : "cursor-not-allowed bg-slate-200 text-slate-400"}`}
          >
            Download DOCX
          </a>
        </div>
        {!qualityGate.exportSafe && <p className="mt-2 text-xs font-semibold text-red-700">Export is disabled — this version&apos;s data failed validation. See the critical issues above.</p>}
      </div>
      </>
      )}
    </div>
  );
}
