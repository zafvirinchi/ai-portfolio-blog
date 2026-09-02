# Phase 25 — Milestone 4: Resume Builder Final Closure & Regression Sweep

## 1. Executive Summary

Final closure audit of the Resume Template/Builder feature (Phase 25 M1-M3). One genuine, narrowly-scoped defect was found and fixed: `RecruiterReportsTab.tsx`'s "Download Candidate Report" button was the **one remaining live instance** of the `<a href>`-to-API-route bug class this repo has now fixed across four consecutive milestones — Milestone 3 had explicitly investigated this exact link and left it unfixed, reasoning its target route "has no entitlement gate to intercept," which was true but incomplete: the route independently returns real JSON on 401 (unauthenticated) and 404 (IDOR-protected, candidate belongs to another recruiter), which is the identical browser-navigates-to-raw-JSON failure mode regardless of whether a 402 is also possible. Fixed using the exact same, already-proven `downloadExport()` pattern this same file's other 8 buttons already use. Every other area audited (IDOR, entitlement matrix, AI Improve, template registry/ID consistency, document integrity, persistence, renderers, mobile/accessibility) was independently re-verified from current source and found genuinely sound — no new defect, no regression from M1-M3's work.

## 2. Final Journey Verification

Re-traced end-to-end: Resume Analyzer → Save to Versions → Create/Open Version → Overview/Builder tabs → Template Gallery → edit/AI Improve → export. No broken transition, dead end, or missing state found. All loading/error/empty/needs-login states remain intact and unchanged since M3.

## 3. Complete Export/Download Inventory (Part 1 — exhaustive, whole-repository)

| Source | UI Action | API Route | Mechanism | Status |
|---|---|---|---|---|
| `VersionDetail.tsx` (4 buttons) | Download PDF/DOCX | `versions/[id]/export` | `downloadExport()` | Correct (M3) |
| `DownloadMenu.tsx` | Download PDF/DOCX/MD/TXT | `versions/[id]/export` | `downloadExport()` | Correct (M2) |
| `ResumeOptimizerPanel.tsx` | Download optimized resume | `jd-match/[id]/optimize/export` | `downloadExport()` | Correct (M3) |
| `JdResumeOptimization.tsx` | Download optimized resume | `jd-match/[id]/export` | `downloadExport()` | Correct (M3) |
| `resume-rewriter/page.tsx` | Download rewrite | `resume-rewriter/[id]/export` | `downloadExport()` | Correct (M3) |
| `RecruiterCandidateTable.tsx`, `RecruiterComparisonTab.tsx` | Candidate exports | `recruiter/**` | `downloadExport()` | Already correct |
| `RecruiterReportsTab.tsx` (CSV/Excel/hiring-report, 5 buttons) | Screening/hiring exports | `recruiter/export` | `downloadExport()` | Already correct |
| **`RecruiterReportsTab.tsx` (PDF candidate report)** | **Download Candidate Report** | **`recruiter/candidates/[id]/export`** | **was raw `<a href>`** | **Fixed this milestone** |

`window.location.href`/`.assign()` repo-wide: zero instances target `/api/**` — every match is a trusted post-success Stripe/internal redirect, not this bug class. No `<form>`/`<iframe>` download tricks found. No mobile-only duplicate download markup found in any of `DownloadMenu.tsx`/`VersionDetail.tsx`/the recruiter components. Every non-resume `<a href>` instance found by the sweep (mock-interview report, linkedin-optimizer, interview-preparation, cover-letter, billing/usage, billing/invoices, settings/profile, admin/analytics — 8 total) remains **explicitly out of scope** and unmodified.

## 4. Template Inventory (re-enumerated, mechanically confirmed)

All 8 templates (Modern, Executive, Classic, Minimal, Technical, GCC, Graduate, Academic) confirmed present in `TEMPLATE_REGISTRY` with complete metadata (category, experienceLevels, industries, atsFriendliness, isOnePage), each mapped 1:1 to `TEMPLATE_IDS` (no orphan on either side — mechanically enforced by an existing, still-passing test). No hardcoded template list exists anywhere else in the repository (repo-wide grep for every template id string turned up only the templates ecosystem itself and unrelated same-word false positives in the mock-interview/interview-prep domains). No hidden 9th template.

## 5. Template ID Consistency

Single source of truth confirmed: `TEMPLATE_IDS` (`template-schema.ts`). No shadow list, no case mismatch, no legacy ID. `DEFAULT_TEMPLATE_SETTINGS` defaults to `"modern"` consistently everywhere a version has never had its template explicitly set — no silent fallback to `"minimal"` or any other id found anywhere in application code (the one `"minimal"` match outside the registry itself is a test explicitly setting that value, not a fallback).

