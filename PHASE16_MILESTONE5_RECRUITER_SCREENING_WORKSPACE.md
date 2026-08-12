# Phase 16 — Milestone 5 — Recruiter Screening Workspace, Shortlisting & Candidate Management

## 1. Audit

Before writing code, traced the full existing recruiter stack: dashboard, job workspace, candidate list/table, candidate profile, `CandidateService`, `RecruiterJobService`, ranking, status, notes, comparison, exports, and the current UI's filtering/sorting.

**Migration status (§2 — checked first, using the exact filenames in the repo):** `20260813000000_add_recruiter_persistence.sql` and `20260814000000_add_recruiter_candidate_evaluation_status.sql`. Re-verified live via direct authenticated REST calls to `GET /rest/v1/recruiter_jobs` and `GET /rest/v1/recruiter_candidates`: both still return `404 PGRST205 "table not found in the schema cache"`. **Neither migration is applied.** No application code was changed to work around this. **Live persistence E2E validation remains blocked until the migrations are applied** — this is repeated verbatim in §19 and is not contradicted anywhere else in this document.

**What already existed, in more depth than expected:**
- `RecruiterCandidateTable.tsx` already had client-side search (name/role/company/location/tags), a status filter, min-experience and min-ATS filters, and sort-by ats/jdMatch/experience/name/latest — plus unused `selectable`/`selectedIds`/`onToggleSelect` props (bulk-action groundwork that was never wired to anything).
- `RecruiterComparisonTab.tsx` and `candidateService.compare()` already existed (2–5 candidates, deterministic comparison table + one LLM narrative) but had **no same-job restriction**.
- `candidate-export.ts` already had CSV/Excel/PDF list export and a single-candidate PDF report, but `csvEscape()` had **no formula-injection protection**, and the column set predated Milestone 4's fit/evaluation fields.
- `CANDIDATE_STATUSES` already fully covers the minimal recruiter workflow this milestone asks for (`Pending Review` ≈ New/Review, plus `Shortlisted`/`On Hold`/`Rejected` exactly as named, plus extra granularity from Phase 13) — **no schema or enum change was made**, per §8's "if already present, preserve them."
- The Candidates tab showed every candidate from every job mixed together, with no job-centric header or job filter at all.

Genuine gaps (the only things built this milestone): job-centric filtering/header, Fit-level and Evaluation-status filters, two new sort keys, bulk status actions (service + route + UI), the same-job comparison restriction, CSV formula-injection protection, and new screening-relevant columns/export fields. Everything else — ATS, JD matching, Candidate Fit, ranking, the deterministic recruiter summary, notes, single-candidate status changes, exports themselves — is reused verbatim.

## 2. Existing functionality reused (nothing rebuilt)

`updateStatus()` (Milestone 1) is the only status-mutation path — `bulkUpdateStatus()` is a batched wrapper around the exact same semantics, not a second state service. `compareRanked`/`computeRankingScore`/`classifyCandidateFitLevel` (Milestone 1) are unchanged; the new "Candidate Fit" sort key reads the same `fitScore` these already compute. `renderCandidateListCsv`/`Excel`/`Pdf` (Phase 13) are extended, not replaced. `candidateService.compare()`/`generateComparisonRecommendation` (Phase 13) are extended with one new check, not rewritten.

## 3. Candidate workspace

The Candidates tab's table now shows a job-context summary card (title, company, candidate count, average JD Match, average ATS) whenever a specific job is selected via the new job filter — matching §3's mock, built entirely from data already in memory (no new fetch). "All Jobs" remains the default view.

## 4. Search

Deterministic, client-side, over already-persisted `CandidateSummary` fields: name, current role, current company, location, tags. No LLM, no vector search — per §5's explicit prohibition.

## 5. Filters

New: Job, Fit Level (Strong/Good/Moderate/Low), Evaluation Status (Evaluated/Stale/Not Evaluated — no "Failed" option, since that state is never persisted, see Milestone 4 and §11 below), minimum JD Match %. Existing, unchanged: Status, minimum years experience, minimum ATS score, free-text search. Experience filtering only ever compares against `experienceYears` already parsed from the resume — never a fabricated value.

## 6. Sorting

Two new keys — **Candidate Fit** (`fitScore`, descending) and **Recently Evaluated** (`evaluatedAt`, descending) — added alongside the existing ATS/JD Match/Experience/Recently Added/Name keys. Sorting is explicitly a UI ordering choice over fields Milestone 1's ranking engine already computed; it never recomputes a score or competes with the separate "Ranking & Recommendations" panel (`computeRanking()`/`rankCandidates()`, untouched).

