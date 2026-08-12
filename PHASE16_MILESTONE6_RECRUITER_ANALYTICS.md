# Phase 16 — Milestone 6 — Recruiter Analytics Dashboard & Screening Insights

## 1. Audit findings

**Migration status — checked first, using the exact filenames in the repo:** `20260813000000_add_recruiter_persistence.sql` and `20260814000000_add_recruiter_candidate_evaluation_status.sql`. Re-verified live via direct authenticated REST calls to `GET /rest/v1/recruiter_jobs` and `GET /rest/v1/recruiter_candidates`: both still return `404 PGRST205 "table not found in the schema cache"`. **Neither migration is applied.** No application code was changed to work around this, no in-memory fallback persistence was added, and this is the third consecutive milestone (4, 5, 6) to confirm this state unchanged.

**Existing functionality traced before writing anything:** `CandidateService.list()`/`computeRanking()` already return `CandidateSummary`/`RankedCandidate` carrying `fitScore`/`fitLevel`/`evaluationStatus`/`scores.jdMatch`/`scores.atsScore`/`status` — Milestones 4–5's own additions. `RecruiterJobService` already ownership-scopes every job read. `CANDIDATE_STATUSES` (Phase 13) is the complete, unmodified status enum. Nothing resembling an analytics/aggregation module existed anywhere in the recruiter package — this genuinely was new functionality, not a rebuild.

## 2. Existing functionality reused (nothing rebuilt)

Every number in this milestone's analytics is either a direct count/average over `CandidateSummary` fields Milestones 1–5 already compute, or a verbatim pass-through of an existing engine's output:
- Candidate Fit score/level: `computeRankingScore`/`classifyCandidateFitLevel` (Milestone 1) — read via the `fitScore`/`fitLevel` already on every `CandidateSummary`, never recomputed.
- Top Candidates: `candidateService.computeRanking()` (Milestone 1's `rankCandidates`/`compareRanked` tie-breaker cascade, unmodified) — sliced to 5, not re-ranked.
- JD Match / ATS scores: read directly from `CandidateSummary.scores`, produced by the existing JD matcher/ATS engine.
- Skill gaps: `JdMatchResult.missingSkills`, the existing JD matcher's own output — aggregated, never recomputed with a second keyword matcher.
- Evaluation status / staleness: `EvaluationStatus`/`evaluated_at` (Milestone 4), read as-is.
- Ownership: `requireRecruiterId()` and `RecruiterJobService.getJob()`'s existing 404 convention, unchanged.

## 3. New functionality

- `src/lib/ai/recruiter/recruiter-analytics.ts` — a **pure, deterministic** module (no I/O, no LLM call): `computeOverallAnalytics`, `computeFitDistribution`, `computeEvaluationDistribution`, `computeStatusDistribution`, `computeScreeningFunnel`, `computeJobAnalytics`, `computeSkillGaps`, `computeAttentionQueue`, and an assembler `buildRecruiterAnalytics`.
- `src/lib/ai/recruiter/recruiter-analytics-service.ts` — the one I/O-performing orchestrator (`getRecruiterAnalytics(recruiterId, jobId?)`), which only ever calls existing `CandidateService`/`RecruiterJobService` methods and hands their output to the pure module.
- Two small, additive extensions to `CandidateService`: `computeRanking(recruiterId, {jobId})` (job-scoped ranking, same engine) and `listMissingSkills(recruiterId, jobId?)` (the one genuinely new query — see §8).
- New route `GET /api/ai/recruiter/analytics` (optional `?jobId=`).
- New `RecruiterAnalyticsTab.tsx`, added as a new tab on the existing `/recruiter` page.

## 4. Analytics model

**Overall:** `totalJobs`, `totalCandidates`, `evaluatedCandidates` (complete + stale — both mean "evaluated at least once"), `unevaluatedCandidates`, `staleCandidates`, `averageJdMatch`/`averageAtsScore`/`averageCandidateFit` (each averaged over only the candidates that actually have that score — a candidate without a JD match is excluded from the JD Match average, never counted as 0).

**Candidate Fit / Evaluation / Status distributions:** straight counts over `fitLevel`/`evaluationStatus`/`status`. The status distribution always returns every entry in `CANDIDATE_STATUSES`, including ones with zero candidates — never a partial map that silently omits an unused status.

**Screening funnel (§2):** inspected `CandidateStatus` first, per the explicit instruction, and used only real values: `Imported` (all candidates) → `Evaluated` (`evaluationStatus !== "not_evaluated"`) → `Strong/Good Fit` (`fitLevel` STRONG or GOOD) → `Shortlisted` (`status === "Shortlisted"`) → `Interview/Selected` (`status` is Interview Scheduled, Offer, or Hired). **Documented limitation:** stages are counted independently, not strictly nested — the underlying fields are each independently settable by a recruiter (e.g. a candidate can be shortlisted before being evaluated), so forcing a strict funnel ordering would fabricate a progression the data doesn't actually guarantee. This is stated in code (`recruiter-analytics-types.ts`'s `ScreeningFunnelStage` doc comment) and verified by a dedicated test.

