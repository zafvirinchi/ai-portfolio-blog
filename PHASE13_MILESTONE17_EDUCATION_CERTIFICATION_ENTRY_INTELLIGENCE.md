# Phase 13 — Milestone 17: Education & Certification Entry Intelligence + Safe Auto-Apply

## 1. Summary

Milestone 17 makes the JD-optimization review surface behave like an enterprise resume builder for Education and Certification requirements: every JD requirement is now classified per-item (not just "gap or not") against the resume, shown in a JD Requirement / Resume Evidence / Status / Action table, and any "add this" action hands the user off to the **existing** Resume Builder editor rather than fabricating or auto-filling anything. It also consolidates one piece of Milestone 15/16-documented duplication where it was safe to do so, and leaves the rest of that duplication untouched with a stated reason.

## 2. Files Added

- `PHASE13_MILESTONE17_EDUCATION_CERTIFICATION_ENTRY_INTELLIGENCE.md` (this file)

## 3. Files Modified

- `src/lib/ai/job-description/keyword-engine.ts` — added `classifyEducationRequirements()`, `classifyCertificationRequirements()`, and the private `findExactMatch()` helper they share.
- `src/lib/ai/job-description/keyword-engine.test.ts` — added tests for the two new classifiers and additional `findRelatedCertification()` coverage (38 tests total in this file, up from 17).
- `src/lib/ai/job-description/jd-matcher.ts` — `matchEducation()` (private) rewritten to build its `EducationMatch` result from the two new classifiers instead of three separate ad hoc computations. External shape and behavior unchanged.
- `src/lib/ai/job-description/jd-matcher.test.ts` — added a "Milestone 17 consolidation regression" describe block (5 tests) exercising `computeJdMatch().educationMatch` directly.
- `src/lib/ai/resume-versions/dynamic/optimization-review.ts` — `buildEducationAndCertificationProposals()` rewritten to use the same two classifiers instead of its own `matchEducationRequirements`/`matchKeywords`/`findRelatedCertification` calls.
- `src/app/api/ai/resume/versions/[id]/jd-optimize/propose/route.ts` — additive response fields `educationMatches` and `certificationMatches` (full per-requirement breakdown, all statuses).
- `src/components/resume/versions/JdOptimizationReview.tsx` — new "Education Match" / "Certification Match" sections (JD Requirement / Resume Evidence / Status / Action rows for every classified requirement); new optional `onNavigateToBuilder` prop; removed the now-superseded gap-only "Action Needed" render block (its cards showed strictly a subset of what the new tables show).
- `src/components/resume/versions/VersionDetail.tsx` — passes `onNavigateToBuilder={() => setTab("builder")}` into `JdOptimizationReview`.

## 4. Files Deliberately Left Untouched

- `src/lib/ai/job-description/keyword-engine.ts`'s `matchEducationRequirements()` and `findRelatedCertification()` — both still used directly by other call sites (`ats-engine.ts`'s `scoreEducation`, and the new classifiers themselves) and already correct; not rewritten.
- `src/lib/ai/job-description/resume-optimizer.ts` (the v2/duplicate optimizer) — see §11.
- `src/lib/ai/resume-versions/dynamic/optimization-review.ts`'s `applyOneProposal()` `autoApplicable` guard — unchanged from Milestone 16; still the enforcement point.

## 5. Education Matching Behavior

`classifyEducationRequirements(resumeDegrees, jdRequirements)` classifies each JD education requirement independently into one of:

- **`matched`** — an exact (word-aligned) textual match exists in the resume's degree list (via the same `tokensMatch()` used for skills — literal, not naive substring).
- **`equivalent_or_higher`** — no literal match, but `isEquivalentOrHigherDegree()` finds a resume degree at the same level or higher with overlapping field words (e.g. resume "M.Tech Computer Science" vs. JD "Bachelor's in Computer Science").
- **`missing`** — neither of the above.

Note: because "B.Tech" and "Bachelor's", or "MSc" and "Master's", are different literal words, a same-level abbreviated degree classifies as `equivalent_or_higher`, not `matched` — `matched` is reserved for genuinely identical text. This was confirmed by running the tests (an initial test draft assumed `matched` and had to be corrected once the actual classification was observed).

