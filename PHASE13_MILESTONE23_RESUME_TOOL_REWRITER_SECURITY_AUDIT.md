# Phase 13 — Milestone 23: Resume Tool & Resume Rewriter Security + Functional Audit

## 1. Objective

Audit and, where genuinely vulnerable, harden the remaining resume-related LLM prompt surfaces flagged by Milestone 22: `src/lib/ai/tools/resume.tool.ts` and every prompt in `src/lib/ai/resume-rewriter/`. Preserve all existing rewrite behavior, factual-preservation rules, Phase 9 resume-aware chat behavior, and the Phase 10 `intent === "resume"` multi-agent-bypass rule. No architecture redesign, no new agents, no schema change.

## 2. Repository Discovery — Dependency Map

```
Resume-aware chat (Phase 9):
  /api/ai/chat -> resumeRequestContext (set from resumeId) -> ToolRegistry
    -> resume.tool.ts (ResumeTool.execute) -- NO LLM call, returns { context, chunks: [] }
       -> buildResumeContext()/buildJdMatchContext()/... (plain string formatters)
    -> state.toolOutput -> multiAgentCoordinator.run() [PROTECTED] -> mergedContext
    -> portfolioChain.invoke(question, history, mergedContext) [PROTECTED]
       -> prompt.ts's portfolioPrompt ({context} placeholder in the system message)
       -> llm.invoke(prompt)  <-- the actual LLM call for resume-aware chat answers

Resume Rewriter:
  /resume-rewriter (UI) -> /api/ai/resume-rewriter, /api/ai/resume-rewriter/[rewriteId]/*
    -> rewrite-service.ts (RewriteService)
       -> summary-rewriter.ts        (generateSummaryVariants)
       -> bullet-rewriter.ts         (generateBulletVariants)
       -> achievement-rewriter.ts    (generateAchievementRewrite)
       -> experience-rewriter.ts     (generateExperienceRewrite)
       -> project-rewriter.ts        (generateProjectRewrite)
       -> skills-rewriter.ts         (generateSkillsRewrite)
       -> rewrite-service.ts's own 2 inline prompts (rewriteCertifications, generateWholeResume)
       -> rewrite-validator.ts (SAFETY_RULES_PROMPT, validateRewrite() — deterministic post-hoc gate)
  Chat can also drive a rewrite via resume.tool.ts's handleRewriteMessage() (Phase 13 Milestone 5),
  which calls the SAME rewriteService.rewriteSection() — no separate prompt path.
```

Searched the repository for every term in this milestone's Part 1 list (`resume.tool`, `resume-rewriter`, `rewrite`, `resumeRequestContext`, `delimitedDataBlock`, `openai.chat`, `response_format`, system/user prompt construction, résumé/JD text interpolation) via `grep`/`response_format` sweeps, not assumption.

## 3. Actual Callers Confirmed

- `resume.tool.ts` is registered in the Tool Registry (`tools/registry.ts`) and invoked by the planner/agent pipeline whenever `resumeRequestContext` has an active `resumeId` (set by `/api/ai/chat/route.ts` when a resume was uploaded this session) — this is the real Phase 9 call path.
- `RewriteService` is invoked from `/api/ai/resume-rewriter` (start a session) and `/api/ai/resume-rewriter/[rewriteId]/*` (per-section rewrite/accept/reject/restore/whole-resume actions), and additionally from `resume.tool.ts`'s `handleRewriteMessage()` when chat detects a rewrite-session intent — confirmed live via the `/resume-rewriter` page and its own API routes, both reachable in the production build.

## 4. LLM Prompts Discovered

