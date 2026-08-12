# Phase 16 — Milestone 4 — Recruiter Job Workspace + Candidate Ingestion & Evaluation

## 1. Audit findings

**Migration status (§1 — verified before any code change):** `20260813000000_add_recruiter_persistence.sql` (Milestone 3) matches the intended schema (`recruiter_jobs`, `recruiter_candidates`, `recruiter_id` on both, `job_id` FK with `on delete set null`, indexes on `(recruiter_id, created_at desc)`, `notes`/`tags`/`status` constraints). **Live-checked against the actual Supabase instance** via a direct authenticated REST call (`GET /rest/v1/recruiter_jobs`): **the migration has NOT been applied** — `404 PGRST205 "Could not find the table 'public.recruiter_jobs' in the schema cache"`. Per this milestone's explicit instruction, no application code was changed to work around this, and no live authenticated persistence E2E validation is claimed anywhere in this document (see §22).

**Recruiter workflow dependency map** (persisted vs. ephemeral vs. computed), traced through `candidate-service.ts`/`recruiter-job-service.ts` before writing anything:

| Data | Nature |
|---|---|
| `resume_data`, `ats_score`, `jd_match_result`, `interview_readiness_score`, `insights`, `status`, `tags`, `notes`, `job_id` | **Persisted** (recruiter_candidates row) |
| `normalized_jd`, `job_description_text` | **Persisted** (recruiter_jobs row) |
| resumeService/jdMatchService/prepService's own records; `ephemeralPointers` (interview-readiness compatibility adapter) | **Ephemeral**, 2h TTL / process-local, never the source of truth for an already-imported candidate |
| `CandidateSummary` (incl. this milestone's `fitScore`/`fitLevel`/`evaluationStatus`), `RecruiterSummary` (incl. `recommendedAction`), `RankedCandidate`, `atsExplanation` | **Computed on every read**, pure functions of the persisted row (+ the attached job's `updatedAt` for staleness) — never stored |

Three genuine gaps existed against this milestone's actual asks: no duplicate-candidate detection, no way to know whether a candidate's evaluation was stale relative to its job's current JD, and no single explicit re-evaluate action. Everything else in §2's checklist (dashboard, job selection, import, parsing, ATS, JD match, Candidate Fit, ranking, profile, status, notes, comparison, exports) already existed from Milestones 1–3 and was left untouched.

## 2. Existing engines reused (none rebuilt)

Resume parser (`resumeService.analyzeUpload`), ATS engine (`resumeScorer`, read via its `.overall` only — a Milestone 3 decision, unchanged), JD parser (`jdParser.parse`), JD matcher (`jdMatchService.analyze` / `computeJdMatch`), Candidate Fit engine (`computeRankingScore` + `classifyCandidateFitLevel`, Milestone 1, **zero new weights**), deterministic Recruiter Summary (`buildRecruiterSummary`, Milestone 1), ranking + tie-breaker (`rankCandidates`, unmodified). One additional existing engine was newly reused this milestone: `resume-versions/dynamic/ats-explainability.ts`'s `explainJdAtsCategories()` (Phase 15's deterministic per-category ATS explainer) — see §9.

## 3. Evaluation pipeline

Unchanged shape from Milestone 3, now with staleness/duplicate awareness layered on top:

```
Resume upload → resumeService.analyzeUpload (parser, unmodified)
             → duplicate check (recruiterId + jobId + resume email, deterministic, no LLM)
             → [if a job is attached] jdMatchService.analyze (JD matcher, unmodified)
             → insert recruiter_candidates row (resume_data, ats_score, jd_match_result, evaluated_at)
             → read-time: fitScore/fitLevel (Candidate Fit, Milestone 1) + evaluationStatus (new) + recommendedAction (new) + atsExplanation (new) — all pure functions of the row, computed fresh every read
```

## 4. Persistence model

No change to Milestone 3's `recruiter_candidates`/`recruiter_jobs` tables beyond one additive column (see §21). `fitScore`/`fitLevel`/`evaluationStatus`/`recommendedAction`/`atsExplanation` are **never stored** — they're derived at read time from already-persisted fields, per this milestone's own explicit instruction (§12: "do not persist redundant computed ranking data if it can safely be recomputed deterministically," extended here to fit/status/explanation for the same reason).

