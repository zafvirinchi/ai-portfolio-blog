# Phase 17 — Milestone 6: Interview Progress & Practice History Intelligence

## 1. Audit findings

Before writing anything, the full session lifecycle was re-read end to end: `session-types.ts`, `session-service.ts`, `session-manager.ts`, `score-engine.ts`, the Mock Interview page and its Score/Report/Debrief tabs, and M3/M4/M5's `interview-coverage.ts` / `interview-intelligence-service.ts` / `session-debrief.ts`.

Answers to the audit's own explicit questions:

1. **Can multiple completed sessions for the same context already be retrieved?** No. `SessionService` (`session-service.ts`) exposes exactly one read method, `get(sessionId)`, resolving a single record from its private `records = new Map<string, StoredSessionRecord>()`. There is no `list()`, `getAll()`, `findBy...()`, or any index by `resumeId`/`jdMatchId`/`prepId`.
2. **Does any existing ephemeral store already retain completed sessions?** Only the single session's own record, under its own `sessionId` key, for its 2-hour TTL. Nothing retains a *history* of sessions.
3. **Is there already a session-listing mechanism?** No (see #1). Confirmed by reading every route under `src/app/api/ai/mock-interview/**` — none accept or return more than one session.
4. **Can progress be derived without persistence?** Yes, for the actual comparison math — every value M5's `SessionDebrief` already computes (score, readiness, category performance, coverage impact) is real, already-derived data. The genuine gap is purely **which session IDs to ask about**, not how to score/compare them.
5. **What happens after the current TTL expires?** The session is silently purged (`purgeExpired()`, called on every `get()`/`save()`) — `sessionService.get()` returns `undefined` for an expired id, exactly like an invalid one. No trace remains server-side.
6. **Is `resumeVersionId` available in the session/prep context?** No. Traced the full chain: `resume-version-adapter.ts` (M2) uses `resumeVersionId` only at seed time to populate `resumeService`; neither `ResumeRecord` (`resume-types.ts`), `JdMatchRecord` (`jd-types.ts`), nor `PrepRecord` (`prep-types.ts`) retain it afterward. `SessionRecord` has no `resumeVersionId` field either. This means "same interview context" can only be established via the ephemeral `resumeId`/`jdMatchId` (and, when present, `prepId`) — never `resumeVersionId`.
7. **Is JD context available without another LLM call?** Yes — `jdMatchService.get(jdMatchId)` returns the already-parsed `JobDescription`, exactly as M3/M5 already rely on.

### Conclusion: no database migration, no second session store

Genuine multi-session "practice history" requires remembering **which session IDs exist for a given browser/context** — and nothing in the current architecture does that. Two honest options existed:

- **(a)** Add a database table to persist session history — explicitly forbidden by this milestone unless "genuinely required and architecturally safe," and it isn't: the underlying scores/coverage/study-plan data all already exist and are fully re-derivable from the existing ephemeral stores; only the *list of IDs to look up* is missing.
- **(b)** Have the **client** (which already legitimately holds each `sessionId` — the same bearer token every other route in this family already trusts) remember a small, capped, TTL-pruned list of its own past session IDs, and pass that list back to a new read-only endpoint that re-derives everything server-side from `sessionService`.

**(b) was chosen.** This introduces no new backend store, no new source of truth, and no schema change — `sessionService`'s single in-memory `Map` remains the *only* place any score, readiness, or coverage value is authoritative. The client-side addition (`practice-history-store.ts`, a `localStorage`-backed list of `{sessionId, prepId, resumeId, jdMatchId, completedAt}` breadcrumbs — never scores or content) is a genuinely new pattern for this codebase (no prior `localStorage` usage existed anywhere), so it is called out explicitly here rather than introduced silently. See §17 for its documented limitations.

## 2. Existing functionality reused

- `sessionService.get()` — the only read path, used identically to every sibling route.
- `buildSessionDebrief()` (M5) — called once per resolved session ID; this milestone's entire per-session score/readiness/category/coverage data comes from here, never recomputed.
- `computeReadinessLabel()` (M4) — reused for `latestReadiness`/`previousReadiness`, never a new readiness engine.
- `buildStudyPlan()` (M4) — reused a third time (after M5) for the reprioritized study plan; only the *input ordering* changes.
- `computeInterviewIntelligence()` (M3) — reused, unmodified, to source the latest session's linked question list for study-plan reprioritization.
- M5's `CoverageImpactItem`/`DemonstrationStatus`/`CategoryPerformance` types and classification — this milestone never re-derives "was this topic demonstrated," it only aggregates M5's own already-computed classifications across sessions.
- The Mock Interview page's tab architecture (`Tabs`), Setup/Interview/Score/Report/Debrief tabs, and Mock Interview / Interview Preparation routes — all reused unmodified except for the two small additive wiring changes in §5.

## 3. Genuine gaps found and filled

1. No mechanism existed to even identify which past sessions belong to the same practice context — filled by the client-side breadcrumb list (§1).
2. No cross-session comparison existed at all — filled by `interview-progress.ts`.
3. No category-trend classification (IMPROVING/STABLE/DECLINING/INSUFFICIENT_DATA) existed.
4. No persistent-weakness detection across sessions existed (M5's `criticalWeaknesses` is per-session only).
5. No study-plan reprioritization driven by *historical* (multi-session) performance existed (M5's is single-session only).

## 4. Session lifecycle (as it now applies to progress)

```
Session completes (sessionService.end())
  -> mock-interview/page.tsx's applyTurnResult(result)
       -> if result.completed: practiceHistoryStore.recordCompletedSession({sessionId, prepId, resumeId, jdMatchId})
            (id only — no score/content — written to localStorage, capped at 10 entries, pruned at the same 2h TTL sessionService itself uses)

Progress tab opens (or a new session completes while it's mounted)
  -> MockInterviewProgress.tsx reads getRecentSessionIds({resumeId, jdMatchId}) from localStorage
  -> GET /api/ai/mock-interview/progress?sessionIds=...&resumeId=...&jdMatchId=...
       -> for each id: sessionService.get(id)            [existing, unmodified]
       -> isSameContext(session, resumeId, jdMatchId)      [new, pure — drops mismatches]
       -> buildSessionDebrief(id)                          [M5, unmodified]
       -> sort by session.createdAt
       -> computeInterviewProgress(points)                 [new, pure]
```

## 5. Files added

- `src/lib/ai/mock-interview/interview-progress.ts` (+ `.test.ts`) — the one new pure, deterministic, zero-LLM engine.
- `src/lib/ai/mock-interview/practice-history-store.ts` — the client-only, `localStorage`-backed breadcrumb list (§1).
- `src/app/api/ai/mock-interview/progress/route.ts` — the new read-only endpoint.
- `src/components/mock-interview/MockInterviewProgress.tsx` — the new "Progress" tab.

## 6. Files modified

- `src/app/(site)/mock-interview/page.tsx` — added the "Progress" tab; widened the local `TurnResponse` type with `completed: boolean` and calls `recordCompletedSession()` from `applyTurnResult()` when a turn completes the session; added a small `tabsRemountKey` piece of state so the Progress tab's "View Latest Debrief" CTA can force a one-time remount of the (intentionally uncontrolled) `Tabs` component landing on the Debrief tab, without adding a general external-control API to `Tabs.tsx` itself.
- `src/lib/ai/mock-interview/session-debrief.ts` — **no changes**; only its already-exported `buildSessionDebrief`, `SessionDebrief`, `CategoryPerformance`, `DemonstrationStatus`, `CoverageImpactItem` are imported.
- `src/lib/ai/interview-prep/interview-coverage.ts` — **no changes** this milestone (M5 already exported everything needed: `computeReadinessLabel`, `buildStudyPlan`, `CoverageCategory`).

## 7. Progress model

`InterviewProgress` (`interview-progress.ts`) — see the file for the full interface; summarized:

- `sessionsAttempted` / `sessionsCompleted` — distinct counts (a resolved-but-incomplete session counts toward the former only).
- `latestScore` / `previousScore` / `scoreDelta` — read directly from each session's own `SessionReport.overallScore`; `null` whenever fewer than the relevant number of completed sessions exist.
- `latestReadiness` / `previousReadiness` — `computeReadinessLabel()` (M4) applied to each session's own `interviewReadiness`; never a new readiness computation.
- `completionRate` — the average of each completed session's own `SessionDebrief.summary.completionPercentage`.
- `categoryProgress` / `improvingAreas` / `decliningAreas` — per §8.
- `persistentWeakAreas` / `repeatedMisses` — per §9.
- `recommendedNextPractice` — per §10.
- `updatedStudyPlan` / `studyPlanUnavailableReason` — per §11.
- `trend` — the same delta-classification used for categories (§8), applied to `scoreDelta`.

## 8. Trend calculation

A category's score history is the chronological list of each completed session's own `CategoryPerformance.averageScore` for that category (M5), skipping any session where it's `null` (never asked). With fewer than 2 real data points, the category is `INSUFFICIENT_DATA` — "do not infer improvement from a single score" is enforced exactly as specified.

With 2+ points, `latest - previous` is compared against `TREND_STABLE_BAND = 5` (new to this milestone, documented in-code): `>= +5` → `IMPROVING`, `<= -5` → `DECLINING`, otherwise `STABLE`. This small noise band exists so a 1–2 point evaluator fluctuation between two answers on the same topic isn't reported as a fabricated improvement or decline. The overall session `trend` field reuses the exact same threshold and classifier for consistency.

## 9. Persistent weakness rules

Built entirely from M5's own per-session `CoverageImpactItem[]` (`coverageImpact`), grouped by the exact `${category}::${topic}` key M5 already assigns (no new normalization, no topic-similarity matching, no LLM):

- Any occurrence with status `"Not assessed"` is skipped entirely — never counted as evidence.
- `assessedCount` — number of sessions where the topic had a real (non-"Not assessed") status.
- `weakCount` — count of `"Not demonstrated"` or `"Partially demonstrated"` occurrences.
- **Explicit minimum-observation threshold: `PERSISTENT_WEAKNESS_MIN_ASSESSMENTS = 2`** — a topic with `assessedCount < 2`, even if its one assessment was weak, is entirely excluded from `persistentWeakAreas`/`repeatedMisses` (§5's own explicit requirement: "a topic asked once and answered poorly should not automatically be called persistent").
- Classification (only for topics that clear the threshold and have `weakCount >= 1`):
  - `latestStatus === "Demonstrated"` → `IMPROVING` (had trouble before, resolved now).
  - else `weakCount >= 2` → `PERSISTENT_WEAKNESS`.
  - else (`weakCount === 1`, latest still not Demonstrated) → `WATCH`.
- `persistentWeakAreas` = topics classified `PERSISTENT_WEAKNESS`.

## 10. Repeated-miss detection

`repeatedMisses` is a deliberately *broader* signal than `persistentWeakAreas`: every topic with `weakCount >= 2`, regardless of its current status — so a topic that struggled twice and is now `IMPROVING` still shows up here (a real historical pattern worth knowing about) even though it no longer counts as an active, actionable `PERSISTENT_WEAKNESS`. Both are computed from the identical `weakCount`/`assessedCount` data in §9 — no second detection pass, no LLM similarity service, and (per the same-key grouping in §9) two identically-named topics in *different* categories are never merged into one (verified by a dedicated test).

## 11. Study-plan integration

`reprioritizeStudyPlanAcrossSessions()` reuses M4's `buildStudyPlan()` directly, over the **latest completed session's own linked question list** (`computeInterviewIntelligence(latestSession.prepId).questions`, M3/M4, unmodified), reordered so:

1. Topics in `persistentWeakAreas` move first.
2. Topics belonging to a `decliningAreas` category move next (excluding any already placed in step 1).
3. Everything else keeps its original relative order.

Each moved entry gets a deterministic reason — `"Repeated weakness across assessed sessions."` or `"Performance declined in the latest session."` — and unmoved entries get `moved: false, moveReason: null`, exactly mirroring M5's own `moved`/`moveReason` pattern. When the latest session has no `prepId`, or its linked prep report has since expired, `updatedStudyPlan` is `null` with an explicit `studyPlanUnavailableReason` — never a fabricated plan.

## 12. Practice recommendations

Deterministic, ordered `HIGH` (one per `persistentWeakAreas` topic — `"Weak in N of M assessed sessions."`) → `MEDIUM` (one per `decliningAreas` category — `"Performance declined in the latest session (X → Y)."`) → `CONTINUE` (one per `IMPROVING`-status topic — `"Improved in the latest session — continue reinforcement."`). No free-form or LLM-generated text anywhere in this list (verified by a dedicated ordering test).

## 13. Security

- **No new authentication mechanism was added.** Mock interview sessions remain on the same unauthenticated, ephemeral bearer-token model documented in M5 §10 — `sessionId` itself is still the only credential. The new `GET /api/ai/mock-interview/progress` route follows the identical model, extended to accept *several* opaque ids instead of one (the same trust boundary, not a new one).
- **Session IDs cannot be substituted across contexts** — `isSameContext()` (new, directly unit-tested) filters every resolved session to the caller-supplied `resumeId`/`jdMatchId`; a mismatched session is silently excluded, never compared.
- **prep/session linkage is server-derived** — `session.prepId` (not any client input) drives the study-plan source.
- **The client cannot submit historical scores or fabricated trends** — the route's only inputs are `sessionIds` (opaque ids), `resumeId`, and `jdMatchId` (used only as a filter, re-verified against the server-resolved session's own fields — never trusted as content). Every score/readiness/category/coverage value is re-derived server-side via `sessionService.get()` + `buildSessionDebrief()`.
- **The client cannot select another user's `resumeVersionId`** — not applicable/not newly introduced: this route never accepts a `resumeVersionId` at all (§1, finding #6 — it isn't tracked this far downstream in the existing architecture either).
- The client-side `localStorage` breadcrumb list is itself not a security boundary — it only ever stores opaque ids the browser already legitimately obtained by completing those sessions, and the server independently re-verifies context on every request; a tampered localStorage entry can at worst point at a session ID the browser doesn't actually "own" in some other sense, but since there is no user/ownership concept anywhere in this ephemeral family (by design, see M5 §10), this carries the same, already-accepted risk profile as every other route in this product family — not a new one.

## 14. Empty states (§11 of the spec)

| Case | Behavior |
|---|---|
| Zero sessions | "Complete your first mock interview to start tracking progress." + a Start Mock Interview CTA |
| One session | Full latest-performance stats shown; explicit "More sessions are needed to establish a performance trend." note; `trend`/category trends all `INSUFFICIENT_DATA` |
| Two sessions | Full trend comparison enabled |
| Missing category scores | `latest`/`previous` stay `null`, trend `INSUFFICIENT_DATA` — never manufactured |
| Different interview contexts | Filtered out entirely by `isSameContext()` before ever reaching the progress engine — never blindly compared |

## 15. Tests

20 new tests in `interview-progress.test.ts`, covering every item in the spec's 20-point list (mapped in the test file's own `describe` names): zero/one/two-session counts, score improvement/decline/stable trend classification, category improvement/decline/insufficient-data/never-asked, persistent-weakness threshold (single-assessment exclusion, 2+-weak-still-weak, 2+-weak-now-improving), "Not assessed" never counted as weakness, same-topic-different-category non-merging (a "topic normalization" precedent), recommendation ordering (HIGH→MEDIUM→CONTINUE), completion-rate averaging (covers missing-scores/skipped-question effects, already encoded upstream by M5), `isSameContext` (context compatibility / "unrelated sessions not compared" / "invalid context"), the no-`prepId` study-plan-unavailable path, and — the two heavier integration tests — real study-plan reprioritization and a full, unmocked M3/M4/M5 pipeline regression check (via real `buildSessionDebrief()` + mocked `prepService`/`resumeService`/`jdMatchService`/`sessionService`, the same pattern `session-debrief.test.ts` and `interview-intelligence-service.test.ts` already established).

"Forged client data" (§19) has no dedicated runtime test, for the same reason M5 documented: `computeInterviewProgress()`'s only inputs are already-resolved `SessionRecord`/`SessionDebrief` objects, and the API route's only client inputs are opaque ids — there is no code path through which a score, readiness, or category value could originate from the client, so this is a structural guarantee (verified by inspection) rather than something a unit test can meaningfully exercise beyond what §13's other tests already cover.

## 16. Full test result

- Before this milestone: **896/896** passing (M5 baseline).
- After this milestone: **916/916** passing (68 test files) — 20 new tests, 0 regressions.

## 17. TypeScript / lint / build results

- `npx tsc --noEmit` — 0 errors.
- `npm run lint` — 0 errors, 1 pre-existing warning unrelated to this milestone. One real lint error was found and fixed during this milestone: the same `react-hooks/set-state-in-effect` issue M5 hit, in `MockInterviewProgress.tsx`'s data-fetching effect — fixed with the same pattern (a single discriminated-union `LoadState`, every `setState` call nested inside a promise callback, never synchronous in the effect body).
- `npm run build` — succeeds; `/mock-interview` still compiles as a static route, and `/api/ai/mock-interview/progress` is confirmed present in the build's route listing.

## 18. Live validation

Production server (`npm run start`) probes:

```
GET /mock-interview                                                          → 200
GET /api/ai/mock-interview/progress (no params)                              → 400 {"error":"resumeId and jdMatchId are required."}
GET /api/ai/mock-interview/progress?resumeId=r1&jdMatchId=j1                 → 400 {"error":"sessionIds must include at least one session id."}
GET /api/ai/mock-interview/progress?sessionIds=nonexistent&resumeId=r1&jdMatchId=j1 → 200, an "empty/insufficient data" InterviewProgress (invalid ids are silently excluded, never an error)
```

No sensitive data leaked in any response; invalid input produces a clean 400 with a generic message, and an unresolvable session id degrades gracefully to "no completed sessions" rather than an error — matching the spec's explicit "do not create fake history... implement the progress engine so it can consume a list of existing sessions and document the retrieval limitation" instruction. Server was cleanly stopped after validation.

**Not executed, and not claimed**: no live-LLM, real multi-session end-to-end walkthrough (complete two real mock interviews back to back and confirm the Progress tab renders genuine multi-session trends in the browser) was performed — consistent with every prior milestone's documented Supabase/live-service environment limitation. The full data-flow and reprioritization logic were instead verified via the unit test suite (§15), including one test that exercises the real, unmocked `buildSessionDebrief()` pipeline against hand-constructed but realistic session data.

## 19. Known limitations

- **Practice history is per-browser, not per-account.** It lives in `localStorage`, capped at the 10 most recent sessions per resume/JD context and pruned at the same 2-hour TTL the server already uses. Clearing browser storage, switching browsers/devices, or using a different browser profile loses it entirely. This is the direct, honest consequence of the architectural decision in §1 — no persistence layer exists to do otherwise without a database migration.
- **"View Latest Debrief" only works when the most recently tracked session is also the currently active one** in the page's own state (the Debrief tab has no mechanism to display an arbitrary *past* session's debrief — it only ever shows the currently loaded `session`). The CTA is simply omitted rather than shown as a broken link when this doesn't hold.
- **"Review Study Plan" and "Return to Interview Dashboard"-style CTAs** point at the existing `/interview-preparation` page, which has no tab deep-linking mechanism (same limitation M5 documented).
- Study-plan reprioritization is unavailable whenever the *latest* completed session has no linked `prepId` (or its report has since expired) — even if earlier sessions in the history did have one; this keeps the "reprioritize the current/latest plan" semantics honest rather than mixing intelligence from an older, possibly-different prep report.
- `TREND_STABLE_BAND` (5) and `PERSISTENT_WEAKNESS_MIN_ASSESSMENTS` (2) are new, explicitly documented thresholds introduced by this milestone (no prior equivalent existed to reuse) — reasonable, deliberately conservative defaults, not empirically tuned.