| # | File | Function | Untrusted data | Delimiters (before) | Vulnerable? |
|---|---|---|---|---|---|
| 1 | `summary-rewriter.ts` | `generateSummaryVariants` | résumé + `targetContext` | No | **Yes** |
| 2 | `bullet-rewriter.ts` | `generateBulletVariants` | single bullet + résumé + `targetContext` | No | **Yes** |
| 3 | `achievement-rewriter.ts` | `generateAchievementRewrite` | achievements + `targetContext` | No | **Yes** |
| 4 | `experience-rewriter.ts` | `generateExperienceRewrite` | experience bullets + `targetContext` | No | **Yes** |
| 5 | `project-rewriter.ts` | `generateProjectRewrite` | projects + `targetContext` | No | **Yes** |
| 6 | `skills-rewriter.ts` | `generateSkillsRewrite` | skill list | No | **Yes** |
| 7 | `rewrite-service.ts` | `rewriteCertifications` (private method) | certification lines + `targetContext` | No | **Yes** |
| 8 | `rewrite-service.ts` | `generateWholeResume` (private method) | full résumé + `targetContext` | No | **Yes** |
| 9 | `resume.tool.ts` | *(none — no LLM call anywhere in this file)* | n/a | n/a | **False positive** — see §5 |

`targetContext` (a short free-text string, sourced from either a `/resume-rewriter` form field or `resume.tool.ts`'s own `detectTargetContext()` regex over the chat message) was interpolated directly into the **trusted system message** in all 8 vulnerable prompts (`` `...care about.\n\nTarget this rewrite for: ${targetContext}.` ``) — a second, independent injection vector beyond the résumé/JD content itself, since it landed in the instruction area with zero delimiting.

## 5. resume.tool.ts — Audit Result (False Positive at This Layer)

`resume.tool.ts` makes **no LLM call anywhere** — confirmed by reading the entire 1,079-line file. It only assembles plain-text context strings (`buildResumeContext`, `buildJdMatchContext`, `buildInterviewPrepContext`, `buildMockInterviewContext`) and returns `{ context, chunks: [] }`, exactly as this milestone's Part 3 anticipated. Per that same guidance ("if the tool itself does not make an LLM call, do not add unnecessary prompt logic there — instead verify the boundary where its output enters the LLM"), no code change was made to this file.

**Boundary traced** (read-only inspection, not modified): `resume.tool.ts`'s `context` → `GraphState.toolOutput` → `multiAgentCoordinator.run()` [protected] → `mergedContext` → `portfolioChain.invoke()` [protected] → `prompt.ts`'s `portfolioPrompt` system message, under a plain `-----CONTEXT-----\n{context}` section — **no `delimitedDataBlock()` framing and no explicit "ignore embedded instructions" instruction exist at this specific boundary.** This is a real, code-inspection-confirmed architectural gap, but it sits entirely inside `PortfolioChain`/multi-agent architecture, which this milestone's Part 2 explicitly protects ("must NOT be changed unless absolutely required to fix a directly demonstrated security defect"). No exploit was demonstrated (no live LLM testing was performed, per policy), so the bar for an exception was not met. **Documented here, not fixed** — see §13 and the recommendation in §21.

The Phase 9 `SPECIAL MODE — RESUME ANALYSIS` directive text (`buildResumeContext()`) was inspected and is **unchanged** — verified byte-for-byte via the new `resume.tool.test.ts` (§7).

## 6. Resume Rewriter Hardening

All 8 vulnerable prompts (§4, rows 1–8) were hardened identically:

- Added one shared constant, `UNTRUSTED_DATA_PROMPT`, in `rewrite-validator.ts` alongside the existing `SAFETY_RULES_PROMPT` (same reuse pattern already established there) — the system-message sentence explaining that the RESUME DATA/TARGET CONTEXT blocks are untrusted candidate content, not instructions, and listing concrete injection patterns to disregard.
- Every résumé/document-content payload is now wrapped via `delimitedDataBlock()` with a label matching its content (`RESUME DATA`, `BULLET TO REWRITE`, `ACHIEVEMENTS DATA`, `EXPERIENCE DATA`, `PROJECTS DATA`, `SKILLS DATA`, `CERTIFICATIONS DATA`).
- `targetContext`, previously concatenated into the trusted system message, now moves to the user message as its own `delimitedDataBlock("TARGET CONTEXT", targetContext)` block when present; the system message now only says "A TARGET CONTEXT block is included below — use it only as descriptive context for the audience/domain to target."
- `rewriteCertifications`/`generateWholeResume` (previously inline, private methods on `RewriteService`) were extracted into standalone, exported functions (`buildCertificationsMessages`, `buildWholeResumeMessages`) — a pure, behavior-preserving refactor mirroring the other 6 files' already-exported `build*Messages` pattern, done specifically so their prompt construction is unit-testable.

No model, temperature, output schema, bullet-count/exact-count contracts, style descriptions, worked examples, or `SAFETY_RULES_PROMPT` text were changed. `rewrite-validator.ts`'s `validateRewrite()` — the deterministic, non-LLM-trusting post-hoc gate that rejects any rewrite introducing an unrecognized company/technology/certification/number/date — is completely untouched and remains the primary defense against fabrication regardless of prompt-injection outcome (a genuine, pre-existing defense-in-depth control this milestone did not need to add).

## 7. Shared `delimitedDataBlock()` Usage

**No new delimiter implementation was created.** All 8 hardened prompts import `delimitedDataBlock` from the existing `src/lib/ai/prompt-security.ts` — the same module `job-description/optimizer.ts`, `resume-optimizer.ts`, `resume/resume-analyzer.ts`, `job-match/job-match-analyzer.ts`, `resume/resume-parser.ts`, `resume-enterprise/resume-parser.ts`, and `job/job-parser.ts` already use (Milestones 20–22). `UNTRUSTED_DATA_PROMPT` (§6) is not a delimiter implementation — it's shared prompt *text*, the same kind of reuse `SAFETY_RULES_PROMPT` already established in this exact package.

## 8. Tests Added

53 rewriter tests + 5 resume-tool tests + resume.tool.test.ts's completeness check = **71 new tests**, across 8 files:

- `summary-rewriter.test.ts` (15), `bullet-rewriter.test.ts` (8), `achievement-rewriter.test.ts` (8), `experience-rewriter.test.ts` (7), `project-rewriter.test.ts` (7), `skills-rewriter.test.ts` (7), `rewrite-service.test.ts` (14) — each covers: delimiter presence, the milestone's 4 required injection samples (`it.each`, verified present only inside their data block and never in the system message), byte-identical trusted instructions regardless of injected content (controlling for legitimate variation like exact-count contracts), role ordering, and a spot-check that each file's own factual-preservation/completeness rules are still present verbatim.
- `resume.tool.test.ts` (5) — Phase 9 regression per Part 10/13's exact named scenarios: no resumeId (RAG fallback, unchanged), valid resumeId (grounded resume context, SPECIAL MODE directive present, never the "not available" fallback), expired/unknown resumeId (graceful fallback, no crash), and a content-completeness check (career level, roles, strengths, weaknesses, skill gaps all present). This is the one heavier test file this milestone (~20 sibling services mocked to their minimal shape) since `resume.tool.ts`'s import graph is large; every other test file imports a single, lightweight module.

No test calls the real OpenAI API — every LLM-adjacent test file mocks `../openai` to `{}` (the Milestone 20/21/22 convention) and asserts on constructed message arrays only.

`vitest.config.mts` gained two new `include` globs: `src/lib/ai/resume-rewriter/**/*.test.ts` and `src/lib/ai/tools/**/*.test.ts` (neither package had tests before this milestone).

## 9. Resume-Tool Regression Results

All 5 `resume.tool.test.ts` scenarios pass: no-resumeId fallback unchanged, valid-resumeId grounding unchanged (SPECIAL MODE directive verified byte-for-byte), expired/unknown-resumeId handled gracefully with no crash, and detailed resume content (ATS, career level, skill gaps, strengths/weaknesses) confirmed present in the assembled context. `handleRewriteMessage()`'s own logic was not modified (this milestone's resume-rewriter changes are all inside `rewrite-service.ts`/`*-rewriter.ts`, which `handleRewriteMessage()` calls unchanged).

