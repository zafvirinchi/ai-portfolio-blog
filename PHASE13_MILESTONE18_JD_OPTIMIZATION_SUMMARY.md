# Phase 13 — Milestone 18: JD-Driven Resume Optimization Summary & Prioritization

## 1. Goal

Convert the JD matching/optimization intelligence that already exists (Milestones 15–17) into a concise, recruiter-grade summary: overall match strength, matched/related/missing counts, education and certification status, deterministic priority ranking, strengths, gaps, and a list of resume content that must never be changed automatically. This milestone does **not** replace or duplicate the optimizer — it makes the optimizer's and matcher's existing output easier to understand and act on before any proposal is applied.

## 2. Existing Architecture Reused

- **Match score**: `JdMatchResult.overallMatch` (computed by `jd-matcher.ts`'s `computeJdMatch()`) is used directly — never recomputed.
- **Skill matching**: `matchResult.matchedSkills` / `partialSkills` / `missingSkills` (from `keyword-engine.ts`'s `matchKeywords()`, already run inside `computeJdMatch`) — no new keyword engine.
- **Education classification**: `classifyEducationRequirements()` (Milestone 17, `keyword-engine.ts`) — no new education matcher.
- **Certification classification**: `classifyCertificationRequirements()` (Milestone 17, `keyword-engine.ts`), which itself reuses `findRelatedCertification()` — no new certification matcher.
- **Experience signal**: `matchResult.experienceMatch.level`/`.reasoning` (from `experience-engine.ts`'s `matchExperience()`) — no second experience-calculation engine.
- **Mandatory vs. preferred skill evidence**: `JobDescription.mandatorySkills` / `.goodToHaveSkills`, populated by `jd-parser.ts`'s own extraction prompt (which documents `skills` as "the flat union of both") — the only place this milestone treats a requirement as "mandatory," and only because the JD parser already provides that evidence.
- **Proposal/gap semantics**: reuses the existing distinction (Milestone 16/17) that an `equivalent_or_higher` education match and a `matched` certification never produce a gap proposal, while a `related` certification and a `missing` anything always do (`buildEducationAndCertificationProposals()` in `optimization-review.ts`) — the summary's matched/related/missing counts follow this exact same distinction rather than inventing a new one.

## 3. Files Added

- `src/lib/ai/resume-versions/dynamic/jd-optimization-summary.ts` — the summary model and deterministic builder (`buildJdOptimizationSummary()`).
- `src/lib/ai/resume-versions/dynamic/jd-optimization-summary.test.ts` — 17 unit tests.
- `PHASE13_MILESTONE18_JD_OPTIMIZATION_SUMMARY.md` (this file).

## 4. Files Modified

- `src/lib/ai/resume-versions/dynamic/index.ts` — added `export * from "./jd-optimization-summary"` (one line, additive).
- `src/app/api/ai/resume/versions/[id]/jd-optimize/propose/route.ts` — computes and returns one additive `summary` field; every existing response field is unchanged.
- `src/components/resume/versions/JdOptimizationReview.tsx` — added a `JdOptimizationSummary` panel near the top of the results, and two `useRef` scroll anchors ("Review High-Priority Gaps" / "Review Optimization Proposals") pointing at the existing detail sections already rendered below it.

## 5. Files Intentionally Untouched

- `keyword-engine.ts`, `jd-matcher.ts`, `ats-engine.ts`, `experience-engine.ts`, `optimizer.ts`, `resume-optimizer.ts` — no matching/scoring/optimization logic changed.
- `optimization-review.ts` — proposal building/apply logic unchanged; the summary builder only *reads* its sibling classifiers, never `ResumeChangeProposal`s.
- `/jd-optimize/apply` route — untouched; this milestone adds no new auto-apply behavior.
- `ConversationService`, `Agent.run()`, `GraphState`, LangGraph topology, Planner, Tool Registry, Knowledge Pipeline/Manager, resume parser/extraction, resume document persistence model, template engine, `PortfolioChain`, multi-agent topology — none of these were touched or needed to be.

## 6. Summary Model

```ts
interface JdOptimizationSummary {
  overallMatchScore: number;       // JdMatchResult.overallMatch, reused directly
  matchedCount: number;            // skills matched + education (matched+equivalent_or_higher) + certifications matched
  relatedCount: number;            // partial skills + related certifications
  missingCount: number;            // skills missing + education missing + certifications missing
  education: { matched: number; equivalentOrHigher: number; missing: number };
  certifications: { matched: number; related: number; missing: number };
  priorities: OptimizationPriority[];   // { priority, category, title, reason, impact }
  strengths: OptimizationHighlight[];   // { category, title, reason }
  gaps: OptimizationHighlight[];        // { category, title, reason }
  protectedContent: ProtectedContentItem[]; // { sectionId, sectionType, reason }
}
```

Adapted from the milestone's suggested shape: `category` uses the existing `SectionType`/skill vocabulary rather than inventing new labels, and `SummaryCategory` is deliberately a superset (`skill`/`experience`/`education`/`certification` are populated; `keyword`/`project`/`achievement` are reserved — see §17).

## 7. Priority Rules (deterministic, no LLM)

| Signal | Priority | Evidence used |
|---|---|---|
| Missing skill, present in `jobDescription.mandatorySkills` | **critical** | JD parser's own mandatory/preferred split |
| Missing skill, present in neither mandatory nor good-to-have list | **high** | JD lists it, but no mandatory/optional evidence exists |
| Missing education requirement | **high** | `classifyEducationRequirements` status `missing` |
| Missing certification requirement | **high** | `classifyCertificationRequirements` status `missing` |
| Weak overall experience match | **high** | `experienceMatch.level === "Weak"` |
| Partial skill match, mandatory | **high** | family-match exists, but requirement is mandatory |
| Missing skill, present in `goodToHaveSkills` | **medium** | JD parser's mandatory/preferred split |
| Related-but-not-exact certification | **medium** | `classifyCertificationRequirements` status `related` |
| Partial skill match, not categorized mandatory/good-to-have | **medium** | ambiguous JD evidence |
| Partial skill match, good-to-have | **low** | family-match exists for a stated-preferred skill |

Impact is a coarse, level-derived score (`critical`=90, `high`=70, `medium`=45, `low`=20) — deliberately not a separately-fabricated per-item estimate, since this deterministic engine has no evidence to justify finer precision. Priorities are sorted by level, then impact, then title, for stable output.

No `mandatory` status is ever inferred for education or certifications — `JobDescription` has no such field for either, so per the milestone's explicit instruction, none was invented.

## 8. Education Matching Reuse

`education.matched` / `.equivalentOrHigher` / `.missing` are plain counts over Milestone 17's `classifyEducationRequirements()` output, passed in from the `/propose` route (already computed there for the existing `educationMatches` response field — never computed twice by this module). No fabricated institutions or degrees; `resumeEvidence` is always a degree string already present in the resume.

## 9. Certification Matching Reuse

Same pattern via `classifyCertificationRequirements()`, which itself calls `findRelatedCertification()` — untouched in this milestone. A "related" certification's `resumeEvidence` is always the genuinely different certification the candidate already holds; it is never renamed to the JD's requirement text (verified by a dedicated non-fabrication test — see §14, Test 13).

## 10. Keyword Matching Reuse

`matchedCount`/`relatedCount`/`missingCount`'s skill portion comes directly from `JdMatchResult.matchedSkills`/`.partialSkills`/`.missingSkills` — themselves `keyword-engine.ts`'s `matchKeywords()` output, already computed once per `computeJdMatchForResume()` call. No second keyword matcher; a partial/family match is never counted as a full match.

## 11. Anti-Fabrication Rules

- A missing JD requirement (skill, education, or certification) is always shown as `missing`/absent — never silently added to `strengths` or `matchedCount`.
- `resumeEvidence` on every education/certification classification is always a string that genuinely exists in the resume (or `null`) — the builder never writes JD requirement text into an "evidence" field.
- The summary builder is pure: it never mutates `matchResult`, `educationMatches`, `certificationMatches`, or `document` (verified — see §14, Test 16).
- No new LLM call is made anywhere in this milestone — the entire summary is a synchronous reshaping of already-computed data.

## 12. Protected Content Rules

`buildProtectedContent()` lists a fact category only when the corresponding data genuinely exists:

- Personal/contact information — only if at least one contact field is non-null.
- Employment dates & company names — only if an `EXPERIENCE` section exists with at least one entry.
- Education credentials — only if an `EDUCATION` section exists with at least one entry.
- Certification names — only if a `CERTIFICATIONS` section exists with at least one entry.
- Project dates & facts — only if a `PROJECTS` section exists with at least one entry.

Every reason ends with "Do not change this unless the information is factually incorrect." This is purely informational — nothing in this milestone (or the optimizer it summarizes) writes to these fields.

## 13. API Changes

`POST /api/ai/resume/versions/[id]/jd-optimize/propose` gained one **additive** response field: `summary: JdOptimizationSummary`. Every existing field (`jobDescription`, `matchResult`, `proposals`, `currentAtsScore`, `projectedAtsScore`, `educationMatches`, `certificationMatches`) is unchanged. No new routes. `/jd-optimize/apply` is untouched. Authentication is unchanged — `requireUserId()` is called exactly as before; live-verified the route still returns `401` for unauthenticated requests (see §15).

## 14. UI Changes

`JdOptimizationReview.tsx` gained a `JdOptimizationSummaryPanel`, rendered as the first thing inside the results area (above the existing ATS/match stat cards):

- An overall-match progress bar with the score, plus Matched/Related/Missing counts.
- Top 5 priorities, each with a colored priority badge (critical=red, high=amber, medium=blue, low=slate — reusing the component's existing amber/red/green/blue semantic palette, no new colors) and its reason.
- Strengths / Gaps as a two-column compact list.
- Protected Facts (only rendered when non-empty).
- "Review High-Priority Gaps" and "Review Optimization Proposals" buttons that `scrollIntoView` the **existing** detail sections (the Education Match/Certification Match tables and partial/missing-skills box, and the Suggested Changes/Apply block, respectively) — no new dashboard, no duplicate editor, no new routing.

## 15. Tests

17 tests added in `jd-optimization-summary.test.ts`, covering all 16 scenarios the milestone specified (several folded together where they share one assertion block) plus one extra positive control for the CRITICAL rule:

1. All requirements matched. 2. Mixed matched/related/missing. 3. All requirements missing. 4–6. Education matched / equivalent-or-higher / missing. 7–9. Certification matched / related / missing. 10. High-priority (and bonus critical) gap detection. 11. Medium-priority gap detection. 12. Low-priority gap detection. 13. No fabricated information (missing skill never a strength; related cert's evidence never renamed to the JD's own text). 14. Protected content detection (present and absent cases). 15. Existing proposal compatibility (agrees with `buildEducationAndCertificationProposals()` on which requirements are gaps, without depending on it; confirms `autoApplicable: false` is still enforced). 16. Existing JD optimization response compatibility (purity — no input mutation).

## 16. Validation

- `npx tsc --noEmit` — clean.
- `npm run lint` — 0 errors, 1 pre-existing unrelated warning (`no-img-element` in the blog page).
- `npm test` (`vitest run`) — **315/315 passing** (298 before this milestone, +17 new).
- `npm run build` — succeeded, all routes compiled including the modified `/propose` route.
- Live check against a fresh `npm run start` server: `POST /jd-optimize/propose` and `POST /jd-optimize/apply` both still return `401` with a clean JSON error for unauthenticated requests (auth boundary unchanged); `GET /resume-analyzer/versions/[id]` still returns `200`. Full authenticated end-to-end testing (Scenarios A–F in the milestone spec) remains blocked by the pre-existing, unrelated Supabase schema-cache issue (`PGRST205` on `password_history`/`auth_sessions`/`security_events`), first identified in Milestone 14 and reconfirmed present at the start of every milestone since — this environment issue is outside this session's scope and this milestone touches no database tables. Scenarios A–E's logic is exercised directly by the unit tests in §15 instead (e.g. Test 5/6 = Scenario D, Test 8 = Scenario E); Scenario F (existing proposal apply flow) is covered by Test 15 plus the unchanged, still-passing `optimization-review.test.ts` suite.

## 17. Known Limitations

- `priorities`/`strengths`/`gaps` populate only the `skill`, `education`, `certification`, and `experience` categories. `keyword`, `project`, and `achievement` are reserved in the `SummaryCategory` type but not populated in this version — the existing architecture only exposes *aggregate* project/achievement ATS scores (`ats-engine.ts`'s `scoreProject`/`scoreAchievement`), not a per-item evidence list; populating those categories honestly would require a new per-item detector, which this milestone's "reuse existing calculations, don't invent new engines" constraint puts out of scope.
- "Mandatory" status is only ever inferred for skills (where `JobDescription.mandatorySkills` gives real evidence). Education and certification requirements have no such field in the JD schema, so every missing item in those categories is capped at `high`, never `critical`, regardless of how the job posting phrased it.
- The Supabase schema-cache issue (§16) continues to block full interactive end-to-end verification; unrelated to and unaffected by this milestone.

## 18. Future Enhancements

- If `ats-engine.ts`'s project/achievement scoring is ever extended to expose per-item detail (not just an aggregate score), the `project`/`achievement` priority categories could be populated without any new matching engine.
- The Milestone 16 §20 / Milestone 17 §18 optimizer-duplication question (`job-description/optimizer.ts` vs. `resume-optimizer.ts`) remains open and unrelated to this milestone; not revisited here since this milestone touches neither optimizer implementation.

**This milestone does not replace the optimizer.** `optimizer.ts`, `resume-optimizer.ts`, and the proposal/apply pipeline in `optimization-review.ts` are unchanged; this milestone only adds a read-only, deterministic summary layer on top of their existing output.