`jd-matcher.ts`'s `matchEducation()` now folds `matched` + `equivalent_or_higher` into `EducationMatch.matched` (preserving the pre-Milestone-17 external contract, which never distinguished the two).

## 6. Certification Matching Behavior

`classifyCertificationRequirements(resumeCertNames, jdRequirements)` classifies each JD certification requirement into:

- **`matched`** — exact word-aligned text match.
- **`related`** — `findRelatedCertification()` finds a same-vendor-prefix resume certification that isn't an exact match (e.g. resume "Microsoft Certified: Azure Administrator Associate" vs. JD "Microsoft Certified: Azure Solutions Architect Expert"). This function's pre-existing `jdFirstWord.length > 3` threshold is preserved as-is — short vendor prefixes (AWS, GCP, CKA, CKAD) never trigger `related`, which is intentional (a 3-character prefix match is too weak a signal to surface as "you might already have this"), not a bug. Verified directly: an "AWS Certified Developer" vs. "AWS Certified Solutions Architect" pair does **not** classify as `related`, while a 9+ character vendor prefix does.
- **`missing`** — neither of the above.

## 7. Proposal Behavior (unchanged safety model, reused classifiers)

`buildEducationAndCertificationProposals()` still produces exactly the same two kinds of proposal it produced after Milestone 16 (`educationGap`, `certificationGap`), still `autoApplicable: false` for both, still never invents an institution/degree/date/issuer/credential ID. The only change is that its "which requirements are gaps" decision now comes from the shared classifiers (`status !== "missing"` for education, `status === "missing" || status === "related"` for certifications) instead of a second, separately-maintained computation — this is a logic-preserving refactor, not a behavior change (confirmed: all 27 pre-existing `optimization-review.test.ts` tests pass unchanged).

## 8. UI Changes

`JdOptimizationReview.tsx` gained two new always-visible sections (rendered whenever the JD had any education/certification requirements, independent of whether any auto-applicable proposals exist): **Education Match** and **Certification Match**. Each row shows:

- **JD Requirement** — the requirement text as extracted from the job description.
- **Resume Evidence** — the matching/related resume entry, or "Not found".
- **Status** — Matched / Equivalent / Higher / Related — not exact / Missing / Not Present, color-coded.
- **Action** — "View / Edit" for anything with resume evidence, "Add Education" / "Add Certification" for anything missing. Both call the new `onNavigateToBuilder` callback.

`onNavigateToBuilder` is wired from `VersionDetail.tsx` to switch its existing `tab` state to `"builder"`, which renders the **existing** `ResumeBuilder`/`SectionEditor` component — the one that already has "+ Add {label}" entry-creation buttons for EDUCATION and CERTIFICATIONS. No new editor, no new form, no pre-filled fabricated values: the JD requirement text is shown as read-only context in the table, never written into any input field.

The old gap-only "Action Needed" cards (Milestone 16) are removed: everything they showed (the `missing`-status items with their explanatory `reason` text) is now shown in the new tables too — the per-item `reason` text is carried over via a lookup keyed on the shared `matchedRequirement`/`requirement` string, so no explanatory copy was lost, and the tables additionally show `matched`/`equivalent`/`related` items that the old cards never displayed.

## 9. API Changes

Both `/api/ai/resume/versions/[id]/jd-optimize/propose` and `/apply` keep their existing request/response contracts; `/propose`'s response gained two **additive** fields only: `educationMatches: EducationRequirementMatch[]` and `certificationMatches: CertificationRequirementMatch[]`. No new routes. No request-schema changes.

**Known design trade-off**: the route computes `classifyEducationRequirements`/`classifyCertificationRequirements` once directly (for the new response fields) and `buildEducationAndCertificationProposals()` computes them again internally (for the proposals). Both calls are pure, synchronous, and cheap (no AI call, no I/O) — duplicating the call was judged preferable to changing `buildEducationAndCertificationProposals()`'s signature and its 11 existing tests for a negligible performance difference.

## 10. Tests Added