**Job analytics:** groups already-fetched candidates by `jobId` in memory (no per-job query) — every recruiter-owned job appears, including ones with zero candidates (all-zero/null entry, not an omitted row).

## 5. API changes

One new route: `GET /api/ai/recruiter/analytics?jobId=<owned-job-id>`. No existing route was changed. `recruiterId` is always resolved via `requireRecruiterId()`; `jobId`, when supplied, is ownership-validated inside `getRecruiterAnalytics()` (`recruiterJobService.getJob()`) *before* any analytics are computed — a foreign or nonexistent `jobId` both produce the identical `RecruiterJobNotFoundError` → 404, matching every other recruiter route's convention.

## 6. UI changes

A new "Analytics" tab was added to the existing `/recruiter` page's `Tabs` component — no existing tab (Dashboard, Candidates, Comparison, Insights, Reports) was replaced or restructured. The new tab reuses the same card/badge/`<select>` styling already established throughout the recruiter workspace (`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm`, the same `FIT_LEVEL_CLASSNAME` palette). It shows: overview stat cards, fit distribution, evaluation distribution, the screening funnel, a candidate-status grid, a job-level performance table (overall view only), top candidates (linking to each candidate's profile), skill gaps (job-scoped only — see §4/§8), and the recruiter attention queue. Selecting a job in the scope dropdown re-fetches already-computed analytics for that job only — no LLM call, no new version, no side effect.

## 7. Security/ownership model

Unchanged pattern, applied to the new surface: `requireRecruiterId()` at the route boundary, `recruiterJobService.getJob(recruiterId, jobId)` ownership-checks any job-scoped request before computation, and every candidate query (`list`, `computeRanking`, `listMissingSkills`) is `.eq("recruiter_id", recruiterId)`-scoped at the database query level — never filtered client-side after over-fetching. No analytics number, job title, candidate name, or skill gap can include another recruiter's data; verified directly (§9).

## 8. Performance considerations

`getRecruiterAnalytics()` issues at most 4 queries total, all `Promise.all`-parallelized: one candidate list, one job list, one ranking computation (itself one query), and — only when `jobId` is supplied — one missing-skills query. None of these is per-candidate. `listMissingSkills()` (the one new query) selects only `id, jd_match_result`, never `resume_data`, since skill-gap aggregation doesn't need the full resume snapshot — smaller payload than `list()` for the one purpose that needs it. No new persistence table was created; no caching was introduced (analytics are cheap enough to recompute per request at this scale, and premature caching was explicitly out of scope).

## 9. Tests — 33 new (100 total in the recruiter package), 736 total in the repo

```
npx vitest run
 Test Files  56 passed (56)
      Tests  736 passed (736)
```

