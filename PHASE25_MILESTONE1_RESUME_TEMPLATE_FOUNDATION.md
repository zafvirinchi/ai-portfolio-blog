# Phase 25 — Milestone 1: Resume Template & AI Resume Builder Foundation

## 1. Audit Findings

The milestone brief treated "resume templates + builder + AI-improve + ATS-aware export" as a from-scratch product gap, citing Enhancv as market reference (no Enhancv code, design, or content was consulted or copied — the audit below and every subsequent change reused only this repo's own existing architecture). A full, read-only audit of the repository found that this already exists almost end-to-end, built across Phases 13 and 15 as the **Resume Versions** subsystem (`src/lib/ai/resume-versions/**`, `src/app/api/ai/resume/versions/**`, `src/components/resume/builder/**`). Per the brief's own Step 1 instruction ("Determine whether an existing resume representation can be reused… DO NOT create duplicate resume storage"), this milestone reused that subsystem in full and added only the genuine gaps found.

### Current Resume Data Model

Two coexisting representations, by design (not duplication):

1. **Legacy flat `Resume`** (`src/lib/ai/resume/resume-schema.ts`) — the resume parser's output (`contact`, `summary`, `skills`/`technicalSkills`/`softSkills`, `workExperience[]`, `education[]`, `certifications[]`, `projects[]`, `achievements: string[]`, `languages: string[]`, `yearsOfExperience`). Stored in `resume_versions.resume_data` (jsonb). No headline, no custom sections.
2. **Canonical `DynamicResumeDocument`** (`src/lib/ai/resume-versions/dynamic/dynamic-resume-schema.ts`) — `{ schemaVersion, personalInformation, sections: ResumeSection[] }`, with 19 typed section types (Summary, Experience, Education, Projects, Skills, Certifications, Awards, Achievements, Languages, Publications, Patents, Courses, Training, Volunteer, Leadership, Professional Memberships, Interests, References, Custom) and open field-bag entries. **This already satisfies "Template ≠ Resume Content" and "one resume renderable using multiple templates."** Stored in `resume_versions.sections_data` (jsonb, lazily computed from `resume_data` when null via `toDynamicResumeDocument()`).

Both stay in sync: every builder mutation calls `fromDynamicResumeDocument()` to re-derive `resume_data`, so ATS scoring, JD matching, and chat always see current content regardless of which representation was last edited (Phase 15 Milestone 2).

### Current Resume Flow (already fully built)

```
Upload/Analyze (ephemeral, 2h TTL) OR existing version
      -> Save as Version (resumeId | sourceVersionId | none -> clone master)
      -> Resume Builder (/resume-analyzer/versions/[id])
           - Personal Info / Section / Entry / Custom-field CRUD (dnd-kit reorder)
           - Template Gallery (live-preview cards, "Use This Template")
           - Theme Controls (accent/font/size/spacing/ATS-mode/margin/page-size)
           - JD Optimization Review (propose -> accept/reject/edit -> apply)
           - Quality Panel (ATS score, keyword coverage, warnings)
      -> Export (PDF / DOCX / Markdown / TXT)
```

"Create new," "create from existing version," and "create from an analyzed/uploaded resume" (Step 6 of the brief) were all already supported via the version-creation route's `resumeId`/`sourceVersionId` parameters — no new creation-flow code was needed.

### Reusable Services (confirmed, all reused as-is)

- `resumeVersionService` — full ownership-scoped CRUD, dynamic-document mutation, template-settings mutation, JD-optimization apply, rewrite-snapshot save, version compare.
- `resumeScorer.score()` / `computeJdMatchForResume()` — general and JD-aware ATS scoring, already wired into version creation/save.
- `buildQualityGateReport` / `explainGeneralAtsCategories` / `explainJdAtsCategories` (`quality-gate.ts`, `ats-explainability.ts`) — already produce the "ATS Score / keyword coverage / formatting warnings / content warnings" shape the brief's Step 8 asks for.
- `applyChangeProposals` (`optimization-review.ts`) — the existing "Original → Suggested → Accept/Reject" pattern, previously scoped to JD-optimization output.
- `renderDynamicResumePdf/Docx/Markdown/Txt` (`dynamic/export/*.ts`) — one canonical, template-aware rendering pipeline (pdfkit/docx), real selectable text, shared by both the live preview and the download route.
- `RewriteService` and its per-content-type generator functions (`summary-rewriter.ts`, `bullet-rewriter.ts`, `experience-rewriter.ts`, `achievement-rewriter.ts`, `project-rewriter.ts`, `skills-rewriter.ts`) — section-scoped AI rewriting with a fabrication-guard validator (`rewrite-validator.ts`).

### Existing Template Registry (Step 3 was already implemented)

`template-registry.ts` + `template-schema.ts`: 6 code-only templates (`modern`, `executive`, `classic`, `minimal`, `technical`, `gcc`), each with `layout`, `atsFriendliness`, `defaultAccent`/`defaultFont`, `headerAlign`, `sectionHeadingStyle`. `TemplateSettings` (accent/font/size/spacing/ATS-mode/margin/page-size) persisted per-version in `resume_versions.template_settings` (jsonb) — no database table for template definitions, matching the brief's explicit instruction.

### Existing Entitlement Policy (Step 11 was already decided)

`platform-schema.ts` already defines `resume.builder`, `resume.templates`, `resume.versions`, `resume.export` as feature IDs, and `platform-plan-registry.ts` already grants all four **UNLIMITED on every job-seeker tier** (Free/Pro/Premium). `resume.rewrite` and its `AI_REWRITES` usage metric are already tiered (NONE on Free, limited on Pro, unlimited on Premium). **No new monetization decision was required or made in this milestone.**

### Missing Capabilities (the actual, narrow scope of this milestone)

1. No `headline` field on personal info.
2. Template gallery had no filtering and never surfaced `atsFriendliness` on a card; only 6 of the 8 suggested categories existed (no Graduate, no Academic).
3. No generic "Improve with AI" entry point inside the builder itself — the rewrite engine existed but was only reachable from a separate, ephemeral, disconnected `/resume-rewriter` page.
4. No `requireFeature()`/`requireQuota()` call on the new AI-improve capability (everything else needed no new gating — see Entitlement Policy above).

## 2. Architecture

No new resume storage, no new template storage, no new rendering pipeline, no database migration. Every addition below is either an additive TypeScript/Zod type (backward-compatible with every existing `resume_versions` row) or new content inside the existing `sections_data`/`template_settings` jsonb columns.

## 3. Implementation

### 3.1 Headline field
- `dynamic-resume-schema.ts`: `headline: z.string().nullable()` added to `dynamicPersonalInformationSchema` and `updatePersonalInformationSchema`.
- `resume-migration.ts`: `toDynamicResumeDocument()` sets `headline: null` (no legacy equivalent); `fromDynamicResumeDocument()` now destructures `personalInformation` explicitly (rather than a blanket spread) so `headline` never leaks onto the legacy `Resume.contact` shape, which has no such field.
- `PersonalInfoEditor.tsx`: new Headline input, same on-blur-commit convention as every other field.
- All 5 renderers (`ResumePreview.tsx`, `dynamic-resume-pdf.ts`, `dynamic-resume-docx.ts`, `dynamic-resume-markdown.ts`, `dynamic-resume-txt.ts`) extended to show the headline under the name, only when set — one conditional line each, matching each renderer's existing header-block style.
- `ats-explainability.ts`: `CONTACT_FIELD_LABELS`'s type explicitly excludes `headline` (`Exclude<keyof DynamicPersonalInformation, "headline">`) — it's a positioning/content field, not a contact-quality signal, so it deliberately never appears in the Contact Quality panel.

### 3.2 Template registry — 8 templates + structured filter metadata
- `template-schema.ts`: added `TEMPLATE_CATEGORIES` (`ATS_CLASSIC`/`PROFESSIONAL`/`MODERN`/`EXECUTIVE`/`TECH`/`GRADUATE`/`GCC_PROFESSIONAL`/`ACADEMIC`), `EXPERIENCE_LEVELS`, and extended `TemplateDefinition` with `category`, `experienceLevels`, `industries` (structured tags, distinct from the existing free-text `recommendedFor`), and `isOnePage`.
- `template-registry.ts`: tagged all 6 existing templates with their closest category, and added two new templates — `graduate` (entry-level focus) and `academic` (research/publications focus) — closing the full 8-category spread. Both reuse the exact same generic single-column renderer every other template already uses; no new rendering code was needed, only metadata and default styling (matching how `gcc` was added in Phase 15 Milestone 4).
- New pure, unit-tested `filterTemplates(templates, { category?, atsOnly?, onePageOnly? })`.

### 3.3 Template Gallery — filters + ATS badge (Step 5)
- `TemplateGallery.tsx`: added a category chip row (8 categories + "All"), an "ATS: High only" toggle, and a "One-page friendly" toggle — deliberately kept to three controls rather than one per spec'd filter dimension, since category already distinguishes GCC/Tech/Academic/etc. (avoids the brief's own "do not over-design" instruction).
- Each card now visibly shows its category and ATS-friendliness badge (data already existed, was never rendered before).
- Existing responsive grid (`grid-cols-1 sm:grid-cols-2 xl:grid-cols-3`) and `aria-label`/`aria-pressed` conventions extended to the new controls.

