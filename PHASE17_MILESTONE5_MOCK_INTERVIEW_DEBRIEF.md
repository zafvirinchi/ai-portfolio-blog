# Phase 17 — Milestone 5: Mock Interview Session Debrief & Coverage Feedback

## 1. Audit findings

Before writing anything, the full Mock Interview package (`src/lib/ai/mock-interview/*`, `src/app/api/ai/mock-interview/**`, `src/components/mock-interview/*`, `src/app/(site)/mock-interview/page.tsx`) was read in full, alongside M3/M4's `interview-coverage.ts` and `interview-intelligence-service.ts`.

| Capability requested by M5 | Status |
|---|---|
| Session model (`SessionRecord`, `session-types.ts`) | ALREADY IMPLEMENTED — REUSE (Phase 13 M4). Already stores `prepId`, the full `transcript`, `questionsMissedText`, and a `SessionReport`. |
| Session creation / completion (`session-service.ts`) | ALREADY IMPLEMENTED — REUSE. `end()` already computes `overallScore`, `interviewReadiness` (already blended 70/30 with M3's own predicted readiness — `computeInterviewReadiness`), `categoryScores`, `topicScores`, `strengths/weaknesses/topImprovements`, and a learning roadmap. |
| Answer evaluation (`evaluation-agent.ts`, `answer-evaluator.ts`) | PROTECTED — not modified. |
| Session-level scoring (`score-engine.ts`) | PROTECTED — REUSE. `interviewReadiness` is read directly, never recomputed. |
| Session completion UI (`MockInterviewScore.tsx`, `MockInterviewReport.tsx`) | ALREADY IMPLEMENTED — REUSE, untouched. Already render category scores, topic scores, strengths/weaknesses, learning roadmap. |
| Interview coverage engine (`interview-coverage.ts`) | PROTECTED / REUSE — M3's coverage, priority (`classifyTopic`), and deduplication (`deduplicateQuestions`) logic is called directly, never re-implemented. One additive change: `normalizeTopic` changed from module-private to exported (see §4). |
| Interview intelligence service | PROTECTED / REUSE — `computeInterviewIntelligence()` is called directly for the session's linked prep report; not modified. |
| Study Plan (`buildStudyPlan`, M4) | PROTECTED / REUSE — called directly with a reordered input; no second study-plan implementation. |
| resumeVersion integration (M2) | Untouched — mock interview sessions already reach resumeVersion-seeded resumes/JDs transparently through `resumeService`/`jdMatchService`, exactly as before. |
| Authentication / ownership | AUDITED, DOCUMENTED, INTENTIONALLY NOT CHANGED — see §9. |
| Session-history mechanism | NONE EXISTS beyond the 2-hour in-memory `SessionRecord` itself — no separate history store to reuse or duplicate. |
| MultiAgentCoordinator / Planner / Tool Registry / PortfolioChain / resume parser / JD parser / ATS engine / JD matcher / recruiter architecture / DB schema | PROTECTED — none touched. No migration was required or added. |

## 2. Existing functionality reused

- `sessionService.get()` — the sole read path into a `SessionRecord`, used exactly as every sibling route (`.../route.ts`, `.../export/route.ts`) already uses it.
- `SessionRecord.report` (`SessionReport`) — `overallScore` and `interviewReadiness` are read directly as the debrief's own summary and as the sole input to the new readiness recommendation; never recomputed.
- `SessionRecord.transcript` / `questions` / `questionsMissedText` — the only source of "what was actually asked/answered/skipped in this session"; no new session-tracking field was added.
- `computeInterviewIntelligence(prepId)` (M3) — called unmodified to get the session's linked Preparation Plan (`PreparationPlanItem[]`, already priority/evidence-tagged) and the flattened, already-priority-sorted question list (`BrowsableQuestion[]`, M4).
- `buildStudyPlan()` (M4) — called directly, over a reordered copy of its own input, to produce the "Updated Study Plan" (see §8). Never re-implemented.
- `deduplicateQuestions()` (M3) — reused to collapse near-duplicate transcript questions on the same topic before averaging (Step 10's edge case).
- `READINESS_LABEL_THRESHOLD` (M4, value 60) — reused as this milestone's own "Demonstrated"/"Strong"/"READY_FOR_INTERVIEW" bar, never a second invented cutoff.
- `QuestionAnswerCard`, `Tabs`, and every existing Mock Interview tab (`Setup`, `Interview`, `Live Feedback`, `Score`, `Report`, `History`) — untouched; the Debrief is one more `TabItem`.
- The Mock Interview and Interview Preparation routes/URLs (`/mock-interview?resumeId=&jdMatchId=&prepId=`, `/interview-preparation?resumeId=&jdMatchId=`) — reused verbatim for every Debrief CTA.

## 3. Genuine gaps found and filled

M5's actual contribution is a single new deterministic module and its presentation layer:

1. No cross-reference existed between a mock interview session's real, demonstrated performance and M3/M4's JD/resume-derived coverage, priority, and study plan — session scoring and Interview Preparation intelligence were two disconnected systems.
2. No "category performance" view existed keyed to the JD/resume-aligned taxonomy (`Technical/Resume/JD/Behavioral/System Design/Coding`) — only mock-interview's own 8-key evaluation-dimension taxonomy (`technical/communication/problemSolving/architecture/leadership/confidence/coding/behavioral`) existed, which answers a different question.
3. No "was this priority topic demonstrated in the interview" classification existed.
4. No post-session study-plan reprioritization existed.
5. No single "should I attempt another interview" recommendation existed (only the raw `interviewReadiness` number).

## 4. Files added

- `src/lib/ai/mock-interview/session-debrief.ts` (+ `.test.ts`) — the one new pure, deterministic, zero-LLM module.
- `src/app/api/ai/mock-interview/[sessionId]/debrief/route.ts` — the new read-only endpoint.
- `src/components/mock-interview/MockInterviewDebrief.tsx` — the new Debrief tab's UI.

## 5. Files modified

- `src/lib/ai/interview-prep/interview-coverage.ts` — one additive change: `normalizeTopic` changed from a module-private helper to an exported one, so `session-debrief.ts` can match a session question's own free-text topic against M3/M4's topics without re-declaring the same normalization. This is the allowed reuse direction: mock-interview already depends on interview-prep (`session-service.ts` already imports `prepService`, `buildLearningRoadmap`, etc.), never the reverse — the same one-directional layering rule M3 itself established. No other line in this file changed.
- `src/app/(site)/mock-interview/page.tsx` — added the "Debrief" tab (`key={session.sessionId}` on `MockInterviewDebrief`, so a new session cleanly remounts it — see §12).
- `src/components/mock-interview/MockInterviewSetup.tsx` — one small additive change: reads an optional `?interviewType=` query param to preselect the form's Interview Type (falls back to `"Mixed"` for anything missing/invalid, exactly as before). This exists solely so the Debrief's "Practice weak category" CTA can pre-fill a sensible starting type; it does not bypass the form, the question-selection cascade, or add any new interview-type taxonomy.

## 6. Data flow

```
GET /api/ai/mock-interview/{sessionId}/debrief
  -> buildSessionDebrief(sessionId)
       -> sessionService.get(sessionId)                [existing, unmodified]
       -> (if session.prepId) computeInterviewIntelligence(prepId)  [M3, unmodified]
            -> prepService.get / resumeService.get / jdMatchService.get  [existing, unmodified]
       -> buildSummary(session)                          [new, pure]
       -> buildCategoryPerformance(session)               [new, pure]
       -> buildTopicPerformanceMap(session)                [new, pure — dedupes via M3's deduplicateQuestions]
       -> buildCoverageImpact(intelligence.plan, topicPerformance)  [new, pure]
       -> reprioritizeStudyPlan(intelligence.questions, topicPerformance)  [new, pure — calls M4's buildStudyPlan()]
       -> computeReadinessRecommendation(interviewReadiness, criticalWeaknessCount)  [new, pure]
```

Every input is either the session's own already-persisted data or an already-computed M3/M4 result. No new LLM call anywhere in this path — confirmed by inspection (no `openai` import in `session-debrief.ts` or the new route/component) and by the test suite running entirely under the same `vi.mock("../openai", ...)` guard M3/M4's own tests use (required only because `interview-coverage.ts` transitively imports `question-generator.ts`, never because this milestone calls it).

## 7. Debrief model

`SessionDebrief` (`session-debrief.ts`):

- `summary` — `totalQuestions`, `answeredQuestions`, `skippedQuestions`, `evaluatedQuestions`, `overallScore`, `readinessLevel` (both read directly from `session.report`), `completionPercentage` (`answeredQuestions / totalQuestions`, `0` when `totalQuestions` is `0` — never a division-by-zero).
- `categoryPerformance` — one row per `CoverageCategory` (`technical/resume/jd/behavioral/systemDesign/coding`), each with `questionsAsked`, `questionsAnswered`, `averageScore` (`null`, never `0`, when nothing was asked), `performanceLevel` (`Strong ≥ 60`, `Moderate 30–59`, `Needs Practice < 30`, `Not Assessed` when `averageScore` is `null`), and up to 5 deduped strengths/weaknesses pulled verbatim from the session's own per-turn evaluations.
- `readinessRecommendation` — always present (`READY_FOR_INTERVIEW` / `PRACTICE_BEFORE_INTERVIEW` / `NEEDS_FOCUSED_PREPARATION`).
- `coverageImpact`, `criticalWeaknesses`, `strongAreas`, `practiceRecommendations`, `updatedStudyPlan` — all `null` together, with `coverageUnavailableReason` explaining why, when the session has no linked prep report or that report has since expired. Never partially populated with fabricated data.

## 8. Coverage cross-reference logic

`buildTopicPerformanceMap()` groups the session's own transcript by normalized question topic (`normalizeTopic`, reused from `interview-coverage.ts`), first collapsing near-duplicate questions via M3's `deduplicateQuestions()` (Step 10) so a repeated/rephrased question on the same topic doesn't get double-counted. Each topic is classified into one of four states:

- **Demonstrated** — average score ≥ 60 (`DEMONSTRATED_THRESHOLD`, reusing `READINESS_LABEL_THRESHOLD`).
- **Partially demonstrated** — average score 30–59.
- **Not demonstrated** — average score < 30, *or* the question was skipped (recorded via `session.questionsMissedText`, matched back to its topic) with no other answered turn on that same topic taking priority.
- **Not assessed** — the topic never appears in the transcript or the skip list at all. This is the explicit, conservative default for anything the session never asked about — the module never concludes a candidate "lacks" a skill merely because it wasn't asked (verified by a dedicated test).

`buildCoverageImpact()` applies this classification to the session's linked `InterviewIntelligence.plan` — the exact same priority-tagged "Must Prepare / High Priority / Recommended / Optional" topic list M3/M4 already curate for the JD/resume-driven technical, JD, and resume-skill topics. Behavioral/System-Design/Coding topics are deliberately excluded from this specific cross-reference (they don't carry a JD-mandatory-style priority in M3's own coverage model) and are instead covered by the separate, simpler `categoryPerformance` roll-up (§7).

## 9. Study-plan reprioritization

`reprioritizeStudyPlan()` partitions M4's own `BrowsableQuestion[]` (already priority-sorted) into "topics assessed as Not demonstrated this session" and everything else, moves the former to the front (preserving relative order within each group), reassigns `studyOrder`, and calls M4's real `buildStudyPlan()` on the result — the exact same Today/Next/Later bucketing and step numbering, never a second implementation. Each resulting entry gets `moved: boolean` (true only if its new position is genuinely earlier than its original one) and a `moveReason` that is either:

- `"Moved higher because this topic was assessed in the mock interview and the response scored below the readiness threshold (N/100)."`, or
- `"Moved higher because this topic's question was skipped during the mock interview."`

and is `null` whenever `moved` is `false` — never a fabricated reason.

## 10. Security / ownership model

Mock interview sessions use the same unauthenticated, ephemeral bearer-capability-token model as every sibling tool in this product family (`resumeService`, `jdMatchService`, `prepService`, `sessionService` itself) — confirmed by reading every existing `.../[sessionId]/*` route: none of them check a Supabase session or a user/owner field, because `SessionRecord` has no such field. The `sessionId` UUID itself is the only credential, exactly like every other route already accessing this session (`GET .../[sessionId]`, `.../export`, `.../hint`, `.../control`, `.../answer`).

The new `GET /api/ai/mock-interview/[sessionId]/debrief` route follows this identical model rather than introducing a new, parallel authentication layer for one route in an otherwise-unauthenticated family (explicitly out of scope per the milestone's own Step 13 — "do not modify protected architecture" / "document the conflict rather than introducing a parallel implementation"). This is the same architecture, with the same guarantee level, as the rest of the family — not a regression.

Verified:
- **sessionId cannot access another user's session in a way distinct from the existing family** — there is no user concept to violate; an unknown/invalid `sessionId` returns a generic 404 with no internal detail (confirmed live, §14).
- **resumeVersionId / resume / JD content cannot be client-substituted** — `buildSessionDebrief(sessionId: string)` accepts only the session ID; every resume/JD/score/coverage value is derived server-side from `sessionService.get()` and `computeInterviewIntelligence()`, never from request body/query.
- **Scores and coverage cannot be client-forged** — the debrief route accepts no request body at all (`GET`, no payload); nothing from the client is treated as authoritative input.

## 11. Edge cases (Step 10 of the spec)

| Case | Behavior |
|---|---|
| Empty session (0 questions) | `summary.totalQuestions = 0`, `completionPercentage = 0` (no division by zero); every category `Not Assessed` |
| All questions skipped | Each skipped topic → `Not demonstrated`; `answeredQuestions = 0` |
| Partially completed session | `SessionNotCompletedError` → 409, never a partial/fabricated debrief |
| Completed session, no evaluation scores | Same as "all skipped" if nothing was answered; categories with zero answered turns are `Not Assessed`, never `0` |
| Session with only one category | Other 5 categories correctly show `Not Assessed` |
| Resume-only interview with no JD | Not reachable — mock interview sessions always require both `resumeId` and `jdMatchId` (audited: `MockInterviewSetup`/`session-service.start()` reject a missing JD match) |
| JD interview with missing JD data | Same as above — `jdMatchService.get()` failing throws before a session can even start; nothing for the debrief to handle post hoc |
| Coverage item not assessed | `Not assessed`, never `Not demonstrated` (dedicated test) |
| Topic assessed but answer skipped | `Not demonstrated`, `averageScore: null` (dedicated test) |
| Duplicate/near-duplicate questions | Collapsed via `deduplicateQuestions()` before averaging; only the kept turn's score counts (dedicated test) |
| Missing resumeVersion context | Not this milestone's concern — resumeVersion integration (M2) happens upstream at resume/JD-match seeding time; the debrief only ever reads the resulting `resumeId`/`jdMatchId`, identically regardless of how they were seeded |
| Invalid/nonexistent session | `SessionDebriefNotFoundError` → 404 (live-verified, §14) |
| Cross-user session access | No distinct concept from "invalid session" in this architecture — see §10 |
| No linked prep report (`prepId` null) or an expired one | `coverageImpact`/`criticalWeaknesses`/`strongAreas`/`practiceRecommendations`/`updatedStudyPlan` all `null`, with an explicit `coverageUnavailableReason`; `summary`/`categoryPerformance`/`readinessRecommendation` still fully computed |

## 12. UI notes

`MockInterviewDebrief.tsx` is a new "Debrief" tab alongside the existing Setup/Interview/Live Feedback/Score/Report/History tabs — nothing else in `mock-interview/page.tsx` was rebuilt. It shows the session result, the category performance table, "What You Demonstrated"/"What Needs Practice" panels, the Coverage Impact list (or the unavailable-reason message), the reordered Study Plan, and four CTAs (Start Another Mock Interview, Practice \<weakest category\> — only rendered when a genuinely weak category exists, Review Study Plan, Return to Interview Dashboard), all reusing existing routes.

State management note: an early implementation called `setLoading`/`setError`/`setDebrief` synchronously inside the fetch effect's body, which `eslint-plugin-react-hooks`'s `set-state-in-effect` rule correctly flagged (calling `setState` synchronously in an effect risks cascading renders). Fixed by deriving `loading` from a single `{ debrief, error }` result object that is only ever set from inside the fetch's own `.then()`/`.catch()` callbacks, and keying the component by `session.sessionId` in the parent so a new session gets a clean remount instead of needing a manual state reset.

## 13. Tests

19 new tests in `session-debrief.test.ts`, following the exact "mock only the ephemeral getters, exercise M3/M4's real coverage/plan/study-plan math end-to-end" pattern `interview-intelligence-service.test.ts` already established:

- Session lookup errors (invalid session, in-progress session, completed-but-null-report) → correct error types.
- Session summary (totals/skip count/completion %, including the zero-question case).
- Category performance (`Not Assessed` for untouched categories; correct aggregation/averaging for touched ones).
- Graceful "no linked prep report" and "expired prep report" paths.
- Demonstrated vs. Not demonstrated vs. Not assessed classification, including the explicit "never concludes a candidate lacks a skill it was never asked about" case.
- Critical weaknesses / strong areas / deterministic practice recommendations.
- Study-plan reprioritization, including the "already-first CRITICAL topic doesn't get relabeled as moved" and "skipped topic moves up with a skip-specific reason" cases.
- Near-duplicate question collapsing before averaging.
- Skip-vs-answered precedence for the same topic.
- Readiness recommendation threshold boundaries (60 / 30).

## 14. TypeScript / lint / build results

- `npx tsc --noEmit` — 0 errors.
- `npm run lint` — 0 errors, 1 pre-existing warning unrelated to this milestone (`no-img-element` in `blog/[slug]/page.tsx`). One real lint error (`react-hooks/set-state-in-effect`) was found and genuinely fixed during this milestone (§12), plus 2 unescaped-apostrophe errors, both fixed.
- `npm run build` — succeeds; `/mock-interview` and `/api/ai/mock-interview/[sessionId]/debrief` both compile cleanly (the new route confirmed present in the build's route listing).

## 15. Full test result

- Before this milestone: **877/877** passing (M4 baseline).
- After this milestone: **896/896** passing (67 test files) — 19 new tests, 0 regressions.

## 16. Live validation

Production server (`npm run start`) probes:

```
GET /mock-interview                                              → 200
GET /api/ai/mock-interview/nonexistent-session/debrief           → 404
  {"error":"Mock interview session not found or expired."}
GET /api/ai/mock-interview/nonexistent-session (sibling route, for comparison) → 404
  {"error":"Mock interview session not found or expired"}
```

The debrief route's 404 behavior matches its sibling routes exactly — no internal detail leaked, consistent error shape. Server was cleanly stopped after validation.

**Not executed, and not claimed**: a full authenticated/real end-to-end walkthrough (start a real session → answer real questions via the LLM evaluator → end it → fetch its debrief → verify the rendered UI) was not performed. This requires live OpenAI calls through the full question-selection/evaluation cascade and, per every prior milestone in this arc, the environment's Supabase/live-service limitation blocks that kind of run here. The 409 (`SessionNotCompletedError`) and full-data-flow paths were instead verified via the unit test suite (§13, §15), which exercises the same `computeInterviewIntelligence`/coverage/study-plan code paths the live route calls, against real (not live-network) data.

## 17. Known limitations

- No live-LLM end-to-end validation was performed (see §16) — consistent with every prior milestone's documented limitation.
- The "Practice weak category" CTA maps a `CoverageCategory` to a starting `InterviewType` using a small, fixed, documented lookup (e.g. `resume → "Project Deep Dive"`, `jd → "Technical"`) rather than a precise reverse-derivation — this is a reasonable, conservative default, not a guarantee the next session will ask about that exact category.
- "Review Study Plan" and "Return to Interview Dashboard" currently point at the same `/interview-preparation` URL (both tabs live on that one page, and there is no existing mechanism to deep-link a specific tab via URL); they are kept as two distinct, clearly-labeled CTAs rather than merged, since a future milestone could legitimately give the Interview Preparation page tab deep-linking.
- Coverage Impact / Critical Weaknesses / Study-Plan reprioritization are unavailable for sessions with no linked Interview Preparation report (`prepId` was never set, e.g. a mock interview started directly without first generating a prep report) — by design, not a bug; `coverageUnavailableReason` explains this to the user.

## 18. Recommended Milestone 6

A natural next step is a lightweight **Cross-Session Progress View**: since mock interview sessions are currently fully ephemeral (2-hour TTL, no history store), even a minimal, still-ephemeral "compare this session's debrief to your previous session in this same browser tab's memory" (client-side only, no new persistence/migration) would let a candidate see whether a specific weak topic actually improved across two consecutive practice attempts — reusing this milestone's own `SessionDebrief` shape for both sides of the comparison, with the same audit-first, reuse-first, zero-new-LLM-call discipline as M1–M5.
