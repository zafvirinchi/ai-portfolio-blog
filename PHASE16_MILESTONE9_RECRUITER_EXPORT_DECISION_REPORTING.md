# Phase 16 — Milestone 9 Final Implementation Report

## 1. Audit Findings

**Migration status (checked live, first, before any code):** `recruiter_jobs`/`recruiter_candidates` both still return `404 PGRST205 "table not found in the schema cache"`. **6th consecutive milestone (M4–M9) confirming this, unchanged.**

**Existing export engine:** `candidate-export.ts` (Phase 13/Milestone 5) already provides CSV, XLSX, and PDF rendering for a candidate list, plus a single-candidate PDF report — one file, every format, exactly the "no second export engine" precedent this milestone had to preserve. `LIST_COLUMNS` already covered 15 recruiter-facing fields (Name, Current Role, Experience, ATS, JD Match, Resume Score, Candidate Fit, Fit Level, Evaluation Status, Recommended Action, Location, Notice Period, Current Company, Expected Salary, Status).

**Existing CSV sanitization:** `neutralizeFormulaInjection()`/`csvEscape()` (Milestone 5, §19) already prefix a leading apostrophe on any value starting with `=`, `+`, `-`, or `@`, applied uniformly to every column via `LIST_COLUMNS.map(col => csvEscape(...))`. **Reused verbatim, not reimplemented** — every new column automatically inherits this protection by virtue of being added to the same `LIST_COLUMNS` array.

**XLSX exporter:** `renderCandidateListExcel()` writes every cell as a plain JS string via `sheet.addRow({...})`; exceljs serializes these as OOXML shared-string cells, never formula cells (`{formula: ...}` is never constructed anywhere in this codebase). **Confirmed safe by construction**, and now backed by a round-trip regression test (§15) rather than asserted from documentation alone. Per §11's own instruction, nothing was changed here.

**Comparison:** `candidate-comparison.ts`'s `buildComparisonTable()` (deterministic) + `generateComparisonRecommendation()` (one LLM call) already exist, wired through `candidateService.compare()`, which already enforces the Milestone 5 same-job restriction and Milestone 2-era ownership checks. **No export existed for this result.**

**Analytics/decision history:** `recruiter-analytics.ts` (Milestones 6/7/8) already computes `OverallAnalytics`, `ConversionRates`, `statusDistribution`, and (Milestone 8) `InterviewFunnelMetrics` from real, persisted data — but exposed only two raw rate percentages (`shortlistToInterviewRate`, `interviewToHireRate`), not the underlying cohort COUNTS ("Interviewed", "Hired After Interview") this milestone's Interview Outcome section needs. **No report EXPORT existed for any of this** — only the live `RecruiterAnalyticsTab` UI.

**CandidateStatus / decision_history:** unchanged since Milestone 7; already sufficient for every "Decision Breakdown" bullet this milestone asks for. No new status.

**Email/Phone:** `CandidateSummary` (the shape every export/report reads) didn't surface `resume.contact.email`/`.phone`, even though `toSummary()` already reads that same `resume.contact` object into memory for `.name`/`.location`. **A one-line gap, not a missing feature.**

**Job title/company on export rows:** the candidate table UI already resolves this via a `jobById` map (Milestone 5/8); the export renderer had no equivalent.

