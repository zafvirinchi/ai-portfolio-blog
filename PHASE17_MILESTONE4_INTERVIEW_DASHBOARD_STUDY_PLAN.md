# Phase 17 — Milestone 4: Interview Preparation Dashboard, Study Plan & Actionable Readiness

## 1. Objective

Turn Milestone 3's deterministic coverage/priority/evidence intelligence
(`interview-coverage.ts`, `interview-intelligence-service.ts`) into a
presentation-and-action layer inside the existing `/interview-preparation`
page: an overview dashboard, a "Must Prepare" plan view, coverage
visualization, JD gap and resume evidence panels, filterable/searchable
question browsing, a deterministic study plan, actionable readiness
recommendations, and a prominent Mock Interview CTA. No new engines, no
new LLM calls beyond what M1–M3 already introduced, no new persistence,
no database migration.

## 2. Audit findings

Before writing anything, the existing `/interview-preparation` page,
`PrepOverview.tsx`, `Tabs.tsx`, `QuestionAnswerCard.tsx`,
`MockInterviewSetup.tsx`, and the M3 coverage endpoint were read in full.

| Capability requested by M4 | Status |
|---|---|
| Readiness score, sub-scores | ALREADY IMPLEMENTED — REUSE (`report.readinessScore`, Phase 13 M3) |
| Coverage %, plan tiers, JD gaps, evidence | ALREADY IMPLEMENTED (M3) — REUSE, only needed a presentation layer |
| Question list rendering per category | ALREADY IMPLEMENTED — REUSE (`PrepTechnicalQuestions`, `PrepHrQuestions`, etc., unchanged) |
| Ideal-answer expand/collapse | ALREADY IMPLEMENTED — REUSE (`QuestionAnswerCard.tsx`, untouched) |
| Mock Interview route/handoff | ALREADY IMPLEMENTED — REUSE (`/mock-interview?resumeId=&jdMatchId=&prepId=`) |
| Overview dashboard (readiness label, recommended action) | MISSING — IMPLEMENT MINIMALLY |
| Coverage visualization with percentages/bars | MISSING — IMPLEMENT MINIMALLY (percentage math added to `interview-coverage.ts`) |
| JD Gap panel, Resume Evidence panel | MISSING — IMPLEMENT MINIMALLY |
| Unified filter/search across all question types | MISSING — IMPLEMENT MINIMALLY (one utility, `question-filters.ts`) |
| Deterministic Study Plan | MISSING — IMPLEMENT MINIMALLY |
| "Mark for Practice" / question bookmarking | NOT SAFELY VERIFIABLE WITHOUT A MIGRATION — deliberately NOT built; see §17 |
| Interview scheduling / calendar dates | FORBIDDEN BY SPEC — not built |
| MultiAgentCoordinator `"resume"` vs `"interview"` bypass bug | PROTECTED — DOCUMENT, DO NOT MODIFY (confirmed still present, confirmed the dedicated `/mock-interview` page is unaffected since it never routes through the coordinator) |
| Knowledge Base, JD parser, resume parser, ATS/readiness scorer, mock interview engine, MultiAgentCoordinator, Planner, Tool Registry, PortfolioChain | PROTECTED — none modified |

## 3. Existing functionality reused

- `report.readinessScore` (Phase 13 M3) — the only readiness score; no
  second algorithm was written. The dashboard adds only a **label**
  (`computeReadinessLabel`) on top of the existing `overall` number.
- M3's `computeInterviewCoverage`, `classifyTopic`, `buildPreparationPlan`,
  `deduplicateQuestions` — all unchanged, still the sole source of
  coverage/priority/evidence data.
- `QuestionAnswerCard.tsx` — reused directly inside the new Practice tab
  via a local `resolveAnswer()` lookup, not rebuilt.
- The Mock Interview route and its `resumeId`/`jdMatchId`/`prepId` query
  contract — reused verbatim for every new CTA (header button, Practice
  tab "Start Mock Interview", "Practice Critical Questions").
- `prepService.get()`, `resumeService.get()`, `jdMatchService.get()` —
  the same three getters M3's orchestrator already composed; M4 adds no
  new store reads.
- `Tabs.tsx` — the existing tab component; the new "Practice" tab is
  just one more `TabItem`.

## 4. Genuine gaps identified and filled

1. No readiness **label** or plain-English recommended next action
   existed — only the raw `overall` number.
2. No percentage view of coverage existed — only raw covered/missing
   arrays.