## 6. Document Integrity

Re-confirmed `saveDynamicDocument()`'s exact current implementation: ownership check → full `dynamicResumeDocumentSchema.parse()` (cannot silently drop a required field, including headline) → derives `resume_data` via the already-audited `fromDynamicResumeDocument()` → one ownership-filtered `.update()` writing both representations atomically. Template selection (`saveTemplateSettings()`) touches only the `template_settings` column — never `sections_data`/`resume_data`. No new field-loss path found.

## 7. Resume Persistence

Traced create → load → edit → save → reload → switch template → save → reload → export. Every save is a full-document write of current client state (standard last-write-wins) — appropriate and sufficient for a single-owner-editing scenario; introducing optimistic-concurrency machinery would be speculative over-engineering for a workflow that structurally has no concurrent-writer scenario (ownership is always exactly one user). A failed save throws a real error (`if (error) throw new Error(...)`) rather than silently appearing successful, and the client surfaces it. **No defect.**

## 8. AI Improve Verification

Re-verified the full contract from current source: ownership → `requireFeature("resume.rewrite")` → `requireQuota("AI_REWRITES")` → LLM call, in that order; `recordUsage` fires exactly once per successful request across all 3 dispatch branches; the real fabrication guard is unchanged; `UpgradePrompt` wiring (M2 fix) confirmed still intact in both `AiImproveButton.tsx`/`AiImproveSkillsButton.tsx`. Searched for alternate entry points: `generateBulletVariants`/`generateSummaryVariants`/`generateSkillsRewrite`/`generateAndValidateVariants` are called only from their own definitions, the pre-existing ephemeral `rewrite-service.ts` flow (independently gated at its own session-start), and the `ai-improve` route — no second/bypass caller exists anywhere in the codebase. **No defect, no AI policy changed.**

## 9. Entitlement Matrix (resume-builder scope only)

| Feature | Route | requireFeature | requireQuota | recordUsage | Client UX |
|---|---|---|---|---|---|
| Resume builder/templates/versions/export | `versions/**` CRUD/template/export | — | — | — | n/a — UNLIMITED on Free/Pro/Premium (live-confirmed) |
| JD-optimized version | `versions` POST, `[id]/optimize`, `jd-optimize/propose` | — | `JD_MATCHES` | yes | `UpgradePrompt` |
| AI Improve | `[id]/ai-improve` | `resume.rewrite` | `AI_REWRITES` | yes, once | `UpgradePrompt` |
| Resume Optimizer | `jd-match/[id]/optimize` | `resume.optimize` | — | n/a | established pattern |

Re-read `platform-plan-registry.ts` directly (not cited from a prior report): confirmed byte-identical to M3's matrix — `resume.rewrite` is NONE (Free) → 30/month (Pro) → UNLIMITED (Premium), `resume.builder`/`templates`/`versions`/`export` UNLIMITED on every tier. Exports are intentionally free — confirmed policy, not a gap. **No quota invented, no policy changed.**

## 10. IDOR / Authentication Final Check

Every `ResumeVersionService` method (previously verified in M2/M3, spot-re-confirmed this milestone by re-reading `saveDynamicDocument`/`saveTemplateSettings` directly) takes `userId` and enforces ownership via `.eq("user_id", userId)` or a prior `getVersion(userId, versionId)` gate — no exception. `requireUserId()` resolves strictly from the server-verified Supabase session, never from client-supplied input. The one route touched this milestone (`recruiter/candidates/[candidateId]/export`) was independently re-read: `requireRecruiterId()` + `candidateService.exportCandidateReportPdf(candidateId, recruiterId)` — ownership-filtered, 404 (not 403) on another recruiter's candidate. **IDOR confirmed safe**, now independently reproduced across three separate audit passes (M1's build, M2's fork, M3's fork, this milestone's direct re-read).

## 11. Renderer Verification

PDF/DOCX/Markdown/TXT confirmed unchanged since M2/M3 — all still share `prepareForRender()`, the DOCX `HeadingLevel.HEADING_1` fix is intact, and the PDF-Unicode warning is confirmed present in **both** `DownloadMenu.tsx` (Builder) and `VersionDetail.tsx` (Overview) — no regression, no drift.

## 12. Mobile/Accessibility Verification

Spot-checked the one file changed this milestone: the new `RecruiterReportsTab.tsx` button carries an explicit `aria-label` and a disabled/loading state, matching every sibling button in the same file. No mobile-specific regression possible — no layout/CSS was touched, only an `<a>`→`<button>` swap reusing the file's own existing responsive `flex flex-wrap` container.

