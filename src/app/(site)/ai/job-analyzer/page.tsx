"use client";

import { useState } from "react";

import JobUpload from "@/components/job/JobUpload";
import JobSummary from "@/components/job/JobSummary";
import JobOverview from "@/components/job/JobOverview";
import JobSkills from "@/components/job/JobSkills";
import JobResponsibilities from "@/components/job/JobResponsibilities";
import JobRequirements from "@/components/job/JobRequirements";
import JobTechnologyStack from "@/components/job/JobTechnologyStack";
import JobBenefits from "@/components/job/JobBenefits";
import type { JobParseResult } from "@/lib/ai/job/job-types";

export default function JobAnalyzerPage() {
  const [result, setResult] = useState<JobParseResult | null>(null);

  return (
    <section className="min-h-screen bg-slate-50 px-6 py-16">
      <div className="mx-auto max-w-5xl">
        <div className="mb-10 text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-blue-600">
            Job Description Intelligence
          </p>

          <h1 className="mt-4 text-4xl font-bold text-slate-950 sm:text-5xl">
            Understand any job description instantly
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600">
            Upload a job description to extract requirements, skills, responsibilities, and
            technology stack in a structured, easy-to-scan view.
          </p>
        </div>

        {!result && (
          <div className="mx-auto max-w-2xl">
            <JobUpload onParsed={setResult} />
          </div>
        )}

        {result && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div>
                <p className="text-sm text-slate-500">Analyzed file</p>
                <p className="font-semibold text-slate-900">{result.filename}</p>
              </div>

              <button
                onClick={() => setResult(null)}
                className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Analyze another job description
              </button>
            </div>

            <JobSummary job={result.jobDescription} />
            <JobOverview job={result.jobDescription} />
            <JobSkills job={result.jobDescription} />
            <JobTechnologyStack job={result.jobDescription} />
            <JobResponsibilities job={result.jobDescription} />
            <JobRequirements job={result.jobDescription} />
            <JobBenefits job={result.jobDescription} />
          </div>
        )}
      </div>
    </section>
  );
}
