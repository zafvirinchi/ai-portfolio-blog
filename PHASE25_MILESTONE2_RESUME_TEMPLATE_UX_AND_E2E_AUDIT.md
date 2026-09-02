# Phase 25 — Milestone 2: Resume Template UX & End-to-End Validation Audit

## Scope

Independent, skeptical re-verification of the resume-template/builder/AI-improve journey built in Milestone 1, tracing signup → Resume Analyzer → Resume Builder → Template Gallery → template selection → editing → headline → AI improvement → live preview → template switching → save/persistence → PDF/DOCX/Markdown/TXT export → download. No rebuild, no new template registry, no new tables/migrations. Audit first; code changed only for genuine, evidence-based defects. Nothing committed.

This was not a rubber-stamp of Milestone 1's own summary — three independent investigations (two background audits plus direct code re-reading) treated every prior claim as unverified until re-derived from the current source.

## Architecture Reviewed

`src/lib/ai/resume-versions/**` (dynamic document model, template registry/styles/renderers, service layer, route handlers), `src/components/resume/builder/**` (Builder UI), `src/lib/ai/resume-rewriter/**` (AI generator functions the new AI-improve route dispatches to), `src/lib/billing/{entitlement-service,entitlement-response,entitlement-client-error,export-download}.ts` and `src/components/billing/platform/UpgradePrompt.tsx` (entitlement/error-UX conventions). No other subsystem was modified.

## Complete Template Inventory

| Template | layout | headerAlign | sectionHeadingStyle | category | ATS friendliness |
|---|---|---|---|---|---|
| modern | single-column | left | accent-left-border | MODERN | high |
| executive | single-column | center | centered-divider | EXECUTIVE | high |
| classic | single-column | left | underline | ATS_CLASSIC | high |
| minimal | single-column | left | plain-caps | PROFESSIONAL | high |
| technical | sidebar | left | accent-left-border | TECH | medium |
| gcc | single-column | left | underline | GCC_PROFESSIONAL | high |
| graduate | single-column | **center** (fixed this milestone, was left) | plain-caps | GRADUATE | high |
| academic | single-column | center | underline | ACADEMIC | high |

## Results by Part