### 3.4 AI Improve — generic entry point in the builder (Step 7, the core new capability)
Zero new AI/LLM logic. New stateless route `POST /api/ai/resume/versions/[id]/ai-improve`:
- `requireUserId()` → `resumeVersionService.getVersion(userId, id)` — ownership check (404, not 403) **before** any entitlement check or LLM call, matching every sibling route.
- `requireFeature(userId, "resume.rewrite")` → `requireQuota(userId, "AI_REWRITES")` — both pre-existing feature/metric, no new ones introduced — before the LLM call.
- Dispatches by section:
  - `summary` → `generateSummaryVariants()` against `version.resumeData.summary` (the legacy snapshot, kept in sync on every builder save).
  - `skills` → `generateSkillsRewrite()`, returning categorized suggestions (a different shape — see `AiImproveSkillsButton.tsx` below).
  - `experience` / `achievements` / `projects` / `certifications` → `generateBulletVariants()` against the caller-supplied `itemText` — the engine's own existing "improve exactly this one text item, in resume context" tool, already used this same way (regardless of section) by the ephemeral flow's own single-item "Generate Again" mode.
  - `generateAndValidateVariants()` — the retry-once-then-fallback-to-original fabrication guard — was **extracted from a private `RewriteService` method into a standalone exported function** (it never referenced `this`) so this new route reuses it verbatim instead of re-implementing it. Zero behavior change for the existing ephemeral rewrite flow, which now just calls the same function directly.
