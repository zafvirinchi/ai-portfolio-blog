# Phase 17 — Milestone 3 Final Report
## AI Interview Preparation — Personalized Question Quality & Coverage

This milestone adds a deterministic, zero-LLM "intelligence layer" on top of the existing, completely unmodified interview-prep engine — coverage, priority, evidence, deduplication, and a personalized preparation plan — without rebuilding, replacing, or mutating anything Milestones 1–2 established.

## 1. Existing Interview Architecture Audited

Traced the full pipeline end-to-end: `resume-version-adapter.ts` (M2) → `resumeService`/`jdMatchService` → `prepService.generate()` → `deriveTechnicalTopics()` → `coverTechnicalTopicsFromKb()` (KB cascade) → `generateQuestionsAndAnswers()` (LLM fallback, uncovered topics only) → `recommendCodingTopics()` (deterministic) → `analyzeWeaknesses()`/`analyzeConfidence()` (deterministic) → `computeReadinessScore()` (deterministic) → `interviewPreparationReportSchema.parse()` → UI (`PrepOverview` + 8 category tabs). Confirmed: questions are **selected** (KB search, deterministic project/topic derivation), **generated** (one LLM call, uncovered topics + fixed HR/project/system-design counts), **categorized** (by construction — each generation path produces a fixed report field), and **scored** (readiness, deterministic weighted blend) — but, before this milestone, **never carried priority, evidence, or cross-category coverage/deduplication metadata**.

## 2. Existing Capabilities Reused