3. No JD-gap-specific view existed — gaps were buried inside the
   preparation plan's tiers, not surfaced skill-by-skill against the JD.
4. No resume-evidence summary existed (current role, projects,
   technologies, achievements, leadership signals) for interviewees to
   sanity-check what the AI is drawing on.
5. No unified way to filter/search across all four question categories
   at once — each category lived in its own tab with no shared filter
   state.
6. No study plan/ordering existed — questions had priority but no
   explicit "do this first" sequencing.

## 5. Overview dashboard

`PrepOverview.tsx` (extended) now shows, when `intelligence` has loaded:
- A readiness-label badge (`"Ready for Interview"` / `"Needs More
  Preparation"`) next to the existing readiness score, using the
  existing 60-point threshold (`READINESS_LABEL_THRESHOLD`, re-declared
  to mirror Phase 16 M8's `READY_FOR_INTERVIEW_THRESHOLD` precedent —
  interview-prep has no dependency on the recruiter package).
- A "Recommended Next Action" callout with a deterministic sentence
  (`buildRecommendedAction`) naming the top critical topics, or falling
  back to high-priority topics, or a calm "no gaps" message.
- Per-category coverage percentage bars plus an overall percentage
  summary.
- Critical/high-priority question counts as additional stat tiles.

## 6. Coverage presentation

`computeCategoryCoveragePercent` / `computeOverallCoveragePercent`
(`interview-coverage.ts`) return `null` for an empty category (0
covered + 0 missing) rather than fabricating 0% or 100% — the UI only
renders a percentage/bar when one is mathematically meaningful.

## 7. JD gap presentation

