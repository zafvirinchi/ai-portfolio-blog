"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

import type { PlatformUserSummary } from "@/lib/billing/platform-admin-service";

// Phase 18 Milestone 3 — Scope A/G. Search needs client interactivity
// (unlike most existing /admin/* pages, which are static server-
// rendered dashboards) — this is the one new admin page in this
// milestone that's a client component for that reason; the per-user
// detail page stays server-rendered, matching the existing convention.
export default function PlatformUsersSearchPage() {
  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState("");
  const [results, setResults] = useState<PlatformUserSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (email.trim()) params.set("email", email.trim());
      if (userId.trim()) params.set("userId", userId.trim());
      if (role) params.set("role", role);

      const response = await fetch(`/api/admin/platform/users?${params.toString()}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Search failed");

      setResults(data.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed.");
      setResults(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Platform Users</h1>
        <p className="mt-1 text-sm text-slate-600">Search individual platform users by email, user id, or role — manage their roles, entitlement overrides, and billing state.</p>
      </div>

      <form onSubmit={handleSearch} className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <label htmlFor="search-email" className="mb-1 block text-xs font-semibold text-slate-500">
            Email contains
          </label>
          <input
            id="search-email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-label="Search users by email"
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
            placeholder="jane@example.com"
          />
        </div>
        <div>
          <label htmlFor="search-userid" className="mb-1 block text-xs font-semibold text-slate-500">
            Exact user id
          </label>
          <input
            id="search-userid"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            aria-label="Search users by exact user id"
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
            placeholder="uuid"
          />
        </div>
        <div>
          <label htmlFor="search-role" className="mb-1 block text-xs font-semibold text-slate-500">
            Role
          </label>
          <select
            id="search-role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            aria-label="Filter users by role"
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Any</option>
            <option value="JOB_SEEKER">Job Seeker</option>
            <option value="RECRUITER">Recruiter</option>
            <option value="ADMIN">Admin</option>
          </select>
        </div>
        <button type="submit" disabled={loading} aria-label="Search users" className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
          {loading ? "Searching..." : "Search"}
        </button>
      </form>

      {error && (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-sm">
          {error}
        </div>
      )}

      {results && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          {results.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-500">No users matched this search.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                  <th scope="col" className="px-5 py-3 font-semibold">Email</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Roles</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Created</th>
                  <th scope="col" className="px-5 py-3 font-semibold" />
                </tr>
              </thead>
              <tbody>
                {results.map((user) => (
                  <tr key={user.userId} className="border-b border-slate-50 last:border-0">
                    <td className="px-5 py-3 text-slate-700">{user.email ?? "—"}</td>
                    <td className="px-5 py-3 text-slate-500">{user.roles.join(", ")}</td>
                    <td className="px-5 py-3 text-slate-500">{new Date(user.createdAt).toLocaleDateString()}</td>
                    <td className="px-5 py-3 text-right">
                      <Link href={`/admin/platform/users/${user.userId}`} className="text-sm font-semibold text-blue-600 hover:underline">
                        Manage
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