- **Already implemented — reused**: `deriveTechnicalTopics()`, `coverTechnicalTopicsFromKb()`, `recommendCodingTopics()`, `buildCheatSheet()`'s output (via the report's own `cheatSheet` field), the entire 5-stage generation cascade, `computeReadinessScore()` and its threshold-free continuous scale, `prepService.get()`, `resumeService.get()`, `jdMatchService.get()`.
- **Already implicitly balanced — no change made**: category counts are already bounded by construction (HR always exactly 6; one project question per real project; system design exactly 3, one per difficulty; technical capped at `MAX_TOPICS = 8` derived topics, KB-first). No category can dominate an interview prep set today — audited and confirmed, not assumed. Per Step 7's own instruction ("only add deterministic balancing if the current implementation has a genuine gap"), **no balancing code was added.**
- **Milestone 1's `READY_FOR_INTERVIEW_THRESHOLD = 60`** (recruiter package) — not directly applicable to `computeReadinessScore()`'s own continuous 0–100 scale (which has no "ready" cutoff of its own); no new threshold was introduced anywhere in this milestone, and the existing readiness computation/output is completely unchanged (verified: `readinessScore` passes through this milestone's new code untouched).

## 3. Genuine Gaps Discovered

No coverage, priority, evidence, deduplication, or preparation-plan layer existed anywhere in `interview-prep/*` prior to this milestone — confirmed by repository search, not assumed. All five were **missing — implemented minimally**, as one cohesive, well-scoped pure module plus one thin orchestrator, per the spec's own suggested shape.

## 4. Coverage Implementation

`computeInterviewCoverage(resume, jobDescription, report)` — pure, zero-LLM, in `src/lib/ai/interview-prep/interview-coverage.ts`:

| Category | Covered/missing derived from |
|---|---|
| Technical | `deriveTechnicalTopics()`'s own output (existing, reused) vs. topics actually present in `report.technicalQuestions` |
| Resume | `resume.technicalSkills` vs. technical-question topics + technologies of projects that already have a project question |
| JD | `jd.mandatorySkills ∪ jd.goodToHaveSkills` vs. technical-question topics |
| Behavioral | `hrQuestionItemSchema`'s own existing 6-category enum vs. `report.hrQuestions` categories actually present |
| System Design | The fixed Easy/Medium/Hard tiers vs. difficulties actually present in `report.systemDesignQuestions` |
| Coding | `report.codingRecommendations` verbatim; `missing` is always `[]` — documented as a deliberate, honest non-fabrication (that list has no "missing" concept without inventing one) |

No new keyword-matching engine — every comparison reuses already-existing skill/topic lists.

## 5. Priority Implementation

**Missing — implemented minimally.** `classifyTopic(topic, jd, resume)` returns a deterministic `CRITICAL | HIGH | MEDIUM | LOW` verdict from a strict evidence cascade: mandatory JD requirement → CRITICAL; core resume technology (not JD-mandatory) → HIGH; good-to-have JD requirement → MEDIUM; anything else → LOW. Never infers a technology "because it's common for the role" — every non-LOW verdict traces to a real, named entry in `jd.mandatorySkills`/`jd.goodToHaveSkills`/`resume.skills`/`resume.technicalSkills`.

## 6. Evidence Implementation

Bundled into the same `classifyTopic()` result (`evidenceSource: "JD" | "Resume" | "General" | null`, plus a human-readable `reason`) rather than a separate function — both answer the identical underlying question ("how is this topic grounded in real data") from two presentations. `"General"` is used, honestly, whenever a topic can't be traced to a specific JD/resume entry — never fabricated as JD- or resume-sourced.

## 7. Deduplication Implementation

**Missing — implemented minimally**, deliberately conservative. `deduplicateQuestions()` removes (a) exact-normalized-text duplicates and (b) same-topic near-duplicates whose "core subject" matches after stripping a small, explicit set of common question-framing phrases ("Explain your experience with X" / "Tell me about your X experience" — the milestone's own worked example, now a passing regression test). Two questions on the *same* topic with genuinely different core subjects (the Knowledge Base's own intentional up-to-2-questions-per-topic design) are never merged — verified by test. No LLM, no semantic-similarity model.

## 8. Category Balancing

Audited (§2) and found already adequately bounded by the existing fixed-count generation rules. No deterministic balancer was added — a genuine "no gap found," documented rather than solved with unnecessary code.

## 9. Preparation-Plan UI

Added to the **existing** `PrepOverview` component (already the "Overview" tab — no new tab, no new page): a Coverage panel (per-category covered/missing counts and topic lists) and a Personalized Preparation Plan grouped into the requested **Must Prepare / High Priority / Recommended / Optional** tiers, each item showing topic, priority, reason, and either its real generated question or real curated study-reference bullets (reused from the report's own existing `cheatSheet`, never invented). All new interactive/informational elements carry descriptive `aria-label`s (e.g. `"Missing Technical coverage"`, `"Must Prepare interview topics"`, `"Start Mock Interview"`, `"Export interview preparation report as PDF"`).

## 10. Readiness Integration

`computeReadinessScore()` itself was **not modified** — its inputs, output shape, and the report's `readinessScore` field are byte-for-byte unchanged. This milestone's new metadata is fetched and rendered *alongside* readiness (a separate `GET .../coverage` call), never fused into it, per the explicit "do not create a second readiness score" / "do not arbitrarily change existing thresholds" instructions.

## 11. JD Gap Integration

`buildPreparationPlan()` directly implements the spec's own worked example: a mandatory JD skill absent from generated coverage → `CRITICAL` / `Must Prepare`, with `recommendedPreparation` populated from the report's own real `cheatSheet` entry when one exists (e.g. Docker's real bullet points), and **never** a claim like "you have Docker experience" — verified by a dedicated test asserting the reason text never contains "you have" for an uncovered, JD-only topic, and that its `evidenceSource` is `"JD"`, never `"Resume"`, when the skill genuinely isn't on the resume.

## 12. Mock Interview Compatibility

`MultiAgentCoordinator` was not referenced, imported, or modified. The new coverage/plan metadata lives entirely outside `PrepRecord`/`InterviewPreparationReport` (fetched separately by the UI) — `sessionService.start()`'s existing `{resumeId, jdMatchId, prepId}` contract is completely untouched, so the Mock Interview handoff is unaffected by construction, not merely left alone. The known `intent === "resume"` vs. `"interview"` bypass limitation was not touched, per instruction — the dedicated `/mock-interview` page remains the reliable interface, unchanged.

## 13. Prompt-Security Verification

**No new prompt was created.** `interview-coverage.ts` and `interview-intelligence-service.ts` make zero LLM calls (neither imports `../openai` or any LLM client — confirmed by inspection, not merely asserted) and therefore have no prompt-injection surface at all. `delimitedDataBlock()` was not touched; no second implementation was added; none was needed.

## 14. Files Added

```
src/lib/ai/interview-prep/interview-coverage.ts
src/lib/ai/interview-prep/interview-coverage.test.ts
src/lib/ai/interview-prep/interview-intelligence-service.ts
src/lib/ai/interview-prep/interview-intelligence-service.test.ts
src/app/api/ai/interview-prep/[prepId]/coverage/route.ts
```

## 15. Files Modified

```
src/components/interview-prep/PrepOverview.tsx   (+Coverage panel, +Preparation Plan panel — additive prop, backward compatible)
src/app/(site)/interview-preparation/page.tsx    (fetches the new coverage endpoint; adds aria-labels to existing action links)
```

`prep-service.ts`, `question-generator.ts`, `answer-generator.ts`, every mock-interview file, and `PrepRecord`/`interviewPreparationReportSchema` were **not modified** — genuinely protected, not just left alone by omission.

## 16. APIs Added/Modified

`GET /api/ai/interview-prep/[prepId]/coverage` — new, read-only, unauthenticated (consistent with every other interview-prep route — `prepId` is itself an unguessable ephemeral capability token, the same model Milestone 1 documented). Returns `404` for an unknown/expired `prepId` or expired underlying resume/JD-match context, never a stack trace or internal detail.

## 17. Database Changes

**None.** No migration was created or considered necessary — everything is computed on-demand from already-ephemeral, already-in-memory data.

## 18. Tests Added

```
interview-coverage.test.ts               (22 tests)
interview-intelligence-service.test.ts    (3 tests)
```

Covering, directly, the spec's own 12-item list (§15): resume-technology coverage; mandatory-JD-skill → CRITICAL priority; a missing JD skill's evidence is never attributed to the resume; the exact "Spring Boot" worked-example deduplication case; two genuinely different same-topic KB-style questions are never merged; deterministic (identical-input → identical-output) priority classification; evidence only ever traces to real JD/resume/General sources; per-category coverage computed correctly; readiness pass-through unaffected; the orchestrator's not-found/expired handling. "No LLM call" is additionally provable structurally — neither new module imports an LLM client at all.

## 19. Full Test Result

```
Before:    825
Added:     25
After:     850
Failures:  0
```

## 20. TypeScript Result

```
npx tsc --noEmit → exit 0, no errors
```

## 21. Lint Result

```
npm run lint → 0 errors, 1 pre-existing warning (unrelated <img> in blog/[slug], predates this milestone)
```

## 22. Build Result

```
npm run build → ✓ Compiled successfully in 45s
```

## 23. Live Validation

`npm run build` → `npm run start` → `curl` → server killed via `taskkill`:

| Request | Result |
|---|---|
| `GET /api/ai/interview-prep/fake-prep-id/coverage` | **404** — "Interview preparation report not found or expired." |
| `POST /api/ai/interview-prep` `{resumeId, jdMatchId}` (fake ids) | **422** — unchanged from before this milestone, confirms no regression |
| `GET /interview-preparation` | **200** |

No sensitive data appears in the new route's URL (only an already-ephemeral `prepId`) or in any log line this milestone added (the new route logs only generic failure messages, consistent with every existing interview-prep route). No authenticated Supabase E2E was attempted or claimed — not applicable here, since none of the routes touched by this milestone require authentication (same finding as Milestones 1–2).

## 24. Known Limitations

- Deduplication's "core subject" matching is a deliberately narrow, rule-based pattern (strips a small set of common question-framing phrases) — it will not catch every possible rephrasing, by design (a broader semantic match would require an LLM or embeddings, explicitly forbidden this milestone).
- The Preparation Plan currently surfaces technical/JD/resume topics only; behavioral/system-design/coding gaps are surfaced through the Coverage panel but not as individual plan rows — a deliberate scope choice (those categories are already fully covered by construction in the common case, so per-topic plan rows would mostly be empty noise), not an oversight.
- `recommendedPreparation` content is limited to whatever `buildCheatSheet()` already curates for a given technology; a gap topic with no cheat-sheet entry shows no study reference rather than an invented one.
- As with every milestone since Phase 16, no authenticated Supabase E2E was possible in this environment — not a new limitation, and not applicable to this milestone's specific (unauthenticated) routes regardless.

## 25. Recommended Milestone 4

The intelligence layer is now available but only surfaces in the "Overview" tab; a reasonable next step is threading priority/evidence badges directly onto individual questions within the existing category tabs (Technical/HR/System Design/etc.) so a Must-Prepare question is visually flagged wherever it's read, not only in the summary panel — a presentation-only extension of this milestone's existing data, not a new computation. Failing that, the standing recommendation from every prior milestone remains: exercise this whole path (M2 + M3 combined) against a real authenticated user once this environment can support it.

---

## Summary

**What was already present:** the entire generation, categorization, KB-cascade, readiness-scoring, and Mock Interview pipeline — all reused verbatim, none rebuilt.

**What was actually changed:** one new pure module (`interview-coverage.ts`) computing coverage/priority/evidence/deduplication/preparation-plan; one new thin orchestrator (`interview-intelligence-service.ts`) wiring it to already-existing getters; one new read-only API route; and additive UI in the existing Overview tab. `prep-service.ts`, the question-generation cascade, the Knowledge Base, `MultiAgentCoordinator`, and every schema/type Milestones 1–2 established remain completely untouched.

**Is Resume → JD → Interview Preparation personalization now complete?** For this milestone's scope — yes: every generated question set now carries deterministic coverage, priority, and evidence metadata, is safely deduplicated, and is presented as a personalized, prioritized preparation plan grounded only in real resume/JD data, with zero new LLM calls. Deeper personalization (e.g., surfacing this metadata inline per-question, or covering behavioral/system-design gaps with individual plan rows) remains open, deliberately deferred rather than rushed into this milestone.
