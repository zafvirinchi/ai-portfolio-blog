# Phase 13 Milestone 3 — AI Interview Preparation Engine

## Goal

Combine an already-parsed resume, an already-computed JD match, and the
existing Interview Knowledge Base into one personalized interview-prep
report: readiness score, technical/HR/project/system-design questions
with ideal answers, weakness/confidence analysis, coding practice
topics, a day-by-day learning roadmap, and a cheat sheet. Not a mock
interview — preparation material, generated once and downloadable.
Purely additive: a new package, three new routes, a new page, and small,
explicitly-scoped hooks into two existing chat tools.

## Which "current system" this builds on

The spec's own framing ("uses BOTH Parsed Resume and Parsed Job
Description") points at Phase 12 Milestone 4's JD Intelligence Engine
(`src/lib/ai/job-description/`) — the only existing pipeline that
actually produces a `JdMatchResult` (ATS score, missing skills, match
percentage). Phase 13 Milestone 1's standalone `job/` package has no
comparison capability and isn't used here. Everything this milestone
reads is read-only reuse: `resumeService`, `jdMatchService`,
`resumeSuggestionsEngine.analyzeSkillGap()`, `searchInterviewQuestions()`.

## Architecture

```
Resume (resumeService.get)  +  JdMatchResult (jdMatchService.get)
        │
        ▼
POST /api/ai/interview-prep
        │
        ▼
PrepService.generate()
        │
        ├─► deriveTechnicalTopics(jd, resume)      the spec's own example
        │                                          topic list, filtered to
        │                                          what's actually present
        │
        ├─► coverTechnicalTopicsFromKb(topics)      searchInterviewQuestions()
        │     KB-first: topics with ≥3 relevant     per topic (read-only,
        │     real matches never touch the LLM      Interview Extraction
        │                                           untouched)
        │
        ├─► generateQuestionsAndAnswers()           the ONE LLM call —
        │     gpt-4o-mini, structured output          AI technical questions
        │                                              (uncovered topics only)
        │                                            + all HR/project/
        │                                              system-design questions
        │                                            + every item's ideal
        │                                              answer, same response
        │
        ├─► recommendCodingTopics()                 deterministic — topic/
        │                                            difficulty/platform only,
        │                                            never a specific problem
        │
        ├─► analyzeWeaknesses() / analyzeConfidence() deterministic — reuses
        │                                            JdMatchResult's category
        │                                            scores + SkillGap
        │
        ├─► buildLearningRoadmap()                  deterministic — buckets
        │                                            SkillGap's recommended
        │                                            courses/certs/projects
        │                                            across 4 timeframes
        │
        ├─► buildCheatSheet()                       deterministic — curated,
        │                                            factually-checked static
        │                                            reference table
        │
        └─► computeReadinessScore()                 deterministic — weighted
                                                      formula over already-
                                                      computed inputs
        │
        ▼
InterviewPreparationReport  ->  stored in-memory (2h TTL), keyed by prepId
```

Only the question/answer generation is genuinely generative. Every other
section is a pure function over data these pipelines already computed —
same "compute what can be computed" philosophy every deterministic score
in this codebase (`resume-score.ts`, `ats-engine.ts`, `resume-optimizer.ts`)
already follows. This keeps one "Generate Interview Preparation" click to
exactly one LLM call.

## New package: `src/lib/ai/interview-prep/`

- `prep-schema.ts` — Zod schemas for the LLM-output shape (questions +
  embedded ideal answers, one strict `json_schema`) and the deterministic
  section shapes (readiness score, weakness/confidence analysis, coding
  recommendations, learning roadmap, cheat sheet), assembled into
  `interviewPreparationReportSchema`.
- `prep-types.ts` — `PrepGenerateInput`, `PrepRecord`.
- `question-generator.ts` — topic derivation, KB search + relevance
  filtering, the one bulk LLM call, deterministic coding-topic
  recommendations.
- `answer-generator.ts` — standalone single-question ideal-answer
  generator, for on-demand regeneration (chat "explain the ideal answer",
  a UI regenerate affordance) — not called during initial generation.