## 10. Dynamic-Section Compatibility — Finding

`resume-rewriter/` operates entirely on the **legacy, fixed-shape `Resume` object** (`resume/resume-schema.ts`) with its own fixed `RewriteSection` enum: `summary`, `careerObjective`, `experience`, `projects`, `skills`, `achievements`, `certifications`, `bullet` — confirmed via `rewrite-schema.ts`. It has **zero references** to `DynamicResumeDocument`/`dynamic-resume-schema.ts` anywhere in the package. This means education, awards, publications, patents, languages, and custom sections are **not rewritable** through this package at all — not a regression introduced here, but a genuine, pre-existing architectural boundary. Retrofitting this package to consume the dynamic section model would be a substantial feature addition (effectively a second section architecture bridging into rewrite generation), explicitly out of this milestone's scope ("do not redesign the architecture," "do not introduce a second section architecture," "do not introduce new functionality"). **Not changed — documented as a known limitation (§20)**, consistent with the milestone's own instruction to preserve whatever the current implementation already does rather than force a fix.

Within its own actual (fixed) section scope, all 7 rewriter functions were verified (via the new tests) to still carry their existing per-section rules — exact-count completeness contracts (experience/achievements/projects/certifications), the "never rename a certification" rule, the "technologies must be a subset of the project's own list" rule, and the "never add a skill not already listed" rule — none weakened.