## 5. Job relationship

Unchanged from Milestone 3: `job_id` nullable, `on delete set null`. New this milestone: `recruiter_jobs.updated_at` (already existed) is now actually *read* by `CandidateService` — batched once per `list()`/`getProfile()` call (never per-candidate) to compute each candidate's `evaluationStatus` against its own job's freshness, with no N+1 (see §18).

## 6. Candidate relationship

New: duplicate detection scoped to `(recruiterId, jobId, email)`. "Same candidate + same job" returns the existing candidate instead of creating a new row; "same candidate + different job (or unattached)" is allowed as a distinct row, matching the spec's own example table exactly. Detection is a single `.eq("recruiter_id", ...)`-scoped query per import batch, filtered in memory over that one recruiter's own candidate pool — it can never observe or reveal whether another recruiter already has the same person (verified by test, §20).

## 7. ATS

Unmodified engine. `ats_score` (the resume-only `.overall`, from Milestone 3) is unchanged. New: when a JD match exists, its 12 category scores are now explained per-category via the existing `explainJdAtsCategories()` (Phase 15) through a small field-name adapter (`toAtsCategoryScores()` — renames `JdMatchResult`'s fields to the shape that function already expects; no new scoring, purely a rename). The *general* (non-JD) explainer (`explainGeneralAtsCategories`) was deliberately **not** wired in — it needs the full `AtsScore` breakdown object, which Milestone 3 deliberately chose not to persist (only `.overall`); persisting it now just to unlock this would be scope creep against Milestone 3's own reasoned decision.

## 8. JD matching

Unmodified engine (`jdMatchService.analyze`/`computeJdMatch`). No second implementation. `matchCandidate()` and the new `reEvaluateCandidate()` both route through the exact same call.

## 9. Candidate Fit

`computeRankingScore` + `classifyCandidateFitLevel` (Milestone 1, unmodified, same 90/75/60 thresholds) are now called directly inside `toSummary()`, so `fitScore`/`fitLevel` appear on every `CandidateSummary` — not just inside a ranking list (`RankedCandidate`) as before. Same computation, same engine, now surfaced at the individual-candidate level the candidate profile page needs.

## 10. Recruiter summary

`buildRecruiterSummary()` (Milestone 1) now also returns `recommendedAction` — a fixed, deterministic lookup keyed by `CandidateFitLevel` (`recommendRecruiterAction()`, new in `candidate-summary.ts`), computed from the exact same `fitLevel` the summary was already deriving internally. No LLM call, no new weights — see §12's explicit instruction against rewriting the deterministic summary with an LLM.

## 11. Evaluation status

New, computed (not stored) `EvaluationStatus = "not_evaluated" | "complete" | "stale"`:
- `not_evaluated` — no job attached, or never matched.
- `stale` — matched, but the attached job's `updatedAt` is newer than the candidate's `evaluatedAt` (the JD changed since).
- `complete` — matched and up to date.

There is deliberately **no persisted "failed" state**. A failed match/evaluate attempt throws synchronously back to the caller (mapped to a 422/404/401 HTTP response) without touching the candidate row at all — the prior successful state (e.g. a real ATS score) is never overwritten or discarded (§16's explicit requirement). "Evaluation Failed" is therefore a **transient, request-level UI state** (an inline error banner, §17), not a candidate property — the honest reflection of a synchronous, non-queued evaluation architecture (see §15 and §24 for why "Evaluation In Progress" similarly isn't a stored state).

## 12. Stale evaluation

Detected via one additive, nullable column: `recruiter_candidates.evaluated_at` (new — see §21). `updated_at` (already existed) was checked first and found **insufficient**: it's bumped by every mutation (adding a note, changing status/tags), not only by an actual JD-match recomputation, so it cannot reliably answer "when was this candidate last evaluated against its job's current JD." `evaluated_at` is set only when `jd_match_result` is actually (re)computed — at import-with-job, explicit match, and re-evaluate.

## 13. Re-evaluation

New `candidateService.reEvaluateCandidate(candidateId, recruiterId)` and `POST /api/ai/recruiter/candidates/[candidateId]/evaluate`. Re-runs the match against the candidate's **own currently-attached job only** — never a client-supplied `jobId` — which structurally guarantees it can never violate the job/candidate/recruiter consistency invariant (§25): the job it evaluates against is always the same one already verified, at match time, to belong to this recruiter. It: derives recruiter identity from the session (never the client), re-verifies candidate ownership (`requireRecord`), re-verifies job ownership (`recruiterJobService.getJob`), reuses the existing matcher, persists the new snapshot, and updates `evaluated_at`. Throws a clear error if the candidate has no attached job yet ("Attach this candidate to a job before re-evaluating").

## 14. LLM call analysis

| Call | Required? | Cached / repeated? |
|---|---|---|
| Resume parsing (per uploaded file) | Required — no way to score/match without it | Once per file, unchanged from Milestone 1 |
| JD parsing (per job, at create/JD-edit time) | Required to normalize the JD | Once per job creation or JD-text edit only (unchanged from Milestone 3 — never re-parsed on every match) |
| JD matching + optimizer suggestions (per candidate-job match) | Required for JD Match/Candidate Fit/Recruiter Summary to have real data | Once per explicit match or re-evaluate action — **never automatic**; duplicate detection runs *before* this call so a detected duplicate never triggers a wasted match |
| Candidate insights (`generateInsights`) | Optional, explicit "Generate Insights" button | Unchanged from Milestone 1, on-demand only |

No new LLM call type was introduced this milestone. Duplicate detection, staleness, fit-level surfacing, recommended action, and ATS explanation are all deterministic — zero LLM calls, per §12/§14's explicit instructions. Re-evaluation costs exactly the same one JD-match call the existing "Match Against Job" action already cost — it's the same operation, just re-triggerable and now diagnosable (stale badge tells the recruiter *when* to use it, rather than guessing).

## 15. Security

Every new/changed method takes `recruiterId` resolved server-side via Milestone 2's `requireRecruiterId()` — never from the client. `reEvaluateCandidate` never accepts a `jobId` from the caller at all (by design, see §13). Duplicate detection is `recruiterId`-scoped so it can never leak whether another recruiter already has a given candidate.

## 16. IDOR protection

`GET`/`PATCH` candidate, `POST candidates/import`, `POST candidates/[id]/match`, `POST candidates/[id]/evaluate`, `GET`/`PATCH`/`DELETE` job — all tested for identical treatment of a non-owned vs. a nonexistent id (`CandidateNotFoundError`/`RecruiterJobNotFoundError`, both always 404, never a distinct 403 — Milestone 2's §14 convention, unchanged and re-verified for the new `/evaluate` route).

## 17. Partial failure handling

A failed JD match (e.g. the LLM call throws) leaves the candidate's `ats_score` (already persisted from import) completely untouched — the update to `jd_match_result`/`evaluated_at` simply never runs, so the row keeps its last-known-good state. The UI reflects this: the Scores panel always shows the real, persisted ATS score even when JD Match reads "Not Evaluated," and a failed evaluate/match action surfaces as an inline banner (`actionError`, new — deliberately separate from the page-level "candidate not found" error state, so a failed action can never make an already-loaded candidate look like it vanished).

## 18. Performance

`list()` now does exactly one extra query (`recruiterJobService.listJobs(recruiterId)`, batched once, mapped by job id) to compute every candidate's `evaluationStatus` — not one job lookup per candidate. `getProfile()` does one job lookup (only when the candidate has a `jobId`) — a single row, not a list scan. Duplicate detection is one `recruiter_id`-scoped query per import batch (not per file, and never scans other recruiters' data). No N+1 was introduced.

## 19. Accessibility

New interactive elements all carry descriptive `aria-label`s: the fit-level and evaluation-status badges, the "Re-evaluate Candidate" button, the "Job to match against" / "Select Job" selects (already labelled from Milestone 3, unchanged). The new inline evaluation-failure banner uses `role="alert"`. Score values fall back to the literal text "Not Evaluated" rather than a bare "0" or blank cell wherever a score doesn't exist yet (§17/§18's explicit requirement against misleading precision).

