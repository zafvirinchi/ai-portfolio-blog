# Phase 17 — Milestone 1 Final Report
## AI Interview Preparation — Audit, Foundation & Integration

This was an audit-first milestone. The headline finding is that almost everything on Phase 17's target-experience list (§1–12 in the original brief) **already exists and is substantially more sophisticated than the brief assumed** — including a live, populated, curated interview-question knowledge base that Phase 16 never touched. The only code changes made this milestone are a targeted prompt-security hardening pass and the test infrastructure to prove it.

## 1. Existing Interview Architecture

Three genuinely distinct systems exist under the "interview" umbrella, and conflating them would have been the biggest risk of this milestone:

| System | Purpose | Persistence | Package |
|---|---|---|---|
| **Interview Knowledge Base** | Admin-curated, searchable library of real interview Q&A, extracted from uploaded documents, categorized/topic-tagged | **Live, applied, populated Supabase tables** (`interview_questions`, `interview_categories`, `interview_topics`) | `src/lib/ai/interview/*` (extraction pipeline, Phase 11), `src/lib/ai/interview-chat/*` (search/chat), `src/lib/admin/interview-*-service.ts` (admin CRUD), `src/lib/ai/knowledge/interview.service.ts` |
| **Interview Preparation** | Personalized, resume+JD-driven prep report (questions + ideal answers + readiness score + learning roadmap) | Ephemeral, 2h TTL, in-memory (by original design) | `src/lib/ai/interview-prep/*` (Phase 13 Milestone 3) |
| **Mock Interview** | Live, turn-by-turn simulated interview session with real-time evaluation and scoring | Ephemeral, 2h TTL, in-memory (by original design) | `src/lib/ai/mock-interview/*` (Phase 13 Milestone 4) |