- `weakness-analyzer.ts` — deterministic weakness/confidence analysis.
- `learning-roadmap.ts` — deterministic 7/15/30/60-day plan builder.
- `study-plan.ts` — deterministic readiness score + cheat sheet.
- `prep-service.ts` — orchestrator, in-memory TTL store,
  `interviewPrepRequestContext` (`AsyncLocalStorage`, same pattern as
  `resumeRequestContext`/`jdMatchRequestContext`), all 5 required
  `[interview-prep]` log lines.
- `index.ts` — barrel.

## New routes

- `POST /api/ai/interview-prep` — `{resumeId, jdMatchId}` → full report.
  `maxDuration = 60`.
- `POST /api/ai/interview-prep/[prepId]/answer` — `{question}` → one
  on-demand ideal answer, backs the chat/UI regenerate flow.
- `GET /api/ai/interview-prep/[prepId]/export?format=markdown|pdf|docx` —
  same shared-sections/`pdfkit`/`docx` pattern every export route in this
  arc uses; new files, nothing reused-by-modification.

## Knowledge Base reuse ("KB first," made real)

`deriveTechnicalTopics()` builds a candidate topic list from the JD's
categorized skills (falling back to the resume's own skills if the JD has
none). For each topic, `coverTechnicalTopicsFromKb()` calls the existing,
unmodified `searchInterviewQuestions()` — a topic with ≥3 genuinely
relevant matches is satisfied entirely from the KB (its questions/answers
reused verbatim, `source: "knowledge-base"`); only topics without enough
real coverage are passed to the LLM call. A well-covered topic never
touches the model at all — verified directly: on a real test JD
(Java 17/Spring Boot/Angular/AWS/Docker/PostgreSQL/Kubernetes/Kafka),
4-7 of the derived topics were served entirely from the KB across
several runs.

## AI prompt design