**Skills Match / Missing Skills / Education Match / Certification Match:** `JdMatchResult` already computes `matchedSkills`, `missingSkills`, `educationScore`, and `certificationScore` per candidate — but `CandidateSummary` deliberately omits the full match object (Milestone 4's own design decision), and only `certificationScore` survives onto `CandidateScoreBreakdown`. `educationScore` has no home on the summary at all. Milestone 6 already established the fix pattern for exactly this shape of gap: `listMissingSkills()`, a tiny lightweight `select("id, jd_match_result")` query. **No JD matcher change needed — only a sibling lightweight query.**

## 2. Existing Functionality Reused

- `neutralizeFormulaInjection()`/`csvEscape()` (Milestone 5) — every new CSV column, unchanged.
- `renderCandidateListExcel()`'s string-cell-only writing discipline — unchanged, only documented and tested.
- `candidateService.compare()`'s ownership + same-job validation — extracted into `requireComparableCandidates()` and reused by both `compare()` (unchanged behavior) and the new export path (§7).
- `bulkUpdateStatus()`'s atomic "fetch all requested ids, reject the whole operation on any count mismatch" pattern — reused verbatim for `listByIds()` (§3).
- `listMissingSkills()`'s "select id + jd_match_result, scoped to recruiter/job" shape — the pattern (not the function) reused for `listCandidateMatchDetails()`.
- `listDecisionHistories()` (Milestone 8) — reused as-is for "Last Decision Date"/"Last Decision Note" and for the Hiring Decision Report's interview funnel.
- `getRecruiterAnalytics()` (Milestones 6/7/8) — the Hiring Decision Report is a pure rendering of its output; not one metric was recomputed by a second implementation.
- `buildInterviewEligibility()` (Milestone 8) — reused directly for the "Interview Eligible" export column.
- `requireRecruiterId()` / `handleRecruiterRouteError()` — the export route uses both unchanged.

## 3. Genuine Gaps

1. `email`/`phone` on `CandidateSummary` (zero-cost, data already in memory).
2. `Job`/`Job Company` export columns (needs the recruiter's jobs threaded into the export context).
3. `Skills Match`/`Education Match` export columns + a new lightweight query to source them (`listCandidateMatchDetails`).
4. `Interview Readiness`/`Interview Eligible`/`Decision`/`Last Decision Date`/`Last Decision Note` export columns.
5. Atomic, ownership-verified "Export Selected" (`listByIds`).
6. A deterministic Comparison export (CSV/XLSX) that does **not** re-invoke the LLM-backed recommendation.
7. A deterministic Hiring Decision Report (CSV/XLSX), including two new raw interview-funnel counts (`interviewedCohortCount`, `hiredAfterInterviewCount`) needed to report "Interviewed"/"Hired After Interview"/"Awaiting Interview Decision" distinctly from the existing rate percentages.
8. UI actions to trigger all of the above from the existing recruiter workspace tabs.

## 4. Files Added

None. Every genuine gap fit inside an existing file (extending `candidate-export.ts`, `candidate-service.ts`, `recruiter-analytics.ts`/-types/-service, and the existing `/api/ai/recruiter/export` route) — no new export engine, no new analytics module, no new route file.

## 5. Files Modified

```
src/lib/ai/recruiter/candidate-types.ts            (email/phone on CandidateSummary)
src/lib/ai/recruiter/candidate-service.ts           (toSummary email/phone; listByIds; listCandidateMatchDetails;
                                                       requireComparableCandidates extraction; buildComparisonExport;
                                                       exportComparisonCsv/Excel; buildExportContext;
                                                       exportCandidateListCsv/Excel signature extension)
src/lib/ai/recruiter/candidate-export.ts            (CandidateExportContext; widened LIST_COLUMNS; new columns;
                                                       renderComparisonCsv/Excel; renderHiringDecisionReportCsv/Excel)
src/lib/ai/recruiter/recruiter-analytics-types.ts   (InterviewFunnelMetrics: +interviewedCohortCount, +hiredAfterInterviewCount)
src/lib/ai/recruiter/recruiter-analytics.ts         (computeInterviewFunnelMetrics returns the 2 new raw counts)
src/lib/ai/recruiter/recruiter-analytics-service.ts (exportHiringDecisionReportCsv/Excel)
src/app/api/ai/recruiter/export/route.ts            (type=candidates|hiring-report|comparison; candidateIds param)
src/components/recruiter/RecruiterCandidateTable.tsx (Export Selected CSV/XLSX links)
src/components/recruiter/RecruiterComparisonTab.tsx  (Export Comparison CSV/XLSX links)
src/components/recruiter/RecruiterReportsTab.tsx     (Export Hiring Report CSV/XLSX links; aria-labels on existing links)
src/lib/ai/recruiter/candidate-export.test.ts        (new tests, see §10)
src/lib/ai/recruiter/candidate-service.test.ts       (new tests, see §10)
src/lib/ai/recruiter/candidate-interview.test.ts     (fixture: +email/phone)
src/lib/ai/recruiter/candidate-ranking.test.ts       (fixture: +email/phone)
src/lib/ai/recruiter/recruiter-analytics.test.ts     (fixture: +email/phone)
```

## 6. API Changes

`GET /api/ai/recruiter/export` (existing route, extended — no new route file):

| Param | Values | Notes |
|---|---|---|
| `type` | `candidates` (default) \| `hiring-report` \| `comparison` | selects the renderer |
| `format` | `csv` \| `excel` \| `pdf` (candidates only) | unchanged |
| `jobId` | job id | unchanged; `candidates`/`hiring-report` only |
| `candidateIds` | comma-separated ids | new; `candidates` (§3, "Export Selected", takes precedence over `jobId`) or `comparison` (required, 2-5 ids) |

`candidateService.exportCandidateListCsv/Excel(recruiterId, {jobId?, candidateIds?})` — signature widened from a positional `jobId` to an options object (only internal callers existed; no breaking external change). `candidateService.exportComparisonCsv/Excel`, `candidateService.listByIds`, `candidateService.listCandidateMatchDetails`, `candidateService.buildComparisonExport` are new methods. `recruiterAnalyticsService.exportHiringDecisionReportCsv/Excel` are new orchestrator functions.

## 7. UI Changes

- **Candidates tab** (`RecruiterCandidateTable`): "Export Selected (CSV)" / "Export Selected (Excel)" links added to the existing bulk-action bar, enabled whenever one or more candidates are checked.
- **Comparison tab**: "Export Comparison (CSV)" / "Export Comparison (Excel)" links appear once a comparison result is on screen.
- **Reports tab**: new "Hiring Decision Report" card with CSV/Excel export links, alongside the existing candidate-list export card (now with explicit `aria-label`s: "Export candidates as CSV/XLSX/PDF").

No new tab was added; no existing tab was redesigned.

## 8. Security Decisions

- Formula injection: unchanged reuse of Milestone 5's `csvEscape()`/`neutralizeFormulaInjection()` — every new column passes through the same function, verified by new tests (§10) including one exercising a `=`-prefixed value in a NEW column (Job title).
- XLSX: no candidate-controlled value can become a live formula (audited + regression-tested, §1/§10) — no code change was needed or made.
- Sensitive fields: no raw internal ids (candidateId/recruiterId/jobId), no auth tokens, no prompt/LLM payloads are ever written to an export row — the same discipline the pre-existing `LIST_COLUMNS` already had, preserved for every new column.
- Every export/report method routes through `requireRecruiterId()` (server-derived only) and an existing ownership check (`listByIds`, `requireComparableCandidates`, `getRecruiterAnalytics`'s `recruiterJobService.getJob()`).

## 9. Ownership Model

- **Selected-candidate export (§3):** `listByIds()` mirrors `bulkUpdateStatus()`'s exact atomic pattern — fetches all requested ids scoped by `recruiter_id`; if the returned count doesn't match the requested count, throws `CandidateNotFoundError` and returns nothing. A foreign id and a nonexistent id produce the identical error (verified by test).
- **Comparison export (§7):** reuses `requireComparableCandidates()` — the same per-id `requireRecord()` ownership check and same-job restriction `compare()` already enforced, now shared rather than duplicated.
- **Hiring report / job-scoped export:** `getRecruiterAnalytics()`'s existing `recruiterJobService.getJob()` ownership check (unchanged) rejects a foreign `jobId` with `RecruiterJobNotFoundError` → 404, before any data is read.
- Every rejection path returns the same 404 (via `handleRecruiterRouteError`, now used by the export route too) — never a distinct 403, never a hint about which id/job was the problem.

## 10. Export Design

Every render function takes already-fetched, already-ownership-verified data (`CandidateSummary[]`, `ComparisonRow[]`, `RecruiterAnalytics`) — none of them perform I/O themselves. A new `CandidateExportContext` (optional, defaults to `{}`) carries the three small lookup maps (`jobsById`, `matchDetailsByCandidateId`, `decisionHistoryByCandidateId`) that `LIST_COLUMNS`' new getters need beyond a bare summary; `candidateService.buildExportContext()` builds this once per export call (three recruiter-scoped queries, never one per candidate). Every field that isn't derivable from real data renders as an empty cell (CSV/XLSX convention already established by the existing columns) — never a fabricated value.

## 11. Testing

```
Before:    779
Added:     21
After:     800
Failures:  0
```

New coverage: `candidate-export.test.ts` (+13 — new columns render real data or empty strings never fabricated values; Email/Phone sourced directly from CandidateSummary; Job/Skills Match/Missing Skills/Education Match/Last Decision Date+Note sourced from the export context, with Last Decision Date correctly picking the MOST RECENT history entry; Interview Eligible reuses `buildInterviewEligibility()`; an XLSX round-trip proving a `=`-prefixed candidate name is written and re-read as a literal string, never a formula; comparison CSV/XLSX render the exact same table plus Status/Interview Readiness supplementary rows; hiring-report CSV sections and the derived "Awaiting Interview Decision" count; a `null` conversion rate renders "Not available", never a fabricated 0%). `candidate-service.test.ts` (+8 — `listByIds` ownership success/foreign-rejection/enumeration-protection; job-scoped and candidateIds-scoped `exportCandidateListCsv`; `buildComparisonExport`/`exportComparisonCsv` proven to never call the mocked OpenAI client, plus same-job-restriction reuse; `listCandidateMatchDetails` recruiter/job scoping).

## 12. Migration Status

**No new migration was added.** Every genuine gap fit inside already-persisted `recruiter_candidates` columns (`jd_match_result`, `decision_history`) — nothing needed a new column. Live Supabase check (before writing any code, repeated at completion): `recruiter_jobs`/`recruiter_candidates` are both still `404 PGRST205` — **unapplied**, unchanged from Milestones 4–8. No application-code workaround was written.

## 13. Live Validation

`npm run build` → `npm run start` → `curl` against the real server → server killed via `taskkill`:

| Check | Result |
|---|---|
| `GET /api/ai/recruiter/export?format=csv` (no auth) | **401** |
| `GET /api/ai/recruiter/export?format=csv&candidateIds=a,b` (no auth) | **401** |
| `GET /api/ai/recruiter/export?type=hiring-report&format=csv` (no auth) | **401** |
| `GET /api/ai/recruiter/export?type=hiring-report&format=excel` (no auth) | **401** |
| `GET /api/ai/recruiter/export?type=comparison&format=csv&candidateIds=a,b` (no auth) | **401** |
| `GET /recruiter` (no auth) | **307 → `/login?redirect=/recruiter`** |

```
Authenticated persistence/export E2E: BLOCKED — required recruiter migrations are not applied to the live database.
```

Every ownership/atomicity/rendering claim in this report is instead verified directly against the real service and rendering code via the 21 new tests in §11.

## 14. Known Limitations

- All three recruiter-persistence migrations remain unapplied (§12) — unchanged, standing manual action item.
- The comparison export omits Missing Skills/Education/Certifications per candidate — `ComparisonResult`/`CandidateSummary` don't carry the full JD-match object, and fetching it via an extra per-comparison query was judged out of this milestone's minimal-diff scope; Status and Interview Readiness were added instead since both are already on `CandidateSummary` at zero cost. A future milestone could extend `buildComparisonExport()` to also pull `listCandidateMatchDetails()` for the compared ids if this proves needed.
- The Hiring Decision Report's Top Candidates section omits per-candidate Missing Skills for the same reason (`RankedCandidate.summary` doesn't carry it).
- "Export Selected" and comparison export pass candidate ids as a comma-separated GET query parameter — fine for the realistic recruiter-workspace scale (dozens of candidates), but would need a POST body if candidate lists ever grew large enough to risk URL length limits.
- The Interview Outcome / Hiring Decision Report's cohort counts inherit Milestone 8's own limitation: `decision_history` only exists going forward from Milestone 7, so candidates whose stage changes all predate it won't contribute to `interviewedCohortCount`/`hiredAfterInterviewCount`.

## 15. Protected Architecture Untouched

`interview-prep/*`, `mock-interview/*`, ConversationService, PortfolioChain, Planner, Tool Registry, LangGraph/multi-agent architecture, the ATS engine, JD matcher (`jd-matcher.ts`, `jd-service.ts`), the resume optimizer, `candidate-ranking.ts`'s scoring logic itself, and `candidate-score.ts` were not modified this milestone. `recruiter-analytics.ts` (flagged in the spec as "modify only if absolutely required and explicitly justified") was extended — not rewritten — with two additional return fields on an existing pure function, directly required by §8's explicit "Interviewed"/"Hired after interview" counts; no metric was recomputed by a second implementation. `candidateService.compare()`'s external behavior (including its one LLM call) is byte-for-byte unchanged; only its internal validation was extracted into a shared private helper.

## Recommended Next Milestone

Once migrations are applied and real authenticated login is available, the standing deferred two-recruiter live walkthrough (six consecutive milestones deferred by infrastructure alone) should finally run end-to-end, including exercising every new export/report against real persisted data. Functionally, extending `buildComparisonExport()`/the Hiring Report's Top Candidates section with per-candidate Missing Skills (§14) is the most natural small follow-up; a recruiter-facing "scheduled/recurring export" (e.g., a weekly hiring report emailed automatically) would be a reasonable larger Milestone 10 candidate if the product direction calls for it.