## 7. Status workflow

Unchanged. `CANDIDATE_STATUSES` already satisfied the minimal workflow this milestone asks for; nothing was added or removed.

## 8. Shortlisting

Per-candidate quick-action buttons ("Shortlist" / "Reject") were added to each table row alongside the existing full-status dropdown — both call the same `updateStatus()`-backed `PATCH .../status` route, unchanged from Milestone 1.

## 9. Bulk actions

New: multi-select checkboxes (select-all included) + a bulk action bar (Shortlist Selected / Move to Review / Put On Hold / Reject Selected) appearing only when candidates are selected. Backed by a new `candidateService.bulkUpdateStatus(recruiterId, candidateIds, status)` and `POST /api/ai/recruiter/candidates/bulk-status`.

**Ownership is verified for every id before any row is written.** The service first `SELECT`s all requested ids scoped to `recruiter_id`; if the returned count doesn't match the requested count (meaning at least one id is missing or owned by someone else), it throws `CandidateNotFoundError` and the `UPDATE` never runs — not even for the ids that *were* owned. Verified by test: a 3-candidate batch (2 owned + 1 belonging to another recruiter) leaves all 3 rows, including the 2 owned ones, completely untouched.

## 10. Candidate comparison

**Same-job restriction (§17), the one functional gap found in an otherwise-complete feature:** `compare()` now collects every selected candidate's `jobId` into a set; if more than one distinct value appears (including a mix of a real job and "unattached"), it throws `"Candidates must belong to the same job to compare."` before any LLM call runs. Comparing candidates that are *all* unattached (no job for any of them) is allowed — their ATS/resume-only scores are still on a consistent basis. The comparison picker UI now shows each candidate's job name so a recruiter can avoid the mismatch before submitting, and the resulting error surfaces as a normal inline banner (`role="alert"`).

## 11. Export

CSV/Excel/PDF list exports (Phase 13) now include Candidate Fit, Fit Level, Evaluation Status, and Recommended Action columns, and accept an optional `?jobId=` to scope the report to one job's candidates — a new "Candidate Screening Report" job selector was added to the Reports tab. Nothing new was exported beyond already-computed candidate fields; no raw LLM prompts, tokens, or auth material were ever part of this export and remain absent.

**CSV formula-injection protection (§19):** any cell value beginning with `=`, `+`, `-`, or `@` is now prefixed with a literal leading apostrophe before the existing comma/quote/newline escaping runs — the standard mitigation every major spreadsheet app honors (renders as literal text, never evaluates what follows). The `.xlsx` export was audited and found inherently safe by construction: `exceljs` writes plain string values as typed string cells in the OOXML format (no `<f>` formula element), so Excel never re-interprets them as formulas on open — no equivalent fix was needed there, and none was added.

## 12. Pagination

