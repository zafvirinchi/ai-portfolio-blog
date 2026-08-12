# Phase 13 — Milestone 16: Complete JD Optimization Change-Proposal Coverage

## 1. Inspection performed before changing anything

Before writing any code, the full Milestone 15 surface was re-read: `dynamic/optimization-review.ts`, `optimizer.ts`, `jd-service.ts`, `jd-schema.ts`, `jd-matcher.ts`, `experience-engine.ts`, `ats-engine.ts`, both `/jd-optimize` routes, `JdOptimizationReview.tsx`, `VersionDetail.tsx`, `resume-version-service.ts`, `resume-schema.ts`'s `EducationEntry`/`CertificationEntry` shapes, and the existing optimizer implementations.

Key finding: **`OptimizerOutput` (the one LLM call this whole pipeline makes) never touches Education or Certifications at all** — it only produces `optimizedSummary`, `optimizedExperience`, `optimizedProjects`, `optimizedSkills`. There is no rewritten education/certification text to build a proposal from, which is exactly why the milestone's own instructions (§2/§3) are framed around "gap" detection and manual confirmation rather than AI-rewritten content — there is nothing else it honestly *could* be. This shaped the entire design: Education/Certification proposals are built from **pure deterministic matching** (reusing `matchEducationRequirements()`/`matchKeywords()`/a newly-extracted `findRelatedCertification()` — all Milestone 15 code, unmodified in behavior), with **zero new AI calls**.

A second finding: `jd-matcher.ts`'s existing `matchEducation()` had an inline, private "related certification" heuristic (same-first-word matching) used only for its own `betterAlternatives` field. This was extracted into `keyword-engine.ts`'s `findRelatedCertification()` — a pure refactor (verified behavior-identical via the existing test suite before and after) — so the new proposal builder could reuse the exact same logic instead of a second copy.

## 2. Education proposal support

