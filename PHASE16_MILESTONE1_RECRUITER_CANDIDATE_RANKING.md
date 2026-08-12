# Phase 16 — Milestone 1: Recruiter Candidate Ranking Foundation

## 1. Objective

Begin Phase 16: a recruiter-facing candidate ranking foundation, reusing the existing Phase 13–15 resume/JD/ATS architecture, explicitly scoped to NOT build the full recruiter portal, bulk screening, shortlist workflows, or analytics.

## 2. Architecture Audit — The Headline Finding

Before writing any code, a search for existing recruiter/recruitment infrastructure (`src/app/(site)/recruiter/`, `src/app/api/ai/recruiter/`, `src/lib/ai/recruiter/`) turned up an entire, already-complete **Enterprise Recruiter Workspace**, built under **Phase 13 Milestone 8** (`PHASE13_MILESTONE8_RECRUITER_WORKSPACE.md`) — well before this Phase 16 sequence began, and apparently unknown to whoever wrote this milestone's spec, since its own "do NOT build" list (shortlist workflows, recruiter analytics, interview scheduling, candidate messaging) describes features that already exist.

Confirmed already built and reused verbatim, without a single line changed:

| This milestone asks for | Already exists as |
|---|---|
| A deterministic Candidate Fit function, separate from ATS/JD Match (§2/§4) | `candidate-score.ts`'s `computeScoreBreakdown()` — assembles a per-candidate breakdown from real `AtsScore`/`JdMatchResult` fields, with a documented resume-only fallback heuristic for every field when no JD match exists yet (never an LLM guess) |
| Missing data handled honestly, never coerced to 0 (§6/§20/§21) | Already exactly this — every `CandidateScoreBreakdown` field is `number \| null`; `candidate-ranking.ts`'s weighting **redistributes proportionally across only the populated factors**, so a candidate missing interview-readiness data still ranks sensibly on what's known |
| Deterministic ranking, no LLM (§9/§17) | `rankCandidates()` — a weighted composite, zero LLM calls |
| Candidate list + detail UI foundation (§12/§13) | `/recruiter` (dashboard, ranking, candidate table) and `/recruiter/candidates/[candidateId]` (full profile: scores, JD match, evidence, insights) |
| Evidence (matched/missing skills) (§7) | Already shown in the candidate detail page, reading `jdMatchResult.matchedSkills`/`.missingSkills` directly — no fabrication |
| Explainable weighting, documented (§5) | `RANKING_FACTORS` in `candidate-ranking.ts`, weights and rationale already documented in that file's own comments |

## 3. Genuine Gaps Found

Auditing the existing system against this milestone's *exact* requirements — not just its general theme — surfaced three concrete, narrow gaps:

1. **No "Candidate Fit Level" tier (§8).** `rankCandidates()` produces a numeric `rankingScore` but never classified it into STRONG/GOOD/MODERATE/LOW.
2. **No explicit, documented tie-breaker cascade (§9/§10).** The existing sort (`.sort((a, b) => b.rankingScore - a.rankingScore)`) relies on JavaScript's array-sort stability to keep ties in input order — reproducible for a *fixed* input array, but not what "deterministic tie-breaking on candidate attributes" means: the spec wants ties broken by JD Match → Skills → Experience → ATS, and the existing code had no such cascade at all.
3. **No deterministic (non-LLM) strengths/gaps summary (§11).** The existing `candidate-insights.ts` already produces a rich strengths/weaknesses/risk-factor analysis — but it costs one LLM call per candidate (confirmed in the Milestone 8 doc). This milestone's §11 is explicit: *"Do not generate these summaries with an LLM in this milestone. They should be deterministic."* No zero-cost, always-available equivalent existed.

## 4. An Important Finding Not Fixed: No Per-Recruiter Ownership Model

This milestone's §14 (Privacy) and §29 (Database) both assume a "Recruiter A / Recruiter B" ownership boundary exists or should be added. Auditing `candidate-service.ts` and `recruiterRequestContext` found the opposite: the entire recruiter workspace is a **single, shared, unauthenticated, in-memory session** — `recruiterRequestContext` carries a bare `{ active: true }` flag, not a recruiter identity; `/api/ai/recruiter/ranking` (confirmed live, §28) returns real data with zero auth check. This is not an oversight — it's a documented Phase 13 Milestone 8 design decision ("No auth gate — `/recruiter` is publicly reachable like every other Phase 13 AI feature page in this portfolio demo, consistent with the rest of the site's posture").

