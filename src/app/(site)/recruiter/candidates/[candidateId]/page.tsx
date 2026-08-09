"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { CANDIDATE_STATUSES, CANDIDATE_TAGS, NOTE_CATEGORIES, CandidateStatus, CandidateTag, NoteCategory } from "@/lib/ai/recruiter/candidate-schema";
import type { CandidateProfile } from "@/lib/ai/recruiter/candidate-types";

export default function CandidateProfilePage() {
  const params = useParams<{ candidateId: string }>();
  const candidateId = params.candidateId;

  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [noteCategory, setNoteCategory] = useState<NoteCategory>("Recruiter");
  const [noteText, setNoteText] = useState("");
  const [noticePeriod, setNoticePeriod] = useState("");
  const [expectedSalary, setExpectedSalary] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/ai/recruiter/candidates/${candidateId}`);
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "Candidate not found");

      setProfile(data);
      setNoticePeriod(data.record.noticePeriod ?? "");
      setExpectedSalary(data.record.expectedSalary ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Candidate not found.");
    } finally {
      setLoading(false);
    }
  }, [candidateId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleStatusChange(status: CandidateStatus) {
    setBusy("status");
    try {
      await fetch(`/api/ai/recruiter/candidates/${candidateId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function handleToggleTag(tag: CandidateTag) {
    if (!profile) return;
    const current = profile.record.tags;
    const next = current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag];

    setBusy("tags");
    try {
      await fetch(`/api/ai/recruiter/candidates/${candidateId}/tags`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: next }),
      });
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function handleSaveFields() {
    setBusy("fields");
    try {
      await fetch(`/api/ai/recruiter/candidates/${candidateId}/fields`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noticePeriod, expectedSalary }),
      });
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function handleAddNote() {
    if (!noteText.trim()) return;

    setBusy("note");
    try {
      await fetch(`/api/ai/recruiter/candidates/${candidateId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: noteCategory, text: noteText.trim() }),
      });
      setNoteText("");
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function handleMatchJd() {
    setBusy("match");
    try {
      const response = await fetch(`/api/ai/recruiter/candidates/${candidateId}/match`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Matching against the job description failed.");
    } finally {
      setBusy(null);
    }
  }

  async function handleGenerateInsights() {
    setBusy("insights");
    try {
      await fetch(`/api/ai/recruiter/candidates/${candidateId}/insights`, { method: "POST" });
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function handleGenerateReadiness() {
    setBusy("readiness");
    try {
      const response = await fetch(`/api/ai/recruiter/candidates/${candidateId}/interview-readiness`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Interview readiness generation failed.");
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <section className="min-h-screen bg-slate-50 px-6 py-16">
        <div className="mx-auto max-w-4xl text-center text-slate-500">Loading candidate...</div>
      </section>
    );
  }

  if (error || !profile) {
    return (
      <section className="min-h-screen bg-slate-50 px-6 py-16">
        <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-lg font-semibold text-slate-900">Candidate not available</p>
          <p className="mt-2 text-sm text-slate-600">{error ?? "This candidate could not be found."}</p>
          <Link href="/recruiter" className="mt-5 inline-block rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700">
            Back to Workspace
          </Link>
        </div>
      </section>
    );
  }

  const { summary, record, resume, jdMatchResult } = profile;

  return (
    <section className="min-h-screen bg-slate-50 px-6 py-16">
      <div className="mx-auto max-w-4xl space-y-6">
        <Link href="/recruiter" className="text-sm font-semibold text-blue-600 hover:underline">
          ← Back to Workspace
        </Link>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{summary.name}</h1>
              <p className="text-slate-600">
                {summary.currentRole ?? "Role unknown"} at {summary.currentCompany ?? "unknown company"}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {resume.contact.email ?? "no email"} · {resume.contact.phone ?? "no phone"} · {summary.location ?? "location unknown"}
              </p>
            </div>

            <select
              value={record.status}
              onChange={(e) => handleStatusChange(e.target.value as CandidateStatus)}
              disabled={busy === "status"}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold"
            >
              {CANDIDATE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {CANDIDATE_TAGS.map((tag) => (
              <button
                key={tag}
                onClick={() => handleToggleTag(tag)}
                disabled={busy === "tags"}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  record.tags.includes(tag) ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {tag}
              </button>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={`/resume-rewriter?resumeId=${record.resumeId}`}
              className="inline-block rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Rewrite this resume
            </Link>
            <Link
              href={`/recruitment?candidateId=${candidateId}`}
              className="inline-block rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Add to a job pipeline
            </Link>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-2 text-xs font-bold uppercase text-slate-500">Scores</h3>
            <p className="text-sm text-slate-700">Resume Score: {summary.scores.resumeScore ?? "N/A"}</p>
            <p className="text-sm text-slate-700">ATS Score: {summary.scores.atsScore ?? "N/A"}</p>
            <p className="text-sm text-slate-700">JD Match: {summary.scores.jdMatch ?? "N/A"}</p>
            <p className="text-sm text-slate-700">Overall Score: {summary.scores.overallScore ?? "N/A"}</p>
            <p className="text-sm text-slate-700">Interview Readiness: {summary.scores.interviewReadiness ?? "N/A"}</p>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={handleMatchJd}
                disabled={busy === "match"}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {busy === "match" ? "Matching..." : "Match Against Workspace JD"}
              </button>
              <button
                onClick={handleGenerateReadiness}
                disabled={busy === "readiness"}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {busy === "readiness" ? "Generating..." : "Generate Interview Readiness"}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-2 text-xs font-bold uppercase text-slate-500">Recruiter Fields</h3>
            <label className="mb-1 block text-xs text-slate-500">Notice Period</label>
            <input
              value={noticePeriod}
              onChange={(e) => setNoticePeriod(e.target.value)}
              className="mb-2 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            />
            <label className="mb-1 block text-xs text-slate-500">Expected Salary</label>
            <input
              value={expectedSalary}
              onChange={(e) => setExpectedSalary(e.target.value)}
              className="mb-2 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            />
            <button
              onClick={handleSaveFields}
              disabled={busy === "fields"}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>

        {resume.summary && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-2 text-xs font-bold uppercase text-slate-500">Professional Summary</h3>
            <p className="text-sm text-slate-700">{resume.summary}</p>
          </div>
        )}

        {resume.workExperience.length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-xs font-bold uppercase text-slate-500">Experience Timeline</h3>
            <div className="space-y-3">
              {resume.workExperience.map((job, index) => (
                <div key={index} className="border-l-2 border-blue-200 pl-4">
                  <p className="text-sm font-semibold text-slate-800">
                    {job.title} — {job.company}
                    {job.isCurrent ? " (Current)" : ""}
                  </p>
                  <p className="text-xs text-slate-400">
                    {job.startDate ?? "?"} - {job.isCurrent ? "Present" : job.endDate ?? "?"}
                  </p>
                  <ul className="mt-1 list-disc pl-4 text-sm text-slate-600">
                    {job.description.map((bullet, bulletIndex) => (
                      <li key={bulletIndex}>{bullet}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {resume.education.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-2 text-xs font-bold uppercase text-slate-500">Education</h3>
              {resume.education.map((edu, index) => (
                <p key={index} className="text-sm text-slate-700">
                  {edu.degree}, {edu.institution}
                </p>
              ))}
            </div>
          )}

          {resume.certifications.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-2 text-xs font-bold uppercase text-slate-500">Certifications</h3>
              {resume.certifications.map((cert, index) => (
                <p key={index} className="text-sm text-slate-700">
                  {cert.name}
                  {cert.issuer ? ` — ${cert.issuer}` : ""}
                </p>
              ))}
            </div>
          )}
        </div>

        {resume.projects.length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-2 text-xs font-bold uppercase text-slate-500">Projects</h3>
            {resume.projects.map((project, index) => (
              <div key={index} className="mb-2">
                <p className="text-sm font-semibold text-slate-800">{project.name}</p>
                {project.description && <p className="text-sm text-slate-600">{project.description}</p>}
                {project.technologies.length > 0 && <p className="text-xs text-slate-400">{project.technologies.join(", ")}</p>}
              </div>
            ))}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-2 text-xs font-bold uppercase text-slate-500">Skills / Technology Stack</h3>
            <div className="flex flex-wrap gap-1.5">
              {[...resume.skills, ...resume.technicalSkills].map((skill, index) => (
                <span key={index} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                  {skill}
                </span>
              ))}
            </div>
          </div>

          {resume.achievements.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-2 text-xs font-bold uppercase text-slate-500">Achievements</h3>
              <ul className="list-disc space-y-1 pl-4 text-sm text-slate-700">
                {resume.achievements.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {jdMatchResult && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-2 text-xs font-bold uppercase text-slate-500">JD Match</h3>
            <p className="text-sm text-slate-700">Overall match: {jdMatchResult.overallMatch}% | ATS: {jdMatchResult.atsScore}</p>
            <p className="mt-1 text-sm text-slate-700">Matched skills: {jdMatchResult.matchedSkills.join(", ") || "none"}</p>
            <p className="mt-1 text-sm text-slate-700">Missing skills: {jdMatchResult.missingSkills.join(", ") || "none"}</p>
          </div>
        )}

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase text-slate-500">AI Insights</h3>
            <button
              onClick={handleGenerateInsights}
              disabled={busy === "insights"}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {busy === "insights" ? "Generating..." : "Generate Insights"}
            </button>
          </div>

          {record.insights ? (
            <div className="space-y-2 text-sm text-slate-700">
              <p>
                <span className="font-semibold">Hiring recommendation:</span> {record.insights.hiringRecommendation.rating} —{" "}
                {record.insights.hiringRecommendation.explanation}
              </p>
              <p>
                <span className="font-semibold">Strengths:</span> {record.insights.strengths.join("; ") || "none"}
              </p>
              <p>
                <span className="font-semibold">Weaknesses:</span> {record.insights.weaknesses.join("; ") || "none"}
              </p>
              <p>
                <span className="font-semibold">Risk factors:</span> {record.insights.riskFactors.join("; ") || "none"}
              </p>
            </div>
          ) : (
            <p className="text-sm text-slate-400">Not generated yet.</p>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-xs font-bold uppercase text-slate-500">Notes</h3>

          <div className="mb-4 flex flex-wrap gap-2">
            <select value={noteCategory} onChange={(e) => setNoteCategory(e.target.value as NoteCategory)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
              {NOTE_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
            <input
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Add a note..."
              className="min-w-[220px] flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            />
            <button
              onClick={handleAddNote}
              disabled={busy === "note"}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Add Note
            </button>
          </div>

          {record.notes.length === 0 ? (
            <p className="text-sm text-slate-400">No notes yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {[...record.notes].reverse().map((note) => (
                <li key={note.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <span className="mr-2 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600">{note.category}</span>
                  {note.text}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
