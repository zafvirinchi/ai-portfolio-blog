# Phase 25 — Milestone 3: Resume Builder End-to-End UX, Template Selection & Export Audit

## 1. Executive Summary

A full, independently-re-verified (not trusted from prior milestone reports) end-to-end audit of the Resume Analyzer → Resume Versions → Template Gallery → Builder → AI Improve → Export journey. **This was not a clean-audit outcome.** The most significant finding: Milestone 2's own "exhaustive" fix for the `<a href>`-to-API-route bug class was *not actually exhaustive* — it fixed only the Builder tab's `DownloadMenu.tsx`, missing **6 more live instances** of the identical bug class in the Overview tab (`VersionDetail.tsx`, the page's *default* tab) and in two adjacent, journey-reachable subsystems (`ResumeOptimizerPanel.tsx`, `JdResumeOptimization.tsx`, `resume-rewriter/page.tsx`). All are now fixed. The Milestone 2 PDF-Unicode warning was also found incomplete (present in the Builder tab, missing from the Overview tab) and is now fixed. IDOR, entitlement enforcement, and the AI Improve flow were independently re-audited from source and found genuinely sound — no defect there.

## 2. Complete Journey Map (traced from actual code, not filenames)

```
Resume Analyzer (/resume-analyzer, anonymous-capable)
  -> "Save to My Versions" -> /resume-analyzer/versions?resumeId=X
       -> VersionsList.tsx: 401 -> "Sign in" state | empty state | create-Master form
       -> POST /api/ai/resume/versions (creates Master or a tailored clone)
  -> "Open" -> /resume-analyzer/versions/[id] -> VersionDetail.tsx
       -> defaults to "Overview" tab (ATS score, quality gate, PDF/DOCX export)
       -> "Resume Builder" tab -> ResumeBuilder.tsx
            -> Sections tab (edit content, AI Improve per field)
            -> Template tab (TemplateGallery.tsx, 8 templates, filters)
            -> Design tab (ThemeControls.tsx, accent/font/spacing, Reset Design)
            -> DownloadMenu.tsx (PDF/DOCX/MD/TXT)
  -> JdOptimizationReview (propose/apply, both tabs) -> "Restore as Master" / "Compare with Master"
```

No broken transitions, dead ends, or missing states were found in this core path. Every loading/error/empty/needs-login state is handled (traced directly in `VersionsList.tsx`/`VersionDetail.tsx`).

## 3. Template Inventory (8/8, re-verified from current source)

| Template | layout | headerAlign | sectionHeadingStyle | category | ATS |
|---|---|---|---|---|---|
| modern | single-column | left | accent-left-border | MODERN | high |
| executive | single-column | center | centered-divider | EXECUTIVE | high |
| classic | single-column | left | underline | ATS_CLASSIC | high |
| minimal | single-column | left | plain-caps | PROFESSIONAL | high |
| technical | sidebar | left | accent-left-border | TECH | medium |
| gcc | single-column | left | underline | GCC_PROFESSIONAL | high |
| graduate | single-column | center | plain-caps | GRADUATE | high |
| academic | single-column | center | underline | ACADEMIC | high |

## 4. Template Selection Audit (Part 2)

All 12 checklist items verified true: every template appears, has valid metadata, is selectable, persists (single ownership-filtered `.update()` on `template_settings` only), survives refresh, is retained by existing resumes, a new resume gets `DEFAULT_TEMPLATE_SETTINGS` (`templateId: "modern"`, deterministic), switching never touches `sections_data`/`resume_data`, cannot corrupt the document, and preview/export/all renderers consume the identical `document`+`templateSettings` state. **Metadata usefulness**: `category`/`atsFriendliness`/`isOnePage` are genuinely functional (drive real gallery filters). `experienceLevels`/`industries` are populated accurately on every template but are **not** consumed by any UI filter — confirmed decorative today. **Classification: INTENTIONAL / NOT A DEFECT** — this mirrors Milestone 1's own explicit, documented reasoning for `industries` ("category already distinguishes GCC/Tech/Academic — a separate control would duplicate it"), and the same reasoning extends validly to `experienceLevels` given this catalog's category-correlated experience levels (GRADUATE≈entry, EXECUTIVE≈senior). Not fixed; noted as a low-priority product-decision candidate (Part 16: P3).

## 5. Template Visual Differentiation (Part 3)

Re-verified Milestone 2's Graduate/Minimal fix is intact and correct (`graduate.headerAlign` is now `"center"`, giving it a unique structural triple). No new structural duplicate found among the 8. Classic/GCC's pre-existing duplication (documented and deliberately deferred in Milestone 2) remains unchanged — **not reopened**, per this milestone's explicit "do not modify unrelated pre-existing work" and its own prior classification as a deferred, out-of-named-scope item.

## 6. Template → Style Application (Part 4)

Re-verified directly against renderer source (not assumption): `layout`, `headerAlign`, `sectionHeadingStyle` (from `TemplateDefinition`) and `accentColor`, `fontFamily`, `fontSize`, `spacing`, `atsMode`→layout-collapse, `margin`, `pageSize` (from `TemplateSettings`) are **all genuinely read and applied** by every renderer via `resolveTemplateStyles()` — confirmed by direct inspection of `dynamic-resume-pdf.ts`, `dynamic-resume-docx.ts`, and `ResumePreview.tsx`, not decorative. The one gap: `TemplateDefinition.defaultAccent`/`defaultFont` are **not** auto-applied when a template is selected — they exist solely as the target of `ThemeControls.tsx`'s manual "Reset Design" button, a documented, deliberate Phase 15 Milestone 5 design (own doc comment confirms this was intentional, not an oversight). **Classification: BUSINESS DECISION** (should selecting a template auto-apply its colors, and if so, on every switch or only first selection?) — not implemented here, per this milestone's explicit "do NOT automatically implement style application without proving the product contract requires it."

## 7. Content Preservation Audit (Part 5)

Every field (headline, summary, experience, education, skills, projects, certifications, achievements, contact/links, custom sections, ordering, dates, descriptions, bullets) was traced editor → API (Zod-validated) → service (`saveDynamicDocument`'s full-document `.parse()`, which cannot silently drop a required field) → persistence (`sections_data` jsonb, exact round-trip) → all 5 renderers, which all share one `prepareForRender()` pipeline and cannot diverge. Empty/optional sections are correctly dropped entirely, consistently, everywhere. **No defect found.** Unicode/CJK/Arabic/Cyrillic survive the data model and every format *except* PDF glyph rendering (a font-coverage limitation, not a data-loss defect — see Part 8).

## 8. Editor UX Audit (Part 6)

Traced `VersionsList.tsx`/`VersionDetail.tsx`/`ResumeBuilder.tsx` end-to-end: every async action has a loading/disabled state; destructive actions (`handleDelete`) require `window.confirm()`; non-destructive ones (`handleDuplicate`) correctly don't; every fetch failure surfaces a message, never a blank screen; 401 is handled with a dedicated "Sign in" state, not a generic error. Section/entry editors commit on blur or discrete click (not per-keystroke). **No genuine defect found** in this pass.

## 9. AI Improve Audit (Part 7) — all 15 items independently re-verified from current source

Ownership → entitlement (`resume.rewrite` feature, `AI_REWRITES` quota) → LLM call ordering confirmed correct by direct route re-read. Zero LLM calls on rejection (existing test + live probe). Original text never mutated pre-Accept; Reject/close discards cleanly; a failed AI call leaves content untouched. The real, unmocked fabrication guard is unchanged. `recordUsage` fires exactly once per successful request across all 3 dispatch branches, with no shared fallthrough that could double-fire. A user re-clicking "Improve with AI" after one completed suggestion is correctly charged again — a second AI operation, not a retry of the same one. The generic quota check-then-act race that theoretically affects *every* `requireQuota`-gated route in this codebase is not specific to AI Improve and is out of this milestone's scope (would require changing the shared entitlement-service architecture — explicitly disallowed). No separate recruiter code path exists for this feature (the chat-tool dispatcher has zero resume-version references) — a recruiter can only reach it the same way any user does, on their own resume version. **No genuine defect found**, beyond the client-side `UpgradePrompt` wiring already fixed in Milestone 2 (re-confirmed still intact).

## 10. Export Audit (Part 8)

All 4 renderers (PDF/DOCX/Markdown/TXT) confirmed to share one content pipeline; ordering/dates/long-text/empty-sections cannot diverge between them. **Genuine defect found and fixed**: the Milestone 2 PDF-Unicode warning (`containsPdfUnsafeCharacters()`) was wired into the Builder tab's `DownloadMenu.tsx` but not into the Overview tab's independent export buttons in `VersionDetail.tsx` — **incomplete**, not sufficient, not misleading. Now wired into both. The underlying pdfkit font-coverage limitation itself remains unchanged (embedding real Unicode fonts is a genuine engineering project, correctly out of proportion for this milestone, per its own "do not replace the PDF renderer unless absolutely necessary" instruction) — the warning is the appropriate, minimal mitigation, now applied everywhere a PDF can be triggered from.

## 11. Download-Link Audit (Part 9) — exhaustive, not a sample

Grepped the entire `src/` tree for every `<a href>` targeting `/api/**`. Within the resume-builder journey's actual scope, found and fixed:

| File | Instances | Target route | Status |
|---|---|---|---|
| `VersionDetail.tsx` | 4 (2 header + 2 Quality Gate) | `/api/ai/resume/versions/[id]/export` | **Fixed** |
| `ResumeOptimizerPanel.tsx` | 3 (md/pdf/docx) | `/api/ai/resume/jd-match/[id]/optimize/export` | **Fixed** |
| `JdResumeOptimization.tsx` | 3 (md/pdf/docx) | `/api/ai/resume/jd-match/[id]/export` | **Fixed** |
| `resume-rewriter/page.tsx` | 4 (md/pdf/docx/html) | `/api/ai/resume-rewriter/[id]/export` | **Fixed** |
| `DownloadMenu.tsx` | 4 (already fixed in Milestone 2) | `/api/ai/resume/versions/[id]/export` | Already correct |

All converted to the existing `downloadExport()` fetch+blob helper — no new pattern invented, no new dependency. `window.location.href`/`.assign()` was also grepped repo-wide: zero instances target any `/api/` path (the matches found are legitimate Stripe-checkout/same-app redirects, unrelated). Findings outside the resume journey (settings/billing/admin/interview-prep/cover-letter/linkedin-optimizer/recruiter export links) were identified by the exhaustive sweep but are **explicitly out of this milestone's stated scope** ("Resume Builder / Resume Versions / Template Gallery journey") and were **not modified**, per "do not modify unrelated pre-existing work" — flagged below as a recommended follow-up.

## 12. Authentication/IDOR Audit (Part 10)

Every exported `ResumeVersionService` method re-read line-by-line (not just the 3-4 previously audited): every one takes `userId` and filters by it, either directly (`.eq("user_id", userId)`) or via a prior `getVersion(userId, versionId)` gate; every mismatch produces `ResumeVersionNotFoundError` → 404 (never 403, never a different error revealing existence). **No exception found — IDOR confirmed safe**, not merely re-asserted. The chat-tool dispatcher (`resume.tool.ts`) exposes zero resume-version capability — no cross-persona bypass surface exists. Every Resume Versions route requires a real session unconditionally (no anonymous path, correctly distinct from the ephemeral analyzer/rewriter/jd-match subsystem's deliberate anonymous capability). No admin/bulk resume-version route exists anywhere.

## 13. Entitlement Matrix (Part 11)

Built fresh from current `platform-schema.ts`/`platform-plan-registry.ts`/route source (not cited from a prior report):

| Feature | Route(s) | requireFeature | requireQuota | recordUsage | Client UX |
|---|---|---|---|---|---|
| Resume Versions CRUD/builder/template/export | `versions/**` (document/sections/template/export/duplicate/restore) | — | — | — | n/a (UNLIMITED every tier — confirmed live) |
| JD-optimized version creation | `versions` POST, `[id]/optimize`, `[id]/jd-optimize/propose` | — | `JD_MATCHES` | yes | `JdOptimizationReview.tsx` uses `UpgradePrompt` |
| AI Improve | `[id]/ai-improve` | `resume.rewrite` | `AI_REWRITES` | yes, exactly once | `AiImproveButton`/`AiImproveSkillsButton` use `UpgradePrompt` (M2 fix, confirmed intact) |
| Resume Analyzer upload | `/api/ai/resume` | — | `ATS_CHECKS` (authenticated only) | yes | established pattern |
| JD Resume Optimizer | `jd-match/[id]/optimize` | `resume.optimize` | — | n/a | established pattern |

`resume.export` confirmed **UNLIMITED on every tier**, live-read from source — this is intentional, already-decided policy, not a gap; every export/template/CRUD route being correspondingly ungated is the *correct* implementation of that policy, not a defect. **No commercial policy was changed.**

## 14. Mobile/Accessibility Audit (Part 12)

Spot-checked (not redesigned): existing responsive grid classes (`grid-cols-1 sm:grid-cols-2 xl:grid-cols-3`) remain intact in `TemplateGallery.tsx`; all new/changed buttons in this milestone's fixes carry explicit `aria-label`s (matching the established convention); `UpgradePrompt` retains its existing `role="status" aria-live="polite"` semantics everywhere it's now used. No new accessibility regression introduced by this milestone's changes. A full independent mobile/a11y pass beyond what's already established was not performed — no defect was found to justify one, and this milestone's own scope discipline ("only fix concrete defects") argues against inventing a broader review.

## 15. Findings With Severity

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | `VersionDetail.tsx`: 4 `<a href>` instances to the export route (Overview tab, default tab) | **P1** — same bug class already fixed twice before, in the most-used location | **Fixed** |
| 2 | `ResumeOptimizerPanel.tsx`/`JdResumeOptimization.tsx`/`resume-rewriter/page.tsx`: 10 more `<a href>` instances | **P2** — same bug class, ephemeral/anonymous routes (no entitlement stakes, only 404/500 JSON-navigation UX) | **Fixed** |
| 3 | PDF-Unicode warning (Milestone 2) not wired into `VersionDetail.tsx`'s export buttons | **P2** — incomplete mitigation of a real, previously-found defect | **Fixed** |
| 4 | `downloadExport()` had zero dedicated tests despite being the shared fix for a 3-times-recurring bug class | **P2** (test-coverage gap) | **Fixed** (4 new tests) |
| 5 | `experienceLevels`/`industries` metadata unused as gallery filters | P3 / INTENTIONAL | Not fixed — documented, consistent with Milestone 1's own explicit reasoning |
| 6 | `defaultAccent`/`defaultFont` never auto-applied on template selection | BUSINESS DECISION | Not fixed — requires explicit product sign-off |
| 7 | Classic/GCC structural duplication (Milestone 2, deferred) | P2 / deferred | Not reopened — outside this milestone's named scope |
| 8 | Non-resume `<a href>` export links found by the exhaustive Part 9 sweep (settings, billing, admin, interview-prep, cover-letter, linkedin-optimizer, recruiter's one unfixed PDF-report link) | P2, out of scope | Not modified — "do not modify unrelated pre-existing work" |

## 16. Fixes Implemented

1. `VersionDetail.tsx` — 4 `<a href>` → `downloadExport()`-based buttons with `UpgradePrompt`/error display; PDF-Unicode warning wired in.
2. `ResumeOptimizerPanel.tsx` — 3 `<a href>` → `downloadExport()`-based buttons.
3. `JdResumeOptimization.tsx` — 3 `<a href>` → `downloadExport()`-based buttons (component converted to `"use client"`, required for the new `useState`).
4. `resume-rewriter/page.tsx` — 4 `<a href>` → `downloadExport()`-based buttons.
5. `src/lib/billing/export-download.test.ts` (new) — 4 tests covering `downloadExport()`'s entitlement-rejection, plain-error, malformed-body, and network-failure paths; registered in `vitest.config.mts`.

## 17. Deferred Findings

- Classic/GCC template structural duplication (Milestone 2 finding, unchanged).
- `experienceLevels`/`industries` filter exposure (documented, low-priority).
- The 9 non-resume `<a href>` instances the Part 9 sweep found outside this milestone's scope (settings/profile, billing/usage, billing/invoices, admin/analytics, mock-interview report, interview-preparation, cover-letter, linkedin-optimizer, and `RecruiterReportsTab.tsx`'s one remaining unfixed PDF-report link, inconsistent with its own already-fixed CSV/Excel buttons in the same file).

## 18. Business Decisions Required

- Should selecting a template in the gallery auto-apply that template's `defaultAccent`/`defaultFont`, and if so, on every switch or only the first time a version's template is set? (Section 6 / Part 4.)

## 19. Validation Results

```
BASELINE TESTS:  1288 (113 files)
FINAL TESTS:     1292 (114 files)
NEW TESTS:       4
FAILURES:        0

TSC:        PASS
LINT:       PASS (0 errors; 2 pre-existing, unrelated <img> warnings)
BUILD:      PASS
VERIFY.SH:  PASS WITH WARNINGS (zero findings in any file this milestone touched; all listed warnings pre-existing/untouched)
```

**Live validation**: dev server started clean; home/`resume-analyzer`/`resume-analyzer/versions`/`resume-analyzer/versions/[id]` page shells all return 200 (client-side auth handling, correct architecture); `GET /api/ai/resume/versions`, `GET /api/ai/resume/versions/[id]`, `POST .../ai-improve`, `GET .../export`, `PATCH .../template` all correctly return structured 401 JSON unauthenticated; the two ephemeral export routes I fixed UI wiring for (`resume-rewriter/[id]/export`, `resume/jd-match/[id]/export`) confirmed to return clean 404 JSON for a nonexistent/expired id — exactly the response my fixes now correctly intercept instead of navigating the browser to it. **No authenticated E2E was fabricated** — no test credentials were available in this environment.

## 20. Remaining Risks

1. Full authenticated E2E (real login → real version → template switch → AI improve → export) is still unverified — same standing limitation as Milestone 2, unrelated to this milestone's changes.
2. The 9 out-of-scope `<a href>` instances found by the Part 9 sweep remain live outside the resume journey.
3. The two BUSINESS DECISION / deferred product questions (Section 18, Classic/GCC) remain open.

## 21. Final Classification

**B — Minor, non-blocking.** Genuine defects were found and fixed (the download-link bug class, materially more widespread than previously believed) with minimal, targeted, regression-tested changes. No security/cost/data-loss (P0) or major functional/security (true P1-blocking) issue survives; nothing was rebuilt, redesigned, or given a new architecture/dependency. The remaining items are explicitly out-of-scope findings, a documented business decision, and a previously-deferred, low-priority template-styling nuance — none of which block this journey's correctness today.

---

### Exact files modified (Milestone 3)
- `src/components/resume/versions/VersionDetail.tsx`
- `src/components/resume/jd/ResumeOptimizerPanel.tsx`
- `src/components/resume/jd/JdResumeOptimization.tsx`
- `src/app/(site)/resume-rewriter/page.tsx`
- `vitest.config.mts`

### Exact files created (Milestone 3)
- `src/lib/billing/export-download.test.ts`

### Exact files deleted (Milestone 3)
- None.

Nothing was committed.
