"use client";

import { useState } from "react";

import ResumeUpload from "@/components/resume/ResumeUpload";
import ResumeOverview from "@/components/resume/ResumeOverview";
import ResumeAtsScore from "@/components/resume/ResumeAtsScore";
import ResumeSkillGap from "@/components/resume/ResumeSkillGap";
import ResumeTechRadar from "@/components/resume/ResumeTechRadar";
import ChatBox from "@/components/ai/ChatBox";
import type { ResumeAnalysisResult } from "@/lib/ai/resume/resume-types";

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
            improvement suggestions — then ask follow-up questions in chat.
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

                <button
                  onClick={() => setResult(null)}
                  className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  Analyze another resume
                </button>
              </div>
            </div>

            <ResumeOverview analysis={result.analysis} candidateName={result.resume.contact.name} />

            <ResumeAtsScore score={result.atsScore} />

            <ResumeTechRadar technologyStack={result.analysis.technologyStack} />

            <ResumeSkillGap skillGap={result.skillGap} />

            <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-xl md:p-6">
              <ChatBox
                resumeId={result.resumeId}
                title="Ask about this resume"
                subtitle="Get follow-up answers grounded in the uploaded resume"
                placeholder="Ask about your ATS score, skill gaps, or suitable roles..."
                suggestions={SUGGESTED_QUESTIONS}
                emptyStateTitle="Ask a follow-up question"
                emptyStateBody="For example, try one of the questions below."
              />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
