# Phase 13 — Dynamic Resume Sections, Fields & Entries

## 1. Goal

Upgrade the Resume Builder (built on top of Phase 13's Resume Versioning feature) from a fixed-shape resume into a genuinely dynamic, section/entry/field-based editor: arbitrary add/remove/rename/reorder of sections and entries, custom fields, custom sections, field-level visibility, empty-field omission, and template rendering that iterates a generic `sections[]` structure rather than hard-coded fields — without introducing a second resume data model, without touching the live AI/parsing/ATS/JD-matching pipelines, and with full backward compatibility for every resume created before this milestone.

## 2. Existing architecture discovered

Before writing any code, the repo was inspected for: a Resume Builder UI, a resume template/theme system, and any richer resume schema than Phase 12's parser output.

- **No Resume Builder UI existed anywhere** in the live app (`Grep` for `ResumeBuilder|SectionEditor|EntryEditor|ResumeTemplate`, `Glob` for `**/*builder*` and `**/*template*` — no matches beyond the new code this milestone adds).
- **`src/lib/ai/resume-enterprise/`** — a ~3,600-line, richer resume schema/parser/ATS package from a prior "Phase 12" commit — is **completely unwired** into the live app. Only two unrelated files import small constants from its `ats` subpackage (`TECHNOLOGY_DICTIONARY`, `ACHIEVEMENT_PATTERNS`, `WEAK_PHRASES`); nothing uses its schema, parser, or normalizer. It was **not** treated as live infrastructure and not built upon.
- **No template/theme selection system exists** anywhere in the app. The existing PDF/DOCX/Markdown export formats are the only "templates" that exist, so no template-picker UI was fabricated.
- The only persistent, user-owned, editable resume concept in the codebase is **Resume Versions** (`resume_versions` table, built in the immediately-preceding milestone). Given the milestone's own instruction to extend existing structures rather than invent a duplicate resume system when the assumed architecture doesn't match reality, the dynamic sections model was built as an **extension of Resume Versions**, not a new top-level feature.
- The **live Phase 12 parser** (`resume/resume-parser.ts` / `resume/resume-schema.ts`) does not extract Publications, Patents, Awards, Volunteer, Leadership, Courses, or References data at all — only the unused `resume-enterprise` schema does. See §21 (Known Limitations).

## 3. New dynamic resume model

`src/lib/ai/resume-versions/dynamic/dynamic-resume-schema.ts` defines the whole model with Zod:

```
DynamicResumeDocument { schemaVersion, personalInformation, sections: ResumeSection[] }
ResumeSection         { id, type, title, order, visible, entries: ResumeEntry[] }
ResumeEntry           { id, order, visible, fields: Record<string, FieldValue>, hiddenFieldKeys: string[], customFields: CustomField[] }
FieldValue            = string | string[] | boolean | null
CustomField           { id, label, value, order, visible }
```

`schemaVersion` (currently `1`) lets a future migration distinguish "no dynamic document yet" from "a stale dynamic-document shape" without touching every existing row. 17 section types are supported: `SUMMARY, EXPERIENCE, EDUCATION, PROJECTS, SKILLS, CERTIFICATIONS, AWARDS, ACHIEVEMENTS, LANGUAGES, PUBLICATIONS, PATENTS, COURSES, VOLUNTEER, LEADERSHIP, INTERESTS, REFERENCES, CUSTOM`.

## 4. Section registry

`dynamic/section-registry.ts`'s `SECTION_REGISTRY` maps each section type to a label, whether it supports multiple entries, and a `FieldDefinition[]` (key, label, input type: text/textarea/date/boolean/list/url) — the single source of truth the generic `SectionEditor`/`EntryEditor` UI uses to decide which inputs to render. **This is a UI hint, not a validation whitelist** — `resumeEntrySchema.fields` is a free-form `Record<string, FieldValue>`, so an entry can always carry fields the registry doesn't know about (e.g. from a custom field, or a future registry addition) without breaking. `ADDABLE_SECTION_TYPES` drives the "+ Add Section" menu.

## 5. Entry model

Entries have no fixed maximum count and are always ordered by an explicit `order` integer, never re-sorted implicitly. `duplicateEntry` produces a fully independent copy (new id, edits never propagate back to the original — verified in tests).

## 6. Field model

A field's value is a closed 4-shape union (`string | string[] | boolean | null`) so every renderer and the emptiness check can exhaustively handle it. List-typed fields (achievements, technologies, skills) are edited as newline-separated text in the UI and stored as `string[]`.

## 7. Custom section support

Any `CUSTOM`-typed section can be added with a user-supplied title (prompted at creation). It has no registry fields — entries in a custom section are pure custom-field containers, exercising the same custom-field machinery every other section type uses.

## 8. Custom field support

Every entry, regardless of section type, can carry an arbitrary list of `{ label, value, order, visible }` custom fields — added/renamed/hidden/removed independently of the entry's registry fields, through their own dedicated API routes and service methods (`addCustomField`/`updateCustomField`/`removeCustomField`).

## 9. Section ordering

Sections carry an explicit `order`; `moveSectionUp`/`moveSectionDown` swap with the adjacent section (no-op at either edge — verified in tests) and `reorderSections` accepts a full ordered-id list (rejects anything that doesn't contain every existing section id, preventing silent data loss from a partial reorder call).

## 10. Entry ordering

Same pattern at the entry level via `reorderEntries` (full ordered-id list, scoped to one section). The Resume Builder UI drives this with per-entry Move Up/Down buttons rather than drag-and-drop, computing the swapped id list client-side and calling the same reorder endpoint the backend already exposed.

## 11. Visibility

Two independent conditions govern whether a field renders, matching the milestone's own distinct "Field Visibility" and "Empty Field Handling" requirements:

1. **Emptiness** (`isFieldEmpty`) — an unset/blank/whitespace-only string, or an array with no non-blank entries, is never rendered, regardless of visibility flags. Booleans are never "empty" (`false` is a real value).
2. **Explicit hide** (`hiddenFieldKeys` on the entry, `visible` on sections/entries/custom fields) — a field *with* a real value that the user has explicitly hidden also never renders.

A boolean field (e.g. "Current Position") renders only when `true` — never as a "Current Position: No" line. Sections and entries with zero renderable content after filtering are dropped entirely rather than showing an empty heading.

## 12. Template rendering

`dynamic/dynamic-resume-render.ts` is the **single source of truth** for "what should actually be shown," called identically by the React live preview, the PDF renderer, and the DOCX renderer:

- `isFieldEmpty(value)` — the emptiness check described above.
- `prepareForRender(document)` — visible sections (sorted by order) → visible/non-empty entries (sorted by order) → visible/non-empty fields, with visible/non-blank custom fields appended.
- `formatFieldValue(field)` — the one place a `FieldValue` becomes display text (lists joined with `", "`, booleans rendered as their own label).

No renderer has any per-section-type hard-coded layout knowledge — each just walks `sections[]` generically, which is exactly what this milestone asked for (contrasted with the legacy JD-match exporter, which only ever renders a fixed handful of sections).

## 13. Persistence

One new nullable JSONB column, `resume_versions.sections_data` (migration `20260811000000_add_resume_versions_sections_data.sql`), per the milestone's explicit instruction to extend the existing JSONB structure rather than introduce relational sections/entries/fields tables. No RLS changes (this project has no RLS anywhere; all authorization is application-level via `requireUserId()`).

## 14. Backward compatibility

Old resumes and versions are **never migrated in place**. `resume-migration.ts`'s `toDynamicResumeDocument(resume)` computes a fresh `DynamicResumeDocument` **at read time** whenever `sections_data` is `null`, deriving sections only where the legacy data actually has content (e.g. no `SUMMARY` section is created for a blank/whitespace-only summary). The computed document is only ever persisted once the user (or an AI merge) actually saves an edit through the Builder — a version nobody has opened in the Builder yet stays exactly as it was, forever compatible with the legacy flat renderer.

## 15. AI integration

No second resume data model and no new AI calls. The **existing, unmodified** JD-optimization (`jd-service.ts`) and resume-rewrite (`resume-rewriter/rewrite-service.ts`) pipelines are untouched; `resume-migration.ts`'s `mergeOptimizedSectionsIntoDocument()` / `mergeRewrittenSectionsIntoDocument()` run **after** those pipelines complete, doing a controlled, section-type-matched merge (original-bullet-text matching for Experience/Projects, wholesale replacement for Summary/Skills/Achievements) into an already-existing dynamic document — never touching sections the AI output has no content for, and never touching custom sections/fields the user has already added. This only runs when `version.sectionsData` already exists; a version never opened in the Builder is unaffected.

## 16. Export integration

`GET /api/ai/resume/versions/[id]/export` checks `version.sectionsData`:

- **Present** → renders via the new dynamic PDF/DOCX/Markdown renderers (`dynamic/export/`), which walk `prepareForRender()`'s output generically — hidden fields, empty fields, custom sections, and custom fields are all handled correctly, and reordered sections/entries export in their persisted order.
- **`null`** → falls through, byte-for-byte unchanged, to the exact pre-existing legacy flat renderer this route already used. Every version created before this milestone (or never opened in the Builder) exports exactly as it always did.

## 17. UI

New `src/components/resume/builder/` package, wired into `VersionDetail.tsx` as a second "Resume Builder" tab (alongside the pre-existing "Overview" tab, which is completely unchanged):

- **`ResumeBuilder`** — loads the dynamic document via `GET .../document`, and is the single place that calls the ~13 granular structural API routes; every mutation's response (`{ version }`) refreshes local state from `version.sectionsData`, so the client never re-implements the server's document-transform logic.
- **`SectionEditor`** — per-section header (inline rename, hide/show, delete-with-`confirm()`, move up/down), collapsible entry list, "+ Add {default entry label}" button.
- **`EntryEditor`** — registry-driven field inputs (text/textarea/date/boolean/list/url), a per-field hide toggle, and a custom-fields sub-list (add/rename/hide/remove), plus per-entry visibility/duplicate/delete/move controls.
- **`AddSectionMenu`** — a `<select>` of `ADDABLE_SECTION_TYPES` plus an "Add Section" button; choosing `CUSTOM` prompts for a title.
- **`ResumePreview`** — a read-only live preview built directly on `prepareForRender()`, so it can never drift from what PDF/DOCX/Markdown export actually produce.

Field-value edits commit **on blur**, not per keystroke, per the milestone's explicit "avoid excessive API calls while typing" instruction; structural actions (add/remove/move/duplicate) are one click each, matching the codebase's existing button-driven (not drag-and-drop) interaction style.

## 18. Testing performed

**Automated (194/194 passing, 49 new for this milestone):**
- `dynamic-resume-document-service.test.ts` (18 tests) — every one of the 13 pure transform functions: add/update/remove/move/reorder sections, add/update/remove/duplicate/reorder entries, add/update/remove custom fields, plus `SectionNotFoundError`/`EntryNotFoundError` cases and a no-op-at-the-edge check for `moveSectionUp`/`Down`.
- `resume-migration.test.ts` (13 tests) — `toDynamicResumeDocument` (no section for blank/absent legacy data, correct field mapping per section type, correct section ordering, default visibility), `mergeOptimizedSectionsIntoDocument`/`mergeRewrittenSectionsIntoDocument` (only-matching-sections mutated, purity/no-mutation-of-input, custom sections left untouched).
- `dynamic-resume-render.test.ts` (18 tests) — `isFieldEmpty` (blank/whitespace/empty-array/booleans-never-empty), `prepareForRender` (hidden sections/entries/fields dropped, sections with zero renderable entries dropped entirely, boolean-true-only rendering, order-field-driven sorting independent of array position, visible-and-non-blank custom field filtering), `formatFieldValue`.

**Also run and clean this milestone:** `npm run lint` (0 errors), `npx tsc --noEmit` (0 errors), `npm run build` (succeeds).

**API-level (via curl against a rebuilt `next start` server):** every new and pre-existing `/api/ai/resume/versions*` route correctly returns `401` (not the previous, incorrect `422`) when unauthenticated — see §19; the anonymous Resume Analyzer upload/analyze flow (`/resume-analyzer`, `/api/ai/resume`) is unaffected and still returns `200`.

**Interactive browser testing:** not completed — see §21.

## 19. A real bug found and fixed (auth error mapping)

While curl-testing the new routes, every one of them returned `422 Unprocessable Entity` instead of `401 Unauthorized` for an unauthenticated request. Root cause: `requireUserId()` (`resume-version-auth.ts`) threw a plain `Error`, and **every** route's error handler in the entire `resume-versions` API surface (not just the new routes — this pattern was inherited from the prior Resume Versioning milestone) had no branch to recognize it, falling through to a generic 422. This silently broke `VersionDetail.tsx`'s own "sign in to view this resume version" prompt, which explicitly checks `response.status === 401`.

**Fix:** added `UnauthorizedError` (`resume-version-auth.ts`), thrown by `requireUserId()`; added a `401` branch to the shared `handleVersionRouteError()` helper and to every route file's own inline error handling (`[id]/route.ts`, `route.ts`, `optimize`, `rewrite`, `restore`, `duplicate`, `compare`, `export`). Verified via curl on a fresh build that every route now correctly returns 401. This is a pure error-mapping fix — no authorization logic changed.

## 20. Files added

```
src/lib/ai/resume-versions/dynamic/dynamic-resume-schema.ts
src/lib/ai/resume-versions/dynamic/section-registry.ts
src/lib/ai/resume-versions/dynamic/dynamic-resume-render.ts
src/lib/ai/resume-versions/dynamic/resume-migration.ts
src/lib/ai/resume-versions/dynamic/dynamic-resume-document-service.ts
src/lib/ai/resume-versions/dynamic/index.ts
src/lib/ai/resume-versions/dynamic/dynamic-resume-document-service.test.ts
src/lib/ai/resume-versions/dynamic/resume-migration.test.ts
src/lib/ai/resume-versions/dynamic/dynamic-resume-render.test.ts
src/lib/ai/resume-versions/dynamic/export/dynamic-resume-markdown.ts
src/lib/ai/resume-versions/dynamic/export/dynamic-resume-pdf.ts
src/lib/ai/resume-versions/dynamic/export/dynamic-resume-docx.ts
src/lib/ai/resume-versions/dynamic/export/index.ts
src/lib/ai/resume-versions/resume-version-route-helpers.ts
src/app/api/ai/resume/versions/[id]/document/route.ts
src/app/api/ai/resume/versions/[id]/sections/route.ts
src/app/api/ai/resume/versions/[id]/sections/reorder/route.ts
src/app/api/ai/resume/versions/[id]/sections/[sectionId]/route.ts
src/app/api/ai/resume/versions/[id]/sections/[sectionId]/move/route.ts
src/app/api/ai/resume/versions/[id]/sections/[sectionId]/entries/route.ts
src/app/api/ai/resume/versions/[id]/sections/[sectionId]/entries/reorder/route.ts
src/app/api/ai/resume/versions/[id]/sections/[sectionId]/entries/[entryId]/route.ts
src/app/api/ai/resume/versions/[id]/sections/[sectionId]/entries/[entryId]/duplicate/route.ts
src/app/api/ai/resume/versions/[id]/sections/[sectionId]/entries/[entryId]/custom-fields/route.ts
src/app/api/ai/resume/versions/[id]/sections/[sectionId]/entries/[entryId]/custom-fields/[fieldId]/route.ts
src/components/resume/builder/ResumeBuilder.tsx
src/components/resume/builder/SectionEditor.tsx
src/components/resume/builder/EntryEditor.tsx
src/components/resume/builder/ResumePreview.tsx
src/components/resume/builder/AddSectionMenu.tsx
supabase/migrations/20260811000000_add_resume_versions_sections_data.sql
PHASE13_DYNAMIC_RESUME_SECTIONS.md
```

## 21. Files modified

```
src/lib/ai/resume-versions/resume-version-types.ts        (+ sectionsData field)
src/lib/ai/resume-versions/resume-version-service.ts       (+ getDynamicDocument/saveDynamicDocument + 13 CRUD wrappers, AI-merge wiring in applyJdOptimization/saveRewrittenSections)
src/lib/ai/resume-versions/resume-version-auth.ts           (+ UnauthorizedError; requireUserId() throws it instead of a plain Error)
src/lib/ai/resume-versions/index.ts                         (+ export * from "./dynamic")
src/app/api/ai/resume/versions/[id]/export/route.ts         (dynamic-vs-legacy branch; legacy branch left byte-identical; + 401 mapping)
src/app/api/ai/resume/versions/[id]/route.ts                (+ 401 mapping)
src/app/api/ai/resume/versions/route.ts                     (+ 401 mapping)
src/app/api/ai/resume/versions/[id]/optimize/route.ts       (+ 401 mapping)
src/app/api/ai/resume/versions/[id]/rewrite/route.ts        (+ 401 mapping)
src/app/api/ai/resume/versions/[id]/restore/route.ts        (+ 401 mapping)
src/app/api/ai/resume/versions/[id]/duplicate/route.ts      (+ 401 mapping)
src/app/api/ai/resume/versions/compare/route.ts             (+ 401 mapping)
src/components/resume/versions/VersionDetail.tsx            (+ Overview/Resume Builder tab switcher; Overview content unchanged)
```

## 22. Files explicitly untouched

`ConversationService`, `Agent.run()`/LangGraph topology, `PlannerService`/planner schema, Tool Registry, Knowledge Pipeline/Knowledge Manager/RAG retrieval, `PortfolioChain`, the Mock Interview graph and existing interview system, the live Phase 12 resume parser/schema, the two existing ATS scorers, the JD-matching/optimization engine's own logic (only its *output* is merged, never its computation), the resume-rewriter engine's own logic, `src/lib/ai/resume-enterprise/` (confirmed still unwired), Authentication/authorization logic itself (only error-to-status *mapping* changed, per §19), and all unrelated UI (billing, analytics, SaaS admin, interview prep, cover letter, LinkedIn optimizer, recruiter workspace, etc.).

## Known limitations

1. **AI-driven auto-population of Publications/Patents/Awards/Volunteer/Courses/Leadership/References is not implemented.** The live Phase 12 parser doesn't extract these fields from an uploaded resume at all (only the unused `resume-enterprise` schema does), and extending the live parser's extraction schema was judged out of scope for this milestone (too close to "protected AI architecture" to change without being asked). The dynamic model fully supports these section types structurally — a user can manually add and populate them today — but nothing currently detects and auto-creates them from a parsed upload.
2. **Section/entry reordering in the UI is button-driven (Move Up/Down), not drag-and-drop.** The backend fully supports arbitrary reordering (`reorderSections`/`reorderEntries` accept any ordered-id permutation); a drag-and-drop UI could be layered on top later without any backend change.
3. **Interactive browser (click-through) testing of the Resume Builder was not completed.** A full end-to-end pass (sign up a throwaway account, upload a resume, exercise every Builder control in a real browser) was attempted but blocked by a pre-existing, unrelated environment issue: this Supabase project's PostgREST layer currently returns a stale-schema-cache error (`PGRST205`) for real SELECT/INSERT queries against `password_history`/`auth_sessions`/`security_events` (all three tables exist — confirmed directly — this is a cache-propagation quirk, not a missing migration), which blocks the login/signup flow entirely, for any account, independent of anything in this milestone. Verification instead relied on: 194/194 automated tests passing (49 new, covering every pure transform/render/migration function exhaustively), a clean `lint`/`tsc`/`build`, and curl-level confirmation that every new API route enforces auth correctly and that the anonymous Resume Analyzer flow is unaffected. Recommend reloading the Supabase schema cache (Dashboard → Project Settings → API → "Reload schema cache") and re-running a manual click-through pass before this milestone is considered fully sign-off-ready.

## Next recommended milestone

Per this milestone's own instruction, no further unrelated milestone work should follow automatically. If a follow-up is wanted: (a) a manual interactive test pass once the Supabase schema-cache issue is resolved, (b) AI-assisted auto-detection of Publications/Awards/Volunteer/etc. sections from an uploaded resume (would require extending the live Phase 12 parser's extraction schema — an explicit, separate decision), or (c) drag-and-drop section/entry reordering in the Builder UI.