## 20. Tests — 11 new (41 total in the recruiter package), 686 total in the repo

```
npx vitest run
 Test Files  53 passed (53)
      Tests  686 passed (686)
```

New, against the real service code (mocked `supabaseAdmin` query builder, no live DB required — email is smuggled through the mock resume upload's buffer content so duplicate-detection tests can control it deterministically without touching the real parser):

- **Duplicate detection** (4 tests): same candidate + same job → detected, no second row; same candidate + different job → allowed; different recruiter + same email → isolated, never cross-leaked; no-email resume → never flagged (no stable identifier to compare, honestly skipped rather than guessed).
- **Stale evaluation + re-evaluation** (5 tests): fresh match is `complete`; editing the job's JD marks it `stale`; re-evaluating clears staleness and bumps `evaluatedAt`; re-evaluate rejects a non-owner; re-evaluate rejects a candidate with no attached job; an unmatched candidate is `not_evaluated` (never a fabricated `0%`).
- **Database consistency invariant** (1 test): a candidate's `jobId`, whenever set, always resolves to a job owned by that same candidate's `recruiterId`.
- **Ranking regression** (1 test): `computeRanking()` still orders descending by `rankingScore` and attaches a valid fit `level` to persisted, evaluated candidates.

## 21. Database changes

One migration: `20260814000000_add_recruiter_candidate_evaluation_status.sql` — `ALTER TABLE recruiter_candidates ADD COLUMN IF NOT EXISTS evaluated_at timestamptz` (nullable, additive, backward compatible, no destructive change, safe to re-run). No other schema change — `fitScore`/`fitLevel`/`evaluationStatus`/`recommendedAction`/`atsExplanation`/`duplicates` are all computed, never stored (§4/§11).

## 22. Live validation

Ran `npm run build`, then `npm run start`, `curl`'d against the real server, then killed it:

| Check | Result |
|---|---|
| `POST /api/ai/recruiter/candidates/fake-id/evaluate` (no auth) | **401** |
| `GET /api/ai/recruiter/jobs` (no auth) | **401** |
| `GET /recruiter` (no auth) | **307 → `/login?redirect=/recruiter`** |
| `GET /recruiter/candidates/fake-id` (no auth) | **307 → `/login?redirect=/recruiter`** |

Per §1's mandatory first step and repeated here honestly: **the Milestone 3 migration is not applied to the live Supabase database** (confirmed via a direct authenticated REST call — `404 PGRST205`), and this session has no real recruiter login credentials to complete an authenticated two-recruiter walkthrough even if it were. Both conditions the milestone requires before claiming authenticated E2E persistence validation are unmet, so **that validation is not claimed**. What was verified live is exactly what's possible without them: every route's auth gate (401/redirect) behaves correctly regardless of database state, and ownership/duplicate/staleness/re-evaluation/consistency behavior is verified directly against the real service code via the tests in §20, which exercise the identical `.eq("recruiter_id", ...)` / `.eq("job_id", ...)` code paths every route calls.

## 23. Known limitations

- **Migration not yet applied** (§1/§22) — an action item for the user, not a code gap; every recruiter route will 401 (auth-gated ones) or fail with a clear Postgres "table not found" error (the still-unauthenticated Recruitment Pipeline routes) until it's run.
- **"Evaluation In Progress" has no persisted state** — evaluation is synchronous within one request/response cycle in this architecture; there's no background job for a status to track. The UI's `busy` state during the request is the closest honest equivalent.
- **Duplicate detection depends on the resume having a parsed email** — a resume with no email (or an unparseable one) is never flagged as a duplicate, by design (§7's own "if no stable identifier exists" guidance) rather than guessed at.
- All of Milestone 3's known limitations (interview-readiness's ephemeral-window compatibility adapter, the unauthenticated Recruitment Pipeline, "Rewrite this resume" link staleness) are unchanged.

## 24. Recommended Milestone 5

Batch re-evaluation (§22 of this spec explicitly deferred it: "do not implement a large asynchronous queue system in this milestone") — once a real job queue exists elsewhere in the platform, "re-evaluate all candidates for this job" becomes a natural extension of `reEvaluateCandidate()`, called once per candidate. Alongside it, authenticating the Recruitment Pipeline (still the last major unauthenticated surface reading recruiter candidate data, per every prior milestone's own recommendation) would let its own job/candidate-attachment model gain the same staleness/re-evaluation semantics this milestone just built for the Recruiter Workspace.