Two structured-output prompts (`question-generator.ts`'s bulk call,
`answer-generator.ts`'s standalone one) share the same safety spine:
- Technical/system-design answers: genuine, accurate engineering
  guidance — general knowledge, not a claim about the candidate, so the
  model is told to be thorough.
- HR/project (STAR) answers: **coaching guidance in second person**, never
  a first-person narrative claiming a specific event happened — the
  model is shown an explicit WRONG/RIGHT example pair (see Safety Rules
  below) rather than a single abstract instruction, the same
  example-driven technique that fixed fabrication issues in this arc's
  other optimizer prompts (Phase 13 Milestone 2).

## What real testing found (and fixed)

Three real issues surfaced during this milestone's own verification —
not left as theoretical concerns:

1. **Un-deduped topic casing.** `job-description/jd-parser.ts` (protected,
   not modified) has no case-insensitive dedup safety net — a real JD
   extraction returned `["java", "JAVA", "Java 17"]` as three separate
   `programmingLanguages` entries. `deriveTechnicalTopics()` inherited
   this, firing three near-identical KB searches and showing duplicate
   questions. Fixed by normalizing (case-insensitive + strip trailing
   version numbers) and deduping within this milestone's own topic
   derivation — the protected parser itself is untouched; the fix lives
   entirely in new code.
2. **False-positive KB matches.** `searchInterviewQuestions()`'s `ilike`
   search is intentionally broad, and a naive substring relevance check
   let "java" match inside "javascript." Fixed with a proper
   alphanumeric-boundary check. A second pass then found a *data-quality*
   issue in the KB itself — a row literally categorized `topicTitle:
   "Java"` whose actual question was "What is TypeScript?" (Interview
   Extraction, where this would be fixed, is protected). Since the
   category/topic labels are exactly where a batch mis-tagging would
   surface, the relevance check now trusts only the question text and
   tags, not the shared category labels — a stricter, safer check where
   a false negative just falls through to (always-correct) AI generation.
3. **Fabricated behavioral answers.** The first real HR-question test
   produced answers like *"During my time at TechNova Inc., we faced a
   tight deadline..."* — a specific, invented scenario stated as fact,
   despite an explicit "don't fabricate" instruction already in the
   prompt. The instruction wasn't concrete enough. Fixed by adding an
   explicit WRONG/RIGHT example pair to both prompts, reframing every
   STAR field as second-person instructional coaching ("Think of a
   project at [company] where...") rather than a narrated event.
   Re-verified clean across a subsequent full run — every situation/task/
   action/result field now correctly coaches rather than narrates.

No fabricated LeetCode/HackerRank problem names or URLs anywhere —
`recommendCodingTopics()` is fully deterministic, topic/difficulty/
platform guidance only, same anti-fabrication discipline as every other
generative section in this arc.

## Chat integration (Section 13)

`interviewPrepRequestContext` is defined in `prep-service.ts` (kept out
of `resume.tool.ts` deliberately — that file already juggles two
contexts, and this codebase's established pattern is one context per
feature module, e.g. `interview-chat/`'s own `interviewSourcesContext`).
Small, symmetric additive branches were added to **both**
`resume.tool.ts` and `interview.tool.ts` (neither protected — only
Interview Extraction, the admin import pipeline, is) so the context is
available regardless of which one the unmodified Planner routes a
question to. `/api/ai/chat/route.ts` gained one more optional field
(`prepId`), nested inside the existing context chain exactly like
Milestone 4 added `jdMatchId`. Verified: a real chat request with
`prepId` set correctly surfaced the generated questions and weak areas
in its answer.

## UI

`/interview-preparation` (new page, same visual shell as
`/resume-analyzer`/`/ai/job-analyzer`) reads `resumeId`/`jdMatchId` from
URL search params; if either is missing, it prompts the user back to
`/resume-analyzer`. Generation is lazy (button-triggered, not automatic)
— the same cost-conscious pattern Phase 13 Milestone 2's optimizer tab
uses. 9 tabs per the spec (Overview/Technical/HR/Projects/System
Design/Coding/Weaknesses/Learning Plan/Cheat Sheet), reusing
`components/ui/Tabs.tsx`. One small link was added to
`resume-analyzer/page.tsx`'s JD-matched banner ("Prepare for the
interview") — the only change to that file.

## Validation results

- Real end-to-end runs via the production routes (resume upload → JD
  match → interview-prep generate → chat with `prepId` → on-demand
  answer → all 3 exports), on repeatedly fresh dev servers (Turbopack's
  incremental-recompilation module-duplication artifact, already
  documented in this arc's prior milestones, recurred here too —
  resolved the same way, a clean restart; not expected in a deployed
  build).
- All three real bugs above: found, fixed, and re-verified clean.
- All 3 export formats verified with correct `Content-Type` and valid
  file signatures.
- `npm run lint` — 0 errors (1 pre-existing, unrelated warning).
- `npx tsc --noEmit` — clean.
- `npm run build` — clean; all 3 new routes and the new page registered;
  every pre-existing route unchanged.
- No browser tooling available this session — the API/route layer is
  fully HTTP-verified; the tab UI itself wasn't visually confirmed in a
  browser.

## Known limitations

- The LLM occasionally generates one technical question for a topic the
  KB already covered, despite the prompt's "only for these topics"
  restriction — a soft compliance gap (mild redundancy, not incorrect
  content), consistent with this codebase's repeated finding that LLM
  instruction-following is reduced by explicit examples, not guaranteed
  eliminated.
- `deriveTechnicalTopics()`'s version-stripping/dedup is a targeted fix
  for the exact casing pattern real testing found — not a general-purpose
  normalizer; an unusual variant could still slip through.
- The KB relevance filter trades recall for precision (question text +
  tags only, not category labels) — a genuinely relevant KB question
  whose only topic signal is its (correct) category label will now
  incorrectly fall through to AI generation. Safe (never wrong), just
  occasionally less efficient than it could be with cleaner source data.
- `readinessScore`/`knowledgeBaseCoverage` depend on the topic list's
  size and the KB's actual content — a resume/JD pair with very few
  categorized skills will show a low KB-coverage number regardless of
  how good the underlying prep is.

## Future mock interview extension

This milestone explicitly stops short of a live mock interview. Natural
next steps, none built here: a turn-by-timed-turn "ask one question at a
time" chat flow (the STAR/technical answer schemas already exist to
grade against); a scoring rubric comparing a typed/spoken answer against
the ideal one; voice input/output; a session-persistence layer so a mock
interview can span multiple chat turns coherently (today's in-memory,
2-hour-TTL `PrepRecord` is enough to hold the question bank, but nothing
tracks "which questions has the candidate already answered in this mock
session").