A fourth, unrelated system — `src/lib/ai/recruitment/interview-scheduler.ts` (Phase 13 Milestone 9's Recruitment Pipeline) — schedules real interview *appointments* for recruiters, not candidate prep. Confirmed out of scope, untouched, consistent with Phase 16's own findings about it.

**Classification: A (fully implemented) for all three core systems.** None were rebuilt.

## 2. Existing Interview-Preparation Features

Audited `interview-prep/*` function-by-function against the Phase 17 target list:

| Target capability | Status | Evidence |
|---|---|---|
| Technical questions | **A** | `coverTechnicalTopicsFromKb()` searches the live KB first; only KB-short topics reach the one LLM call (`generateQuestionsAndAnswers`) |
| HR questions | **A** | 6 fixed categories (Leadership/Conflict Resolution/Ownership/Teamwork/Communication/Career Goals), LLM-generated with explicit STAR-coaching-not-narration rules |
| System Design questions | **A** | 3 fixed difficulty tiers, LLM-generated |
| Coding questions | **A** | Fully deterministic (`recommendCodingTopics`) — topic/platform/difficulty guidance only, **never a fabricated named problem** (no LeetCode API to verify one exists) |
| Behavioral questions | **A** | Covered by the HR question set (Leadership/Conflict Resolution/Teamwork are behavioral categories, STAR format) |
| Resume-specific questions | **A** | Project questions generated per real project only ("never invent a project not listed") |
| JD-specific questions | **A** | `deriveTechnicalTopics(jd, resume)` prioritizes JD skills, resume skills only as fallback |
| Skill-gap questions | **B (partial)** | `analyzeWeaknesses()`/`analyzeConfidence()` (deterministic) identify gaps and feed the learning roadmap, but no question TYPE is specifically targeted at a gap — gaps inform coaching, not a dedicated question category |
| Difficulty levels | **A** | `Easy`/`Medium`/`Hard` throughout |
| Suggested answer guidance | **A** | Every generated question includes an `idealAnswer`, with an explicit, well-written fabrication-prevention rule already in the prompt (see §9) |
| Interview readiness insights | **A** | `computeReadinessScore()` — deterministic, 7-factor weighted blend of already-computed ATS/JD-match/project/experience/KB-coverage scores |
| Mock interview integration | **A** | See §3 |

No genuine gap in question generation itself was found. Nothing here was rebuilt.

## 3. Existing Mock-Interview Features

Audited the full session lifecycle in `mock-interview/*`:

- **Start / question selection**: a 5-stage priority cascade — Knowledge Base → prior Interview Prep report → deterministic resume-project templates → deterministic JD templates → LLM fallback (only once every free source is exhausted). This is the strongest zero-unnecessary-LLM-call design in the codebase.
- **Answer submission / evaluation**: one real per-turn LLM call (`evaluation-agent.ts`), scoring only the dimensions relevant to the question's type, with explicit follow-up-question logic and the same fabrication-prevention discipline as interview-prep.
- **Scoring**: deterministic (`score-engine.ts`) — category/topic/overall scores computed from already-returned evaluation dimensions, never a second LLM call.
- **Session state**: `sessionService`'s in-memory `Map`, 2h TTL — pause/resume/restart/skip/previous/next/difficulty-override all implemented.
- **Completion / report**: aggregates feedback across the transcript, reuses `interview-prep`'s `buildLearningRoadmap()` (read-only) rather than a second roadmap builder.
- **History**: none beyond the current session's own transcript (no persisted, cross-session interview history — see §11).

**Classification: A.** Nothing here was rebuilt.

## 4. Existing Recruiter Interview Integration (Phase 16 Milestone 8)

Traced exactly what M8's "safe links" target, as this milestone's brief asked:

- `candidateService.getInterviewLinkParams()` resolves `resumeId`/`jdMatchId` from the recruiter's own `ephemeralPointers` map (set at candidate import/match time) — the SAME `resumeService`/`jdMatchService` ephemeral stores interview-prep/mock-interview read from.
- The resulting links point at `/interview-preparation?resumeId=&jdMatchId=` and `/mock-interview?resumeId=&jdMatchId=` — the exact pages audited in §2/§3.
- Ownership is enforced entirely on the recruiter side (candidate belongs to the authenticated recruiter) before the link is ever generated; the interview-prep/mock-interview pages themselves have no concept of recruiter ownership (see §10).

**Confirmed working as designed, consistent with Phase 16's own documentation. Not modified.**

## 5. Data-Flow Diagram

```
[Ephemeral path — WORKING, Category A]
Resume Upload (/resume-analyzer)
  → resumeService (ephemeral, 2h TTL) → resumeId
  → JD paste/match → jdMatchService (ephemeral, 2h TTL) → jdMatchId
  → Candidate Fit / JD Match (already computed, part of jdMatchId's record)
  → Interview Readiness = prepService.generate({resumeId, jdMatchId})
  → Interview Preparation page (/interview-preparation?resumeId=&jdMatchId=)
  → Mock Interview page (/mock-interview?resumeId=&jdMatchId=&prepId=)

[Dynamic Resume path — DISCONNECTED, Category C — see §6]
Dynamic Resume Builder (/resume-analyzer/versions/[id])
  → resume_versions (persisted, Supabase, Section Registry, template-aware)
  → ✗ NO PATH to resumeService / interview-prep / mock-interview

[Recruiter path — WORKING, Category A, Phase 16 Milestone 8]
Recruiter imports candidate → candidateService (persisted, recruiter_candidates —
  though these tables remain unapplied live, per Phase 16's own findings)
  → ephemeralPointers map bridges candidateId → {resumeId, jdMatchId}
  → getInterviewLinkParams() → same /interview-preparation, /mock-interview pages
```

## 6. Dynamic Resume Compatibility Status

**Genuine gap confirmed — Category C: implemented but disconnected from the Dynamic Resume architecture.**

- `resume-version-service.ts` reads FROM `resumeService`'s ephemeral store (one direction only: ephemeral upload → persisted version, at version-creation time).
- There is **no reverse path**. Once a user edits a Dynamic Resume Version (adds a dynamic section, applies a JD optimization, edits Personal Information, etc.), that edited content has no way to reach `prepService.generate()` — which only ever accepts a `resumeId` pointing into the ephemeral `resumeService` Map, reflecting the ORIGINAL upload, never any edit made afterward.
- Doubly disconnected: the Dynamic Resume system also computes its OWN JD match (`computeJdMatchForResume()`, persisted directly onto the `resume_versions` row) rather than through `jdMatchService`'s ephemeral store — so even if a `resumeId` bridge existed, there is no corresponding `jdMatchId` for interview-prep to consume either.
- Verified by direct inspection of `/resume-analyzer/versions/[id]/page.tsx`: **zero references** to `interview`, `resumeId`, or `jdMatchId` anywhere in that page.
- **Not a hard block**: a Dynamic Resume Version can be exported (PDF/DOCX/Markdown/TXT — `resume-versions/dynamic/export/*`, already implemented) and manually re-uploaded through the original `/resume-analyzer` ephemeral flow to reach interview-prep that way. The gap is a missing *direct* integration, not a total dead end.
- **Not fixed this milestone.** Bridging this properly requires either (a) a new `resumeService` seeding method that accepts already-known `Resume`+`AtsScore`+`SkillGap` data without re-running the full parse+LLM-analyze pipeline (a change to the protected canonical `resumeService`), or (b) an equivalent `jdMatchId` bridge for `resume_versions`' own JD-match computation. Both are real, non-trivial feature work — not "the smallest change required to establish the foundation." Recommended as Phase 17 Milestone 2's primary scope (see §22).

## 7. JD Integration Status

- **Ephemeral path**: fully working — `jdMatchService.analyze({resumeId, jd})` produces a `jdMatchId` consumed identically by interview-prep and mock-interview. Confirmed.
- **Dynamic Resume path**: `computeJdMatchForResume()` is called directly with resume+JD text and returns a `matchResult` persisted onto the version row — it does not create an ephemeral `jdMatchId`. Same disconnection as §6, not a separate defect.
- **Recruiter path**: `jdMatchResult` is persisted as a full snapshot on `recruiter_candidates` (Phase 16 M3+); the M8 adapter bridges it back to an ephemeral `jdMatchId` via `ephemeralPointers`. Confirmed working.

## 8. Question-Generation Inventory

See §2 for the full per-category table. Summary of the underlying engineering, which is the real story here:

- **Input data**: `Resume` (parsed), `JobDescription` (parsed), `JdMatchResult` (matched/missing skills, category scores) — all already-computed, never re-derived.
- **Output schema**: strict `json_schema` structured outputs (`GENERATED_QUESTIONS_JSON_SCHEMA`, `IDEAL_ANSWER_JSON_SCHEMA`, `FALLBACK_QUESTION_JSON_SCHEMA`, `ANSWER_EVALUATION_JSON_SCHEMA`) — every LLM response is Zod-validated before use; a schema-validation failure throws rather than silently accepting malformed output.
- **LLM usage**: exactly 5 call sites across both packages (question-generator, answer-generator, hint-generator, question-selector's fallback, evaluation-agent) — confirmed by direct grep, none extraneous.
- **Difficulty handling**: `Easy`/`Medium`/`Hard` uniformly, with a `normalizeDifficulty()` heuristic mapping the KB's free-text level strings onto the same enum.
- **Tests**: zero existed for either package before this milestone (see §16 for what was added and why).

## 9. Prompt-Security Status

**Genuine gap found and fixed.**

`../prompt-security.ts`'s `delimitedDataBlock()` is the codebase's established, single canonical helper for marking untrusted resume/JD/candidate content as DATA, not instructions — already reused by 20 files across `job-description/*`, `resume/*`, `job-match/*`, `resume-rewriter/*`. **`interview-prep/*` and `mock-interview/*` were the only generative packages in the entire codebase not using it** — all 5 of their LLM prompt-builders interpolated resume/JD/answer text directly into message strings with no untrusted-data boundary at all.

The highest-risk instance: `evaluation-agent.ts`'s `buildEvaluationMessages()` interpolated the candidate's own **live-typed answer** — the single most attacker-influenceable input in either package (unlike a resume, which requires an upload, this is free text submitted in real time during an active session) — with zero delimiting.

Existing fabrication-prevention discipline in these prompts (the STAR-coaching-not-narration rules, the "never invent a project" rule) was **already excellent and is unchanged** — that is a distinct concern from prompt-injection (an adversarial resume/JD/answer trying to redirect the model's behavior), which is what `delimitedDataBlock()` addresses.

**Fixed** (§13): all 5 call sites now wrap resume/JD/answer content in `delimitedDataBlock()`, reusing the existing helper — no second delimiter implementation. `question-selector.ts`'s fallback prompt additionally had `jd.jobTitle`/`companyName` interpolated directly into the **system** message (the one place with no precedent elsewhere in the codebase — every other hardened prompt keeps 100% of untrusted content out of the system message); moved into the delimited user-message block.

## 10. Authentication/Ownership Status

**Confirmed intentional, not a defect.** `/api/ai/interview-prep` and `/api/ai/mock-interview*` require no Supabase authentication — live-probed (§21) and confirmed by direct code inspection. This is consistent with the entire ephemeral-tools product family (`/resume-analyzer`, `/job-match`, etc.), none of which require login: `resumeId`/`jdMatchId`/`sessionId`/`prepId` function as unguessable bearer capability tokens (server-generated `randomUUID()`, held only in-memory, 2h TTL), not as records owned by a persisted account. The actual anti-abuse mechanism is credit/usage metering (`checkCredits`/`consumeCredits`/`withUsageContext`), not an auth wall — a deliberate, different design from the Recruiter Workspace (Phase 16), which correctly requires login because it deals with a signed-in recruiter's own persisted, cross-session data. Every route validates its inputs (missing/malformed `resumeId`/`jdMatchId` → 400) and returns a clean, internals-free error for an expired/nonexistent id (→ 422, verified by live probe, §21) rather than a crash or stack trace.

## 11. Database/Persistence Status

**No new migration required or created.**

- The Interview Knowledge Base (`interview_questions`/`interview_categories`/`interview_topics`) is **live, applied, and populated** — verified by direct authenticated query against Supabase (a real row was returned from each table). This is the one interview-related persistence layer that exists, and it already works end-to-end.
- Interview Preparation and Mock Interview are ephemeral by original, explicit design (2h TTL, in-memory) — this milestone's audit found no functional defect caused by that, and per the milestone's own instruction ("if the current interview-preparation workflow is ephemeral and persistence is not required for this milestone, keep it that way"), **it was kept that way.**
- The one place persistence would matter — cross-session mock-interview history (§3's "interview history if any" = none) — is a real absence, but not required for THIS milestone's foundation; noted as a candidate for a future milestone only if the product direction calls for it, not implemented speculatively here.

## 12. Genuine Gaps Discovered

1. **Prompt-injection boundary missing on 5 LLM call sites** (§9) — **fixed this milestone**.
2. **Dynamic Resume Builder ↔ Interview Preparation disconnection** (§6/§7) — **documented, deferred** (too large for "smallest foundation fix"; recommended as Phase 17 Milestone 2).
3. **Skill-gap-targeted question type doesn't exist** (§2, Category B) — gaps are analyzed and inform coaching/roadmap, but no dedicated "ask about your gap" question category exists — **documented, deferred**, low priority (the underlying data already exists; this is additive scope, not a defect).
4. **`MultiAgentCoordinator`'s missing `"interview"` bypass** (§13) — **confirmed as a real, current, protected-architecture defect. Not fixed, per this milestone's explicit instruction.**
5. **Zero test coverage existed for either package before this milestone** — partially addressed (§16); a full deterministic-function test suite (e.g. `computeReadinessScore`, `deriveTechnicalTopics`, `score-engine.ts`'s pure functions) was judged out of scope for "genuine gaps discovered," since none of those functions were touched or found defective this milestone.

## 13. Changes Implemented

All five are the same category of change (wrap existing untrusted content in the existing `delimitedDataBlock()` helper; zero model/temperature/schema/scoring changes):

- `src/lib/ai/interview-prep/question-generator.ts` — `buildQuestionGenerationMessages()` (now exported)
- `src/lib/ai/interview-prep/answer-generator.ts` — `buildAnswerMessages()` (now exported)
- `src/lib/ai/mock-interview/hint-generator.ts` — `buildHintMessages()` (now exported)
- `src/lib/ai/mock-interview/question-selector.ts` — `buildFallbackMessages()` (now exported); additionally removed raw `jd.jobTitle`/`companyName` interpolation from the system message
- `src/lib/ai/mock-interview/evaluation-agent.ts` — `buildEvaluationMessages()` (now exported) — the candidate's live answer now gets its own `"CANDIDATE ANSWER DATA"` block, the highest-value fix of the five

Plus test infrastructure: `vitest.config.mts` extended to include `src/lib/ai/interview-prep/**/*.test.ts` and `src/lib/ai/mock-interview/**/*.test.ts` (neither package was in the include list before — without this, the new tests below would silently never run).

## 14. Protected Architecture Left Untouched

`LangGraph`/multi-agent orchestration, `ConversationService`, `Planner`, `Tool Registry`, `PortfolioChain`, `MultiAgentCoordinator` (`coordinator.ts` — see §13 above for why, despite a confirmed defect), `interviewer-agent.ts`, `feedback-agent.ts`, `score-engine.ts`, `session-manager.ts`, `session-service.ts`, `prep-service.ts`, `study-plan.ts`, `weakness-analyzer.ts`, the Interview Knowledge Base extraction pipeline (`interview/*`), `interview-chat/*`'s search logic, the canonical resume parser/analyzer, the JD parser/matcher/optimizer, the ATS engine, and every Phase 16 recruiter file. Nothing in this list was modified.

## 15. Known Limitations

- Dynamic Resume Builder has no direct path into Interview Preparation/Mock Interview (§6) — manual export-and-reupload remains the only workaround.
- Skill-gap-specific question generation doesn't exist as a distinct category (§2/§12).
- `MultiAgentCoordinator`'s chat-driven mock-interview commands can be diluted/rewritten by the Research/Reviewer/Summarizer pass, because `decidePlan()` bypasses that pass for `intent === "resume"` but not `intent === "interview"` (confirmed still present, byte-level: `AgentIntent` includes `"interview"` as a real value, but `coordinator.ts`'s bypass condition never checks for it). **The dedicated `/mock-interview` page is entirely unaffected** — its API routes (`/api/ai/mock-interview*`) call `sessionService` directly and never touch `ConversationService`/`PortfolioChain`/the coordinator at all, confirmed by direct route inspection. Only the chat-driven convenience path (`interview.tool.ts`'s mock-interview command handling, reachable through `/api/ai/chat`) is affected. The safe, minimal fix — adding `input.intent === "interview"` alongside the existing `"resume"` check in `decidePlan()` — is well-understood and low-risk, but touches protected architecture and was correctly left for explicit future authorization rather than made unilaterally in an audit milestone.
- No cross-session mock-interview history exists (each session is independent, 2h TTL) — consistent with original design, not treated as a defect.
- Interview Preparation/Mock Interview remain unauthenticated by design (§10) — correctly distinguished from a security gap.

## 16. Tests Added

```
src/lib/ai/interview-prep/question-generator.test.ts   (4 tests)
src/lib/ai/interview-prep/answer-generator.test.ts      (2 tests)
src/lib/ai/mock-interview/hint-generator.test.ts        (2 tests)
src/lib/ai/mock-interview/question-selector.test.ts     (2 tests)
src/lib/ai/mock-interview/evaluation-agent.test.ts       (3 tests)
```

Added only for this milestone's own genuine finding (§9) — each proves the corresponding prompt-builder now wraps resume/JD/answer content in the `DATA ONLY, NOT INSTRUCTIONS` delimiters, and that the trusted system message stays first/unmodified even when the underlying resume/JD/answer content itself looks like an injection attempt. None call the real OpenAI model (`../openai` is stubbed, matching this codebase's own established pattern in `job-description/optimizer.test.ts`); none depend on uncontrolled live LLM output. No test was added for `deriveTechnicalTopics`/`recommendCodingTopics` beyond two small sanity checks bundled into the question-generator file, since those functions were read but not modified — deeper deterministic-function coverage for the rest of the package was judged out of scope for "genuine gaps discovered this milestone."

## 17. Full Test Result

```
Before:    803
Added:     13
After:     816
Failures:  0
```

## 18. TypeScript Result

```
npx tsc --noEmit → exit 0, no errors
```

## 19. Lint Result

```
npm run lint → 0 errors, 1 pre-existing warning (unrelated <img> in blog/[slug], predates this milestone)
```

## 20. Build Result

```
npm run build → ✓ Compiled successfully in 49s
```

## 21. Live Validation Result

`npm run build` → `npm run start` → `curl` against the real server → server killed via `taskkill`:

| Request | Result |
|---|---|
| `POST /api/ai/interview-prep` (empty body) | **400** — "resumeId is required" |
| `POST /api/ai/interview-prep` (fake resumeId/jdMatchId) | **422** — "Resume not found or expired — please re-upload your resume." (no internals leaked) |
| `POST /api/ai/mock-interview` (empty body) | **400** — "resumeId is required" |
| `POST /api/ai/mock-interview` (fake resumeId/jdMatchId, valid type/mode) | **422** — same clean not-found message |
| `POST /api/ai/mock-interview/[fake-session]/answer` | **422** — "Mock interview session not found or expired." |
| `GET /interview-preparation` (no query params) | **200** — renders its own client-side "upload a resume first" empty state |
| `GET /mock-interview` (no query params) | **200** — same client-side empty-state pattern |
| `GET /interview-questions` | **200** |

No route required authentication (§10 — confirmed intentional). No authenticated Supabase E2E was attempted or claimed for the interview-prep/mock-interview ephemeral flow, since neither requires authentication to begin with — that distinction is itself the honest finding here, not a limitation to work around. The Interview Knowledge Base's live data was verified via a direct authenticated service-role query (§11), not through an end-user-authenticated flow (none exists for that read-only KB).

## 22. Recommended Phase 17 Milestone 2

**Bridge the Dynamic Resume Builder to Interview Preparation** (§6/§7) — the single largest, best-evidenced genuine gap this milestone found, and squarely a "foundation" concern rather than a new feature. Concretely: add a `resumeService` seeding path that accepts an already-known `Resume` (from a `resume_versions` row) without re-running the full parse+LLM-analyze pipeline, plus an equivalent bridge for the Dynamic Resume system's own `computeJdMatchForResume()` output into `jdMatchService`'s ephemeral store — enough for a single "Generate Interview Preparation from this Resume Version" action to produce a working `resumeId`+`jdMatchId` pair. This is deliberately scoped as its own milestone rather than folded into this one, consistent with the instruction not to implement the full Phase 17 roadmap in Milestone 1.

Secondary candidates, lower priority: a dedicated skill-gap-targeted question category (§2/§12, additive, no blocker); explicit, deliberate authorization to fix `MultiAgentCoordinator`'s missing `"interview"` intent bypass (§13/§15) if the chat-driven mock-interview convenience path is judged worth the protected-architecture change.
