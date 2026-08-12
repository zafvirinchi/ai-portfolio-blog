# Phase 15 — Milestone 10: Final Resume Quality Gate & Pre-Export Review

## 1. Objective

A final, deterministic "is this resume ready to submit" gate before export — never a second ATS engine, never a second optimizer, never a new LLM call.

## 2. Audit Findings

This is the tenth and final milestone in this sequence, and its audit benefited from everything already confirmed in Milestones 7–9: ATS scoring (`resume-score.ts`/`ats-engine.ts`), Section Completeness and Contact Quality (`ats-explainability.ts`, Milestone 7), a resume-quality/layout checker (`resume-quality.ts`, Milestone 14), closed-enum template validation (Milestone 5), and ownership-checked export routes were all already correct and complete — reused verbatim, none re-implemented.

**What was genuinely missing** was confirmed two ways: a targeted `grep` across `src/lib/ai` for date/placeholder/duplicate-detection logic (no matches in the live resume pipeline), and — more tellingly — `resume-quality.ts`'s **own doc comment from Milestone 1** explicitly flags this:

> "Deliberately does NOT check 'consistent dates' the way the milestone's own example checklist mentions — a genuine date-format/chronology validator would need real date parsing this codebase doesn't have for free-text date fields."

This milestone is what finally builds that validator — deliberately lightweight, and honest about never guessing a date it can't confidently parse (exactly what the Milestone 1 comment anticipated would be needed).

## 3. Genuine Gaps Found

1. **No date validation or overlap detection** (§7) — confirmed absent everywhere.
2. **No placeholder-text detection** (§12) — confirmed absent everywhere.
3. **No duplicate-content detection** (§11) — confirmed absent everywhere.
4. **No unified readiness classification** (§17/§20) tying ATS/JD/completeness/contact/dates/placeholders/duplication together into one "READY / NEEDS_IMPROVEMENT / NEEDS_REVIEW" gate — the individual signals existed (Milestone 7), but nothing aggregated them into a single pre-export verdict.
5. **No final panel in `VersionDetail.tsx`** presenting that verdict alongside the existing Download PDF/DOCX actions.

## 4. Files Added

- `src/lib/ai/resume-versions/dynamic/quality-gate.ts` — the core module (see §4 below for its full content breakdown).
- `src/lib/ai/resume-versions/dynamic/quality-gate.test.ts` — 25 tests.

## 5. Files Modified

- `src/lib/ai/resume-versions/dynamic/index.ts` — one line, re-exporting the new module (established barrel-file convention).
- `src/components/resume/versions/VersionDetail.tsx` — added the "Resume Readiness" panel, positioned after the existing JD Optimization flow and before nothing else — the last thing on the page, matching the spec's own pipeline diagram (Builder → ATS → JD → Safe Improvements → **Final Quality Gate** → Export).

## 6. Files Intentionally Untouched

`resume-score.ts`, `ats-engine.ts`, `keyword-engine.ts`, `jd-matcher.ts` (no scoring logic touched — every score the gate displays is read, never recomputed), `resume-quality.ts` (its `checkResumeQuality()` output is accepted as an input, not reimplemented), `ats-explainability.ts` (`computeSectionCompleteness`/`computeContactQuality` reused directly, not duplicated), `templates/template-schema.ts`/`template-styles.ts` (the closed-enum validation the gate's template check reuses), every export route (no new export endpoint — the panel's Download buttons point at the exact same `/api/ai/resume/versions/[id]/export?format=pdf|docx` URLs the page header already used).

## 7. Quality Gate Architecture

One new pure module, `quality-gate.ts`, structured as:

- **A lightweight date parser** (`parseResumeDate`) supporting the formats resumes actually use ("Jan 2022", "January 2022", "01/2022", "2022-06", "2022", "Present"/"Current"). Returns `null` — never a guess — for anything else; every date-based check below only compares two dates when *both* parsed successfully.
- **Per-check pure functions**, each returning `QualityIssue[]`: placeholder detection (a fixed, conservative pattern list — whole-value or clearly-a-placeholder-phrase matches only, never a substring that could appear in legitimate prose), duplicate-content detection (normalized exact-text comparison, a 25-character minimum length so short legitimate repeats like a skill name are never flagged), in-entry date-range validation (end before start), cross-entry date-overlap detection (EXPERIENCE only, reported as "potential," never "invalid"), skills-list duplicate detection, entry-completeness checks (an entry with none of its section-defining fields filled in), and template/export-safety checks (a defensive re-run of the *same* Zod schemas already enforced on every save).
- **One aggregator**, `buildQualityGateReport()`, that accepts an already-loaded `DynamicResumeDocument`, `TemplateSettings`, and an already-computed `ResumeQualityReport` (Milestone 14) — reusing everything, recomputing nothing scoring-related — and combines every check above plus Milestone 7's `computeSectionCompleteness`/`computeContactQuality` into one `QualityGateReport`: a readiness level, a flat issue list (each with `category`/`severity`/`title`/`description`/`sectionType`/`actionable`), severity counts, an `exportSafe` flag, and the reused completeness/contact rows.