New:
- **`recruiter-analytics.test.ts`** (28 tests, pure functions — no mocking needed): empty workspace, missing-score averaging (never treated as 0), evaluated/unevaluated/stale counting, fit/evaluation distributions (every level/status, including zero counts), status distribution (never invents a status outside the real enum), screening funnel (all 5 stages + the independently-counted-not-nested case), job analytics (including the zero-candidate-job case), skill-gap aggregation (ranking by count, case/whitespace-normalized duplicates, empty data never fabricating a gap), attention queue (every rule, first-match-wins ordering, a candidate matching no rule is omitted), and `buildRecruiterAnalytics`'s scope-dependent behavior (job analytics only in the overall view, skill gaps only in the job-scoped view, top-5 passthrough from the existing ranking engine).
- **`recruiter-analytics-service.test.ts`** (5 tests, against the real service code with a mocked `supabaseAdmin` query builder): recruiter A's overall analytics never include recruiter B's jobs/candidates; a foreign `jobId` produces the identical error as a nonexistent one; job-scoped analytics stay correctly isolated; `listMissingSkills()` is recruiter-scoped; `computeRanking(recruiterId, {jobId})` only ranks that recruiter's own job candidates.

Full existing suite (Milestones 1–5, Recruitment Pipeline compatibility) re-run and confirmed passing unchanged — no existing test was weakened or removed.

## 10. Validation results

```
npx tsc --noEmit   → exit 0, no errors
npm run lint        → 0 errors, 1 pre-existing warning (unrelated <img> in blog/[slug])
npm run build        → ✓ Compiled successfully — /api/ai/recruiter/analytics present in the route manifest
```

Live-probed via `npm run start` + `curl`, then the server was killed:

| Check | Result |
|---|---|
| `GET /api/ai/recruiter/analytics` (no auth) | **401** |
| `GET /api/ai/recruiter/analytics?jobId=fake` (no auth) | **401** |
| `GET /recruiter` (no auth) | **307 → `/login?redirect=/recruiter`** |

**Authenticated persistence E2E was not attempted and is not claimed.** Both preconditions remain unmet: the migrations are unapplied (§1) and no real login credentials exist in this environment. What's verified live is exactly what's possible without them — the auth gate on the new route — and every ownership/aggregation behavior is instead verified directly against the real service code via the tests in §9.

## 11. Database migration state

**Unchanged and unapplied** (§1). No new migration was created this milestone — every analytics requirement was satisfiable from the existing `recruiter_jobs`/`recruiter_candidates` schema (Milestones 3–4); nothing here needed a new column or table.

## 12. Known limitations

- **Both migrations remain unapplied** — an action item for the user, not a code gap.
- **Skill gaps are only computed in the job-scoped view.** An all-jobs aggregate was deliberately not built: missing skills are relative to one job's JD, and summing across different jobs' requirement sets (Job A wanting Docker, Job B wanting Redis) would produce a number with no coherent meaning — documented in code rather than fabricated.
- **The screening funnel's stages are independently counted, not strictly nested** (§4) — an honest reflection of the underlying data model, not a defect.
- All limitations from Milestones 2–5 (Recruitment Pipeline's own lack of authentication, `generateInterviewReadiness`'s ephemeral-window compatibility adapter, deferred pagination, "Rewrite this resume" link staleness) are unchanged and out of this milestone's scope.

## 13. Deferred work

Nothing in this milestone's own scope was deferred beyond the all-jobs skill-gap aggregate (§12, a deliberate "don't fabricate" decision, not a postponement). Batch re-evaluation (deferred again across Milestones 4–5) remains the standing deferred item from the wider Recruiter SaaS arc.

## 14. Recommended Milestone 7

Once the migrations are applied and a real authenticated login becomes available in this environment, the first priority should be the two-recruiter live walkthrough every milestone since 3 has had to defer — this analytics surface in particular would benefit from a real "Recruiter A sees only their own numbers, Recruiter B sees only theirs" live confirmation, not just the service-level tests here. Functionally, batch re-evaluation for the candidates this milestone's attention queue and stale-count now make easy to *identify* (but not yet act on in bulk) remains the natural next step.