- `recordUsage(userId, "AI_REWRITES")` only after success.
- UI: new `AiImproveButton.tsx` (text sections) and `AiImproveSkillsButton.tsx` (skills, different suggestion/accept shape) — both render Original vs. Suggested and only call the caller's existing `onUpdate`/`onCommit` on an explicit Accept click, which persists through the **existing** `/sections/[sectionId]/entries/[entryId]` PATCH route — no new persistence endpoint, nothing ever auto-applied. Wired into `EntryEditor.tsx` for every textarea field on Summary/Experience/Projects/Achievements, and next to the Skills list field; `versionId` threaded down through `ResumeBuilder.tsx` → `SectionEditor.tsx` → `EntryEditor.tsx`.

## 4. Files Changed

**New:**
- `src/app/api/ai/resume/versions/[id]/ai-improve/route.ts` (+ `route.test.ts`)
- `src/components/resume/builder/AiImproveButton.tsx`
- `src/components/resume/builder/AiImproveSkillsButton.tsx`

**Modified:**
- `src/lib/ai/resume-versions/dynamic/dynamic-resume-schema.ts` (headline field)
- `src/lib/ai/resume-versions/dynamic/resume-migration.ts` (headline mapping, explicit destructure)
- `src/lib/ai/resume-versions/dynamic/ats-explainability.ts` (`CONTACT_FIELD_LABELS` type)
- `src/lib/ai/resume-versions/templates/template-schema.ts` (categories, experience levels, `TemplateDefinition` fields)
- `src/lib/ai/resume-versions/templates/template-registry.ts` (8 templates, `filterTemplates()`)
- `src/lib/ai/resume-rewriter/rewrite-service.ts` (extracted `generateAndValidateVariants`)
- `src/components/resume/builder/PersonalInfoEditor.tsx`, `ResumePreview.tsx`, `TemplateGallery.tsx`, `EntryEditor.tsx`, `SectionEditor.tsx`, `ResumeBuilder.tsx`
- `src/lib/ai/resume-versions/dynamic/export/dynamic-resume-pdf.ts`, `dynamic-resume-docx.ts`, `dynamic-resume-markdown.ts`, `dynamic-resume-txt.ts` (headline rendering)
- `vitest.config.mts` (new route test registered)
- ~13 existing `*.test.ts` fixtures under `resume-versions/**` updated to include `headline: null` (additive, required field — every other `personalInformation` field follows the same required-not-optional convention)

