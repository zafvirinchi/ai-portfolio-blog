# Phase 16 — Milestone 3 — Persistent Recruiter Jobs & Candidate Records

## 1. Architecture audit

Confirmed before writing any code:

- No job/candidate persistent table existed anywhere in `supabase/migrations/`. The only prior persistence precedent in the AI feature set is `resume_versions` (Phase 13), which established the "snapshot already-computed engine output into a row, never re-derive it" pattern this milestone follows.
- `CandidateService` (Phase 13 M8, scoped to recruiter ownership in Phase 16 M2) was a singleton in-memory `Map`, with candidates referencing `resumeService`/`jdMatchService`/`prepService` records by ephemeral id rather than storing their content.
- The single per-recruiter `activeJobDescriptions` Map (Milestone 2's own interim fix for the original global-shared JD bug) had no persistence and no real "Job" entity — just a text string.
- A **separate** `jobService` (`src/lib/ai/recruitment/job-service.ts`) already exists — Phase 13 Milestone 9's Recruitment Pipeline "Job" entity. It is a different concept (department/location/employmentType/hiringManager fields, no recruiter-identity ownership, still fully unauthenticated per Milestone 2's audit) and was **not** reused or touched — reusing it would have imported the Recruitment Pipeline's own unauthenticated actor model into the now-secured Recruiter Workspace.
- `job-description/jd-schema.ts`'s `JobDescription` (the Phase 13 JD parser's structured output) and `jd-parser.ts`'s `jdParser.parse()` are the existing, unmodified JD-parsing engine — reused directly for the new `recruiter_jobs.normalized_jd` column.
- `candidate-score.ts`'s `computeScoreBreakdown()` only ever read `.overall` off the full `AtsScore` object it was passed — confirmed by grep before deciding to persist just that integer rather than the whole ATS breakdown.

## 2. New schema (`supabase/migrations/20260813000000_add_recruiter_persistence.sql`)

Two tables, following `resume_versions.sql`'s exact conventions (raw SQL, `create table if not exists`, `gen_random_uuid()`, `references auth.users(id)`, no RLS, indexed on `recruiter_id, created_at desc`):