## 8. ATS Behavior

The panel displays `freshAtsScore.overall` — the exact same value `ResumeAtsScore` already shows above it, itself computed by Milestone 7's re-run of the unmodified `resumeScorer.score()`. No second calculation.

## 9. JD Behavior

`JD Match {version.jdMatchScore}%` is shown **only** when `version.jobDescriptionText` is set (i.e., a JD analysis has actually run for this version) — otherwise omitted entirely, never fabricated, matching §3.B and §30's explicit "do not fabricate JD metrics."

## 10. Completeness

Reuses `computeSectionCompleteness()` (Milestone 7) directly. A recommended-but-absent section (e.g. missing Certifications) becomes a **medium**-severity issue — never critical or high — precisely because §3's own instruction warns against requiring every section for every resume ("a student may not need Experience... Projects may be optional"). This milestone doesn't attempt to infer *which* sections a specific candidate needs (that would require unreliable inference about who the candidate is); instead, it flags an absence as worth a look, never as a blocker.

## 11. Contact Validation

Reuses `computeContactQuality()` (Milestone 7) for the per-field rows, and adds one new aggregate classification (`Complete`/`Partial`/`Missing`) plus two issues: missing email is **high** severity (a real functional gap — "recruiters may not have a reliable way to contact you," §18's own example), missing phone is **low** (commonly expected, not essential).

## 12. Date Validation

New (§4 above). Both single-entry range validation and cross-entry overlap detection are scoped exactly as the spec asks: a reversed range within one entry is **high** (mathematically invalid, not a guess); an overlap between two different EXPERIENCE entries is **medium** and explicitly worded "Potential... this may be intentional (e.g. concurrent roles)" — never asserted as an error.

## 13. Placeholder Detection

New. A fixed `RegExp` list (Lorem ipsum, bracketed placeholders like `[Company Name]`, "TBD", "TODO", "Sample X", etc.) matched only as whole-value or clear-phrase patterns. Tested explicitly against a false-positive case ("QA Test Engineer" / "Tested and validated payment flows" must never trigger the placeholder pattern for "test").

## 14. Duplicate Detection

New. Normalized (lowercased, whitespace-collapsed) exact-text comparison across every entry field in the document, with a 25-character minimum so short, legitimately-repeated tokens (a skill name in both Skills and a Project's technologies) are never flagged, and two merely-similar-but-different bullets are correctly left alone (tested).

## 15. Template Validation / Export Safety

A defensive re-run of `dynamicResumeDocumentSchema.safeParse()` and `templateSettingsSchema.safeParse()` — the exact schemas Milestones 1 and 5 already enforce on every save. In normal operation this should never fail for a version that was ever successfully saved (tested: a normally-built document is always `exportSafe: true`); it exists for the rare legacy/corrupted-row case, and the panel's Download buttons are genuinely disabled (with an explanation) only when it does.

## 16. Readiness Classification

Three deterministic tiers, thresholds documented directly in the code (per §17's explicit "do not use arbitrary thresholds without documenting the reason"):

- **NEEDS_REVIEW** — at least one critical or high-severity issue (something a recruiter or the export pipeline would actually trip over: missing email, an invalid date range, a failed schema validation).
- **NEEDS_IMPROVEMENT** — no critical/high issue, but at least one medium issue (a missing recommended section, placeholder text, duplicated content, an empty entry).
- **READY** — only low-severity issues remain, or none at all.

## 17. Issue Severity & Structure

Every `QualityIssue` carries exactly the shape §18 asks for (`id`, `category`, `severity`, `title`, `description`, `sectionType` as the navigation target, `actionable`) — no internal implementation detail (regex patterns, weight numbers, schema error internals) is ever exposed in a title/description.

## 18. Issue Navigation

Every actionable issue renders an "Open Builder" button (`aria-label="Fix: {title}"`) that switches `VersionDetail.tsx` to its existing Builder tab — the same navigation pattern Milestones 8/9 already established for `onNavigateToBuilder`/`onOpenSection`. No new editor, no section-specific deep link (the same documented limitation as Milestone 8 — jumping to a section by *type* rather than a specific *entry* — carries forward here unchanged).

## 19. Export Integration

The panel's Download PDF/DOCX buttons are `<a href="/api/ai/resume/versions/[id]/export?format=pdf|docx">` — byte-identical URLs to the ones already in the page header (Milestone 3-era). No new export route. Per §22/§26, non-critical issues never block export — only `exportSafe === false` (the rare schema-failure case) disables the buttons, with an explicit explanation.

## 20. Security

Zero new LLM calls — every check in `quality-gate.ts` is a pure, synchronous function over already-in-memory data. No new prompt construction, no raw resume/JD text sent anywhere. Ownership is unchanged — the gate operates on the same `version` object `VersionDetail.tsx` already fetched through its existing `requireUserId()`-protected route.

## 21. Authorization

Unchanged — no new route, no new data access path.

## 22. Performance

One pass over the document per check function (all O(n) or small-n-squared for the pairwise date-overlap check, negligible at resume scale), zero database queries, zero re-parsing, zero re-scoring. `buildQualityGateReport()` accepts `qualityReport` as a parameter specifically so `VersionDetail.tsx`'s already-computed value (used by the panel above it) is reused rather than recomputed.

## 23. Accessibility

Every action has a specific `aria-label`: `"Fix: {issue title}"` per issue, `"Download resume as PDF"` / `"Download resume as DOCX"` on the export buttons (matching §33's own examples verbatim), plus `aria-disabled` on the export links when `exportSafe` is false.

## 24. Responsive Behavior

Reuses the same `flex-wrap`/card patterns already used throughout `VersionDetail.tsx` — no new layout primitive.

## 25. Tests

25 new deterministic tests in `quality-gate.test.ts`, all non-LLM: date parsing (5 formats + Present/Current + 4 unparseable-returns-null cases), readiness classification across all 3 levels with a documented cause for each, date-range validation (valid, reversed, overlapping-but-potential, non-overlapping, and the "never guess with one unparseable side" case), placeholder detection (2 true positives, 1 explicit false-positive check), duplicate detection (1 true positive, 2 false-positive checks — short legitimate repeats and genuinely-different-but-similar bullets), skills duplicate detection, entry completeness, export safety, and confirmation that `sectionCompleteness`/`contactQuality` are the exact same rows Milestone 7's functions already produce (never reimplemented).

## 26. Validation Results

| Command | Result |
|---|---|
| `npx vitest run` | **645/645 passing** (up from the Milestone 9 baseline of 620; +25 new tests, 0 regressions, 50/50 test files) |
| `npx tsc --noEmit` | Clean, 0 errors |
| `npm run lint` | 0 errors, 1 pre-existing unrelated warning (`no-img-element`) — one new error (an unescaped apostrophe in the new panel's export-disabled message) was found and fixed during this milestone's own validation pass |
| `npm run build` | `✓ Compiled successfully` |

## 27. Live Validation

Started a production server and probed the version route directly, without authentication:

- `GET /api/ai/resume/versions/[id]` (no auth) → `401`

Confirms the data source the new panel reads from remains auth-gated, unchanged.

**What was not live-tested**: an authenticated click-through (open a version, confirm the readiness badge/issue list/Open Builder navigation, trigger an optimization and confirm the gate refreshes via the existing `load()` reuse, download PDF/DOCX from the new panel). Same pre-existing Supabase auth/schema-cache limitation as every prior milestone in this phase — reported honestly rather than assumed. The underlying logic is established by the 25 new unit tests, which exercise the exact same pure `buildQualityGateReport()` function the panel calls.

## 28. Database Changes

None.

## 29. Known Limitations

- Authenticated end-to-end live testing remains blocked by the pre-existing Supabase limitation (§27).
- "Open Builder" navigates by section *type*, not a specific entry — the same documented limitation carried forward from Milestone 8.
- Completeness checking does not attempt to infer whether a specific candidate (student vs. senior, etc.) genuinely needs a given section — deliberately, since that inference isn't reliably deterministic; every missing-recommended-section issue is capped at medium severity precisely to avoid over-penalizing a resume for a legitimately-absent section (§3.C).
- Date validation only covers EXPERIENCE and EDUCATION entries (the two section types with `startDate`/`endDate` fields in the registry) — Certifications' issue/expiration dates were considered but left out of this milestone's scope, since an expired certification is a business-meaning judgment (should it still be listed?) rather than a mathematically-invalid range.

## 30. Recommended Next Milestone

Extend "Open Builder" issue navigation to scroll to the specific entry (not just the section), closing the limitation carried forward from Milestones 8–10 — likely by having the Quality Gate issue carry an `entryId` where one exists (already available on several of this milestone's own issues, e.g. `empty-entry-{id}`) and having the Builder tab accept an optional scroll target on mount.