- `keyword-engine.test.ts`: 21 new tests across `classifyEducationRequirements`, `classifyCertificationRequirements`, and additional `findRelatedCertification` scenarios (short-vendor-prefix non-match, long-vendor-prefix match, exact-match precedence over related).
- `jd-matcher.test.ts`: 5 new tests directly exercising `computeJdMatch().educationMatch` post-consolidation (equivalent-or-higher promotion, true gap, exact cert match, related cert placement in `betterAlternatives` only, short-vendor-prefix non-match).
- No new component-level (`.test.tsx`) tests were added — this codebase has no existing React component test infrastructure (confirmed: zero `.test.tsx` files anywhere under `src/`), so the UI change was verified via `tsc`, `eslint`, and live `curl` checks against a running server instead, consistent with how Milestones 14–16 verified their own UI work.

## 11. Full Test Result

```
Test Files  26 passed (26)
     Tests  298 passed (298)
```

(Baseline before this milestone's test additions was 272; the 26 added here are the ones listed in §10.)

## 12. Lint Result

`npm run lint` — 0 errors, 1 pre-existing warning (`@next/next/no-img-element` in `src/app/(site)/blog/[slug]/page.tsx`, unrelated to this milestone, not introduced by it).

## 13. TypeScript Result

`npx tsc --noEmit` — clean, no errors.

## 14. Build Result

`npm run build` — succeeded, all routes compiled including `/resume-analyzer/versions/[id]` and both `jd-optimize` API routes.

## 15. Live Testing Result

Interactive browser/login testing remains blocked by the pre-existing Supabase schema-cache issue (`PGRST205` on `password_history`/`auth_sessions`/`security_events`), first identified in Milestone 14 and reconfirmed present at the start of this milestone — unrelated to any table this session touches (zero schema changes in Milestones 15–17). Verified instead via a fresh `next start` production server:

- `GET /resume-analyzer/versions/test-id` → `200` (page renders; client-side data fetch handles the unauthenticated/not-found case itself)
- `POST /api/ai/resume/versions/test-id/jd-optimize/propose` → `401 {"error":"You must be signed in to manage resume versions."}`
- `POST /api/ai/resume/versions/test-id/jd-optimize/apply` → `401 {"error":"You must be signed in to manage resume versions."}`

All three confirm the routes are wired correctly and fail closed (clean JSON error, no stack trace) rather than crashing, which is what's checkable without a working login session.

## 16. Security Considerations

- No new fabrication surface: the new UI tables display JD requirement text as read-only; the "Add" actions never pre-populate the Resume Builder's form fields.
- The `autoApplicable: false` server-side guard in `applyOneProposal()` (Milestone 16) is untouched and still the actual enforcement point — the UI change is presentation-only and cannot itself cause a gap proposal to be applied.
- No new routes, no new request-body fields accepted by any route — only response fields were added, so there is no new client-controlled input to validate.
- No secrets, `.env` changes, or new database access were introduced.

## 17. Known Limitations

- The Supabase schema-cache issue (§15) continues to block end-to-end interactive verification of the full logged-in flow; this is an environment issue predating and unrelated to this milestone.
- `findRelatedCertification()`'s `> 3` character vendor-prefix threshold is a heuristic, not a curated taxonomy — it will still miss some genuinely related certifications with short names and could in principle over-match on a coincidentally-shared long first word. This is documented pre-existing behavior (Milestone 15/16), not something this milestone changed.
- `classifyEducationRequirements`/`classifyCertificationRequirements` are computed twice per `/propose` request (§9) — an accepted, cheap trade-off, not a correctness issue.

## 18. Recommended Next Milestone

The Milestone 16 report's §20 "remaining optimizer duplication" (`job-description/optimizer.ts` vs. `job-description/resume-optimizer.ts`) is still unresolved and was reviewed again in this milestone: consolidating it remains out of scope for a targeted, low-risk change, since `resume-optimizer.ts` backs a still-live, differently-scoped read-only diff UI (`ResumeOptimizerPanel.tsx` / `/api/ai/resume/jd-match/[jdMatchId]/optimize`) with its own output shape. A dedicated milestone to either retire that older ephemeral flow in favor of the Resume Versions optimization-review flow, or to formally document it as a permanently-separate v2 API, would let that duplication be resolved deliberately rather than accumulating further.