## 5. Tests

- `template-registry.test.ts`: 8 templates present, one per category, structured metadata populated on all 8, `graduate`/`academic` specifics, 5 new `filterTemplates()` cases (category, ATS-only, one-page-only, AND-combination, no-filter).
- `resume-migration.test.ts`: headline defaults to `null` on migration; headline never leaks onto the derived legacy `contact` shape.
- `ai-improve/route.test.ts` (9 cases): 404-not-403 ownership before any entitlement/LLM call; zero LLM calls when over quota; `requireFeature`/`requireQuota` called before the LLM call; `recordUsage` called only after success; **the real, unmocked fabrication guard genuinely falls back to the original text** when every suggested variant mentions a non-existent employer (validated against the real `validateRewrite()`, not a mock); `itemText` required for non-summary/skills sections; correct dispatch to `generateSummaryVariants`/`generateSkillsRewrite`.
- Full suite: **1280/1280 passing** (1263 pre-existing + 17 new), zero weakened or removed tests.

## 6. Validation

```
TSC:      PASS
LINT:     PASS (0 errors; 2 pre-existing, unrelated `<img>` warnings)
TESTS:    PASS (1280/1280)
BUILD:    PASS (new /api/ai/resume/versions/[id]/ai-improve route present in the route manifest)
```

Repo `verification` skill: **PASS WITH WARNINGS** — the whole-tree security/code-quality batch scan found zero findings in any file this milestone touched; every listed warning is in a pre-existing file from an earlier phase, untouched here (the per-file diff review, checks 6–18, was skipped because the git base ref is stale after a long uncommitted session — 483 files — not because 483 files were genuinely changed by this milestone).

Live probe (unauthenticated, against a running `next dev` server): home page 200; `/resume-analyzer/versions/[id]` page shell 200 (auth is enforced by the client component's own API calls, per this repo's established convention, not at the page-shell level); `POST /api/ai/resume/versions/[id]/ai-improve` unauthenticated → **401** with the exact same `UnauthorizedError` message every sibling route produces.

