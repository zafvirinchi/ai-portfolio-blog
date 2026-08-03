"use client";

import { useState } from "react";

import JobMatchUpload from "@/components/job-match/JobMatchUpload";
import JobMatchScore from "@/components/job-match/JobMatchScore";
import JobMatchGapAnalysis from "@/components/job-match/JobMatchGapAnalysis";
import JobMatchReport from "@/components/job-match/JobMatchReport";
import type { JobMatchResult } from "@/lib/ai/job-match/job-match-types";

function buildReport(result: JobMatchResult): string {
  const { resume, atsScore, jobMatch } = result;

  const lines: string[] = [
    `# Job Match Analysis — ${resume.contact.name ?? result.filename}`,
    "",
    `Resume Match: ${jobMatch.jdMatchPercent}%`,
    `ATS Score: ${atsScore.overall}/100`,
    "",
    "## Critical Missing Skills",
    ...(jobMatch.missingSkills.map((item) => `- ${item}`) || []),
    "",
    "## Missing Keywords",
    ...jobMatch.missingKeywords.map((item) => `- ${item}`),
    "",
    "## Soft Skill Gaps",
    ...jobMatch.softSkillGaps.map((item) => `- ${item}`),
    "",
    "## Certification Gaps",
    ...jobMatch.certificationGaps.map((item) => `- ${item}`),
    "",
    "## Project Gaps",
    ...jobMatch.projectGaps.map((item) => `- ${item}`),
    "",
    "## Experience Gap",
    ...jobMatch.experienceGaps.map((gap) => `- ${gap.area}: ${gap.required} (${gap.candidateHas})`),
    "",
    "## Resume Section Analysis",
    ...jobMatch.resumeSectionAnalysis.map((section) => `### ${section.section}\n${section.feedback}`),
    "",
    "## Recruiter Feedback",
    jobMatch.recruiterFeedback,
    "",
    "## Priority Improvements",
    ...jobMatch.priorityImprovements.map((item) => `- ${item}`),
    "",
    "## Final Recommendation",
    jobMatch.finalRecommendation,
  ];

  return lines.join("\n");
}

function downloadReport(result: JobMatchResult) {
  const blob = new Blob([buildReport(result)], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `job-match-analysis-${Date.now()}.md`;
  anchor.click();

  URL.revokeObjectURL(url);
}

export default function JobMatchPageClient() {
  const [result, setResult] = useState<JobMatchResult | null>(null);

  return (
    <section className="min-h-screen bg-slate-50 px-6 py-16">
      <div className="mx-auto max-w-5xl">
        <div className="mb-10 text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-blue-600">
            AI Job Description Intelligence
          </p>

          <h1 className="mt-4 text-4xl font-bold text-slate-950 sm:text-5xl">
            See exactly how well your resume matches a job
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600">
            Upload your resume and a job description to get a match score, missing
            skills and keywords, experience gaps, and a prioritized improvement plan.
          </p>
        </div>

        {!result && (
          <div className="mx-auto max-w-2xl">
            <JobMatchUpload onAnalyzed={setResult} />
          </div>
        )}

        {result && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div>
                <p className="text-sm text-slate-500">Analyzed resume</p>
                <p className="font-semibold text-slate-900">{result.filename}</p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => downloadReport(result)}
                  className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Download Analysis
                </button>

                <button
                  onClick={() => setResult(null)}
                  className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  Analyze another match
                </button>
              </div>
            </div>

            <JobMatchScore jdMatchPercent={result.jobMatch.jdMatchPercent} atsScore={result.atsScore} />

            <JobMatchGapAnalysis jobMatch={result.jobMatch} />

            <JobMatchReport jobMatch={result.jobMatch} />
          </div>
        )}
      </div>
    </section>
  );
}
