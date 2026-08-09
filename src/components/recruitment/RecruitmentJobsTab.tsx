"use client";

import { useState } from "react";

import { EMPLOYMENT_TYPES } from "@/lib/ai/recruitment/pipeline-schema";
import type { Job } from "@/lib/ai/recruitment/pipeline-types";

type Props = {
  jobs: Job[];
  loading: boolean;
  selectedJobId: string | null;
  onSelectJob: (jobId: string) => void;
  onRefresh: () => void;
};

function toList(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

export default function RecruitmentJobsTab({ jobs, loading, selectedJobId, onSelectJob, onRefresh }: Props) {
  const [title, setTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [location, setLocation] = useState("");
  const [employmentType, setEmploymentType] = useState<string>(EMPLOYMENT_TYPES[0]);
  const [experienceRequired, setExperienceRequired] = useState("");
  const [salary, setSalary] = useState("");
  const [requiredSkills, setRequiredSkills] = useState("");
  const [preferredSkills, setPreferredSkills] = useState("");
  const [education, setEducation] = useState("");
  const [noticePeriod, setNoticePeriod] = useState("");
  const [hiringManager, setHiringManager] = useState("");
  const [recruiter, setRecruiter] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (!title.trim()) return;
    setCreating(true);
    setError(null);

    try {
      const response = await fetch("/api/ai/recruitment/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          department: department.trim() || null,
          location: location.trim() || null,
          employmentType,
          experienceRequired: experienceRequired.trim() || null,
          salary: salary.trim() || null,
          requiredSkills: toList(requiredSkills),
          preferredSkills: toList(preferredSkills),
          education: toList(education),
          noticePeriod: noticePeriod.trim() || null,
          hiringManager: hiringManager.trim() || null,
          recruiter: recruiter.trim() || null,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Job creation failed");

      setTitle("");
      setDepartment("");
      setLocation("");
      setExperienceRequired("");
      setSalary("");
      setRequiredSkills("");
      setPreferredSkills("");
      setEducation("");
      setNoticePeriod("");
      setHiringManager("");
      setRecruiter("");
      onRefresh();
      onSelectJob(data.jobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Job creation failed.");
    } finally {
      setCreating(false);
    }
  }

  async function handleDuplicate(jobId: string) {
    await fetch(`/api/ai/recruitment/jobs/${jobId}/duplicate`, { method: "POST" });
    onRefresh();
  }

  async function handleStatus(jobId: string, status: string) {
    await fetch(`/api/ai/recruitment/jobs/${jobId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    onRefresh();
  }

  async function handleDelete(jobId: string) {
    await fetch(`/api/ai/recruitment/jobs/${jobId}`, { method: "DELETE" });
    onRefresh();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-bold text-slate-700">Create Job</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Job title *" className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
          <input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Department" className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location" className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
          <select value={employmentType} onChange={(e) => setEmploymentType(e.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm">
            {EMPLOYMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <input value={experienceRequired} onChange={(e) => setExperienceRequired(e.target.value)} placeholder="Experience (e.g. 4-7 years)" className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
          <input value={salary} onChange={(e) => setSalary(e.target.value)} placeholder="Salary range" className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
          <input value={requiredSkills} onChange={(e) => setRequiredSkills(e.target.value)} placeholder="Required skills (comma-separated)" className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
          <input value={preferredSkills} onChange={(e) => setPreferredSkills(e.target.value)} placeholder="Preferred skills (comma-separated)" className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
          <input value={education} onChange={(e) => setEducation(e.target.value)} placeholder="Education (comma-separated)" className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
          <input value={noticePeriod} onChange={(e) => setNoticePeriod(e.target.value)} placeholder="Expected notice period" className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
          <input value={hiringManager} onChange={(e) => setHiringManager(e.target.value)} placeholder="Hiring manager" className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
          <input value={recruiter} onChange={(e) => setRecruiter(e.target.value)} placeholder="Recruiter" className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <button
          onClick={handleCreate}
          disabled={creating || !title.trim()}
          className="mt-3 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {creating ? "Creating..." : "Create Job"}
        </button>
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading jobs...</p>
      ) : jobs.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No jobs created yet.</p>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <div
              key={job.jobId}
              className={`rounded-2xl border p-5 shadow-sm ${selectedJobId === job.jobId ? "border-blue-400 bg-blue-50/40" : "border-slate-200 bg-white"}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">{job.title}</p>
                  <p className="text-xs text-slate-500">
                    {job.department ?? "—"} · {job.location ?? "—"} · {job.employmentType}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">Required: {job.requiredSkills.join(", ") || "none"}</p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{job.status}</span>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={() => onSelectJob(job.jobId)} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">
                  Select
                </button>
                <button onClick={() => handleDuplicate(job.jobId)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                  Duplicate
                </button>
                {job.status !== "Open" && (
                  <button onClick={() => handleStatus(job.jobId, "Open")} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                    Open
                  </button>
                )}
                {job.status !== "Closed" && (
                  <button onClick={() => handleStatus(job.jobId, "Closed")} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                    Close
                  </button>
                )}
                {job.status !== "Archived" && (
                  <button onClick={() => handleStatus(job.jobId, "Archived")} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                    Archive
                  </button>
                )}
                <button onClick={() => handleDelete(job.jobId)} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