## 20. Was persistence required?

**No.** The audit (§1) found that every value needed for progress tracking already exists and is fully re-derivable from the current ephemeral architecture (`sessionService` + M3/M4/M5). The only genuine gap was *which session IDs to ask about across page loads*, which was solved with a client-side `localStorage` breadcrumb list of opaque IDs — not a database table, not a second session store, and not a new source of truth. If genuine cross-device or long-term (beyond the 2-hour session TTL) history is ever required, that would be a real, new product decision warranting its own milestone and an explicit database migration — deliberately not introduced here.

## 21. Recommended Phase 17 Milestone 7

If durable, cross-device practice history becomes a real product requirement, Milestone 7 should be an explicit **"Persistent Practice History"** milestone: introduce a genuine database-backed session-summary table (never full transcripts — just the same aggregate `SessionDebrief`-shaped snapshot this milestone already knows how to compute), tied to the authenticated Supabase user (not the ephemeral bearer-token session), with a real migration, explicit retention policy, and a clean compatibility path so `interview-progress.ts`'s existing pure engine can be fed either the current ephemeral, localStorage-driven session list or a persisted one without changing its own logic at all — the separation established in this milestone (`SessionProgressPoint[]` in, `InterviewProgress` out, no opinion on where the list came from) was deliberately designed to make that swap possible later without a rewrite.