**Not verified live**: a full authenticated round-trip (real login → real resume version → click "Improve with AI" → see a real OpenAI suggestion). No test credentials were available in this environment, and — as reported earlier in this session — `OPENAI_API_KEY`/`OPENAI_BASE_URL` in `.env.local` currently point at a suspended Vocareum course-proxy key unrelated to this milestone's code, so a real LLM call would fail regardless. The route's correctness under a real OpenAI key is established by the mocked route test (9 cases) plus the pre-existing, unmodified `generateBulletVariants`/`generateSummaryVariants`/`generateSkillsRewrite`/`validateRewrite` functions this route calls, which already have their own coverage. Do not represent this as a verified live AI E2E until the OpenAI key issue is fixed and someone with a real session confirms it manually.

## 7. Security

- Every new/changed line follows the pre-existing `requireUserId()` → `resumeVersionService.getVersion(userId, id)` ownership pattern (404 not 403) verbatim — no new authorization mechanism.
- The one new LLM-calling route is entitlement-gated (`requireFeature`/`requireQuota`) before the LLM call, and only records usage after success — matching every existing AI route's shape exactly.
- No client-supplied `userId`/ownership claim is trusted anywhere in the new code.
- No new Supabase client, no new table, no RLS change, no migration.

## 8. Monetization Considerations

No new pricing was invented. `resume.builder`/`resume.templates`/`resume.versions`/`resume.export` were already UNLIMITED on every tier before this milestone and remain so. The one new capability (AI Improve) reuses the already-tiered `resume.rewrite` feature and `AI_REWRITES` metric exactly as they already govern the standalone `/resume-rewriter` page — a Free-tier user who could not use that page's AI rewriting also cannot use the new in-builder "Improve with AI" button; a Pro/Premium user's existing monthly allowance is shared across both entry points (the same usage counter, not a new one).

## 9. Deferred Decisions

- **Retrofitting `requireFeature()` onto the ~15 already-shipped resume-version CRUD routes** (document/sections/template/export): current plan policy already grants those four feature IDs UNLIMITED on every tier, so this would be a no-op today. Touching 15 stable, already-tested files for zero behavior change was judged out of scope for a "Foundation" milestone — flagged here as a deliberate, explicit gap rather than silently skipped.
- **A dedicated "Links" section type**: `website`/`linkedin`/`github` on personal info, plus the existing `CUSTOM` section type, already cover this; a 20th section type wasn't judged worth adding for Foundation. Revisit if job seekers specifically ask for a structured multi-link section (portfolio, Behance, X/Twitter, etc.).
- **Consolidating the older, separate pdfkit-based JD-optimizer PDF export** (predates the dynamic pipeline, per CLAUDE.md's "JD Intelligence Engine" note) with the one canonical `dynamic/export/*.ts` pipeline this milestone builds entirely on — noted by the audit, not touched, since it's outside this milestone's stated scope and not proven broken.

## 10. Known Limitations

- "Improve with AI" targets one `textarea`-type field per click (Summary content, an Experience/Project/Achievement description, or the whole Skills list) — it does not (yet) offer a per-bullet improve action *within* a list-typed field like Experience's `achievements` chip list, since that field type's chip UI wasn't designed for inline text-suggestion review. Most real experience bullets currently live in that chip list, not the (usually empty) `description` textarea — this is an honest scope boundary, not a hidden gap.
- Live authenticated E2E verification wasn't performed — see Section 6.
- Template previews are the existing scaled-down live-render (`ResumePreview.tsx`), not a static designed thumbnail — this was already the established pattern before this milestone and wasn't changed.

## 11. Recommended Next Milestone

1. Fix the environment's `OPENAI_API_KEY`/`OPENAI_BASE_URL` (see this session's earlier investigation) so the new AI Improve route — and every other AI feature in the app — can be verified against a real provider.
2. Wire "Improve with AI" onto individual Experience/Project bullets inside the chip-list editor (the real, common case), not just the underused `description` textarea.
3. Decide whether to consolidate the legacy JD-optimizer PDF exporter into the one canonical dynamic export pipeline.
4. If/when a genuine business decision is made to tier template/builder/export access differently than "unlimited for everyone," wire `requireFeature()` onto the existing CRUD routes at that time — not preemptively.