**`recruiter_jobs`** — `id`, `recruiter_id`, `title`, `company`, `job_description_text`, `normalized_jd` (jsonb — the parsed `JobDescription`, cached so every candidate matched against this job doesn't re-parse the same text), `status` (`Active`/`Closed`/`Archived`), timestamps.

**`recruiter_candidates`** — `id`, `recruiter_id`, `job_id` (nullable, `on delete set null`), `filename`, `resume_id` (best-effort, see §8), `resume_data` (jsonb — full `Resume` snapshot), `ats_score` (integer), `jd_match_result` (jsonb — full `JdMatchResult` snapshot), `interview_readiness_score` (integer), `insights` (jsonb), `status` (check-constrained to the existing `CANDIDATE_STATUSES`), `tags` (text[]), `notes` (jsonb), `notice_period`, `expected_salary`, timestamps.

No existing table needed to be reused or extended — nothing in the schema modeled a recruiter-owned job or candidate before this.

## 3. Recruiter ownership

Every column and every query is scoped by `recruiter_id`, resolved server-side via Milestone 2's `requireRecruiterId()` — never accepted from the client. This migration adds **no new auth mechanism**; it reuses the exact identity model Milestone 2 established.

## 4. Job persistence

`RecruiterJobService` (new, `recruiter-job-service.ts`) — `createJob`/`listJobs`/`getJob`/`updateJob`/`deleteJob`, all `.eq("recruiter_id", ...)`-scoped, mirroring `resumeVersionService`'s row/record mapping convention exactly. `createJob` calls `jdParser.parse()` once (the existing Phase 13 JD parser, one LLM call) to populate `normalized_jd`. `updateJob` only re-parses when `jobDescriptionText` actually changed — editing title/company/status never triggers a second LLM call. `RecruiterJobNotFoundError` is thrown identically for "doesn't exist" and "belongs to another recruiter" (never a distinct 403), matching `CandidateNotFoundError`'s established convention.

This replaces Milestone 2's `Map<recruiterId, jobDescription>` interim state entirely — the old `/api/ai/recruiter/job-description` route (GET/POST) is deleted; `/api/ai/recruiter/jobs` (GET/POST) and `/api/ai/recruiter/jobs/[jobId]` (GET/PATCH/DELETE) replace it.

## 5. Candidate persistence

`CandidateService` was rewritten from an in-memory `Map` to `supabaseAdmin` queries against `recruiter_candidates`, keeping every method name/signature from Milestone 2 unchanged (only return types became `Promise<...>`) so every caller's *intent* was untouched — only the storage mechanism changed. `toSummary()`/`getProfile()` are now pure functions of the persisted row; they no longer read `resumeService`/`jdMatchService`/`prepService` at all for an already-imported candidate, since `resume_data`/`jd_match_result`/`interview_readiness_score` are snapshots taken at import/match/generation time.

## 6. Evaluation persistence

Per §13's explicit guidance not to duplicate raw prompts/responses: `jd_match_result` stores the full, already-schema-validated `JdMatchResult` (the same structured object the candidate detail page already renders — trimming it would have silently dropped fields the existing UI displays), `insights` stores `CandidateInsights` (the LLM-generated hiring assessment — an expensive result preserved as-is, never silently regenerated), and `ats_score`/`interview_readiness_score` store just the single integers `candidate-score.ts` ever read. Nothing here re-derives or duplicates the ATS engine, JD matcher, or candidate-insights generator — all three remain byte-for-byte unmodified; this table only persists what they already produced.

## 7. Ranking — recomputed, not persisted

`computeRanking()` still calls the unmodified `rankCandidates()`/`computeRankingScore()`/`classifyCandidateFitLevel()`/`compareRanked()` (Phase 16 M1, untouched) fresh on every call, over the persisted `CandidateSummary[]`. No ranking score is stored — it is cheap, deterministic, and depends on tie-break inputs that themselves are already persisted, so persisting a redundant cached copy would only risk it going stale relative to the underlying data (per §12's explicit "do not persist redundant computed data if it can safely be recomputed deterministically").

## 8. Resume ownership decision

Recruiters only ever create candidates by uploading a file directly (`POST /candidates/import` → `resumeService.analyzeUpload()`) — there is no code path anywhere that lets a recruiter reference an existing individual user's personal `resume_versions` row. There was therefore no cross-user resume-ownership question to resolve for existing functionality; a recruiter's candidate resumes are always freshly recruiter-uploaded data, never another user's private resume.

`resume_id` is kept on the row as a **best-effort, may-go-stale** pointer into `resumeService`'s ephemeral 2h store, solely for the "Rewrite this resume" deep link on the candidate page — that link may 404 for any candidate older than 2 hours, exactly as it already could before this milestone (a candidate could already outlive its own resume's TTL and lose that link's target; persistence doesn't create this limitation, it just makes candidates live long enough to encounter it more often). All scoring/display reads `resume_data` (the persisted snapshot), never `resume_id`.

## 9. Candidate/job relationship

`job_id` is nullable — a candidate can be imported unattached (matching the pre-existing import flow) and matched against a specific job later, or attached at import time via an optional `jobId` form field. Matching (`matchCandidate`) requires **both** the candidate and the job to be owned by the calling recruiter — checked via two independent ownership gates (`requireRecord` for the candidate, `recruiterJobService.getJob` for the job) before any LLM call runs, making "attach another recruiter's candidate to my job" (or vice versa) structurally impossible (verified in §16's tests).

## 10. Service architecture

`CandidateService` remains the single service for candidates (no second competing service introduced). `RecruiterJobService` is new, following the exact same class/row/record/ownership-check shape. Both are exported as singletons from `src/lib/ai/recruiter/index.ts`, matching every other package's barrel convention.

## 11. API migration

All 17 existing `/api/ai/recruiter/**` routes: updated to `await` the now-async `CandidateService` calls (no route's request/response contract changed except `import` and `match`, see below). New: `GET`/`POST /jobs`, `GET`/`PATCH`/`DELETE /jobs/[jobId]`. Removed: `/job-description` (superseded). Changed: `candidates/import` now accepts an optional `jobId` form field; `candidates/[id]/match` now requires a `jobId` body param instead of relying on the old ambient per-recruiter active JD.

## 12. Authentication

Unchanged — still Milestone 2's `requireRecruiterId()`, called first in every route, before any database query. No new auth mechanism.

## 13. Authorization

Still 100% application-level (`.eq("recruiter_id", ...)` on every query), never database-level.

## 14. RLS decision

Not introduced. Confirmed via the Phase 14 migrations' own header comments (read during Milestone 2's audit, re-verified here) that this project deliberately uses no RLS anywhere — every table relies on the service-role `supabaseAdmin` client plus application-layer scoping. This migration follows that convention exactly, documented again in the new migration file's own header.

## 15. Indexes

`recruiter_jobs_recruiter_idx (recruiter_id, created_at desc)`, `recruiter_candidates_recruiter_idx (recruiter_id, created_at desc)`, `recruiter_candidates_job_idx (job_id)` — covering every actual query pattern in `RecruiterJobService`/`CandidateService` (list-by-recruiter-newest-first, and the job-deletion `on delete set null` FK lookup).

## 16. Transaction behavior

No multi-step operation here requires atomicity beyond what a single `insert`/`update` statement already provides. Candidate import is a per-file loop (unchanged from Milestone 1/2's design) where one file's failure doesn't affect others — each file's row insert either fully succeeds or fully fails on its own; there is no scenario that leaves a "half-created" job or candidate row, since job creation is one `insert` and candidate import is one `insert` per file. No new transaction framework was introduced.

## 17. Delete behavior

Deleting a job (`recruiterJobService.deleteJob`) never cascades to its candidates — the FK is `on delete set null`, so attached candidates simply become unattached (`job_id = null`) and keep their own persisted data (resume snapshot, notes, status, tags). Candidates are reusable references a recruiter builds up over time, not job-specific records that should vanish when a job closes — deleting a job is a "stop screening for this role" action, not "discard everyone I considered for it."

## 18. Privacy

No new PII surface. If anything, narrower than before: a candidate's resume/JD-match data used to be reachable by anyone who knew a live ephemeral `resumeId`/`jdMatchId` (no ownership check existed on those services); it is now only reachable through the ownership-scoped `recruiter_candidates` row.

## 19. Security / IDOR protection

`CandidateNotFoundError`/`RecruiterJobNotFoundError` are both thrown identically for "doesn't exist" and "belongs to another recruiter" — verified by dedicated tests asserting byte-identical error messages for both cases. Cross-recruiter reads, mutations, and job/candidate attachment are all denied server-side before any data is touched (see §16).

## 20. Tests — 13 new (30 total in the recruiter package), 675 total in the repo

New in `candidate-service.test.ts` (rewritten to exercise the real `supabaseAdmin`-backed services against a mocked query builder — `recruiter-test-helpers.ts`, a new shared test-only multi-table extension of the existing `analytics/test-helpers.ts` chainable mock, following `resume-version-service.test.ts`'s own established mocking pattern):

- Candidate list/get/getProfile scoping, cross-recruiter mutation denial (updateStatus/addNote/updateTags/remove), enumeration protection (identical error for nonexistent vs. not-owned), dashboard/ranking scoping, and the internal `*ForSystemUse()` escape hatch (9 tests, extended from Milestone 2's suite).
- **Job ownership**: list/get scoping, cross-recruiter get/update/delete denial, enumeration protection, and persistence-through-a-fresh-read (4 tests).
- **Job/candidate relationship**: Recruiter A cannot attach Recruiter B's candidate to Recruiter A's job; Recruiter A cannot match their own candidate against Recruiter B's job; a genuine same-recruiter match persists the JD result and remains inaccessible to any other recruiter's `getProfile()` call (3 tests).

```
npx vitest run
 Test Files  53 passed (53)
      Tests  675 passed (675)
```

Unchanged and still passing: `candidate-ranking.test.ts` (11), `candidate-summary.test.ts` (6) — neither touches persistence.

## 21. TypeScript

```
npx tsc --noEmit → exit 0, no errors
```

## 22. Lint

```
npm run lint → 0 errors, 1 pre-existing warning (unrelated <img> in blog/[slug], present before this milestone)
```

## 23. Build

```
npm run build → ✓ Compiled successfully
```
`/api/ai/recruiter/jobs` and `/api/ai/recruiter/jobs/[jobId]` appear in the route manifest; `/api/ai/recruiter/job-description` no longer does.

## 24. Live validation

Ran `npm run build` then `npm run start`, `curl`'d against the real server, then killed it:

| Check | Result |
|---|---|
| `GET`/`POST /api/ai/recruiter/jobs` (no auth) | **401** |
| `GET`/`PATCH`/`DELETE /api/ai/recruiter/jobs/fake-id` (no auth) | **401** |
| `POST /api/ai/recruiter/candidates/fake-id/match` (no auth) | **401** |
| `GET /api/ai/recruiter/candidates` (no auth) | **401** |
| `GET /api/ai/recruiter/job-description` (removed route) | **404** |
| `GET /recruiter` (no auth) | **307 → `/login?redirect=/recruiter`** |
| `GET /api/ai/recruitment/jobs/fake/pipeline` (sibling, unauthenticated by design) | **500 — `Could not find the table 'public.recruiter_candidates'`** |

The last result is expected and important to be honest about: this repository has no migration tooling (documented in every migration file's own header, including the new one) — `20260813000000_add_recruiter_persistence.sql` must be run manually in the Supabase SQL Editor before any route that touches `CandidateService` can succeed, including the previously-fully-public Recruitment Pipeline routes that read candidates. This confirms the *code path* reaches the real, correctly-configured Supabase instance (the same instance Milestone 2's `requireRecruiterId()` checks already proved was live) and fails at exactly the expected boundary — a missing table, not a bug — and will resolve the moment the migration is applied.

Per the explicit instruction not to claim authenticated E2E validation where it isn't possible: I could not log in as two real recruiters and click through the UI, both because no login credentials are available to this session and because the migration hasn't been applied to the live database. Ownership/cross-recruiter/persistence-through-a-fresh-read behavior is instead verified directly against the real service code (not a hand-rolled fake) via the mocked-query-builder tests in §20, which exercise the identical `.eq("recruiter_id", ...)` code paths every route calls.

## 25. Known limitations

- **The migration has not been applied to the live database** — this is an action item for the user (or a future deploy step), not a code gap. Every recruiter route will 401/500 appropriately until it is (401 for auth-gated routes regardless of table existence; 500 with a clear Postgres "table not found" error for the unauthenticated Recruitment Pipeline routes that touch candidates).
- **`generateInterviewReadiness` remains bound to `prepService`'s original ~2-hour ephemeral window** (documented in `candidate-service.ts`'s `ephemeralPointers` comment) — `prepService.generate()` (protected Interview Prep architecture) only accepts live `resumeService`/`jdMatchService` ids, never already-computed data, so this one action cannot be made durable without either modifying that protected service or duplicating its LLM pipeline. This is not a new limitation — a candidate whose resume/JD-match data had already expired from the ephemeral store could never generate interview readiness before this milestone either; the only change is that the candidate record itself no longer disappears alongside it.
- **The Recruitment Pipeline (Phase 13 Milestone 9) remains fully unauthenticated**, as documented in Milestone 2 — its calls into `CandidateService` were updated only enough to keep compiling against the new async, persistent API (`*ForSystemUse()` accessors), with byte-for-byte unchanged behavior otherwise.
- **"Rewrite this resume" may 404** for any candidate whose `resume_id` has aged out of `resumeService`'s 2-hour store — pre-existing behavior, now encountered more often since candidates persist far longer.

## 26. Recommended next milestone

Authenticate and own the Recruitment Pipeline (Phase 13 M9) the same way this arc has now done for the Recruiter Workspace — it is the last major unauthenticated surface reading recruiter candidate data, and would let `generateInterviewReadiness`'s compatibility-adapter limitation be revisited alongside it if the pipeline gains its own persistent job/candidate-attachment model.