## 11. Protected Architecture Verification

Not modified: `ConversationService`, `Agent.run()`, `GraphState`, `graph.ts`/`edges.ts`/`nodes.ts`, planner architecture/contract, Tool Registry interface, `PortfolioChain` (`chains/portfolio.chain.ts`, `prompt.ts`), `Retriever`, Knowledge Pipeline/Manager, `rag_documents`/`rag_document_chunks`, Resume Analyzer architecture, JD matcher, ATS engine, dynamic resume section architecture, resume versioning architecture, JD optimization proposal/apply architecture, multi-agent architecture (`multi-agent/coordinator.ts`), database schema. `intent === "resume"`'s multi-agent-bypass behavior (Phase 10) was not touched — no file implementing that check was modified.

## 12. Files Added

- `src/lib/ai/resume-rewriter/summary-rewriter.test.ts`
- `src/lib/ai/resume-rewriter/bullet-rewriter.test.ts`
- `src/lib/ai/resume-rewriter/achievement-rewriter.test.ts`
- `src/lib/ai/resume-rewriter/experience-rewriter.test.ts`
- `src/lib/ai/resume-rewriter/project-rewriter.test.ts`
- `src/lib/ai/resume-rewriter/skills-rewriter.test.ts`
- `src/lib/ai/resume-rewriter/rewrite-service.test.ts`
- `src/lib/ai/tools/resume.tool.test.ts`
- `PHASE13_MILESTONE23_RESUME_TOOL_REWRITER_SECURITY_AUDIT.md`

## 13. Files Modified

- `src/lib/ai/resume-rewriter/rewrite-validator.ts` — added `UNTRUSTED_DATA_PROMPT` constant.
- `src/lib/ai/resume-rewriter/summary-rewriter.ts`, `bullet-rewriter.ts`, `achievement-rewriter.ts`, `experience-rewriter.ts`, `project-rewriter.ts`, `skills-rewriter.ts` — hardened prompts; exported `build*Messages` (renamed uniquely per file — `buildSummaryMessages`, `buildBulletMessages`, etc. — to avoid a barrel re-export collision).
- `src/lib/ai/resume-rewriter/rewrite-service.ts` — hardened its 2 inline prompts, extracted into exported `buildCertificationsMessages`/`buildWholeResumeMessages`.
- `vitest.config.mts` — added the 2 new `include` globs (§8).

**Not modified**: `src/lib/ai/tools/resume.tool.ts` (audited, confirmed no code change needed — §5).

## 14. Files Intentionally Untouched