**Audited, not implemented — documented per §20's own explicit escape hatch.** `list()` currently loads a recruiter's full candidate set per call. True server-side pagination that composes correctly with the existing filters/sort would require moving search/status/fit/evaluation filtering and sorting server-side too (pagination and client-side filtering don't compose: filtering page N's results can't reproduce "give me matching candidates 26–50 across the whole set"). That is a materially larger architecture change than this milestone's genuine-gap scope, and recruiter-owned candidate pools are bounded by one recruiter's own import activity, not multi-tenant scale — not the kind of dataset server-side pagination was designed to solve here. **One real, lower-risk win was implemented instead:** server-side job filtering (`list(recruiterId, {jobId})`), which is the single highest-value way to shrink what a recruiter loads at once, and composes cleanly since it's a hard partition, not a soft filter.

## 13. Performance

`list()`'s new `jobId` option filters at the database query level (`.eq("job_id", ...)`), not by fetching everything and discarding rows in JS. The job-context summary card and the Dashboard tab's job-workspace card both compute from the already-fetched `candidates` array in memory — no new per-selection network round-trip. No N+1 was introduced: bulk status update is two queries total (one ownership-check `SELECT ... IN (...)`, one `UPDATE ... IN (...)`), not one per candidate. No JD re-parsing, no new LLM calls, no repeated resume parsing.

## 14. Security

Every new/changed method and route resolves `recruiterId` server-side via the existing `requireRecruiterId()` — never from the client. `bulkUpdateStatus` never trusts a client-asserted ownership claim; it re-derives it from the database on every call.

## 15. IDOR protection

Tested directly against the real service code (§17): non-owned bulk-update, non-owned comparison inclusion, and job filtering are all confirmed to behave identically to a nonexistent resource — `CandidateNotFoundError`, always 404, never a distinct 403, matching every prior milestone's convention. Single-candidate status/notes/list/get IDOR coverage is unchanged from Milestones 2–4 and continues to pass.

## 16. Accessibility

New interactive elements all carry descriptive `aria-label`s: per-candidate "Shortlist \[Name\]" / "Reject \[Name\]" / "Select \[Name\] for bulk actions" / "Select \[Name\] for comparison" / "Change status for \[Name\]", the "Select all visible candidates" checkbox, every new filter/sort `<select>`, and the bulk action bar's buttons. The new comparison error banner uses `role="alert"`. Scores that don't exist yet render as the literal text "Not Evaluated" rather than a blank or "0" cell.

## 17. Tests — 17 new (67 total in the recruiter package), 703 total in the repo

```
npx vitest run
 Test Files  54 passed (54)
      Tests  703 passed (703)
```

New, against the real service code (mocked `supabaseAdmin` query builder — extended to support `.update().eq().in().select()` for the bulk path):

- **Job-scoped `list()`** (1 test): `{jobId}` returns exactly that job's candidates.
- **Bulk status update** (4 tests): all-owned batch succeeds; a batch with one non-owned id is rejected **in full**, with the owned candidates' rows verified byte-for-byte unchanged afterward (§24's exact regression scenario); a nonexistent id in the batch produces the identical error as a non-owned one; a forged `recruiterId` can never bulk-update someone else's candidates.
- **Comparison same-job restriction** (4 tests): rejects a cross-job selection with the exact documented message; allows same-job candidates; allows all-unattached candidates; a candidate belonging to another recruiter can never be smuggled into a comparison (IDOR).
- **CSV formula injection** (8 tests, new `candidate-export.test.ts`): `=`, `+`, `-`, `@`-prefixed values are neutralized; a value merely *containing* one of those characters (not starting with it) is untouched; injection-protection composes correctly with existing comma/quote escaping; ordinary names pass through unmodified; the new screening columns are present with correct values.

## 18. Database changes

**None.** No migration was added this milestone — the audit found the existing Milestone 3/4 schema (`recruiter_jobs`, `recruiter_candidates`, `evaluated_at`) already sufficient for every genuine gap identified (job filtering is a query-level `.eq()`, not a schema change; bulk status reuses the existing `status` column; nothing else persists).

## 19. Live validation

Ran `npm run build`, then `npm run start`, `curl`'d against the real server, then killed it:

| Check | Result |
|---|---|
| `POST /api/ai/recruiter/candidates/bulk-status` (no auth) | **401** |
| `GET /api/ai/recruiter/candidates?jobId=fake` (no auth) | **401** |
| `GET /api/ai/recruiter/export?jobId=fake` (no auth) | **401** |
| `GET /recruiter` (no auth) | **307 → `/login?redirect=/recruiter`** |

**Authenticated persistence E2E remains blocked by missing Supabase migrations** (§2) — re-confirmed live before any code was written and unchanged at the end of this milestone. No two-recruiter walkthrough (Recruiter A creates/shortlists/compares/exports, Recruiter B is denied, A's data persists across reload) was attempted or is claimed; both preconditions the milestone requires before that validation (applied migrations, working authenticated login in this environment) are absent. What's verified live is exactly what's possible without them — every route's auth gate — and everything else (bulk ownership rejection, same-job restriction, CSV safety, job-scoped querying) is verified directly against the real service code via the tests in §17.

## 20. Known limitations

- **Both migrations remain unapplied** — an action item for the user, not a code gap.
- **Pagination is deferred**, with reasoning (§12) — job-scoped filtering was implemented instead as the higher-value, lower-risk improvement.
- All limitations from Milestones 2–4 (Recruitment Pipeline's own lack of authentication, `generateInterviewReadiness`'s ephemeral-window compatibility adapter, "Rewrite this resume" link staleness) are unchanged and out of this milestone's scope.

## 21. Recommended Milestone 6

Once the migrations are applied and a real authenticated two-recruiter walkthrough becomes possible, that live validation should be the first thing the next milestone completes (it has been deferred across three consecutive milestones now purely by infrastructure, not by choice). Beyond that: batch re-evaluation for stale candidates (explicitly deferred again this milestone, per §11's instruction not to build a queue architecture) is the natural next step now that the screening list can already surface *which* candidates are stale and select them in bulk — only the "re-evaluate all selected" action itself remains.
