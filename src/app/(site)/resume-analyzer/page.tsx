"use client";

import Link from "next/link";
import { useState } from "react";

import ResumeUpload from "@/components/resume/ResumeUpload";
import ResumeOverview from "@/components/resume/ResumeOverview";
import ResumeAtsScore from "@/components/resume/ResumeAtsScore";
import ResumeSkillGap from "@/components/resume/ResumeSkillGap";
import ResumeTechRadar from "@/components/resume/ResumeTechRadar";
import ChatBox from "@/components/ai/ChatBox";
import Tabs, { TabItem } from "@/components/ui/Tabs";
import JdUpload from "@/components/resume/jd/JdUpload";
import JdAtsBreakdown from "@/components/resume/jd/JdAtsBreakdown";
import JdKeywordMatch from "@/components/resume/jd/JdKeywordMatch";
import JdExperienceMatch from "@/components/resume/jd/JdExperienceMatch";
import JdEducationMatch from "@/components/resume/jd/JdEducationMatch";
import JdMissingSkills from "@/components/resume/jd/JdMissingSkills";
import ResumeOptimizerPanel from "@/components/resume/jd/ResumeOptimizerPanel";
import type { ResumeAnalysisResult } from "@/lib/ai/resume/resume-types";
import type { JdMatchApiResult } from "@/components/resume/jd/types";

function buildReport(result: ResumeAnalysisResult): string {
  const { resume, analysis, atsScore, skillGap } = result;

  const lines: string[] = [
    `# Resume Analysis — ${resume.contact.name ?? result.filename}`,
    "",
    `Generated: ${new Date(result.uploadedAt).toLocaleString()}`,
    "",
    "## ATS Score",
    `Overall: ${atsScore.overall}/100`,
    `- Formatting: ${atsScore.formatting}`,
    `- Keyword: ${atsScore.keyword}`,
    `- Experience: ${atsScore.experience}`,
    `- Skills: ${atsScore.skills}`,
    `- Education: ${atsScore.education}`,
    `- Certification: ${atsScore.certification}`,
    "",
    atsScore.explanation,
    "",
    "## Professional Summary",
    analysis.professionalSummary,
    "",
    `## Career Level: ${analysis.careerLevel}`,
    "",
    "## Suitable Roles",
    ...analysis.suitableRoles.map((role) => `- ${role}`),
    "",
    "## Key Strengths",
    ...analysis.keyStrengths.map((item) => `- ${item}`),
    "",
    "## Weaknesses",
    ...analysis.weaknesses.map((item) => `- ${item}`),
    "",
    "## Improvement Suggestions",
    ...analysis.improvementSuggestions.map((item) => `- ${item}`),
    "",
    "## Skill Gap",
    `Missing Java skills: ${skillGap.missingJavaSkills.join(", ") || "none"}`,
    `Missing Spring skills: ${skillGap.missingSpringSkills.join(", ") || "none"}`,
    `Missing Cloud skills: ${skillGap.missingCloudSkills.join(", ") || "none"}`,
    `Missing DevOps skills: ${skillGap.missingDevOpsSkills.join(", ") || "none"}`,
    `Missing AI skills: ${skillGap.missingAiSkills.join(", ") || "none"}`,
    `Missing Database skills: ${skillGap.missingDatabaseSkills.join(", ") || "none"}`,
    "",
    "## Recommended Courses",
    ...skillGap.recommendedCourses.map((item) => `- ${item}`),
    "",
    "## Recommended Certifications",
    ...skillGap.recommendedCertifications.map((item) => `- ${item}`),
    "",
    "## Recommended Projects",
    ...skillGap.recommendedProjects.map((item) => `- ${item}`),
  ];

  return lines.join("\n");
}