Retrofitting genuine multi-recruiter ownership would require: an authenticated recruiter identity, a persistence layer (the current system is deliberately in-memory with no independent TTL, capped to the underlying resumes' ~2h window), and a schema for which recruiter owns which candidates/jobs — a real architecture change, not an additive one, and squarely the kind of "speculative schema change" §15/§29 themselves warn against introducing without stopping to document first. **This was deliberately not attempted.** Building a partial ownership check on routes that still read from one shared global `Map` would create a false sense of security worse than the current honest, documented gap. This is reported as a known limitation (§14 below), not silently left unaddressed.

## 5. Files Added

- `src/lib/ai/recruiter/candidate-summary.ts` — `buildRecruiterSummary()`.
- `src/lib/ai/recruiter/candidate-ranking.test.ts` — 11 tests.
- `src/lib/ai/recruiter/candidate-summary.test.ts` — 6 tests.

## 6. Files Modified

- `src/lib/ai/recruiter/candidate-ranking.ts` — added `classifyCandidateFitLevel()` and an explicit `compareRanked()` tie-break comparator (exported for direct testing); `rankCandidates()` now attaches `level` to each result and sorts via the new comparator instead of a bare score subtraction.
- `src/lib/ai/recruiter/candidate-types.ts` — added `CandidateFitLevel`, `RecruiterSummary`/`DataAvailability` types; extended `RankedCandidate` with `level` and `CandidateProfile` with `recruiterSummary`.
- `src/lib/ai/recruiter/candidate-service.ts` — `getProfile()` now also computes and returns `recruiterSummary` (via the new, zero-cost `buildRecruiterSummary()` — no new fetch, no new LLM call).
- `src/lib/ai/recruiter/index.ts` — barrel export for the new module.
- `src/app/(site)/recruiter/page.tsx` — the ranking list now shows each candidate's fit level badge alongside the existing score.
- `src/app/(site)/recruiter/candidates/[candidateId]/page.tsx` — a new "Deterministic Summary" panel (strengths/gaps/data-availability), positioned alongside — not replacing — the existing "AI Insights" panel.
- `vitest.config.mts` — added `src/lib/ai/recruiter/**/*.test.ts` to the test include list. **Notable finding**: this glob didn't exist before — the entire Phase 13 Milestone 8 recruiter package had zero test coverage wired into the test runner, despite being extensively built. This milestone's new tests are the first to run against it.

## 7. Files Intentionally Untouched

`candidate-score.ts` (the scoring engine — already correct, reused as-is), `candidate-comparison.ts`, `candidate-insights.ts`, `candidate-recommendation.ts` (the 3 existing LLM-calling features — none touched, none duplicated), `candidate-export.ts`, `candidate-tags.ts`, `candidate-schema.ts`, every existing API route (no new route was added — `level`/`recruiterSummary` ride along on the exact same `GET /ranking` and `GET /candidates/[candidateId]` responses that already existed), `resume-score.ts`, `ats-engine.ts`, `jd-matcher.ts`, `keyword-engine.ts`, the resume parser (none re-implemented, all reused via `candidate-score.ts`'s existing dependencies).

## 8. Candidate Fit Architecture

Unchanged at its core — `computeScoreBreakdown()` → `computeRankingScore()` → (new) `classifyCandidateFitLevel()`. Candidate Fit (`rankingScore`) remains structurally distinct from `scores.atsScore` and `scores.jdMatch`, never conflated, never renamed.

## 9. Score Calculation

Unchanged — `computeRankingScore()`'s proportional weight redistribution across only populated factors was already exactly what §6/§21 ask for; reconfirmed by two new tests (a single populated factor produces its own value unscaled by missing ones; a fully-empty breakdown falls back to `resumeScore`).

## 10. Ranking Algorithm & Tie-Breaking

`rankCandidates()`'s sort now uses `compareRanked()`: primary key `rankingScore` (descending), then an explicit cascade — JD Match → Skills → Experience → ATS, each treating a missing (`null`) value as sorting *after* any real value (never as 0) — and finally `candidateId` (alphabetical) as an always-available last resort, guaranteeing one fixed order even when every scored factor is identically tied. Verified with 4 new tests, including one that reverses the input array and confirms the output order is unchanged.

## 11. Evidence

Unchanged and already correct — `jdMatchResult.matchedSkills`/`.missingSkills` are read directly, never re-derived or guessed, in both the existing candidate detail page and the new `buildRecruiterSummary()`.

## 12. Missing-Data Handling

Unchanged for the score breakdown (already correct); extended to the new summary via `dataAvailability: "available" | "not_provided"` per field (JD match, certifications, projects, education) — never phrased as a candidate deficiency (§6's own example: "Certifications: Not provided," never "candidate is not certified"). Verified with a dedicated test.

## 13. Privacy

**Not implemented — see §4.** The existing architecture has no recruiter-identity concept to enforce ownership against. Documented as a known limitation rather than partially patched.

## 14. Authorization

Unchanged — no new route was added, so no new authorization surface exists either. The pre-existing lack of an auth gate on `/api/ai/recruiter/*` (a documented Phase 13 decision) is unchanged by this milestone.

## 15. Performance

Zero new LLM calls, zero new database queries (there is no database involved — everything is in-memory, as it already was), zero re-parsing, zero re-scoring. `buildRecruiterSummary()` is a pure function over data `getProfile()` already assembles.

## 16. UI

Two small, additive changes to existing pages — a badge in the ranking list, a new panel in the candidate detail page — both using the app's existing card/badge visual language, no new page, no new design system.

## 17. Database

None. No schema exists for this feature (it's in-memory), and none was added.

## 18. Security

Reused `matchedSkills`/`missingSkills` and score data exactly as already computed — no new prompt construction, no raw resume/JD text sent anywhere new. `buildRecruiterSummary()` never calls an LLM.

## 19. Tests

17 new deterministic tests, all non-LLM:

- `candidate-ranking.test.ts` (11): all 4 fit-level tier boundaries; ranking-score behavior confirming missing data is never coerced to 0; strict-descending ordering; correct `level` attached per candidate; reproducibility (same input → same output); the full tie-break cascade (JD Match → Skills → Experience → ATS, tested via the exported `compareRanked()` comparator directly, since tie-break factors are themselves ranking-weight factors, making an organic end-to-end weighted tie impractical to construct by hand); the null-never-beats-a-real-value rule; and the final `candidateId` fallback producing one fixed order regardless of input array order.
- `candidate-summary.test.ts` (6): matched/missing skills become strengths/gaps; a high-scoring dimension (≥85) becomes a strength, a merely-good one (<85) doesn't; no JD match yields zero fabricated gaps; missing resume sections report `not_provided` and are never phrased as a deficiency; present sections report `available`.

## 20. Validation Results

| Command | Result |
|---|---|
| `npx vitest run` | **662/662 passing** (up from the Milestone 10/Phase 15 baseline of 645; +17 new tests, 0 regressions, 52/52 test files) |
| `npx tsc --noEmit` | Clean, 0 errors |
| `npm run lint` | 0 errors, 1 pre-existing unrelated warning (`no-img-element`) — unchanged |
| `npm run build` | `✓ Compiled successfully` |

## 21. Live Validation

Started a production server and probed the recruiter routes directly:

- `GET /api/ai/recruiter/ranking` → `200` (returns real, live ranking data — confirming §4's finding: this route has no auth check at all, a pre-existing condition, not something this milestone changed)
- `GET /recruiter` → `200`

**What was not live-tested**: a full end-to-end candidate import → rank → view detail → confirm level badge and deterministic summary walkthrough. Unlike every other milestone in this long session, this one is **not** blocked by the Supabase auth limitation (the recruiter workspace uses in-memory storage, not Supabase) — but a full multi-file resume upload walkthrough was out of scope for this session's validation pass given the surface area already covered; the new logic is instead established by the 17 unit tests, which exercise the exact same pure functions (`classifyCandidateFitLevel`, `compareRanked`, `buildRecruiterSummary`) the live routes call.

## 22. Database Changes

None.

## 23. Known Limitations

- **No per-recruiter ownership/privacy model** — see §4. This is the most significant gap this milestone leaves open, deliberately, rather than half-implementing.
- No auth gate on any `/api/ai/recruiter/*` route — a pre-existing, documented Phase 13 condition, unchanged.
- The workspace remains a single shared session with no independent persistence, capped to the underlying resumes' ~2-hour TTL (Phase 13's own documented limitation, unchanged).
- `buildRecruiterSummary()`'s score-derived strengths use a fixed ≥85 threshold, consistent with the ≥85 "strong" convention already established in `ats-explainability.ts` (Phase 15 Milestone 7) — chosen for cross-feature consistency, not re-derived from first principles.

## 24. Recommended Next Milestone

Design the ownership/persistence model properly, as its own explicitly-scoped milestone: an authenticated recruiter identity, a real per-recruiter candidate/job data boundary, and a decision about whether the existing in-memory `CandidateService` gets a persistent backing store or a recruiter-scoped in-memory partition — closing the §4/§14 gap this milestone found but correctly declined to patch over.
