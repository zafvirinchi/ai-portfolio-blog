# Phase 15 — Milestone 1: Enterprise Dynamic Resume Builder

## 1. Objective

Deliver an Enhancv-style dynamic Resume Builder: open a resume version, add/edit/remove sections and entries (including custom sections/fields), see changes reflected live in a preview that matches export output, and persist safely — without a second resume data model, a second JSON schema, a parallel data store, new LLM calls, or any change to protected architecture (ConversationService, Agent.run(), LangGraph, GraphState, Planner, Tool Registry, PortfolioChain, multi-agent coordinator, Knowledge Pipeline, interview architecture).

## 2. Audit Method

Before writing any code, read the actual repository state: the dynamic-resume schema and Zod validator, the Section Registry, the resume version service and its granular mutation methods, every `/api/ai/resume/versions/[id]/sections*` route and its shared error-mapping helper, and the full builder UI component tree (`ResumeBuilder.tsx`, `SectionEditor.tsx`, `EntryEditor.tsx`, `AddSectionMenu.tsx`, `ResumePreview.tsx`). No code was written until this audit was complete.

## 3. Audit Finding: The Feature Already Exists

This is the central finding of this milestone. Nearly everything the spec describes was already built, across Phase 13's earlier milestones, before this session began:

| Spec requirement | Existing implementation |
|---|---|
| One dynamic Resume JSON structure, versioned | `DynamicResumeDocument { schemaVersion, personalInformation, sections[] }` — `dynamic-resume-schema.ts`, validated via `dynamicResumeDocumentSchema.parse()` |
| One authoritative section field registry | `SECTION_REGISTRY` in `section-registry.ts` — all 19 `SectionType`s, field lists matching the spec's own Experience/Education/Project/Certification examples near-verbatim |
| Add/edit/delete sections and entries | `dynamic-resume-document-service.ts`'s pure functions (`addSection`, `updateSection`, `removeSection`, `addEntry`, `updateEntry`, `removeEntry`, `duplicateEntry`, `reorderEntries`, `reorderSections`, `moveSectionUp/Down`) |
| Custom sections and custom fields | `type: "CUSTOM"` sections plus `addCustomField`/`updateCustomField`/`removeCustomField` — same architecture, no separate code path |
| Ownership-protected, validated persistence | `resumeVersionService.saveDynamicDocument()` — ownership check via `getVersion`, then `dynamicResumeDocumentSchema.parse()` before every write; this is the *only* place `sections_data` is ever written |
| API reuse, not new endpoints | ~10 existing routes under `/api/ai/resume/versions/[id]/sections*`, all auth + ownership + Zod validated, all funneling errors through one shared `handleVersionRouteError()` |
| Safe local-editing / autosave | `EntryEditor.tsx` commits field edits `onBlur` (not per keystroke) via the existing granular PATCH routes — already satisfies "integrate with existing autosave safely," not "build new autosave" |
| Preview reuses export rendering, no second renderer | `ResumePreview.tsx` imports the same `prepareForRender()` / `getEntryPresentation()` pipeline PDF/DOCX/Markdown export uses |
| Version safety (rollback, protected fields, comparison, history) | Untouched — this milestone made zero changes to `resume-version-service.ts`'s version-management methods |
| No new LLM calls for save/edit/reorder | Confirmed — every mutation method in `dynamic-resume-document-service.ts` is a pure, synchronous, non-LLM function |

Given this, the correct scope for this milestone was **not** a rebuild — it was a targeted gap audit against the spec's own Definition of Done, followed by the smallest correct change set.

## 4. Gaps Identified

Checking the existing implementation against the spec's checklist line by line surfaced exactly three concrete, well-scoped gaps:

1. **No duplicate-singleton-section prevention.** `addSection()` had no guard against adding a second `SUMMARY` or `INTERESTS` section — types the registry marks `supportsMultipleEntries: false`, i.e. conceptually "one implicit entry for the whole resume." Nothing stopped a user from creating two competing summaries with no way to tell which was canonical.
2. **No section-navigation overview.** The spec's own example ("Experience ✓ 3 / Awards 0") — a single view of every registry section type with a real entry count, present or not — did not exist. `AddSectionMenu.tsx` only listed section types not yet added; there was no at-a-glance view of what *was* added and how full it was.
3. **No empty-state UI.** A document with zero sections rendered a bare, contentless builder page — no "Your resume is ready to build." message or quick-add affordance, which the spec explicitly required (without fabricated sample content).