function downloadReport(result: ResumeAnalysisResult) {
  const blob = new Blob([buildReport(result)], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `resume-analysis-${result.resumeId}.md`;
  anchor.click();

  URL.revokeObjectURL(url);
}

const SUGGESTED_QUESTIONS = [
  "What is my ATS score?",
  "What skills are missing?",
  "How can I improve?",
  "What projects should I build?",
];

export default function ResumeAnalyzerPage() {
  const [result, setResult] = useState<ResumeAnalysisResult | null>(null);
  const [jdMatch, setJdMatch] = useState<JdMatchApiResult | null>(null);

  function resetAll() {
    setResult(null);
    setJdMatch(null);
  }

  // "Overview" and "Chat" are exactly what the page already rendered
  // before this milestone — unchanged content, just moved under a tab so
  // a user who never provides a JD sees identical behavior to before.
  const tabs: TabItem[] = result
    ? [
        {
          id: "overview",
          label: "Overview",
          content: (
            <div className="space-y-6">
              <ResumeOverview analysis={result.analysis} candidateName={result.resume.contact.name} />
              <ResumeAtsScore score={result.atsScore} />
              <ResumeTechRadar technologyStack={result.analysis.technologyStack} />
              <ResumeSkillGap skillGap={result.skillGap} />
            </div>
          ),
        },
        ...(jdMatch
          ? [
              { id: "ats-match", label: "ATS Match", content: <JdAtsBreakdown result={jdMatch} /> },
              { id: "keyword-match", label: "Keyword Match", content: <JdKeywordMatch result={jdMatch} /> },
              { id: "experience", label: "Experience", content: <JdExperienceMatch result={jdMatch} /> },
              { id: "education", label: "Education", content: <JdEducationMatch result={jdMatch} /> },
              { id: "missing-skills", label: "Missing Skills", content: <JdMissingSkills result={jdMatch} jobDescription={jdMatch.jobDescription} /> },
              {
                id: "optimization",
                label: "Resume Optimizer",
                content: <ResumeOptimizerPanel jdMatchId={jdMatch.jdMatchId} />,
              },
            ]
          : []),
        {
          id: "chat",
          label: "Chat",
          content: (
            <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-xl md:p-6">
              <ChatBox
                resumeId={result.resumeId}
                jdMatchId={jdMatch?.jdMatchId}
                title="Ask about this resume"
                subtitle="Get follow-up answers grounded in the uploaded resume"
                placeholder="Ask about your ATS score, skill gaps, or suitable roles..."
                suggestions={SUGGESTED_QUESTIONS}
                emptyStateTitle="Ask a follow-up question"
                emptyStateBody="For example, try one of the questions below."
              />
            </div>
          ),
        },
      ]
    : [];

  return (
    <section className="min-h-screen bg-slate-50 px-6 py-16">
      <div className="mx-auto max-w-5xl">
        <div className="mb-10 text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-blue-600">
            Resume Intelligence Agent
          </p>

          <h1 className="mt-4 text-4xl font-bold text-slate-950 sm:text-5xl">
            Get an instant AI-powered resume analysis
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600">
            Upload a resume to get an ATS score, skill gap breakdown, and personalized
            improvement suggestions — then match it against a job description and ask
            follow-up questions in chat.
          </p>
        </div>

        {!result && (
          <div className="mx-auto max-w-2xl">
            <ResumeUpload onAnalyzed={setResult} />
          </div>
        )}

        {result && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div>
                <p className="text-sm text-slate-500">Analyzed file</p>
                <p className="font-semibold text-slate-900">{result.filename}</p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => downloadReport(result)}
                  className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Download Analysis
                </button>

                <Link
                  href={`/resume-analyzer/versions?resumeId=${result.resumeId}`}
                  className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Save to My Versions
                </Link>

                <Link
                  href={`/resume-rewriter?resumeId=${result.resumeId}`}
                  className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Rewrite my resume
                </Link>

                <Link
                  href={`/linkedin-optimizer?resumeId=${result.resumeId}${jdMatch ? `&jdMatchId=${jdMatch.jdMatchId}` : ""}`}
                  className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Optimize my LinkedIn
                </Link>

                <button
                  onClick={resetAll}
                  className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  Analyze another resume
                </button>
              </div>
            </div>

            {jdMatch ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4">
                <p className="text-sm font-semibold text-blue-800">
                  Matched against: {jdMatch.jobDescription.jobTitle ?? "this job description"}
                  {jdMatch.jobDescription.companyName ? ` at ${jdMatch.jobDescription.companyName}` : ""} —{" "}
                  {jdMatch.overallMatch}% match
                </p>
                <div className="flex gap-2">
                  <Link
                    href={`/interview-preparation?resumeId=${result.resumeId}&jdMatchId=${jdMatch.jdMatchId}`}
                    className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                  >
                    Prepare for the interview
                  </Link>
                  <Link
                    href={`/cover-letter?jdMatchId=${jdMatch.jdMatchId}`}
                    className="rounded-xl border border-blue-300 bg-white px-4 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                  >
                    Write a cover letter
                  </Link>
                  <button
                    onClick={() => setJdMatch(null)}
                    className="rounded-xl border border-blue-300 bg-white px-4 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                  >
                    Analyze a different job description
                  </button>
                </div>
              </div>
            ) : (
              <JdUpload resumeId={result.resumeId} onAnalyzed={setJdMatch} />
            )}

            <Tabs tabs={tabs} />
          </div>
        )}
      </div>
    </section>
  );
}
