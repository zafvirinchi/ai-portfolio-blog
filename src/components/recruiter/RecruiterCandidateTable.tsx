"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { CANDIDATE_STATUSES, CandidateStatus } from "@/lib/ai/recruiter/candidate-schema";
import type { CandidateSummary } from "@/lib/ai/recruiter/candidate-types";

type SortKey = "ats" | "jdMatch" | "experience" | "latest" | "name";

type Props = {
  candidates: CandidateSummary[];
  loading: boolean;
  onStatusChange: (candidateId: string, status: CandidateStatus) => void;
  selectable?: boolean;
  selectedIds?: string[];
  onToggleSelect?: (candidateId: string) => void;
};

export default function RecruiterCandidateTable({ candidates, loading, onStatusChange, selectable, selectedIds, onToggleSelect }: Props) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [minExperience, setMinExperience] = useState("");
  const [minAts, setMinAts] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("latest");

  const filtered = useMemo(() => {
    const lowerSearch = search.trim().toLowerCase();

    let result = candidates.filter((candidate) => {
      if (statusFilter && candidate.status !== statusFilter) return false;
      if (minExperience && (candidate.experienceYears ?? 0) < Number(minExperience)) return false;
      if (minAts && (candidate.scores.atsScore ?? -1) < Number(minAts)) return false;

      if (lowerSearch) {
        const haystack = [candidate.name, candidate.currentRole, candidate.currentCompany, candidate.location, ...candidate.tags]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(lowerSearch)) return false;
      }

      return true;
    });

    result = [...result].sort((a, b) => {
      switch (sortKey) {
        case "ats":
          return (b.scores.atsScore ?? -1) - (a.scores.atsScore ?? -1);
        case "jdMatch":
          return (b.scores.jdMatch ?? -1) - (a.scores.jdMatch ?? -1);
        case "experience":
          return (b.experienceYears ?? -1) - (a.experienceYears ?? -1);
        case "name":
          return a.name.localeCompare(b.name);
        case "latest":
        default:
          return b.importedAt.localeCompare(a.importedAt);
      }
    });

    return result;
  }, [candidates, search, statusFilter, minExperience, minAts, sortKey]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, skills, company, location, tags..."
          className="min-w-[220px] flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
        />

        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm">
          <option value="">All statuses</option>
          {CANDIDATE_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>

        <input
          type="number"
          value={minExperience}
          onChange={(e) => setMinExperience(e.target.value)}
          placeholder="Min years exp."
          className="w-32 rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
        />

        <input
          type="number"
          value={minAts}
          onChange={(e) => setMinAts(e.target.value)}
          placeholder="Min ATS score"
          className="w-32 rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
        />

        <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm">
          <option value="latest">Sort: Latest Upload</option>
          <option value="ats">Sort: ATS Score</option>
          <option value="jdMatch">Sort: JD Match</option>
          <option value="experience">Sort: Experience</option>
          <option value="name">Sort: Name</option>
        </select>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">Loading candidates...</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
          No candidates match these filters yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                {selectable && <th className="px-3 py-3" />}
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Current Role</th>
                <th className="px-4 py-3">Experience</th>
                <th className="px-4 py-3">ATS Score</th>
                <th className="px-4 py-3">JD Match</th>
                <th className="px-4 py-3">Resume Score</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">Notice Period</th>
                <th className="px-4 py-3">Current Company</th>
                <th className="px-4 py-3">Expected Salary</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {filtered.map((candidate) => (
                <tr key={candidate.candidateId} className="hover:bg-slate-50">
                  {selectable && (
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds?.includes(candidate.candidateId) ?? false}
                        onChange={() => onToggleSelect?.(candidate.candidateId)}
                      />
                    </td>
                  )}
                  <td className="px-4 py-3 font-semibold text-slate-900">{candidate.name}</td>
                  <td className="px-4 py-3 text-slate-600">{candidate.currentRole ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{candidate.experienceYears ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{candidate.scores.atsScore ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{candidate.scores.jdMatch ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{candidate.scores.resumeScore ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{candidate.location ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{candidate.noticePeriod ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{candidate.currentCompany ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{candidate.expectedSalary ?? "—"}</td>
                  <td className="px-4 py-3">
                    <select
                      value={candidate.status}
                      onChange={(e) => onStatusChange(candidate.candidateId, e.target.value as CandidateStatus)}
                      className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
                    >
                      {CANDIDATE_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/recruiter/candidates/${candidate.candidateId}`}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
