"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import type { ResumeVersionSummary, VersionComparison } from "@/lib/ai/resume-versions/resume-version-types";

function ScoreBadge({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-lg font-bold text-slate-900">{value === null ? "—" : value}</p>
    </div>
  );
}

interface CreateFormState {
  versionName: string;
  targetJobTitle: string;
  targetCompany: string;
  targetLocation: string;
  jobDescriptionText: string;
}

const EMPTY_FORM: CreateFormState = { versionName: "", targetJobTitle: "", targetCompany: "", targetLocation: "", jobDescriptionText: "" };

export default function VersionsList({ sourceResumeId }: { sourceResumeId?: string }) {
  const [versions, setVersions] = useState<ResumeVersionSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);

  const [showCreateForm, setShowCreateForm] = useState(Boolean(sourceResumeId));
  const [form, setForm] = useState<CreateFormState>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);
  const [comparison, setComparison] = useState<VersionComparison | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);

  const hasMaster = versions?.some((version) => version.isMaster) ?? false;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNeedsLogin(false);

    try {
      const response = await fetch("/api/ai/resume/versions");

      if (response.status === 401) {
        setNeedsLogin(true);
        return;
      }

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to load resume versions");

      setVersions(data.versions ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load resume versions.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate() {
    setCreating(true);
    setCreateError(null);

    try {
      const response = await fetch("/api/ai/resume/versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeId: !hasMaster ? sourceResumeId : undefined,
          versionName: form.versionName.trim() || undefined,
          targetJobTitle: form.targetJobTitle.trim() || undefined,
          targetCompany: form.targetCompany.trim() || undefined,
          targetLocation: form.targetLocation.trim() || undefined,
          jobDescriptionText: form.jobDescriptionText.trim() || undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to create resume version");

      setForm(EMPTY_FORM);
      setShowCreateForm(false);
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create resume version.");
    } finally {
      setCreating(false);
    }
  }

  async function handleRename(id: string) {
    if (!renameValue.trim()) return;
    setBusyId(id);

    try {
      const response = await fetch(`/api/ai/resume/versions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionName: renameValue.trim() }),
      });
      if (!response.ok) throw new Error((await response.json()).error || "Rename failed");
      setRenamingId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rename failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDuplicate(id: string) {
    setBusyId(id);
    try {
      const response = await fetch(`/api/ai/resume/versions/${id}/duplicate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!response.ok) throw new Error((await response.json()).error || "Duplicate failed");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Duplicate failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this resume version? It will be moved out of your active versions.")) return;
    setBusyId(id);

    try {
      const response = await fetch(`/api/ai/resume/versions/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error((await response.json()).error || "Delete failed");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setBusyId(null);
    }
  }

  function toggleCompareSelection(id: string) {
    setComparison(null);
    setCompareError(null);
    setSelectedForCompare((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 2 ? [prev[1], id] : [...prev, id]));
  }

  async function handleCompare() {
    if (selectedForCompare.length !== 2) return;
    setCompareError(null);

    try {
      const response = await fetch("/api/ai/resume/versions/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionAId: selectedForCompare[0], versionBId: selectedForCompare[1] }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Comparison failed");
      setComparison(data.comparison);
    } catch (err) {
      setCompareError(err instanceof Error ? err.message : "Comparison failed.");
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Loading your resume versions...</p>;

  if (needsLogin) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-lg font-semibold text-slate-900">Sign in to manage resume versions.</p>
        <p className="mt-2 text-sm text-slate-500">Your analysis stays available without an account — saving tailored versions for different jobs requires signing in.</p>
        <Link href="/login?redirect=/resume-analyzer/versions" className="mt-4 inline-block rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
          Sign In
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-slate-900">Resume Versions</h2>
        <button
          onClick={() => setShowCreateForm((prev) => !prev)}
          className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
        >
          + Create Version
        </button>
      </div>

      {showCreateForm && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-5">
          <h3 className="text-sm font-bold text-slate-800">{hasMaster ? "Create a tailored version" : "Save your Master Resume"}</h3>
          <p className="mt-1 text-xs text-slate-500">
            {hasMaster
              ? "Cloned from your Master Resume. Add a job description to run JD matching and optimization automatically."
              : "This becomes your canonical Master Resume — every future version is cloned from it, and it's never changed automatically."}
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold text-slate-500">
              Version Name
              <input
                value={form.versionName}
                onChange={(event) => setForm({ ...form, versionName: event.target.value })}
                placeholder={hasMaster ? "Senior Full Stack Developer — Emirates" : "Master Resume"}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-800"
              />
            </label>
            <label className="text-xs font-semibold text-slate-500">
              Target Job Title
              <input
                value={form.targetJobTitle}
                onChange={(event) => setForm({ ...form, targetJobTitle: event.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-800"
              />
            </label>
            <label className="text-xs font-semibold text-slate-500">
              Company
              <input
                value={form.targetCompany}
                onChange={(event) => setForm({ ...form, targetCompany: event.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-800"
              />
            </label>
            <label className="text-xs font-semibold text-slate-500">
              Location
              <input
                value={form.targetLocation}
                onChange={(event) => setForm({ ...form, targetLocation: event.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-800"
              />
            </label>
          </div>

          <label className="mt-3 block text-xs font-semibold text-slate-500">
            Job Description (optional — runs JD matching &amp; optimization)
            <textarea
              value={form.jobDescriptionText}
              onChange={(event) => setForm({ ...form, jobDescriptionText: event.target.value })}
              rows={5}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-800"
            />
          </label>

          {createError && <p className="mt-2 text-xs font-semibold text-red-600">{createError}</p>}

          <div className="mt-4 flex gap-2">
            <button
              onClick={handleCreate}
              disabled={creating || (!hasMaster && !sourceResumeId)}
              className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {creating ? "Creating..." : "Create"}
            </button>
            <button onClick={() => setShowCreateForm(false)} className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Cancel
            </button>
          </div>

          {!hasMaster && !sourceResumeId && (
            <p className="mt-2 text-xs text-amber-600">Analyze a resume first, then come back here via &quot;Save to My Versions&quot; to create your Master Resume.</p>
          )}
        </div>
      )}

      {selectedForCompare.length > 0 && (
        <div className="rounded-2xl border border-purple-200 bg-purple-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-purple-800">{selectedForCompare.length} of 2 versions selected for comparison</p>
            <div className="flex gap-2">
              <button onClick={handleCompare} disabled={selectedForCompare.length !== 2} className="rounded-lg bg-purple-600 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                Compare Selected
              </button>
              <button onClick={() => setSelectedForCompare([])} className="rounded-lg border border-purple-300 bg-white px-4 py-1.5 text-xs font-semibold text-purple-700">
                Clear
              </button>
            </div>
          </div>
          {compareError && <p className="mt-2 text-xs font-semibold text-red-600">{compareError}</p>}
        </div>
      )}

      {comparison && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-bold text-slate-700">Comparing: {comparison.versionA.versionName} vs {comparison.versionB.versionName}</h3>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase text-slate-400">ATS Score</p>
              <p className="text-sm text-slate-700">
                {comparison.versionA.atsScore ?? "—"} → {comparison.versionB.atsScore ?? "—"}{" "}
                {comparison.atsScoreDelta !== null && (
                  <span className={comparison.atsScoreDelta >= 0 ? "font-semibold text-green-600" : "font-semibold text-red-600"}>
                    ({comparison.atsScoreDelta >= 0 ? "+" : ""}
                    {comparison.atsScoreDelta})
                  </span>
                )}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-slate-400">JD Match</p>
              <p className="text-sm text-slate-700">
                {comparison.versionA.jdMatchScore ?? "—"} → {comparison.versionB.jdMatchScore ?? "—"}{" "}
                {comparison.jdMatchScoreDelta !== null && (
                  <span className={comparison.jdMatchScoreDelta >= 0 ? "font-semibold text-green-600" : "font-semibold text-red-600"}>
                    ({comparison.jdMatchScoreDelta >= 0 ? "+" : ""}
                    {comparison.jdMatchScoreDelta})
                  </span>
                )}
              </p>
            </div>
          </div>

          {comparison.skillsAdded.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase text-slate-400">Skills Added</p>
              <p className="text-sm text-green-700">{comparison.skillsAdded.map((skill) => `+ ${skill}`).join("  ")}</p>
            </div>
          )}
          {comparison.skillsRemoved.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-semibold uppercase text-slate-400">Skills Removed</p>
              <p className="text-sm text-red-700">{comparison.skillsRemoved.map((skill) => `- ${skill}`).join("  ")}</p>
            </div>
          )}

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase text-slate-400">Summary — {comparison.versionA.versionName}</p>
              <p className="mt-1 text-sm text-slate-600">{comparison.versionA.summary || "—"}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-slate-400">Summary — {comparison.versionB.versionName}</p>
              <p className="mt-1 text-sm text-slate-600">{comparison.versionB.summary || "—"}</p>
            </div>
          </div>

          <div className="mt-3 flex gap-4 text-xs text-slate-500">
            {comparison.summaryChanged && <span>Summary changed</span>}
            {comparison.experienceChanged && <span>Experience changed</span>}
            {comparison.projectsChanged && <span>Projects changed</span>}
          </div>
        </div>
      )}

      {!versions || versions.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-lg font-semibold text-slate-900">No tailored resumes yet.</p>
          <p className="mt-2 text-sm text-slate-500">Create a version to tailor your resume for a specific job.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {versions.map((version) => (
            <div key={version.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selectedForCompare.includes(version.id)}
                    onChange={() => toggleCompareSelection(version.id)}
                    className="mt-1.5"
                    aria-label={`Select ${version.versionName} for comparison`}
                  />
                  <div>
                    {renamingId === version.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          value={renameValue}
                          onChange={(event) => setRenameValue(event.target.value)}
                          className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
                          autoFocus
                        />
                        <button onClick={() => handleRename(version.id)} className="text-xs font-semibold text-blue-600 hover:underline">
                          Save
                        </button>
                        <button onClick={() => setRenamingId(null)} className="text-xs font-semibold text-slate-500 hover:underline">
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        {version.isMaster && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">★ Master Resume</span>}
                        <Link href={`/resume-analyzer/versions/${version.id}`} className="font-semibold text-slate-900 hover:underline">
                          {version.versionName}
                        </Link>
                      </div>
                    )}
                    <p className="mt-1 text-xs text-slate-500">
                      {[version.targetJobTitle, version.targetCompany, version.targetLocation].filter(Boolean).join(" · ") || "No target role set"}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">Updated {new Date(version.updatedAt).toLocaleDateString()}</p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <ScoreBadge label="ATS Score" value={version.atsScore} />
                  <ScoreBadge label="JD Match" value={version.jdMatchScore} />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                <Link href={`/resume-analyzer/versions/${version.id}`} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                  Open
                </Link>
                <button
                  onClick={() => handleDuplicate(version.id)}
                  disabled={busyId === version.id}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Duplicate
                </button>
                <button
                  onClick={() => {
                    setRenamingId(version.id);
                    setRenameValue(version.versionName);
                  }}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Rename
                </button>
                {!version.isMaster && (
                  <button
                    onClick={() => handleDelete(version.id)}
                    disabled={busyId === version.id}
                    className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
