# Phase 15 — Milestone 7: ATS Explainability & Resume Health Dashboard

## 1. Objective

Turn the existing ATS score into an explainable dashboard — why the score is what it is, what's already good, what would help most, and which fixes are safe to apply automatically vs. need a human to confirm a new fact — by exposing the reasoning the existing engines already compute, never by building a second scoring system.

## 2. Audit Findings

This milestone's audit was unusually consequential: most of the *scoring* this spec describes already existed, in far more detail than the spec's own example — the actual gap was almost entirely in *explaining* those numbers, not computing new ones.

| Spec ask | What already existed |
|---|---|
| Score breakdown (§3) | **Two** deterministic scorers: `resume-score.ts` (6 categories, general) and `job-description/ats-engine.ts` (12 categories, JD-aware) — both already reused everywhere; neither was touched |
| Score bars (§4) | `ResumeAtsScore.tsx` / `JdAtsBreakdown.tsx` already rendered value + percentage bar per category |
| Top strengths/issues (§7/§8) | `JdMatchResult.resumeStrengths`/`resumeWeaknesses` — AI-generated, already shown in JD mode only |
| Missing keywords (§10) | `matchKeywords()` (keyword-engine.ts) already classifies matched/**partial**/missing/additional with word-boundary-aware, synonym-aware, family-aware matching — far more sophisticated than a flat list |
| Fix priority (§20) | `improvementSuggestions[].priority` (`"High"\|"Medium"\|"Low"`) already existed |
| Before/After preview (§19) | **Already fully implemented** — `optimization-review.ts`'s `projectAtsScoreAfterProposals()`, already shown in `JdOptimizationReview.tsx` as "Projected ATS Score*" with a "not a guaranteed score" disclaimer, for the JD-optimization-proposal review flow |
| Experience/Project/Certification quality (§11/§14/§16) | `scoreAchievement()`/`scoreProject()`/`scoreCertification()` (ats-engine.ts) already compute these deterministically |

**Genuine gaps found:**