No other gap was found. Everything else the spec asked for was already present and working.

## 5. Naming/Reality Mismatch: "Enterprise Resume Parser"

The spec names the "Enterprise Resume Parser" package as something the builder might integrate with. Auditing `src/lib/ai/resume-enterprise/resume-parser.ts` (independently reconfirming Phase 13 Milestone 22's finding) shows it has **zero live route or UI callers** — it is an orphaned, unused duplicate parser with its own `EnterpriseResume` type, incompatible with the `Resume` type that `ResumeVersionRecord.resumeData` actually uses and that the Dynamic Resume Builder already correctly consumes. Wiring it in would require bridging two incompatible resume schemas, directly violating the spec's own "no second resume model" rule. Decision: leave it untouched and undocumented-as-integrated; the builder correctly uses the live `resume/resume-parser.ts` pipeline, as it already did before this milestone.

## 6. Changes Made

### 6.1 `src/lib/ai/resume-versions/dynamic/dynamic-resume-document-service.ts`

Added `DuplicateSingletonSectionError` and a guard at the top of `addSection()`:

```ts
export class DuplicateSingletonSectionError extends Error {
  constructor(type: SectionType) {
    super(`A "${getSectionDefinition(type).label}" section already exists — only one is allowed.`);
    this.name = "DuplicateSingletonSectionError";
  }
}
```

```ts
if (type !== "CUSTOM" && !definition.supportsMultipleEntries && document.sections.some((section) => section.type === type)) {
  throw new DuplicateSingletonSectionError(type);
}
```

`CUSTOM` is explicitly exempt — a user may always add another named custom section, since it isn't a fixed singleton concept.

### 6.2 `src/lib/ai/resume-versions/resume-version-route-helpers.ts`

Wired the new error into the one shared error-mapping function used by every sections route, returning `409 Conflict`:

```ts
if (error instanceof MasterResumeProtectedError || error instanceof DuplicateSingletonSectionError) {
  return NextResponse.json({ error: error.message }, { status: 409 });
}
```

No new endpoint was created — the existing `POST /sections` route now simply surfaces this new error type through the mapper it already used.

### 6.3 `src/components/resume/builder/SectionNav.tsx` (new)

A section-navigation panel listing every registry section type with its real entry count (`section?.entries.length ?? 0`, never fabricated), clickable to scroll to an existing section or add a missing one via the same `onAdd` callback `AddSectionMenu` already used — no second "add section" code path.

### 6.4 `src/components/resume/builder/SectionEditor.tsx`

Added `id={`section-${section.id}`}` to the root element so `SectionNav`'s "jump to section" can scroll to it.

### 6.5 `src/components/resume/builder/ResumeBuilder.tsx`

- Renders `<SectionNav>` above the section list.
- When `sortedSections.length === 0`, renders an empty state ("Your resume is ready to build.") with quick-add buttons for Experience, Education, Projects, Skills, and Certifications, using the existing `getSectionDefinition().label` for copy (no fabricated content) and the existing add-section mutation path.
- The existing drag/drop section list rendering is unchanged, now conditionally rendered only when sections exist.

## 7. Existing Architecture Reused (Not Modified)

- `DynamicResumeDocument` schema, `dynamicResumeDocumentSchema` Zod validator
- `SECTION_REGISTRY`, `getSectionDefinition`, `ADDABLE_SECTION_TYPES`, `RECOMMENDED_SECTION_TYPES`, `MORE_SECTION_TYPES`
- `resumeVersionService.getDynamicDocument` / `saveDynamicDocument` (ownership + validation)
- All ~10 existing `/sections*` API routes
- `EntryEditor.tsx`'s on-blur field commit ("autosave")
- `ResumePreview.tsx`'s shared `prepareForRender()` / `getEntryPresentation()` rendering pipeline
- `AddSectionMenu.tsx` (unchanged, still rendered at the bottom of the sections tab)
- `toDynamicResumeDocument()` lazy-migration path for legacy versions

## 8. Protected Architecture — Untouched

No changes were made to `ConversationService`, `Agent.run()`, LangGraph topology or `GraphState`, the Planner, the Tool Registry, `PortfolioChain`, the multi-agent coordinator or its Research/Reviewer/Summarizer agents, the Knowledge Pipeline, or the interview architecture. This milestone's changes are confined to three files under `resume-versions/dynamic/` + route helper, and three files under `components/resume/builder/`.

## 9. Out of Scope — Confirmed Not Done

No new optimization/ATS/JD-matching algorithm, no interview agents, no recruiter batch screening, no payments/billing, no analytics, no template marketplace, no drag-and-drop layout engine, no new LLM provider, no new LLM calls of any kind.

## 10. Security

- No new authorization mechanism — the new error type flows through the existing `handleVersionRouteError()`, which itself relies on the existing `requireUserId()` / ownership-check path in every route, unchanged.
- No new logging of resume content or tokens was added.
- The duplicate-singleton guard is enforced server-side (inside the pure function called by the route), not just client-side, so it cannot be bypassed by a direct API call.

## 11. Tests

Extended `src/lib/ai/resume-versions/dynamic/dynamic-resume-document-service.test.ts`'s existing `"addSection / removeSection / updateSection"` describe block with 4 new deterministic, non-LLM test cases:

1. Adding a second `SUMMARY` section throws `DuplicateSingletonSectionError`, and the failed attempt does not mutate the document.
2. Adding a second `INTERESTS` section throws `DuplicateSingletonSectionError`.
3. Adding a second `EXPERIENCE` section (a `supportsMultipleEntries: true` type) does **not** throw.
4. Adding a second `CUSTOM` section, even with an identical title, does **not** throw.

No new test infrastructure, mocking convention, or `vitest.config.mts` glob change was needed — the file was already covered.

## 12. Validation Results

| Command | Result |
|---|---|
| `npx vitest run` | **508/508 passing** (up from the Milestone 24 baseline of 504; +4 new tests, 0 regressions, 46/46 test files) |
| `npx tsc --noEmit` | Clean, 0 errors |
| `npm run lint` | 0 errors, 1 pre-existing unrelated warning (`no-img-element` in `blog/[slug]/page.tsx`) — same warning present before this milestone |
| `npm run build` | `✓ Compiled successfully` — all routes built, including `/resume-analyzer/versions/[id]` (the builder's host page) |

## 13. Live Validation

Started a production server (`npm run start`) and probed the builder's live routes directly:

- `GET /resume-analyzer/versions/00000000-0000-0000-0000-000000000000` → `200` (page shell renders; auth/ownership is enforced client-side and at the API layer, consistent with the rest of the app)
- `POST /api/ai/resume/versions/[id]/sections` (no auth) → `401`
- `GET /api/ai/resume/versions/[id]/document` (no auth) → `401`

This confirms the new and existing routes correctly reject unauthenticated requests before ever reaching the ownership or duplicate-singleton checks.

**What was not live-tested**: a full authenticated click-through (log in, open a real version, add a duplicate Summary section and observe the 409, add a section from the new nav, confirm the empty state on a zero-section document, refresh and confirm persistence). This requires an authenticated Supabase session; the Supabase auth/schema-cache limitation documented since Phase 13 Milestone 14 (and re-confirmed in Milestone 24) still blocks establishing one in this environment. Per the milestone's explicit instruction not to claim a live test passed when it wasn't executed, this is reported honestly rather than assumed from code review. The new guard's correctness is instead established by the unit tests in §11, which exercise the exact same pure function the route calls, plus the unauthenticated-rejection check above confirming the route wiring itself is reachable and enforced.

## 14. Database Changes

None. `sections_data` (JSONB on `resume_versions`, added in an earlier milestone) is unchanged in shape; the new guard only restricts what `addSection()` will accept before that column is ever written.

## 15. Known Limitations

- Authenticated end-to-end live testing remains blocked by the pre-existing Supabase auth/schema-cache limitation (§13) — unchanged from Milestone 24's report, not introduced by this milestone.
- The orphaned "Enterprise Resume Parser" package (§5) remains unwired; if a future milestone wants it integrated, that would require an explicit, separately-scoped decision about bridging or replacing the `Resume`/`EnterpriseResume` schema split — not something to do incidentally.

## 16. Recommended Next Milestone

Template/design improvements to the builder's preview (the spec explicitly deferred this) — e.g. multiple export templates selectable from `ThemeControls.tsx`/`TemplateGallery.tsx` — since the rendering pipeline itself (`prepareForRender`/`getEntryPresentation`) is already shared and stable, making it the lowest-risk next surface to extend.
