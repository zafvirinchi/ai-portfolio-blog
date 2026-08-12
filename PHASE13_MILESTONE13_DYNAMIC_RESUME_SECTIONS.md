# Phase 13 — Milestone 13: Dynamic Resume Sections & Entries (Enhancv-Style Resume Builder)

## 1. Current architecture (audit findings)

This milestone builds directly on top of the **Dynamic Resume Sections** work already completed in this codebase (see `PHASE13_DYNAMIC_RESUME_SECTIONS.md`), which itself extended **Resume Versions** (`resume_versions` table + `src/lib/ai/resume-versions/`) — the only persistent, user-owned resume concept in the app. Before writing any code, that existing implementation was re-audited end to end:

- **Canonical dynamic model already exists**: `DynamicResumeDocument { schemaVersion, personalInformation, sections[] }`, `ResumeSection { id, type, title, order, visible, entries[] }`, `ResumeEntry { id, order, visible, fields, hiddenFieldKeys, customFields }` — this is exactly the shape this milestone's spec asks for, so **no second resume model was created**.
- **Section registry already exists** (`section-registry.ts`) driving the generic `SectionEditor`/`EntryEditor` UI from a `FieldDefinition[]` per section type — a UI hint, not a validation whitelist.
- **Template rendering was already generic**: `prepareForRender()` (`dynamic-resume-render.ts`) already walks `sections[]` and calls no per-section-type function; every renderer (React preview, PDF, DOCX, Markdown) already consumed it.
- **Persistence, backward compatibility, AI-merge compatibility, and export integration were already built** (one nullable JSONB column, lazy read-time migration from the legacy Phase 12 `Resume` shape, controlled section-matched AI merges, export branching on `sectionsData`).
- **Gaps versus this milestone's more detailed spec**, identified and closed below: no `custom` boolean flag on a section (only inferable from `type`), no section-level `settings`, only 17 section types (missing Training, Professional Memberships), reordering was button-only (no drag-and-drop), the "+ Add Section" picker was a flat list (no Recommended/More grouping), and a `CUSTOM` section's entries (which have no registry fields at all) rendered as a flat label-dump rather than a proper heading + body.
- **Still no template/theme system exists** (single-column vs. two-column vs. sidebar) — confirmed again this milestone. Building one is a genuinely separate, large UI/rendering project (see Known Limitations); the existing PDF/DOCX/Markdown output remains "the template," and every change below was written so a future multi-template system could sit on top of `prepareForRender()`'s output without touching the resume data model.

No files under `src/lib/ai/resume-enterprise/` (confirmed still unwired), the live Phase 12 parser, ATS engines, JD-matching engine, resume-rewriter engine, or any AI graph/agent/planner code were modified.

## 2. What this milestone actually added (incremental, on top of the existing model)