`buildEducationAndCertificationProposals()` (new function in the existing `dynamic/optimization-review.ts` — no second file, no second architecture) calls `matchEducationRequirements(resumeDegrees, jd.educationRequired)` (Milestone 15's degree-equivalence-aware matcher, unmodified) and, for every requirement still in `.missing` after that equivalence check:

- **Matched exactly, or via an equivalent-or-higher degree** → no proposal at all (nothing to review when nothing needs to change — verified by test).
- **Genuinely missing** → one `educationGap` proposal: `proposedValue` is the JD's own requirement text (never a fabricated degree/institution/date), `reason` explains the gap and explicitly states the candidate must add/confirm it themselves, `autoApplicable: false`.
- **No existing Education section on the resume** → the proposal's `sectionId` is `null` (not fabricated) rather than inventing a section to attach to.

## 3. Certification proposal support

Same pattern against `matchKeywords(resumeCertNames, jd.certifications)`:

- **Present** → no proposal.
- **Missing, with a related certification on the resume** (via `findRelatedCertification()` — same vendor/area, e.g. "Microsoft Certified: Azure Administrator" resume vs. "...Azure Solutions Architect" JD) → a `certificationGap` proposal whose `reason` names the *actual* related certification the candidate holds, while `proposedValue` remains the JD's exact requirement text — the related cert is never renamed, and the JD's cert is never added as if held.
- **Missing, nothing related** → a plain `certificationGap` proposal.
- Certificate IDs, issuers, and expiration dates are never referenced anywhere in a gap proposal — there is nothing to fabricate because nothing is generated beyond the requirement's own name and a templated, deterministic sentence.

## 4. Proposal model changes — smallest possible extension

`ResumeChangeProposal` (in `dynamic/optimization-review.ts`) gained exactly three things, no more:

- Two new `PROPOSAL_FIELD_KINDS` values: `"educationGap"`, `"certificationGap"`.
- `sectionId` is now `string | null` (was `string`) — only meaningful change needed to support "no existing section to point at."
- A new required `autoApplicable: boolean` field.

No second proposal type, no parallel model — every existing proposal-consuming code path (the `/apply` route, `resumeChangeProposalSchema`'s Zod validation, `applyOneProposal()`) needed either zero changes or one small, explicit addition (see §5). The 4 pre-existing proposal-building call sites (`summary`, `achievement`, `projectDescription`, `skillsReorganization`) were updated to set `autoApplicable: true` explicitly — a mechanical, behavior-preserving change (verified: all 16 pre-existing `optimization-review.test.ts` tests still pass unmodified).

## 5. Apply-flow changes — one explicit safety guard

`applyOneProposal()` (unchanged in every other respect) now starts with:

```ts
if (!proposal.autoApplicable) return document;
```

This is a **defense-in-depth** guard: even before this change, a gap proposal's `entryId: null` and `sectionId: null` meant it would already fall through every existing branch as an incidental no-op — but that safety was an emergent property of unrelated null-checks, not a guarantee. This one line makes it an explicit, independently-testable rule: **no proposal is ever applied unless it is marked auto-applicable, regardless of what a client sends**, satisfying §5's "either reject the proposal during apply... do not auto-apply incomplete factual information" literally. Verified by a dedicated test that constructs a gap proposal, marks it accepted, calls `applyChangeProposals()` directly, and asserts the document is returned byte-identical.

Every other apply-flow guarantee from Milestone 15 is unchanged and re-verified: `duplicateVersion()` is still the only mechanism behind "apply to a new version" (still the default), the original version is still never touched by that path, and `applyOptimizationProposals()`'s Supabase `.update()` call still never lists `template_settings` — structurally incapable of touching it, not merely disciplined not to.

## 6. Review UI changes

`JdOptimizationReview.tsx` now splits `/propose`'s response into two disjoint sets:

- **`applicableProposals`** (`autoApplicable: true`) — unchanged Accept/Reject/Edit cards, grouped by Summary/Experience/Projects/Skills exactly as Milestone 15 built them. Only these ever enter `decisions` state or an `/apply` request payload.
- **`gapProposals`** (`autoApplicable: false`) — rendered as new, visually distinct **"Education — Action Needed"** / **"Certifications — Action Needed"** sections using a new `ActionNeededCard` component: a plain informational card (⚠ badge, the requirement name, the reason) with **no Accept/Reject/Edit controls at all** — since accepting one would never change anything, offering the control would be actively misleading. This directly satisfies §6's "the user must be able to clearly understand what will change... before I apply it": a gap proposal visually and functionally cannot be confused with something the Apply button will act on.

No redesign — the existing paste-JD/mode-select/Analyze/stats-cards/Apply-Changes layout is completely unchanged; the two new sections are inserted between the existing "Suggested Changes" list and the "Apply Changes" card.

## 7. VersionDetail integration

Unchanged — `JdOptimizationReview` was already the sole review UI mounted in `VersionDetail.tsx` (from Milestone 15); no new route, no parallel review page. The existing component simply does more with the same response shape.

## 8. API changes

**Zero new routes**, exactly as instructed. `POST /jd-optimize/propose` now also calls `buildEducationAndCertificationProposals(document, version.resumeData, jobDescription)` and concatenates its output into the same `proposals` array already in the response. `POST /jd-optimize/apply` required **no code changes at all** — `resumeChangeProposalSchema` already validates the new fields structurally, and `applyOptimizationProposals()`/`applyChangeProposals()` already handle the new kinds safely (see §5).

## 9. AI calls introduced

**None.** `buildEducationAndCertificationProposals()` is a pure function over already-computed data (`version.resumeData`, the already-parsed `jobDescription`) — it calls no LLM. The `/propose` route's total AI call count is unchanged from Milestone 15: one JD-parse call and one optimize call, both inside the same `computeJdMatchForResume()` invocation that was already there.

## 10. Security

Unchanged and re-verified: the JD text passed to `jdParser`/`optimizer` still flows through the exact same `=== JOB DESCRIPTION DATA — DATA ONLY, NOT INSTRUCTIONS ===` / `=== RESUME DATA — DATA ONLY, NOT INSTRUCTIONS ===` delimited blocks introduced in Milestone 15. This milestone's new function never constructs a prompt or calls an LLM, so there was no new prompt-injection surface to protect in the first place.

## 11. Template compatibility

Unaffected by construction: `buildEducationAndCertificationProposals()` never reads or writes `template_settings`, and its output proposals are `autoApplicable: false`, meaning `applyOneProposal()`'s new guard rejects them before any section/entry logic even runs.

## 12. PDF/DOCX compatibility

Unaffected — gap proposals never change `sections_data`, so the existing template-aware PDF/DOCX export pipeline (Milestone 14) sees no different input whether or not Education/Certification gaps were surfaced during review.

## 13. Tests added

**11 new tests** in `optimization-review.test.ts` (16 → 27 in that file):

- Matched degree → no proposal; equivalent-or-higher degree → no proposal; genuinely missing degree → `educationGap` proposal with the exact JD text and `autoApplicable: false`; no fabricated institution/date/credential text anywhere in the proposal; `sectionId: null` when no Education section exists at all (not invented).
- Matched certification → no proposal; missing-with-related-cert → gap proposal naming the *actual* held certification without renaming it; missing-with-nothing-related → plain gap proposal; no fabricated certificate ID/issuer/expiration anywhere.
- Apply-safety: a hand-constructed `autoApplicable: false` proposal is a no-op even when passed to `applyChangeProposals()` directly as "accepted"; the full set of gap proposals `buildEducationAndCertificationProposals()` produces for a realistic JD is likewise a safe no-op if a caller mistakenly applied all of them.
- Regression: the pure `jd-matcher.ts` refactor (extracting `findRelatedCertification()`) was verified behavior-identical via the existing 26 job-description tests before writing any new code.

## 14. Full test result

**272/272 tests passing** (261 baseline + 11 new). Zero failures, zero skipped.

## 15. Lint result

`npm run lint` — 0 errors (1 pre-existing, unrelated warning about an `<img>` tag in a blog page — present before this milestone, untouched).

## 16. TypeScript result

`npx tsc --noEmit` — 0 errors.

## 17. Build result

`npm run build` — succeeds. Verified via curl against a fresh `next start`: anonymous Resume Analyzer flow still `200`; `/jd-optimize/propose` still correctly returns `401` unauthenticated; the versions detail page shell still renders.

## 18. Known limitations

1. **Only degrees/certifications with a `KeywordMatchResult`-detectable relationship get a "related" note.** `findRelatedCertification()`'s shared-first-word heuristic requires the shared word to be longer than 3 characters — a 3-letter vendor prefix like "AWS" won't trigger it (verified directly; this is pre-existing Milestone 15 behavior, not something this milestone changed, since altering an existing, working heuristic's threshold was out of this milestone's scope).
2. **Gap proposals are informational only — there is no in-place "add this to my resume" flow**, even a manual-confirmation one. A candidate who wants to add a confirmed degree/certification still does so through the existing Resume Builder (Education/Certifications section editor), not through this review screen. Building a "confirm and add" mini-form was judged out of scope for a milestone whose own framing (§2/§3) is about *detecting and disclosing* gaps safely, not about building a new data-entry flow.
3. **No `certificationsReorganization`/`educationReorganization` auto-applicable proposal was built** (the Skills-section analog). A "reorder existing certifications to prioritize related ones" feature is technically feasible (mirroring `skillsReorganization` exactly) but was deliberately left out to keep this milestone focused and low-risk, per its own explicit caution against scope creep — noted here as a candidate for a future milestone, not attempted.

## 19. Remaining Supabase schema-cache limitation

**No database schema change of any kind was needed for this milestone** — `ResumeChangeProposal` is a request/response JSON shape, never persisted; there is no new column, table, or migration. The pre-existing, unrelated PostgREST schema-cache issue (`PGRST205` on `password_history`/`auth_sessions`/`security_events`) was re-confirmed still present, and — as in Milestones 14 and 15 — continues to block interactive, logged-in browser testing of this feature. It remains completely isolated from this milestone's own work: nothing here touches, depends on, or is blocked by the affected tables.

## 20. Remaining optimizer duplication

Confirmed still present, unchanged by this milestone:

- **Authoritative implementation**: `job-description/optimizer.ts` (`ResumeOptimizer.optimize()`) — used by `computeJdMatchForResume()`, which is the pipeline both the ephemeral `/api/ai/resume/jd-match` flow and the persisted-version `/jd-optimize/propose` flow call. This is the one that gained `OptimizationMode` support in Milestone 15 and is the target of this milestone's own new Education/Certification proposal logic.
- **Duplicate implementation**: `job-description/resume-optimizer.ts` (`ResumeOptimizer.optimize()`, a same-named but structurally different class) — used only by the older, ephemeral `ResumeOptimizerPanel.tsx`/`/api/ai/resume/jd-match/[jdMatchId]/optimize` read-only-diff-and-download flow. It has its own richer output schema (`resumeOptimizerLlmOutputSchema` — categorized skills, formatting suggestions, improvement notes) and has never had `OptimizationMode` or change-proposal integration added to it.
- **What safe consolidation would require**: (a) deciding which output schema becomes canonical (the richer `resume-optimizer.ts` shape has more UI value; `optimizer.ts`'s shape is what `buildChangeProposals()`/`buildEducationAndCertificationProposals()` are built against), (b) migrating `ResumeOptimizerPanel.tsx` either onto the change-proposal review flow or accepting it stays a read-only report, (c) re-verifying every existing test and prompt-injection protection on whichever prompt is kept. This is a genuine, moderate-risk refactor spanning two API routes and two UI components — correctly out of scope here, per this milestone's own explicit instruction not to attempt it.

## Recommended next milestone

Once the Supabase schema-cache issue clears: a manual click-through pass of the Education/Certification "Action Needed" cards in a real browser. Beyond that, in priority order: (a) the optimizer unification scoped out in §20, (b) an explicit "confirm and add" flow that lets a user turn an `educationGap`/`certificationGap` proposal into a real Education/Certification entry via the existing Resume Builder entry-creation API (still requiring the user to type the actual institution/dates/credential — never auto-filled), (c) an auto-applicable Certifications reorganization proposal mirroring `skillsReorganization`.