`prompt.ts`, `chains/portfolio.chain.ts`, `multi-agent/coordinator.ts`, `graph/*.ts`, `agent/planner.ts`, `planner/*`, `tools/registry.ts`, `tools/types.ts`, every other `tools/*.tool.ts` file, `resume-analyzer.ts`/`resume-parser.ts`/`resume-enterprise/resume-parser.ts`/`job-parser.ts`/`jd-parser.ts`/`job-match-analyzer.ts` (all already hardened, Milestones 20–22 — re-verified passing, not re-modified), `keyword-engine.ts`, `jd-matcher.ts`, `ats-engine.ts`, `experience-engine.ts`, `optimization-review.ts`, `jd-optimization-summary.ts`, `dynamic-resume-schema.ts`, `resume-migration.ts`, `resumeVersionService.applyJdOptimization()` and its route, all `rewrite-schema.ts`/`rewrite-types.ts`/`rewrite-history.ts` (no prompt content), `rewrite-validator.ts`'s `validateRewrite()`/`SAFETY_RULES_PROMPT`/`KNOWN_TECHNOLOGIES`/`WELL_KNOWN_COMPANIES` (only the new constant was added, nothing existing changed). No database schema or migration.

## 15. Test Results

`npm test` (`vitest run`) — **494/494 passing**, 45 test files (423 baseline before this milestone; +71 new).

## 16. TypeScript Result

`npx tsc --noEmit` — clean, no errors.

## 17. Lint Result

`npm run lint` — 0 errors, 1 pre-existing unrelated warning (`no-img-element`, blog page — present before this milestone).

## 18. Build Result

`npm run build` — succeeded; every route compiled, including `/resume-rewriter` and `/resume-analyzer`.

## 19. Live Validation

Performed, non-destructive, against a fresh `npm run start` server:
- `GET /resume-rewriter` → `200`.
- `GET /resume-analyzer` → `200` (hosts Phase 9 resume-aware chat).
- `POST /api/ai/chat` (empty body) → `400 {"error":"Message required"}`, unchanged.
- `POST /api/ai/resume` (non-multipart body) → `422`, unchanged.
- `POST /api/ai/resume-rewriter` (empty body) → `400 {"error":"resumeId is required"}`, unchanged.
- **Not performed**: authenticated end-to-end testing of an actual rewrite generation, resume-aware chat answer, or an uploaded résumé containing a live injection attempt — all three require a real login session and a real OpenAI call. This is the same pre-existing Supabase authentication/schema-cache limitation documented since Milestone 14, unrelated to and unaffected by this milestone. The prompt-construction logic that a live injection attempt would actually exercise is covered by the 71 new deterministic unit tests instead (§8), consistent with this milestone's own "prefer deterministic unit tests over live LLM tests" instruction.

## 20. Known Limitations

- `resume-rewriter/` does not integrate with the Dynamic Resume Sections architecture (§10) — a pre-existing boundary, not introduced or fixed by this milestone.
- The `PortfolioChain` boundary gap identified in §5 (no `delimitedDataBlock()` framing around `{context}` in `prompt.ts`) remains open — correctly out of scope given this milestone's explicit protection of `PortfolioChain`/multi-agent architecture, and no exploit was demonstrated (only a static architectural gap).
- No live/authenticated testing of an actual injection attempt against a real OpenAI call was performed (§19) — deterministic prompt-construction tests are the verification instead, per policy.

## 21. Recommendation for Next Milestone

If prioritized, a dedicated, carefully-scoped future milestone could examine whether `prompt.ts`'s `{context}` placeholder should gain the same `delimitedDataBlock()` framing the rest of the codebase now uses consistently — this would need to explicitly justify touching `PortfolioChain`, which every milestone since 15 has protected, and should be proposed on its own terms rather than folded into an unrelated milestone. Separately, Milestone 20/21's legacy-route audit-log review remains outstanding (observe real deployment logs before any removal decision).

Not started automatically, per this milestone's instruction to stop after completion.