1. **`custom: boolean`** on `ResumeSection` — always derived from `type === "CUSTOM"` by the document service (`addSection`), never settable independently, so it can never disagree with `type`. Added purely so callers (and this milestone's own spec'd shape) don't need to know `CUSTOM` is the sentinel value.
2. **`settings: { showTitle: boolean; showDivider: boolean }`** on `ResumeSection`, defaulting to `{ true, true }` via Zod (`.default(...)`), so every existing section — including ones saved before this milestone — gets a sensible default the first time it's parsed, with no explicit migration step needed. Deliberately minimal: only what every renderer (React preview, PDF, DOCX, Markdown) can already respect uniformly, per the spec's own "only implement settings useful and supported by the current template engine" instruction. `columns`/`layout` were **not** added since no multi-column template engine exists yet to interpret them (see Known Limitations).
3. **Two new built-in section types**: `TRAINING`, `PROFESSIONAL_MEMBERSHIPS`, each with their own `FieldDefinition[]` in the registry.
4. **Grouped "+ Add Section" picker** — `RECOMMENDED_SECTION_TYPES` (Summary, Experience, Education, Skills, Projects, Certifications) and `MORE_SECTION_TYPES` (everything else), both derived from a new `group` field on each registry entry, so the UI list can never drift from what's actually addable. `Custom Section` is always offered as its own trailing option.
5. **Entry-add button wording** now matches the spec exactly per section type ("+ Add Experience", "+ Add Education", "+ Add Project", "+ Add Certification", "+ Add Award", "+ Add Publication", ...) — previously it read "+ Add New Position" etc.
6. **`getEntryPresentation()`** (`dynamic-resume-render.ts`) — the one new shared rendering primitive every renderer now uses: picks the first *registry* field as an entry's heading when one exists (unchanged behavior for Experience/Education/etc.), and falls back to the first *custom* field as the heading when it doesn't (a `CUSTOM` section's entries have zero registry fields by design). This directly implements the spec's "Custom sections must render professionally" requirement (§14) — a Custom section entry with `{title, description, impact}` custom fields now renders as a bold heading (`title`'s value) followed by body lines, in the React preview, PDF, DOCX, and Markdown export alike, instead of a flat "Label: value" dump.
7. **Drag-and-drop reordering** for both sections and entries, using `@dnd-kit` (`core` + `sortable` + `utilities`) — the lightweight, actively-maintained, React-19-compatible option (no existing DnD dependency was present; `react-beautiful-dnd`, the older common choice, is unmaintained and has known issues with React 18+ strict mode, so it was not used). A new `SortableItem` wrapper component owns all `@dnd-kit` mechanics and hands the existing `SectionEditor`/`EntryEditor` components only a `dragHandleProps` object to spread onto a `☰` handle button — **neither existing component's core logic, tests, or props were removed**, this is a pure additive extension (`dragHandleProps` is optional). Dropping calls the exact same `/sections/reorder` and `/sections/{id}/entries/reorder` API routes the previous milestone already built (which existed but were previously only reachable indirectly through the Move Up/Down buttons' computed swap) — no new backend code was needed for this. The Move Up/Down buttons remain, for accessibility and parity with the spec's own "Move Up / Move Down" entry action list.
8. **Section settings UI** — a small "⋮ Settings" popover on each section header with two checkboxes (Show section title / Show divider line), calling the same `PATCH /sections/{id}` route (extended to accept an optional `settings` patch).

## 3. Section registry (updated)

19 section types now: `SUMMARY, EXPERIENCE, EDUCATION, PROJECTS, SKILLS, CERTIFICATIONS, AWARDS, ACHIEVEMENTS, PUBLICATIONS, PATENTS, LANGUAGES, VOLUNTEER, LEADERSHIP, COURSES, TRAINING, PROFESSIONAL_MEMBERSHIPS, INTERESTS, REFERENCES, CUSTOM`. Each carries a `group: "recommended" | "more" | null` (CUSTOM has no group — always offered separately), an `entryFields: FieldDefinition[]`, and a `defaultEntryLabel` used verbatim in the "+ Add {label}" button.

## 4. Entry model

Unchanged shape; drag-and-drop and the existing Move Up/Down buttons both call `reorderEntries()`, which still requires the full ordered-id list (rejecting a partial list) — the same integrity guarantee as before, now reachable two ways.

## 5. Custom sections

Unchanged data model (a `CUSTOM`-typed section with no registry fields, entries are pure custom-field containers) — the only change is `custom: true` now being set alongside `type`, and the rendering improvement in §2.6 above.

## 6. Custom fields

Unchanged — `addCustomField`/`updateCustomField`/`removeCustomField`, each independent of an entry's registry fields.

## 7. Ordering

Unchanged pure functions (`reorderSections`/`reorderEntries`/`moveSectionUp`/`moveSectionDown`), now driven by drag-and-drop in addition to buttons. Both paths compute a full ordered-id array and hit the same endpoint, so there is exactly one code path that actually reorders anything server-side.

## 8. Visibility

Unchanged — independent emptiness (`isFieldEmpty`) and explicit-hide (`hiddenFieldKeys`/`visible`) rules, enforced once in `prepareForRender()` and consumed identically by every renderer.

## 9. Section rename

Unchanged — `type` is immutable once a section is created; only `title` is user-editable, and no renderer or service infers behavior from `title` text.

## 10. Section settings (new)

`{ showTitle: boolean; showDivider: boolean }`, defaulting to `true`/`true`. `showTitle: false` suppresses the section heading text (React preview, PDF, DOCX, Markdown all respect this); `showDivider: true` draws a thin rule under the (optional) heading in all four outputs. Patched via `PATCH /api/ai/resume/versions/[id]/sections/[sectionId]` with an optional `settings` object — partial patches merge onto existing settings, never replace them wholesale.

## 11. Template compatibility

No template-selection system exists (confirmed again this milestone — see Known Limitations). What already existed, and remains true: `prepareForRender(document)` is the single generic pipeline every output consumes — visible sections in order, visible/non-empty entries in order, visible/non-empty fields — with **zero** per-section-type branching in any renderer. `getEntryPresentation()` (new this milestone) is the one addition, and it too is section-type-agnostic — it only asks "does this entry have registry fields or not," never "which section type is this."

## 12. Custom section template rendering (new)

See §2.6 — `getEntryPresentation()` gives every renderer a `{ heading, lines }` pair regardless of whether the entry's content came from registry fields or custom fields, so a Custom section entry renders with a real heading line instead of a flat field dump, using the exact same visual treatment (bold heading, indented body lines) as every other section type — no separate "custom section template" was built, satisfying the spec's explicit "do not create a separate custom template for every custom section."

## 13. Live preview

Unchanged architecture — `ResumeBuilder.tsx` re-fetches the updated `sectionsData` from every mutation's API response and re-renders `ResumePreview` from it; no page reload, ever. `ResumePreview` now also respects `settings.showTitle`/`showDivider` and uses `getEntryPresentation()`.

## 14. Autosave / persistence

Unchanged — every structural action (section/entry add, remove, rename, reorder, move, visibility, settings, custom fields) calls one of the existing granular API routes, which persist through the existing `sections_data` JSONB column. No second persistence mechanism was introduced. `settings`/`custom` are covered automatically by the same `dynamicResumeDocumentSchema.parse()` validation every save already goes through — old documents saved before this milestone get `custom: false` / `settings: {showTitle:true, showDivider:true}` filled in by Zod's defaults the moment they're next read, with zero explicit migration code (Zod's `.default()` behavior on an optional-on-input, present-on-output schema is exactly the idempotent adapter the spec's backward-compatibility section (§29) asks for).

## 15. AI compatibility

Unchanged — no new AI calls, no second data model. The existing JD-optimization and resume-rewrite merge functions (`mergeOptimizedSectionsIntoDocument`/`mergeRewrittenSectionsIntoDocument`) still only touch the specific sections their AI output maps to by section `type`, leaving section IDs, entry IDs, ordering, visibility, custom sections, and custom fields on every other section completely untouched. Both continue to work unmodified with sections that now also carry `custom`/`settings` — those fields are simply passed through by the object-spread merge pattern already in place.

## 16. Parsed resume → dynamic sections

Unchanged mapping (`resume-migration.ts`'s `toDynamicResumeDocument()`) — still only creates a section when the legacy Phase 12 parser output actually has content for it, preserving ordering, dates, companies, titles, descriptions, technologies, and achievements exactly as before. The `newSection()` internal helper was updated only to also stamp `custom: type === "CUSTOM"` (always `false` here, since parser-derived sections are never Custom) and default `settings`.

## 17. JD optimization compatibility

Unchanged (see §15) — verified via the existing `resume-migration.test.ts` suite (still passing) that custom sections and their `custom`/`settings` fields survive a merge untouched.

## 18. Export compatibility

The PDF/DOCX/Markdown renderers were updated to (a) call the new `getEntryPresentation()` instead of manually destructuring `entry.fields`, and (b) skip the section title paragraph/line when `settings.showTitle` is `false` and draw a divider (a thin horizontal rule in PDF, a bottom-bordered empty paragraph in DOCX, a `---` line in Markdown) when `settings.showDivider` is `true`. All three still consume exactly the same `prepareForRender()` output the live preview does — no separate export-only structure exists.

## 19. Files added

```
src/components/resume/builder/SortableItem.tsx
PHASE13_MILESTONE13_DYNAMIC_RESUME_SECTIONS.md
```

(`@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` added to `package.json`/`package-lock.json` — no other new dependency.)

## 20. Files modified

```
src/lib/ai/resume-versions/dynamic/dynamic-resume-schema.ts        (+ TRAINING/PROFESSIONAL_MEMBERSHIPS, + custom, + settings/sectionSettingsSchema, + settings patch in updateSectionSchema)
src/lib/ai/resume-versions/dynamic/section-registry.ts             (+ TRAINING_FIELDS/MEMBERSHIP_FIELDS, + group field, + RECOMMENDED_SECTION_TYPES/MORE_SECTION_TYPES, renamed defaultEntryLabel values)
src/lib/ai/resume-versions/dynamic/dynamic-resume-document-service.ts (addSection sets custom/settings; updateSection accepts a settings patch)
src/lib/ai/resume-versions/dynamic/resume-migration.ts             (newSection() helper stamps custom/settings)
src/lib/ai/resume-versions/dynamic/dynamic-resume-render.ts        (RenderableSection carries custom/settings; + getEntryPresentation/RenderableLine/EntryPresentation)
src/lib/ai/resume-versions/dynamic/export/dynamic-resume-markdown.ts (use getEntryPresentation; respect settings)
src/lib/ai/resume-versions/dynamic/export/dynamic-resume-pdf.ts     (use getEntryPresentation; respect settings; draw divider)
src/lib/ai/resume-versions/dynamic/export/dynamic-resume-docx.ts   (use getEntryPresentation; respect settings; draw divider)
src/lib/ai/resume-versions/dynamic/dynamic-resume-document-service.test.ts (+ custom/settings tests)
src/lib/ai/resume-versions/dynamic/dynamic-resume-render.test.ts   (+ getEntryPresentation tests, updated fixtures for the new required fields)
src/lib/ai/resume-versions/dynamic/resume-migration.test.ts        (updated fixture for the new required fields)
src/lib/ai/resume-versions/resume-version-service.ts               (updateSection's TS signature extended with settings)
src/components/resume/builder/SectionEditor.tsx                    (+ dragHandleProps, + onReorderEntries + entry-level DndContext, + settings popover)
src/components/resume/builder/EntryEditor.tsx                      (+ dragHandleProps)
src/components/resume/builder/ResumeBuilder.tsx                    (+ section-level DndContext/SortableContext, + onUpdateSettings/onReorderEntries wiring)
src/components/resume/builder/AddSectionMenu.tsx                   (grouped Recommended/More <optgroup>s)
src/components/resume/builder/ResumePreview.tsx                    (use getEntryPresentation; respect settings)
package.json / package-lock.json                                   (+ @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities)
```

## 21. Files explicitly untouched

Everything listed in `PHASE13_DYNAMIC_RESUME_SECTIONS.md`'s own §22 remains untouched by this milestone too: `ConversationService`, `Agent.run()`/LangGraph topology, `PlannerService`, Tool Registry, Knowledge Pipeline/RAG (including `rag_documents`/`rag_document_chunks` — confirmed, never referenced by anything in this milestone), `PortfolioChain`, the Mock Interview graph/system, the live Phase 12 parser/schema, both ATS scorers, the JD-matching/rewrite engines' own computation logic (only their already-existing merge-output step interacts with sections), `resume-enterprise/` (confirmed still unwired), authentication/authorization logic, the database schema (only the already-existing nullable `sections_data` JSONB column is used — no new tables, no new columns), and all unrelated admin/billing/analytics/interview/cover-letter/LinkedIn/recruiter UI.

## 22. Validation results

- `npm run lint` — 0 errors (1 pre-existing, unrelated warning about an `<img>` tag in a blog page).
- `npx tsc --noEmit` — 0 errors.
- `npm run build` — succeeds.
- `npx vitest run` — **199/199 tests passing** (5 new this milestone: `custom` derivation, `settings` defaults/patching, and 2×`getEntryPresentation` cases covering both the registry-field heading and the custom-field-fallback heading).
- API-level regression check (curl against a fresh `next start`): anonymous Resume Analyzer flow still `200`; every resume-versions API route (including the new/changed ones) still correctly returns `401` when unauthenticated.
- `git status --short` reviewed — only `package.json`/`package-lock.json` (dnd-kit) plus the exact files listed in §19/§20 changed; no unrelated feature was touched.

## Known limitations

1. **No multi-template (single-column / two-column / sidebar) system exists.** This was true before this milestone and remains true — building one is a substantial, separate visual-design/layout-engine project, not an incremental addition. `section.settings` was deliberately kept to `showTitle`/`showDivider` (the only two things every current renderer can already honor) rather than adding `layout`/`columns` fields with no engine behind them yet, per the spec's own "only implement settings useful and supported by the current template engine" instruction.
2. **Interactive browser (click-through) testing of the new drag-and-drop and settings UI was not performed.** As previously reported, this Supabase project's PostgREST layer is still returning a stale-schema-cache error (`PGRST205`) for real SELECT/INSERT queries against `password_history`/`auth_sessions`/`security_events`, which blocks login/signup for any account, independent of anything in this milestone (re-confirmed still present at the end of this milestone). Verification relied on the full automated test suite (199/199), a clean lint/tsc/build, and curl-level confirmation of auth-gating and the unaffected anonymous flow.
3. **AI auto-detection of new section types from a parsed resume is still not implemented** (unchanged limitation from the previous milestone) — the live Phase 12 parser doesn't extract Training/Membership/Publications/etc. fields at all.

## Recommended next milestone

Once the Supabase schema-cache issue is resolved: a manual click-through pass exercising every item in this milestone's own 40-step test list. Beyond that, in priority order: (a) a real multi-template/layout system (the architecture — `Resume Data → Dynamic Section Model → Template Renderer → Selected Template` — is already positioned for this, since no template-specific markup lives in the resume data), (b) AI-assisted section auto-detection from parsing, (c) exposing `RenderableSection.settings` in additional ways as more renderers are added.