## 13. Regression-Pattern Search (Part 12)

Checked every `fetch(...)` call site across `src/components/resume/**` (18 total) for a missing `!response.ok` guard: **none found** — all correctly gate before treating a body as success. Exactly one `.blob()` call exists anywhere in `src/` (inside `export-download.ts` itself, correctly guarded). No resume-related component renders a raw error body without going through `readEntitlementError()`/an explicit error state. The one exception found (`RecruiterReportsTab.tsx`'s PDF link) is exactly the finding fixed in this milestone.

## 14. Findings

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | `RecruiterReportsTab.tsx`: "Download Candidate Report" still a raw `<a href>`; M3's own reasoning for leaving it was incomplete (considered only the 402 case, missed 401/404) | **P2** | **Fixed** |
| 2 | 8 non-resume `<a href>` instances (settings, billing, admin, interview-prep, cover-letter, linkedin-optimizer, mock-interview) | P2, out of scope | Not modified |
| 3 | `defaultAccent`/`defaultFont` not auto-applied on template selection (M3 finding) | BUSINESS DECISION | Unchanged, still open |
| 4 | Classic/GCC structural duplication (M2 finding) | P2, deferred | Unchanged, still open |

## 15. Fixes

`RecruiterReportsTab.tsx` — "Download Candidate Report" converted from `<a href>` to the same `handleExport()`/`downloadExport()` pattern already used by every other button in the same component (no new pattern, no new dependency, no new architecture). Module doc comment corrected to reflect the actual, re-verified reasoning.

## 16. Deferred Items

Items 2-4 from Section 14, unchanged from prior milestones — none within this milestone's stated scope or safely fixable without a product/architecture decision.

## 17. Business/Design Decisions Required

Should selecting a template in the gallery auto-apply that template's `defaultAccent`/`defaultFont` (Section 14 #3)? Unresolved, requires explicit product sign-off — not decided or implemented here.

## 18. Validation Results

```
BASELINE TESTS: 1292
FINAL TESTS:    1292
NEW TESTS:      0   (pure UI-wiring fix reusing an already-tested helper — no
                     new pure logic introduced; same no-component-test-framework
                     rationale already established and applied consistently in
                     M2/M3 for this identical class of fix)
FAILURES:       0

TSC:        PASS
LINT:       PASS (0 errors; 2 pre-existing, unrelated <img> warnings)
BUILD:      PASS
VERIFY.SH:  PASS WITH WARNINGS (zero findings in the one file this milestone touched; all listed warnings pre-existing/untouched)
```

**Live validation**: dev server confirmed healthy (a transient Turbopack dev-mode cache panic occurred mid-session on `globals.css` compilation — confirmed environment/tooling noise, not a code regression, since the production build had already succeeded cleanly moments before and a `.next` cache clear resolved it immediately). Post-recovery: home/`recruiter`/`resume-analyzer` page shells all 200/307 as expected; `GET /api/ai/resume/versions`, `POST .../ai-improve`, `PATCH .../template` (with an invalid template id), `GET .../export`, and the newly-fixed `GET /api/ai/recruiter/candidates/[id]/export` all correctly return structured JSON 401s unauthenticated; `resume-rewriter/[id]/export` for a nonexistent id correctly returns a clean 404 JSON. No raw JSON browser navigation observed anywhere. No authenticated E2E was fabricated — no test credentials were available.

## 19. Remaining Risks

1. Full authenticated E2E remains unverified (standing limitation across M2-M4, no test credentials available in this environment).
2. The 8 out-of-scope `<a href>` instances (Section 14 #2) remain live outside the resume journey.
3. Two open business/product decisions (Sections 14 #3, #4) remain undecided — neither is a defect, both require a human product call.

## 20. Final Closure Recommendation

**One genuine P2 defect was found and fixed within this closure pass, fully validated, with no remaining open engineering work on the Resume Template/Builder feature itself.** Per the milestone's own final decision rule, this does not warrant a Milestone 5 — the defect was small, was fixed minimally, and validation is complete and green.

**Final classification: E — NO FURTHER ENGINEERING WORK REQUIRED** for the Resume Template/Builder feature, conditioned on the two documented, non-blocking business/design decisions (Section 17) being addressed by product/business stakeholders whenever they choose to, not as required engineering follow-up.

---

### Exact files modified
- `src/components/recruiter/RecruiterReportsTab.tsx`

### Exact files created
- None.

### Exact files deleted
- None.

Nothing was committed.
