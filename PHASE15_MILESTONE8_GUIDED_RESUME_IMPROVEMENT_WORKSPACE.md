# Phase 15 — Milestone 8: Guided Resume Improvement Workspace

## 1. Objective

Let the user act on Milestone 7's ATS Explainability findings from one place — reusing the existing rewrite/proposal/apply/version architecture, never a second one.

## 2. Audit Findings

This milestone's audit produced the same pattern as several before it: the *acting* infrastructure this spec asks for almost entirely already existed, under `JdOptimizationReview.tsx` and its supporting `optimization-review.ts`/`jd-optimization-summary.ts` (Phase 13, Milestones 15–19) — built well before Phase 15 began, and already doing most of what a "Guided Improvement Workspace" is.

| Spec ask | What already existed |
|---|---|
| Review Before Apply (§7) | **Fully built** — `ProposalCard` shows Before/After text and Accept/Reject/Edit, applied only on explicit user action |
| Before/After (§10) | **Fully built** — same `ProposalCard`, plus a persisted `Status: Applied` result after apply |
| Projected ATS Score (§9) | **Fully built** — `JdOptimizationReview` already shows Current ATS vs. Projected ATS*, with an honest "not a guaranteed score" disclaimer, computed via `optimization-review.ts`'s `projectAtsScoreAfterProposals()` |
| Individually reviewable improvements (§11) | **Fully built** — per-proposal Accept/Reject, plus "Accept All"/"Reject All" |
| Apply All Safe Improvements (§12) | **Fully built** — every proposal in this flow is `autoApplicable` (the existing model's own "safe" bit) before it can ever reach the accept list; "Accept All" + "Apply N Selected Changes" already is a full safe-batch-apply, no new mechanism needed |
| Version Safety (§13) | **Fully built** — apply target is "new version" (default, recommended) or "current version" (non-master only); the Master Resume can only ever be reached via a new version |
| JD-aware improvements (§16) | **Fully built** — this entire component only activates once a JD is pasted |
| Priority-ranked improvement list (§2's own mockup) | **Fully built** — `JdOptimizationSummaryPanel`'s "Top Priorities" already shows Critical/High/Medium/Low-tagged items with title + reason |
| Error states (§22) | **Fully built** — `proposeError`/`applyError`, no partial apply on failure |

**Genuine gaps found:**

1. **No refresh after applying to the current version (§19).** `JdOptimizationReview` updated `resume_versions` via the API but never told its parent (`VersionDetail.tsx`) to reload — the ATS score, Resume Health, Section Completeness panels (Milestone 7) kept showing the *pre-apply* state until a manual page reload.
2. **Milestone 7's general (non-JD) issue list was a dead end.** Every issue had a label, priority, and safe/manual tag — but nothing to click. The user still had to search the resume themselves to find where "Certifications" or "Experience" needed work, exactly what this milestone's own framing says shouldn't happen.
3. **The safe/manual distinction existed functionally but wasn't labeled (§6).** Every rewrite proposal in `JdOptimizationReview` was already, by construction, wording-only (`autoApplicable`); every education/certification gap already only ever pointed to the Builder to add a new fact. The distinction was real but invisible in the UI.
4. **Generic, non-specific action labels (§26).** "Accept"/"Reject" buttons had no `aria-label` distinguishing which of several proposals on screen they belonged to.

## 3. A Deliberate Non-Decision: No Merged Single Improvement List

The spec's own mockup (§2) shows one flat list mixing a keyword gap, a summary rewrite, an experience rewrite, and a certification gap together. I considered building a single new component that normalizes Milestone 7's `DashboardIssue`s and `JdOptimizationReview`'s `ResumeChangeProposal`s into one shared shape and renders them as one list — and decided against it, for a concrete reason: a proposal needs a full Before/After text diff with Accept/Reject/Edit; a category-score issue needs a priority badge and a section link. Flattening both into one homogeneous list would either lose the proposal's Before/After fidelity or require re-implementing `JdOptimizationReview`'s entire review UI inline — a second, competing implementation of the exact thing §3/§33 forbid ("do not create a second proposal/apply architecture," "no duplicate recommendation engine"). Instead, the workspace experience is achieved the way the rest of this codebase already does it: Milestone 7's dashboard (what's wrong) sits directly above `JdOptimizationReview` (JD-aware fixes, with full review) in the same Overview tab — already true before this milestone — and Milestone 7's issues now each carry a working action (§15) instead of being inert.

## 4. Files Modified

- `src/lib/ai/resume-versions/dynamic/ats-explainability.ts` — added `deriveIssueSectionType()` (a fixed category→`SectionType` lookup) and extended `DashboardIssue` with a `sectionType: SectionType | null` field, populated by `deriveIssuesFromCategories()`.
- `src/components/resume/ResumeAtsScore.tsx` — added an optional `onOpenSection` prop; each issue with a resolved `sectionType` now renders an "Open Builder" button.
- `src/components/resume/versions/VersionDetail.tsx` — passes `onOpenSection={() => setTab("builder")}` (reusing the exact same tab-switch pattern `JdOptimizationReview`'s own `onNavigateToBuilder` already used) and `onApplied={load}` (reusing the existing version-reload function).
- `src/components/resume/versions/JdOptimizationReview.tsx` — added the `onApplied` callback (called only for a same-version apply, never a new-version one); added a "Safe to Apply" badge to every rewrite proposal card and a "Requires Your Confirmation" badge to every gap action row; added specific `aria-label`s to Accept/Reject/Edit buttons and to gap-row action buttons.
- `src/lib/ai/resume-versions/dynamic/ats-explainability.test.ts` — 3 new tests for `deriveIssueSectionType`.

## 5. Files Intentionally Untouched

`optimization-review.ts` (the proposal model and `projectAtsScoreAfterProposals()` — already correct, reused as-is), `jd-optimization-summary.ts` (the priority-ranking engine — already correct), `resume-version-service.ts`'s `applyOptimizationProposals`/`applyJdOptimization` (version-safety logic — already correct), `resume-rewriter/*` (the standalone rewrite engine used by the ephemeral analyzer flow — a separate, working entry point this milestone didn't need to touch), the JD-optimize `propose`/`apply` API routes (no request/response shape change was needed).

## 6. Improvement Model

No new competing model was created. Two existing, purpose-fit models continue to serve their own contexts:
- **`ResumeChangeProposal`** (`optimization-review.ts`) — JD-proposal-driven, text-diff-shaped (id, sectionType, fieldKey, originalValue, proposedValue, reason, matchedRequirement, autoApplicable). Already covers most of §4's conceptual field list (title≈reason, category≈sectionType, safeToAutoApply≈autoApplicable, evidence≈matchedRequirement).
- **`DashboardIssue`** (`ats-explainability.ts`, Milestone 7) — category-score-driven (key, label, value, priority, fixType, potentialImpact), now additionally carrying `sectionType` for navigation (this milestone's one schema addition).

## 7. Safe vs. Manual Workflow

- Every `ResumeChangeProposal` in `JdOptimizationReview` is, by construction, a wording change to content the user already entered (`autoApplicable: true`) — now explicitly labeled "Safe to Apply."
- Every education/certification gap row is, by construction, a missing fact that must come from the user — now explicitly labeled "Requires Your Confirmation."
- Every `DashboardIssue` already carried `fixType: "safe" | "manual"` (Milestone 7, reusing the Resume Rewriter's established Protected Facts rule) — unchanged, now paired with a real "Open Builder" action for both kinds (a manual-fix issue still benefits from being taken straight to the right section).

## 8. Review → Accept/Reject → Apply Workflow

Unchanged, reused as-is: `Pending` (proposal generated, decision defaults to accepted for auto-applicable ones) → user toggles `Accept`/`Reject` per item, or edits the proposed text inline → `Apply N Selected Changes` persists only the accepted set via the existing `/jd-optimize/apply` route → `Applied` (shown via `applyResult`, now also triggering `onApplied` to refresh the surrounding dashboard for a same-version apply).

## 9. Projected Score

Unchanged, reused as-is (`projectAtsScoreAfterProposals()`). Not touched, not duplicated.

## 10. JD-Aware Mode / 11. General Mode

Both already correctly separated (Milestone 7 confirmed §23's ATS/JD separation is real; this milestone didn't change that boundary). What changed: the general mode's issue list now has a working action; the JD mode's proposal/gap rows now have explicit safe/manual labels.

## 12. Version Integration

Unchanged — the existing apply flow's "new version (recommended)" vs. "current version" choice, and the Master Resume's new-version-only restriction, are untouched. This milestone's only version-related change is making `VersionDetail.tsx` re-fetch after a same-version apply so the numbers it shows stay correct.

## 13. Undo / Recovery

Not built, and correctly so: the existing "Apply to a new version (recommended)" default is itself the undo mechanism — a rejected or regretted change is simply a version the user never restores as Master, while the original stays completely intact in version history. `restoreAsMaster()` (existing, unmodified) is the existing recovery path. No second undo/history architecture was needed or added.

## 14. Security

No new API route, no new data flow. `onApplied`/`onOpenSection` are pure UI callbacks operating on data the parent component already fetched through its existing, `requireUserId()`-protected route. No prompt construction was touched — this milestone added zero new LLM calls and zero new prompt-security surface.

## 15. Accessibility

Every progress bar from Milestone 7 already had `role="progressbar"` + `aria-*` attributes. This milestone adds: `aria-label` on every "Open Builder" issue action (e.g. `"Open Certifications section in the Builder"`), on every gap-row action (`"Add Certification: AWS Certified Solutions Architect"`), and on every Accept/Reject/Edit button (`"Accept proposed Experience rewrite"`, `"Reject proposed Summary rewrite"`) — matching the spec's own literal examples.

## 16. Responsive Design

Unchanged — every new element reuses existing flex-wrap/card patterns already in use throughout `JdOptimizationReview.tsx` and `ResumeAtsScore.tsx`; no new layout primitive was introduced.

## 17. Performance

Zero new ATS calculations, zero new parser calls, zero new LLM calls. `onApplied` triggers exactly one existing `load()` re-fetch (already what every other mutating action in `VersionDetail.tsx` — restore, compare — does), only when the user actually applied a change to this version.

## 18. Tests

3 new deterministic tests in `ats-explainability.test.ts` (all non-LLM): `deriveIssueSectionType` maps every scoring category to its correct Builder section (or `null` for categories with no single obvious one, like formatting); `deriveIssuesFromCategories` carries this mapping onto every issue it produces.

No new component-level tests were added, consistent with this codebase's established convention (confirmed again this milestone — zero `.test.tsx` files exist anywhere in the project); the new UI wiring (`onApplied`, `onOpenSection`, the new badges/labels) is plain prop-threading and JSX, verified via `tsc`/`build`/manual reasoning rather than a new test pattern introduced solely for this milestone.

## 19. Validation Results

| Command | Result |
|---|---|
| `npx vitest run` | **619/619 passing** (up from the Milestone 7 baseline of 616; +3 new tests, 0 regressions, 49/49 test files) |
| `npx tsc --noEmit` | Clean, 0 errors |
| `npm run lint` | 0 errors, 1 pre-existing unrelated warning (`no-img-element`) — unchanged |
| `npm run build` | `✓ Compiled successfully` |

## 20. Live Validation

Started a production server and probed the JD-optimize routes directly, without authentication:

- `POST /api/ai/resume/versions/[id]/jd-optimize/propose` (no auth) → `401`
- `POST /api/ai/resume/versions/[id]/jd-optimize/apply` (no auth) → `401`

Both confirm these existing, unmodified routes remain reachable and auth-gated.

**What was not live-tested**: an authenticated click-through (paste a JD, review proposals, accept some, apply to the current version, confirm the dashboard above refreshes with the new score; click "Open Builder" on a general-mode issue and confirm the tab switches). Same pre-existing Supabase auth/schema-cache limitation as every prior milestone in this phase — reported honestly rather than assumed. The underlying logic (`deriveIssueSectionType`, the extended `DashboardIssue` shape) is established by the 3 new unit tests; the UI wiring itself (`onApplied`, `onOpenSection`) is a direct, small, typed prop pass-through verified by a clean `tsc`/`build`.

## 21. Database Changes

None.

## 22. Known Limitations

- Authenticated end-to-end live testing remains blocked by the pre-existing Supabase limitation (§20).
- "Open Builder" switches to the Builder tab but does not scroll to the specific section (Milestone 3's `SectionEditor.tsx` already supports `id="section-{id}"` scroll targets, but wiring a specific section's *id* — not just its *type* — across the tab boundary would need either a shared ref or lifting more state than this milestone's scope warranted; documented rather than built partially).
- The general (non-JD) issue list's "Open Builder" action does not distinguish *which* entry within a section needs work (e.g., "Certifications" opens the Certifications section, but doesn't point at a specific missing certification) — this matches the category-level granularity Milestone 7's deterministic scoring actually operates at; anything more specific would require inventing per-entry evidence the existing scorer doesn't compute.
- No numeric "+X pts" estimate was added to `JdOptimizationSummaryPanel`'s existing Top Priorities list (it already has its own honestly-scoped 0–100 "impact" ranking score, deliberately not a fabricated per-item point estimate, per that component's own prior documentation) — left as-is rather than bolted onto with a differently-scaled number.

## 23. Recommended Next Milestone

Wire "Open Builder" to the specific section *id* (not just type), by having `VersionDetail.tsx` look up the matching section in its already-computed `dynamicDocument` and pass a scroll target through to the Builder tab on mount — the smallest concrete step toward the deferred limitation above, once the cross-tab ref plumbing is worth the added state.