**Part 1 — Template Discovery**: All 8 templates render (every `layout`/`headerAlign`/`sectionHeadingStyle` value used is explicitly handled by all 5 renderers). No stale/orphaned ids in either direction. Category/ATS/one-page filters wire correctly through `filterTemplates()`, including the empty-result state. Industry metadata (`industries: string[]`) exists on every template but is intentionally not exposed as its own filter control (Milestone 1's own documented decision — category already distinguishes GCC/Tech/Academic). **Genuine defect found**: Graduate was structurally byte-identical to Minimal (same `layout`/`headerAlign`/`sectionHeadingStyle`, the only template-intrinsic differentiators this system has), and `defaultAccent`/`defaultFont` are never auto-applied on template selection or reflected in gallery preview cards — so the two templates were genuinely indistinguishable, both in the gallery and in actual rendered output. **Fixed.**

**Part 2 — Template Switching**: Switching `templateId` is a single ownership-filtered `.update()` on `template_settings` only — never touches `sections_data`/`resume_data`. A→B→A preserves all customization by construction (merge-patch). Reload correctly restores both content and template via two independent, ownership-checked `GET`s. No duplicate-row risk (update, not insert). Null/legacy `template_settings` correctly falls back to `DEFAULT_TEMPLATE_SETTINGS` (`templateId: "modern"`, still valid). **No defects found.**

**Part 3 — Resume Data Model**: Traced headline and every other field through editor → API (`updatePersonalInformationSchema`/`addEntrySchema`/`updateEntrySchema`) → service (`saveDynamicDocument`'s `dynamicResumeDocumentSchema.parse()`, which cannot silently drop a required field) → persistence (`sections_data` jsonb, exact round-trip) → all 5 renderers. Rendering is registry-driven (`renderableFieldsFor()` iterates `getSectionDefinition().entryFields`), so any field the registry declares is structurally guaranteed a render path — no field can be "stored but unreachable." Empty/optional sections are correctly dropped entirely by the one shared `prepareForRender()` pipeline every renderer calls — cannot diverge between formats. `fromDynamicResumeDocument()`'s headline-exclusion (Milestone 1) was re-verified to exclude only `headline`, not any real contact field. **No defects found.**

**Part 4 — Export Consistency**: All 5 renderers share one content pipeline (`prepareForRender()`) — ordering, dates, and field formatting cannot diverge between them. Long text (up to schema caps) and page overflow are handled without truncation or crash in every format. Links render as correct, complete text in every format but are never made clickable hyperlinks in PDF/DOCX — reported as a UX enhancement opportunity, not a defect (no information loss). **Genuine defect found**: pdfkit's font mapping (`PDF_FONT_MAP`) uses only 4 of pdfkit's built-in WinAnsi-encoded fonts — full ASCII/Latin-1 coverage, but **no glyph coverage for non-Latin scripts** (Arabic, CJK, Cyrillic, Hebrew, Devanagari, Thai, ...) since no font is embedded anywhere in the pipeline. Such characters previously rendered as silently missing/blank glyphs with **no warning anywhere** — directly relevant to this app's own GCC-oriented template and any candidate whose name uses a non-Latin script. Pre-existing (predates Milestone 1/2), but real. **Mitigated this milestone** (see Fixes below) — full font-embedding was judged out of proportion for this audit.

**Part 5 — AI Improvement Flow**: Server route re-verified line-by-line: ownership check (404 not 403) before any entitlement check, `requireFeature`/`requireQuota` before the LLM call, `recordUsage` only after success, the real (unmocked) fabrication guard genuinely falls back to original text, unauthenticated calls correctly rejected — all confirmed both via the existing mocked test suite and a live probe against a running server. Original text is never overwritten without an explicit Accept click; Reject/close discards the suggestion, leaving the field untouched. **Genuine defect found**: `AiImproveButton.tsx`/`AiImproveSkillsButton.tsx` (client) discarded the server's structured `{code, featureId, limit, used, period}` entitlement-rejection shape and rendered a raw error string instead of `UpgradePrompt` — a direct, confirmed violation of this repo's own established, previously-enforced convention (the identical bug class already found and fixed once before in `JdOptimizationReview.tsx`, per its own Phase 23 M5 comment). **Fixed.**

**Part 6 — Template-Specific Quality**: Traced the PDF pagination logic (short/normal/long resumes, and the sidebar "technical" template specifically) against the previously-documented stale-Y-after-overflow bug — confirmed the existing fix is sound for that exact case. **New, low-severity finding**: if the sidebar's own content overflows onto page 2+, it continues rendering in the same narrow (~32%-width) column rather than widening, wasting page space (no content loss, no clipping — every character still draws correctly). Requires an unusually long sidebar (7 section types) to trigger. **Not fixed** — real but cosmetic, and the pagination code has a documented history of subtle bugs; the risk of a rushed change outweighs the benefit for this milestone. Documented as a deferred item.

**Part 7 — ATS Safety**: No rasterized content anywhere (zero `.image()` calls). Contact info and headline are always real, selectable body text, never in a header/footer region. The "technical" sidebar template's PDF draw order is sequential (all sidebar text, then all main-column text) — not interleaved/corrupted, a known and correctly-labeled characteristic (`atsFriendliness: "medium"`, collapsible to single-column via ATS Mode). **Genuine defect found**: DOCX section headings (`sectionHeadingParagraph()`) used only bold/color `TextRun` formatting — never a real Word `HeadingLevel` style. Visually bold, but structurally indistinguishable from body text to Word's Navigation Pane, screen readers, and any ATS parser that detects section boundaries via paragraph style rather than bold formatting. **Fixed.**

**Part 8 — Authorization/Ownership**: Re-verified the export route and template-settings route independently (not just the AI-improve route from Milestone 1) — both call `resumeVersionService.getVersion`/`saveTemplateSettings`/`getDynamicDocument`, all ownership-filtered (`.eq("id", ...).eq("user_id", ...)`), all 404-not-403 on another user's version. No client-supplied identity is trusted anywhere in the touched code. **No defects found.**

**Part 9 — Error/UX Handling**: Live-probed all three touched routes unauthenticated — every one returns a clean, structured 401 JSON body (`{"error": "You must be signed in to manage resume versions."}`), never a stack trace or blank screen. Invalid template IDs are rejected by Zod validation (400) before reaching the service layer. **Genuine defect found**: `DownloadMenu.tsx` used a plain `<a href>` pointing directly at the export API route — the exact bug class already found and independently fixed 3 times elsewhere in this repo (recruiter export components, via `export-download.ts`'s `downloadExport()` helper): a plain link can't intercept a JSON error response, so an expired session or a deleted/not-found version would navigate the whole browser tab to raw JSON instead of showing the app's own error UI. Not currently gated by entitlement (so a 402 specifically isn't reachable today), but 401/404/500 are all real, reachable failure modes through this exact path. **Fixed.**

**Part 12 — Operational Check**: No migration/Stripe/admin regression found; nothing in that area was reopened. The only operational blocker materially affecting this journey remains the one already reported in this session: `.env.local`'s `OPENAI_API_KEY`/`OPENAI_BASE_URL` still point at a suspended Vocareum course-proxy key, unrelated to this milestone's code, blocking a real live AI-improve/LLM verification.

## Fixes Applied (5 genuine defects, all minimal, all regression-tested)

1. **`AiImproveButton.tsx` / `AiImproveSkillsButton.tsx`** — now call `readEntitlementError()` and render `UpgradePrompt` on a structured entitlement rejection, matching the established, already-enforced-elsewhere convention. *(No new automated test — this repo has no component-testing framework; the underlying `readEntitlementError()`/`UpgradePrompt` pattern this now reuses already has its own coverage.)*
2. **`template-registry.ts`** — Graduate's `headerAlign` changed from `"left"` to `"center"`, making its structural triple unique among single-column templates. Regression test added (`template-registry.test.ts`).
3. **`dynamic-resume-docx.ts`** — section headings now carry `heading: HeadingLevel.HEADING_1` in addition to their existing explicit bold/color/underline formatting (visual output unchanged; only semantic structure added). `sectionHeadingParagraph()` exported for direct testability (matching this codebase's established "extract for testability" pattern). Regression test added, inspecting the `Paragraph`'s own plain, JSON-serializable structure — no new XML/zip-parsing test dependency introduced, honoring this test file's own prior documented decision against one.
4. **`dynamic-resume-render.ts`** — new `containsPdfUnsafeCharacters()` pure function detects non-Latin-1 content (conservative: flags anything outside U+0000–U+00FF); wired into `DownloadMenu.tsx` via `ResumeBuilder.tsx` to show a visible, honest warning near the PDF button instead of silently producing a PDF with missing glyphs. Six regression tests added.
5. **`DownloadMenu.tsx`** — rewritten to use the existing `downloadExport()` fetch+blob helper and `UpgradePrompt`/error-message rendering instead of `<a href>`, matching the pattern already established (and already regression-tested) in `RecruiterReportsTab.tsx`/`RecruiterComparisonTab.tsx`/`RecruiterCandidateTable.tsx`. *(No new automated test — same no-component-testing-framework constraint; the reused `downloadExport()` helper is shared, existing, unmodified code.)*

## Deferred / Non-Issues

- **Classic vs. GCC template structural duplication** (both `single-column`/`left`/`underline`) — same root cause as the Graduate/Minimal defect, discovered incidentally while investigating it, but **not fixed**: GCC's conservative styling is established, shipped positioning from Phase 15 Milestone 4, outside this milestone's explicitly-named scope (only Graduate/Academic were named), and changing it risks a worse regression than documenting it. Candidate for a future, dedicated template-differentiation pass.
- **`defaultAccent`/`defaultFont` never auto-applied on template selection** — a genuine product/UX question (should picking a template also reset accent/font, and if so, only on first selection or every switch?), not a simple bug with one obvious correct fix. Flagged for explicit product sign-off rather than a unilateral behavior change during an audit milestone.
- **Sidebar overflow onto page 2+ wastes page width** (Part 6) — real, low-severity, cosmetic only, no content loss. Deferred given the disproportionate regression risk to already-fragile, well-tested pagination code.
- **Full Unicode/non-Latin PDF font embedding** — the underlying cause of Part 4's defect. A real engineering project (bundling real Unicode-capable font files, per-script selection logic, larger PDF output), correctly out of proportion for this audit milestone; the warning mitigation (Fix 4) makes the limitation honest rather than silent in the meantime.
- **URLs not rendered as clickable hyperlinks in PDF/DOCX** — a UX enhancement opportunity, not a defect (no information is lost; the URL text is fully present and, if anything, more ATS-parser-friendly as plain text).

## Test Results

```
Test Files  113 passed (113)
     Tests  1288 passed (1288)   (1280 pre-existing + 8 new; zero weakened, zero removed)
```

## Build/Lint/Type-Check Results

```
TSC:      PASS
LINT:     PASS (0 errors; 2 pre-existing, unrelated <img> warnings)
BUILD:    PASS
```

Repo `verification` skill: **PASS WITH WARNINGS** — whole-tree security/code-quality batch scan found **zero findings in any file this milestone touched**; every listed warning is in a pre-existing, untouched file from an earlier phase. Per-file diff review (checks 6–18) was skipped by the script itself because the git working tree is 483 files against a stale base ref (a long uncommitted multi-milestone session, not 483 genuinely-changed files) — Mode A (tsc/eslint/vitest/build + the whole-tree scan) ran regardless and is what's reported above.

## Live Validation Results

Against a running `next dev` server: home page 200; unauthenticated `POST /api/ai/resume/versions/[id]/ai-improve` → 401 structured JSON; unauthenticated `GET /api/ai/resume/versions/[id]/export?format=pdf` → 401 structured JSON; unauthenticated `PATCH /api/ai/resume/versions/[id]/template` → 401 structured JSON (auth is checked before template-id validation, correct ordering). **Not verified live**: a full authenticated round trip (real login → real version → template switch → AI improve → export/download). No test credentials were available in this environment, and `OPENAI_API_KEY` is still the broken Vocareum key reported earlier in this session — a real LLM call would fail regardless of this milestone's code. This is stated plainly per the brief's own explicit instruction not to fabricate authenticated E2E; the route-level correctness is established by the mocked test suite plus these live unauthenticated probes, not by a claimed full E2E run.

## Remaining Risks

1. Full authenticated E2E is still unverified (see above) — the highest-value next validation step once credentials and a working OpenAI key exist.
2. Classic/GCC and the accent/font-auto-apply question (Deferred section) remain real, low-to-medium-priority UX gaps.
3. The sidebar-overflow whitespace issue (Part 6) is unresolved but low severity.

## Final Classification

**Genuine defects existed and were fixed** — this was not a clean-audit / no-changes outcome. Five real, evidence-based defects were found and fixed with minimal, targeted changes and 8 new regression tests; three additional real-but-lower-priority findings were documented and deliberately deferred rather than fixed, per the brief's own scope discipline. No template system, entitlement system, or rendering pipeline was rebuilt or duplicated. Nothing was committed.

**Recommended next milestone** (smallest logical scope, only if pursued): resolve the Classic/GCC template-distinctness question and the accent/font-auto-apply-on-selection product decision together (same root cause, same investigation already done here), once a real OpenAI key is available to also close out full authenticated E2E verification.