1. The JD-aware, 12-category `AtsCategoryScores` had **zero explanation text at all** — no field for it, no caption anywhere in the UI. The general 6-category `AtsScore` has one combined paragraph (`buildExplanation()`), not per-category captions suitable for individual bars.
2. No Resume Health tier, no Recruiter Readiness — neither concept existed anywhere.
3. No deterministic strengths/issues for the **general** (no-JD) case — `resumeStrengths`/`resumeWeaknesses` only exist when a JD has been matched (they're AI output from `resumeOptimizer.optimize()`); a resume analyzed without a JD had no "what's good / what needs work" list at all.
4. No Safe-vs-Manual fix classification anywhere (§9).
5. No importance/placement classification for missing keywords (§10) — `missingSkills`/`missingKeywordsSection` were flat lists.
6. No Section Completeness or Contact Quality view tied to the ATS/JD context (a *different*, layout-focused quality check — `resume-quality.ts` — already existed for the Design tab, but nothing surfaced completeness in ATS terms).
7. No per-skill numeric Improvement Impact (§18) — `improvementSuggestions[].impact` is a **string** description, not a point estimate.
8. **`VersionDetail.tsx`'s "Overview" tab — the natural home for a per-version dashboard (§25) — showed only bare `atsScore`/`jdMatchScore` numbers in a stat card, with zero breakdown, zero explanation, for every version.** This was the single highest-value gap found.

## 3. A Real Architectural Constraint Found During Implementation

Tracing exactly what a `ResumeVersionRecord` persists (`resume-version-types.ts`) revealed that **only the flat summary of a JD match survives** — `jdMatchScore`, `matchedSkills: string[]`, `missingSkills: string[]`, and `optimizedSections` (summary/experience/projects/skills text + `improvementSuggestions`). The full 12-category breakdown, `resumeStrengths`/`resumeWeaknesses`, `experienceMatch`, `educationMatch`, and the parsed `JobDescription` itself are **never persisted** — they exist only transiently in the ephemeral analyzer flow's client-side React state.

Recomputing any of that for a *version* would require re-running the JD pipeline (`jdParser.parse()` + `resumeOptimizer.optimize()`) — real LLM calls, which §26 explicitly forbids. This is why the version dashboard's JD section stays limited to what's actually persisted (score, matched/missing skill counts, existing improvement suggestions), while its **general** ATS breakdown is fully rich — because `resumeScorer.score()` is a pure, dependency-free function that can be re-run for free from `resumeData`, which *is* always persisted and always current (Milestone 2's sync).

## 4. Files Added

- `src/lib/ai/resume-versions/dynamic/ats-explainability.ts` — the core explainability module (see §5).
- `src/lib/ai/resume-versions/dynamic/ats-explainability.test.ts` — 28 tests.
- `src/lib/ai/resume-versions/dynamic/index.ts` — did not exist as a separate diff target before; re-exports the new module (barrel file already existed, one line added).

## 5. Files Modified

- `src/lib/ai/resume/resume-score.ts` — exported the existing, unchanged `WEIGHTS` constant (was module-private) so impact estimates can use the *real* weight table instead of a duplicated copy. Zero scoring behavior changed.
- `src/lib/ai/job-description/ats-engine.ts` — same, for its own `WEIGHTS` constant.
- `src/components/resume/ResumeAtsScore.tsx` — added Resume Health, Recruiter Readiness, per-category explanation captions, deterministic Strengths, and deterministic Issues (with priority, Safe/Manual, and point-impact tags).
- `src/components/resume/jd/JdAtsBreakdown.tsx` — added Resume Health, per-category explanation captions (the JD-aware breakdown had none before), and a deterministic Issues section supplementing the existing AI strengths/weaknesses.
- `src/components/resume/jd/JdMissingSkills.tsx` — added importance (Critical/High/Medium) and placement ("Skills"/"Experience"/"Experience + Skills") per missing keyword, when the full `JobDescription` is available (only in the ephemeral JD-match flow — see §3).
- `src/app/(site)/resume-analyzer/page.tsx` — one-line change passing `jobDescription={jdMatch.jobDescription}` to `JdMissingSkills`.
- `src/components/resume/versions/VersionDetail.tsx` — the main integration point: computes a fresh `AtsScore` (via `resumeScorer.score(resumeData)`), a lazily-migrated `DynamicResumeDocument`, and a `ResumeQualityReport` — all from data already on the loaded version, zero new fetches — and renders the full `ResumeAtsScore` dashboard plus new Section Completeness and Contact Quality panels. Also tagged the existing JD-optimization suggestions list with a "Safe Fix" badge.

## 6. Files Intentionally Untouched

`resume-score.ts`'s and `ats-engine.ts`'s actual scoring logic (only the `export` keyword was added to each `WEIGHTS` constant — see §5), `keyword-engine.ts`, `jd-matcher.ts`, `jd-service.ts`, `optimizer.ts`, `optimization-review.ts` (its own `projectAtsScoreAfterProposals` already covers the proposal-review Before/After case and was reused conceptually, not duplicated), `resume-quality.ts` (a distinct, layout-focused concern — reused as a constructor input, not modified), `resume-version-service.ts` (no persistence shape change was needed).

## 7. ATS Explainability Architecture

One new pure, dependency-free module, `ats-explainability.ts`, exporting small, individually-testable functions — no class, no stateful object, matching this codebase's established `resume-quality.ts`/`dynamic-resume-render.ts` pattern:

- `classifyResumeHealth(overall)` — 5-tier deterministic classification (§5's exact thresholds).
- `classifyRecruiterReadiness(atsScore, quality)` — combines the ATS score with the separate, existing Resume Quality report; degrades gracefully to `quality: null` for contexts without one (the ephemeral analyzer).
- `explainGeneralAtsCategories` / `explainJdAtsCategories` — turn the 6 general / 12 JD-aware scores into `{key, label, value, explanation}` rows with a short, deterministic caption.
- `deriveStrengthsFromCategories` / `deriveIssuesFromCategories` — a category becomes a strength only at ≥85, an issue only below a threshold; issues carry `priority`, `fixType`, and `potentialImpact` (see below), sorted by impact descending (§8's "order by impact").
- `classifyFixType(categoryKey)` — a fixed lookup table mapping each category to `"safe"` (wording/presentation of content the user already entered) or `"manual"` (would typically require a new fact) — this is a direct application of the Resume Rewriter's already-established **Protected Facts** rule (AI/manual polish is fine; fabricating a new employer/degree/certification/date is not), not a new concept.
- `computeSectionCompleteness(document)` — reuses the Section Registry's own `RECOMMENDED_SECTION_TYPES`/`MORE_SECTION_TYPES` grouping (Milestone 1) to classify every section type as Complete / Missing (recommended, absent) / Optional (everything else, absent) — never requires an optional section (§12).
- `computeContactQuality(personalInformation)` — 7-field presence check.
- `classifyMissingKeyword(skill, jd)` — importance via the JD's own `mandatorySkills`/`goodToHaveSkills` lists (reusing `matchKeywords()`, never a guessed score); placement via the JD's category arrays (`cloud`/`frameworks`/etc.) and `textContainsTerm()` against `responsibilities` (both from the unmodified `keyword-engine.ts`).
- `estimateSkillAdditionImpact(resume, skill)` / `estimatePotentialAtsScore(resume, skills)` — the one new "what-if" capability: clones the resume, adds a hypothetical skill, re-runs the exact same public `resumeScorer.score()` the real persisted score comes from, and diffs. Never mutates the input. Deliberately bounded to the one concretely simulatable action (a missing skill) — a vague prose suggestion like "improve the summary" has no deterministic delta and correctly gets none fabricated.

## 8. Dashboard Implementation

Two existing presentational components (`ResumeAtsScore.tsx`, `JdAtsBreakdown.tsx`) were extended in place rather than replaced — both already sat behind the exact prop boundary (`score: AtsScore` / `result: JdMatchResult`) this milestone needed, so no new component tree or routing was introduced. `VersionDetail.tsx` gained two new panels (Section Completeness, Contact Quality) using the same design language (existing card/border/badge classes) as every other panel on that page.

## 9. Security

No internal scoring weights, prompts, or other users' data are exposed — the newly-exported `WEIGHTS` constants are the same numbers already implicitly observable from the score itself (score = weighted sum; the weights were never secret, just previously module-private for no security reason). All new UI reads only props already passed down through existing, already-authorized data-fetching (`VersionDetail.tsx`'s existing `requireUserId()`-protected `/versions/:id` fetch; the ephemeral analyzer's existing client state) — no new API route, no new authorization surface.

## 10. Accessibility

Every progress bar (overall and per-category, in both `ResumeAtsScore.tsx` and `JdAtsBreakdown.tsx`) now has `role="progressbar"` with `aria-valuenow`/`aria-valuemin`/`aria-valuemax`/`aria-label` — previously plain, unlabeled `<div>` bars. Every status/priority/fix-type indicator pairs a color with explicit text (e.g. "Critical", "Safe Fix") — never color alone (§28's explicit "color-independent indicators").

## 11. Tests

28 new deterministic tests in `ats-explainability.test.ts`, all non-LLM:

- Resume Health: all 5 tier boundaries.
- Recruiter Readiness: High/Low cases, graceful degradation without a quality report, and an explicit check that reasons never claim a real recruiter's approval.
- Category explanations: correct count (6 general / 12 JD-aware, confirming the JD side now has captions where it had none), qualifier wording scales with score.
- Strengths/Issues: only ≥85 becomes a strength, only below-threshold becomes an issue, correct impact-descending sort, the impact formula verified against the real exported weight table for both the general (fraction) and JD-aware (percentage) weight shapes, correct priority tiers.
- Fix classification: safe vs. manual mapping, safe default-to-manual fallback.
- Section Completeness: Complete/Missing/Optional correctly distinguished, including the "present but empty" case correctly NOT counted complete.
- Contact Quality: presence detection.
- Missing keyword classification: mandatory→Critical, good-to-have→Medium, unlisted→High; placement (Skills / Experience / Experience + Skills).
- Impact estimation: positive delta for a genuinely new skill, input immutability (§19's "without changing the resume yet"), potential never less than current.

## 12. Validation Results

| Command | Result |
|---|---|
| `npx vitest run` | **616/616 passing** (up from the Milestone 6 baseline of 588; +28 new tests, 0 regressions, 49/49 test files) |
| `npx tsc --noEmit` | Clean, 0 errors |
| `npm run lint` | 0 errors, 1 pre-existing unrelated warning (`no-img-element`) — unchanged |
| `npm run build` | `✓ Compiled successfully` |

## 13. Live Validation

Started a production server and probed the changed routes/pages directly:

- `GET /api/ai/resume/versions/[id]` (no auth) → `401` — the data source `VersionDetail.tsx`'s new dashboard reads from remains auth-gated, unchanged.
- `GET /resume-analyzer` → `200` — the ephemeral analyzer page (client-side upload flow) still loads.

**What was not live-tested**: an authenticated click-through (open a version's Overview tab and visually confirm the breakdown/health/readiness/section-completeness panels; upload a resume + JD in the analyzer and confirm the new missing-keyword importance/placement chips; switch versions and confirm the dashboard updates). Same pre-existing Supabase auth/schema-cache limitation as every prior milestone in this phase — reported honestly rather than assumed. The underlying computation is instead established by the 28 new unit tests, which exercise the exact same pure functions the UI calls, using the exact same score/weight objects the real engines produce.

## 14. Database Changes

None. Every new UI element is computed from data already persisted or already in client state.

## 15. Known Limitations

- **The JD-aware, 12-category breakdown and AI-generated strengths/weaknesses are not available for persisted Resume Versions** — only the ephemeral analyzer flow has them, because only it holds the full, unpersisted `JobDescription`/`JdMatchResult` objects (§3). A version's Overview tab shows the full *general* ATS breakdown (always fresh, always free) alongside the *persisted* JD summary fields, honestly, rather than fabricating or silently re-running an LLM call to fill the gap.
- Missing-keyword importance/placement (§10) is unavailable for the same reason wherever only a flat `missingSkills` list is persisted (i.e., for versions) — it works only in the ephemeral analyzer's live JD-match flow, where the parsed `JobDescription` still exists.
- Numeric Improvement Impact (§18) is computed only for the one concretely simulatable action — adding a specific missing skill. Prose-based suggestions (rewrite the summary, strengthen a bullet) intentionally have no numeric estimate, since simulating their effect would require actually generating the rewritten text (an LLM call) before scoring it — exactly the kind of fabricated number §18 itself warns against.
- No explicit "Quick Actions" buttons (Rewrite Summary, Optimize Skills, etc.) were added as new UI beyond what already existed (the Overview/Builder tab switcher, the existing `JdOptimizationReview` apply flow) — the existing navigation already reaches every relevant feature, and adding parallel action buttons risked duplicating rather than reusing that flow.

## 16. Recommended Next Milestone

Persist a small, additive summary of the JD-aware breakdown (e.g. the 12 category scores, not the full AI strengths/weaknesses text) onto `resume_versions` the next time a JD match actually runs for a version — closing the §3 gap for versions without ever triggering a new LLM call outside of an already-user-initiated JD match. This is deliberately out of this milestone's scope (a schema change, however additive, is a bigger decision than an explainability pass), but is the natural next step once a genuine need for it is confirmed.
