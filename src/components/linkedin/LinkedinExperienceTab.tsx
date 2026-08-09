"use client";

import { useState } from "react";

import type { LinkedinRecord } from "@/lib/ai/linkedin/linkedin-types";

type Props = {
  linkedinId: string;
  record: LinkedinRecord;
  onUpdated: (record: LinkedinRecord) => void;
};

export default function LinkedinExperienceTab({ linkedinId, record, onUpdated }: Props) {
  const [loadingExperience, setLoadingExperience] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerateExperience() {
    setLoadingExperience(true);
    setError(null);

    try {
      const response = await fetch(`/api/ai/linkedin/${linkedinId}/experience`, { method: "POST" });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Experience generation failed");
      }

      onUpdated(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Experience generation failed.");
    } finally {
      setLoadingExperience(false);
    }
  }

  async function handleGenerateProjects() {
    setLoadingProjects(true);
    setError(null);

    try {
      const response = await fetch(`/api/ai/linkedin/${linkedinId}/projects`, { method: "POST" });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Projects generation failed");
      }

      onUpdated(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Projects generation failed.");
    } finally {
      setLoadingProjects(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <button
          onClick={handleGenerateExperience}
          disabled={loadingExperience}
          className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loadingExperience ? "Rewriting experience..." : "Generate Experience Bullets"}
        </button>

        <button
          onClick={handleGenerateProjects}
          disabled={loadingProjects}
          className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {loadingProjects ? "Generating projects..." : "Generate Projects"}
        </button>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      <div>
        <h3 className="mb-3 text-sm font-bold text-slate-700">Experience Bullets</h3>

        {(!record.experience || record.experience.length === 0) && (
          <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            Generate rewritten experience bullets to see them here.
          </p>
        )}

        <div className="space-y-3">
          {record.experience?.map((item, index) => (
            <div key={index} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs text-slate-400 line-through">{item.original}</p>
              <p className="mt-2 text-sm font-medium text-slate-800">{item.rewritten}</p>

              {item.atsKeywords.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {item.atsKeywords.map((keyword) => (
                    <span key={keyword} className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                      {keyword}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-bold text-slate-700">Projects</h3>

        {(!record.projects || record.projects.length === 0) && (
          <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            Generate recruiter-grade project descriptions to see them here.
          </p>
        )}

        <div className="space-y-3">
          {record.projects?.map((project, index) => (
            <div key={index} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h4 className="text-sm font-bold text-slate-900">{project.name}</h4>

              <dl className="mt-3 space-y-2 text-sm text-slate-700">
                <div>
                  <dt className="text-xs font-semibold uppercase text-slate-400">Problem</dt>
                  <dd>{project.problem}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase text-slate-400">Solution</dt>
                  <dd>{project.solution}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase text-slate-400">Architecture</dt>
                  <dd>{project.architecture}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase text-slate-400">Business Value</dt>
                  <dd>{project.businessValue}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase text-slate-400">Impact</dt>
                  <dd>{project.impact}</dd>
                </div>
              </dl>

              {project.technology.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {project.technology.map((tech) => (
                    <span key={tech} className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                      {tech}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