`buildJdGapAnalysis` walks the JD's mandatory + good-to-have skills,
cross-references the resume skill set and the M3 coverage map via
`classifyTopic`, and returns each skill's priority, whether it's
missing from the resume, whether it's missing from question coverage,
and any cheat-sheet-derived recommended preparation points (reused from
M1's cheat sheet, never invented). `PrepJdGapPanel.tsx` renders this
list with explicit "Resume: Missing/Present" and "Interview Coverage:
Missing/Covered" `aria-label`s; renders nothing if there are no gaps.

## 8. Resume evidence presentation

`buildResumeEvidenceSummary` extracts current role/company, project
names, technologies, achievements, and leadership signals (detected via
a fixed verb list — `led`, `managed`, `mentored`, etc. — against the
resume's own work-experience bullet lines; never invents a signal that
isn't textually present). `PrepResumeEvidencePanel.tsx` omits any empty
section and renders nothing if the resume has no evidence at all.

## 9. Question filters

One reusable, pure utility: `question-filters.ts`
(`filterQuestions(questions, filters)`), operating over
`BrowsableQuestion[]` produced by `flattenQuestionsForBrowsing`. Filters
by category, priority, and difficulty (`"All"` = no filter), combined
with AND semantics. Used by exactly one consumer, `PrepPracticeTab.tsx`.

## 10. Search

The same `filterQuestions` call also applies a case-insensitive
substring search across the question text, topic, category, evidence
source, and reason — one code path for both filtering and search, no
separate search index or service.

## 11. Study plan

`buildStudyPlan` takes the already priority-sorted `BrowsableQuestion[]`
and assigns a sequential `step` number and a `"Today" | "Next" |
"Later"` bucket (first 3 → Today, next 2 → Next, remainder → Later) —
an ordering, never a calendar date. Verified by test that
`JSON.stringify(plan)` never matches a `YYYY-MM-DD` pattern.

## 12. Readiness recommendations

`buildRecommendedAction` is the only new "recommendation" logic, and it
is a deterministic sentence generator over the existing preparation
plan — not a second scoring algorithm. It reuses `plan[].priority`
exactly as produced by M3's `buildPreparationPlan`.

## 13. Mock Interview integration

Every new CTA (`PrepPracticeTab.tsx`'s "Start Mock Interview" and
"Practice Critical Questions (N)" buttons) links to the identical,
pre-existing `/mock-interview?resumeId=&jdMatchId=&prepId=` route used
by the header button since M2 — no new query parameters, no attempt to
pass an interview "type" or "mode", and no modification to
`MultiAgentCoordinator`, `Planner`, `Tool Registry`, or `PortfolioChain`.
The known `intent === "resume"` vs `"interview"` coordinator bypass bug
was re-confirmed present and confirmed irrelevant to this page (which
calls the mock-interview API routes directly, never through the
coordinator) — left untouched per spec.

## 14. Empty / loading / error states

- If `intelligence` hasn't loaded yet (in flight or failed), the
  Overview tab still renders fully using only `report` data, and the
  Practice tab is simply omitted from the tab list (conditional spread
  in `interview-preparation/page.tsx`) rather than rendering broken.
- `PrepPracticeTab.tsx` shows "No questions match these filters." when
  a filter/search combination excludes everything.
- `PrepJdGapPanel.tsx` / `PrepResumeEvidencePanel.tsx` render `null`
  (no empty box) when there is genuinely nothing to show.
- The page's pre-existing report-generation loading/error states
  (spinner text, `role="alert"` error box) are unchanged.

## 15. Accessibility

All required `aria-label`s implemented verbatim:
- `"Filter interview questions by category"`, `"Filter interview
  questions by priority"`, `"Filter interview questions by
  difficulty"` (three `<select>`s in `PrepPracticeTab.tsx`).
- `"Search interview questions"` (search `<input>`).
- `"Start mock interview"` / `"Start Mock Interview"` (Practice tab and
  header CTA respectively).
- `"View critical interview questions and practice them in a mock
  interview"` — descriptive label on the critical-questions CTA.
- `role="progressbar"` with `aria-valuenow/min/max` on every coverage
  bar (overall readiness bar and per-category bars).
- Descriptive `aria-label`s on tier headings (`"${tier} interview
  topics"`) and study-plan bucket headings (`"${BUCKET} study steps"`).

## 16. Responsive behavior

No new layout system — all new panels reuse the existing Tailwind
grid/flex patterns (`grid gap-4 sm:grid-cols-2 lg:grid-cols-3`, `flex
flex-wrap gap-3`) already used throughout the interview-prep components.

## 17. Security validation

- No new persistence was added. "Mark for Practice" / bookmarking was
  explicitly NOT built (would require a migration or new store) —
  reframed instead as direct Mock Interview CTAs.
- The coverage endpoint and all new panels only ever consume the
  already-fetched `InterviewIntelligence` object; no resume or JD text
  is placed in a URL — only opaque `resumeId`/`jdMatchId`/`prepId`
  UUIDs, exactly as before this milestone.
- Zero new LLM calls. All M4 additions are pure, synchronous functions
  over already-fetched data.
- The invalid-`prepId` case on the coverage endpoint returns a generic
  404 (`"Interview preparation report not found or expired."`) with no
  internal detail — confirmed via live `curl` (see §26).

## 18. Performance considerations

- No duplicate JD or resume parsing — `interview-intelligence-service.ts`
  still calls `prepService.get()` / `resumeService.get()` /
  `jdMatchService.get()` exactly once each, same as M3.
- No N+1: `flattenQuestionsForBrowsing` and `buildStudyPlan` are single
  linear passes over the already-generated question arrays.
- `categoryCoveragePercents` is computed once, server-side, in
  `computeInterviewIntelligence`, alongside the coverage map it derives
  from — not recomputed per render.

## 19. Files added

- `src/lib/ai/interview-prep/question-filters.ts` (+ `.test.ts`)
- `src/components/interview-prep/PrepJdGapPanel.tsx`
- `src/components/interview-prep/PrepResumeEvidencePanel.tsx`
- `src/components/interview-prep/PrepPracticeTab.tsx`

(`interview-coverage.ts`, `interview-intelligence-service.ts`, and their
tests were added in M3 and are extended, not newly added, in M4.)

## 20. Files modified

- `src/lib/ai/interview-prep/interview-coverage.ts` — additive exports:
  `READINESS_LABEL_THRESHOLD`, `computeReadinessLabel`,
  `computeCategoryCoveragePercent`, `computeOverallCoveragePercent`,
  `buildRecommendedAction`, `JdGapItem`/`buildJdGapAnalysis`,
  `ResumeEvidenceSummary`/`buildResumeEvidenceSummary`,
  `BrowsableQuestion`/`flattenQuestionsForBrowsing`,
  `StudyPlanBucket`/`StudyPlanEntry`/`buildStudyPlan`.
- `src/lib/ai/interview-prep/interview-intelligence-service.ts` —
  `InterviewIntelligence` extended with `readinessLabel`,
  `overallCoveragePercent`, `categoryCoveragePercents`,
  `recommendedAction`, `jdGaps`, `resumeEvidence`, `questions`,
  `studyPlan`.
- `src/components/interview-prep/PrepOverview.tsx` — readiness label,
  recommended-action callout, coverage percentage bars, JD gap and
  resume evidence panels.
- `src/app/(site)/interview-preparation/page.tsx` — new conditional
  "Practice" tab.
- `src/lib/ai/interview-prep/interview-coverage.test.ts` — new
  `describe` blocks for every M4 addition.

## 21. APIs added / modified

None. `GET /api/ai/interview-prep/[prepId]/coverage` (added in M3) is
reused unmodified — its response shape simply grew additively via the
`InterviewIntelligence` interface extension in §20.

## 22. Database changes

None. No migration was added or required.

## 23. Tests added

`question-filters.test.ts` (10 tests: category, priority, difficulty,
search-by-question/topic/evidence-source, case-insensitivity, combined
AND filtering, empty-result handling) plus new `describe` blocks in
`interview-coverage.test.ts` covering: `computeReadinessLabel`
(threshold boundary at 60/59), `computeCategoryCoveragePercent` /
`computeOverallCoveragePercent` (including null-for-empty-category),
`buildRecommendedAction` (critical-topics-named, calm-fallback),
`buildJdGapAnalysis` (missing-from-resume true/false, cheat-sheet
reuse), `buildResumeEvidenceSummary` (verbatim data, real leadership
signal detected, no fabricated signal), `flattenQuestionsForBrowsing` /
`buildStudyPlan` (category tagging, determinism across two independent
calls, no calendar dates ever present in the plan).

## 24. Full test result

```
Test Files  66 passed (66)
     Tests  877 passed (877)
```

## 25. TypeScript result

`npx tsc --noEmit` — 0 errors.

## 26. Lint result

`npm run lint` — 0 errors, 1 pre-existing warning unrelated to this
milestone (`no-img-element` in `blog/[slug]/page.tsx`).

## 27. Build result

`npm run build` succeeded. This required one genuine bug fix
(documented below) beyond the milestone's originally-scoped work:
`PrepOverview.tsx` had a real (non-type-only) runtime import of
`computeCategoryCoveragePercent` from `interview-coverage.ts`. Because
`interview-coverage.ts` transitively imports the metered OpenAI client
(`question-generator.ts` → `../openai` → usage-metering →
`saas/tenant-context.ts`, which uses `next/headers`), this dragged a
server-only dependency chain into the client bundle and broke
Turbopack's production build with a "You're importing a module that
depends on 'next/headers'" error. Fixed by moving the percentage
computation server-side into `interview-intelligence-service.ts`
(already server-only) as a new `categoryCoveragePercents` field on
`InterviewIntelligence`, and changing `PrepOverview.tsx` to read that
pre-computed value instead of importing the function. `question-filters.ts`'s
import of `BrowsableQuestion`/`CoverageCategory`/`PriorityLevel` was
also defensively converted to `import type` since these are type-only
bindings consumed by a client component. Live validation confirms
`/interview-preparation` now builds and serves as a static route (`○`).

Live server probes (production build, `npm run start`):
```
GET /interview-preparation                                        → 200
GET /interview-preparation?resumeVersionId=<uuid>                 → 200
GET /mock-interview                                                → 200
GET /api/ai/interview-prep/nonexistent-id/coverage                → 404
  {"error":"Interview preparation report not found or expired."}
```
No sensitive data (resume/JD text, internal error detail) appeared in
any URL or error response. Server was cleanly stopped after validation.

## 28. Known limitations

- Authenticated end-to-end validation (real Supabase-backed resume
  upload → JD match → prep generation → dashboard walkthrough) remains
  blocked by the same environment/Supabase limitation noted in every
  prior milestone; validation here is limited to static routing,
  build/type/lint/test correctness, and error-path probing.
- "Mark for Practice" / persistent bookmarking was deliberately not
  built (would require new persistence or a migration) — the dashboard
  substitutes direct-to-Mock-Interview CTAs instead.
- The `MultiAgentCoordinator` `"resume"` vs `"interview"` intent bypass
  bug remains unfixed, as instructed; it does not affect this
  dashboard's dedicated Mock Interview links.
- The difficulty filter uses the existing data vocabulary (Easy/Medium/Hard)
  rather than a Beginner/Intermediate/Advanced label set that appears
  nowhere in the underlying `Difficulty` type.

## 29. Recommended Milestone 5

A natural next step is a lightweight **Interview Session Debrief**: after
a mock interview completes, surface a read-only summary that cross-references
the mock interview's own scoring (already computed by the Phase 13 M4
engine) against this milestone's coverage/study-plan data — e.g. "you
practiced 4 of your 7 critical questions" — without building a second
scoring algorithm or any new persistence, following the same audit-first,
reuse-first discipline as M1–M4.
