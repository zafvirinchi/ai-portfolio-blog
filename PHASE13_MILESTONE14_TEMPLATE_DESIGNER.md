# Phase 13 — Milestone 14: Enterprise Resume Template Designer & Professional Resume Rendering

## 1. Current architecture (audit findings)

Before writing any code, the existing implementation was re-audited end to end:

- **Canonical resume model**: `DynamicResumeDocument { schemaVersion, personalInformation, sections[] }` (Milestone 12/13), where each `ResumeSection` now also carries `custom`/`settings` (Milestone 13). This remains the single canonical model — no second resume representation was created for templates.
- **Template rendering was already generic in spirit but had no template CONCEPT at all**: `prepareForRender()` walked `sections[]` with zero per-section-type branching, but there was no notion of "which template," no accent/font/spacing controls, and no persisted presentation settings anywhere.
- **Export pipeline**: `dynamic-resume-{pdf,docx,markdown}.ts` already consumed `prepareForRender()`/`getEntryPresentation()` exclusively — the right foundation to extend, not replace.
- **A real, previously-undetected bug found during this audit**: the `/api/ai/resume/versions/[id]/export` route branched on `version.sectionsData` truthiness to decide between the "dynamic" pipeline and a completely separate, hard-coded legacy renderer (`OptimizedResumeSections`, from the unrelated jd-match export feature). Since `sections_data` stays `null` until a user makes an actual *content* edit, a user who only ever visited a hypothetical "Template" tab (this milestone's own new UI) and never touched Sections would have had their template choice **silently ignored** on export, falling through to the old hard-coded renderer that has no template concept whatsoever. This is fixed as part of this milestone — see §18.
- **No template/theme/font/spacing/ATS-mode/page-length settings existed anywhere** — this milestone's entire persistence and control surface is new.
- **PDF**: `pdfkit`, direct programmatic drawing (no HTML-to-PDF pipeline, no headless browser). **DOCX**: the `docx` npm package. Both already dependencies; no new rendering engine was introduced.
- **No admin resume-management UI exists** — confirmed again; nothing in `src/app/admin/` was touched, per §36.

## 2. Template architecture

New `src/lib/ai/resume-versions/templates/` subpackage, mirroring the existing `dynamic/` subpackage's own file-per-concern structure:

- **`template-schema.ts`** — `TemplateSettings` (Zod-validated: `templateId`, `accentColor`, `fontFamily`, `fontSize`, `spacing`, `atsMode`, `pageLength`), all from small, closed enums (never free-form input), plus `TemplateDefinition` (the shape each of the 5 templates fills in).
- **`template-registry.ts`** — `TEMPLATE_REGISTRY: Record<TemplateId, TemplateDefinition>`, the single source of truth for the 5 templates' names, descriptions, layouts, and intrinsic visual flavor (header alignment, section-heading style).
- **`template-styles.ts`** — `resolveTemplateStyles(settings): ResolvedTemplateStyles`, the ONE function every renderer (React preview, PDF, DOCX) calls to turn a `TemplateSettings` value into concrete presentation values (accent hex, font stacks/PDF fonts/DOCX font name, point sizes, spacing multipliers, effective layout). This is the architectural seam described in §8: `Resume Data → resolveTemplateStyles() → Preview / PDF / DOCX`, with zero Tailwind classes or visual styling ever stored in `DynamicResumeDocument` itself.

```
Resume Data (DynamicResumeDocument, template-independent)
        │
        ▼
prepareForRender() + getEntryPresentation()   (content, unchanged from Milestone 13)
        │
        ▼
resolveTemplateStyles(TemplateSettings)       (presentation, new this milestone)
        │
   ┌────┼─────────────┬───────────────┐
   ▼    ▼              ▼               ▼
Preview PDF          DOCX          Markdown/TXT (no visual concept — content only)
```

## 3. Supported templates

Five distinct, original layouts (no third-party UI/assets/branding copied):

| Template | Layout | Header | Section heading style | Default accent / font | ATS friendliness |
|---|---|---|---|---|---|
| **Modern** | Single-column | Left | Accent left-border | Blue / Inter | High |
| **Executive** | Single-column | Centered | Centered divider | Navy / Georgia | High |
| **Classic** | Single-column | Left | Underline | Black / Times New Roman | High |
| **Minimal** | Single-column | Left | Plain caps | Gray / Helvetica | High |
| **Technical** | Two-column (sidebar) | Left | Accent left-border | Blue / Inter | Medium (High once ATS Mode collapses it) |

Every field a template needs beyond the 4 single-column layouts came from a genuine visual differentiator (header alignment + section-heading treatment), not just recoloring the same layout 5 times.

## 4. Theme system (§9–§12)

A deliberately small, closed control set — never an arbitrary color picker or free-text font/size input, so a user cannot accidentally produce a broken or unprofessional layout:

- **Accent color** — 6 presets (Blue, Navy, Green, Purple, Black, Gray), each hex value chosen for safe contrast against a white page (`ACCENT_HEX` in `template-styles.ts`). No pastels, no gradients, no rainbow resumes.
- **Font family** — 5 options (Inter, Arial, Helvetica, Georgia, Times New Roman).
- **Font size** — Compact / Standard / Large, a fixed 3-step point-size scale (`FONT_SIZE_SCALE`).
- **Spacing** — Compact / Standard / Spacious, a fixed 3-step multiplier applied to section/entry gaps.

## 5. Font system (§10)

Two independent mappings from the same 5 `FontFamily` options, because PDF and DOCX have fundamentally different font guarantees:

- **PDF** (`PDF_FONT_MAP`) maps every option onto one of pdfkit's **14 standard, always-embedded** fonts (Helvetica/Helvetica-Bold for Inter/Arial/Helvetica; Times-Roman/Times-Bold for Georgia/Times New Roman) — never a font that could be missing at render time in a serverless environment.
- **DOCX** (`DOCX_FONT_NAME`) passes the real font name straight through — Word's own designed behavior is to substitute an installed font if the named one is missing, so no remapping is needed or wanted there.
- **Web preview** (`WEB_FONT_STACKS`) uses real CSS font stacks with system-safe fallbacks.

## 6. ATS-friendly mode (§21)

`atsMode: boolean` is a pure **rendering configuration** on `TemplateSettings` — never a second resume data model. `resolveTemplateStyles()` is the one place it takes effect: when `atsMode` is true, the "technical" template's `layout` is reported as `"single-column"` (collapsing the sidebar) regardless of its registry default, and `atsFriendliness` is reported as `"high"` to match. Every renderer reads only the *resolved* layout, never the registry's raw layout, so this collapse is automatic and can never be bypassed by a renderer accidentally reading the wrong field.

## 7. Dynamic section rendering in every template (§6–§7)

Every renderer — React preview, PDF, DOCX — still walks `prepareForRender(document)`'s output generically; none of them have any hard-coded knowledge of "Experience" or "Education." `getEntryPresentation()` (built in Milestone 13, reused unchanged here) is what makes a `CUSTOM` section with zero registry fields still render with a proper heading + body instead of a flat field dump — verified this milestone with real generated output (§20) showing "PROFESSIONAL HIGHLIGHTS" rendering correctly across all 5 templates.

## 8. Two-column ("technical") template layout rule (§20)

Documented explicitly, per the milestone's own "if a template requires layout rules, document them clearly" instruction:

- Sidebar section types (`sidebarSectionTypes` on the `technical` `TemplateDefinition`): `SKILLS, LANGUAGES, CERTIFICATIONS, EDUCATION, INTERESTS, TRAINING, COURSES`. Every other visible section renders in the main column.
- **Within each column, ordering is always the user's own** — the two-column split itself is the only thing the layout imposes; it never reorders sections relative to each other within a column.
- **PDF-specific pagination rule**: the sidebar renders once, on page 1 only, alongside the main column. If the main column's content needs to continue past page 1, subsequent pages render the remaining main-column content at full page width — the sidebar is not repeated. This avoids ever clipping or overlapping sidebar content against a page break.
- **DOCX**: implemented as a single borderless one-row, two-column table (sidebar cell + main cell) — the standard technique for a resume sidebar in Word, which reflows across pages natively without needing the PDF's special-case pagination rule. Exact pixel-for-pixel parity with the PDF isn't possible in a flowing `.docx`; this maintains professional **structural** equivalence instead, per §29's own explicit allowance.
- **Live preview**: a CSS grid two-column layout — since it's a continuous scroll view rather than a fixed-size page, it has no equivalent of the PDF's "sidebar only on page 1" pagination workaround.

## 9. Page-break handling (§23)

Implemented in the PDF renderer only (the format with real, fixed-size pages): before drawing a section heading or any individual entry, `renderSectionsInColumn()` estimates its height with pdfkit's own `heightOfString()` and starts a new page first if it wouldn't fit in the remaining space. This keeps a heading from being orphaned at the bottom of a page and keeps a single entry from being split mid-block. Sections themselves are **not** made unbreakable — a section with many entries can still span multiple pages entry-by-entry, which is what avoids large blank areas (the milestone's own explicit warning against making every section unbreakable).

## 10. Page length (§24)

`pageLength: "auto" | "one" | "two"` is persisted as a `TemplateSettings` field and surfaced in the Resume Quality panel as an informational check/warning (§11 below) — it never triggers silent content deletion. Actually constraining rendered output to exactly N pages would require either truncating content (explicitly forbidden) or a much more invasive re-layout engine; this milestone implements the honest, non-destructive half of the requirement (persisted preference + warning) rather than a fabricated one-page-guarantee.

## 11. Resume Quality panel (§25)

New pure function `checkResumeQuality(document, resolvedStyles)` (`dynamic/resume-quality.ts`, exported from the `dynamic` barrel, covered by its own test file) — **never blocks export**. Real, verifiable checks only (no fabricated "consistent dates" check that would require date-format validation this codebase doesn't have):

- No empty visible sections (a section left visible that renders zero content).
- No very-thin sections (rendered character count under a small threshold).
- Contact information complete (email + phone present).
- ATS-friendly structure (reads `resolvedStyles.atsFriendliness` directly — the exact same rendering-characteristic value the Download panel's badge uses, never a separate/duplicated notion).
- Fits within 2 pages (a rough character-count-based page estimate, always disclosed as an estimate).

## 12. Live preview (§22)

`ResumePreview` now accepts an optional `templateSettings` prop and calls the exact same `resolveTemplateStyles()` every export renderer uses. `ResumeBuilder.tsx` keeps `document` and `templateSettings` as sibling pieces of local state; every content mutation and every template/design change updates one of them, and the preview re-renders from whichever changed — no page reload, no distinction in the preview's behavior based on which tab produced the change.

## 13. PDF architecture (§28)

Unchanged pipeline (`DynamicResumeDocument → prepareForRender()/getEntryPresentation() → pdfkit drawing`), now parameterized by `resolveTemplateStyles(templateSettings)` for every color/font/size/spacing/layout decision. No separate hard-coded PDF resume was built. Verified this milestone (§20) to produce selectable, correctly-ordered, correctly-margined text with no clipping/overlap and appropriate page breaks for a realistic multi-entry resume.

## 14. DOCX architecture (§29)

Same principle — `resolveTemplateStyles()` drives font/size/color choices; the sidebar layout is a borderless table for structural (not pixel) parity with the PDF's two-column layout, per §29's own explicit allowance for that distinction.

## 15. Download format selector (§30)

`DownloadMenu.tsx` offers exactly the 4 formats the export route actually implements: **PDF, DOCX, Markdown, TXT**. TXT is a genuinely new renderer (`dynamic-resume-txt.ts`) — plain text, no markup, built on the same `prepareForRender()`/`getEntryPresentation()` pipeline as every other format — not a relabeled copy of the Markdown output. Markdown and TXT deliberately do **not** accept `TemplateSettings` at all (removed during this milestone after initially adding it): plain text has no color/font/spacing/layout concept for a template to change, so a parameter that could never affect output was removed rather than kept as unused dead weight.

## 16. ATS indicator (§31)

The `DownloadMenu`'s badge ("ATS Friendly ✓" / "ATS Compatibility: Medium") is derived directly from `resolvedStyles.atsFriendliness` — a rendering-characteristic label (single-column vs. sidebar, after ATS-mode collapse), **never** a number and **never** derived from or confused with the existing, wholly separate content-based ATS Score feature (`resume-score.ts`).

## 17. Backward compatibility & the export-route fix (§18)

The export route's legacy branch (§1's audit finding) is retired. Every export now always calls `resumeVersionService.getDynamicDocument()` (the lazy fallback, already built and tested in Milestone 13, that derives an equivalent `DynamicResumeDocument` from any pre-existing `resume_data`) and `getTemplateSettings()` (falling back to `DEFAULT_TEMPLATE_SETTINGS`). Content is fully preserved for every existing version; the only behavioral change is that all exports now render through one template-aware pipeline instead of silently splitting between two, which is exactly what §28/§29's "do not build a separate hard-coded PDF/DOCX resume" requires — the legacy hard-coded jd-match export files themselves are untouched and still used by their own unrelated, separate `/api/ai/resume/jd-match/[jdMatchId]/export` route.

## 18. Persistence (§27)

One additive, nullable JSONB column, `resume_versions.template_settings` (migration `20260812000000_add_resume_versions_template_settings.sql`) — a sibling of `sections_data`, never merged into it, keeping resume content and presentation settings independently persisted per §2's architecture rule. `getTemplateSettings()`/`saveTemplateSettings()` (partial-merge PATCH semantics, exactly like `updateSection`'s own settings patch from Milestone 13) are the only two access points; `duplicateVersion()` carries a source's `templateSettings` over to its copy (§26's "switching templates must never modify content" extends naturally to "duplicating a version keeps its template too").

## 19. AI compatibility (§35, §26)

Verified structurally: `applyJdOptimization()` and `saveRewrittenSections()` each call Supabase `.update()` with an explicit column list that has never included `template_settings` — an AI-driven content operation is architecturally incapable of touching template settings, not merely disciplined not to. The same is true in reverse: none of the template-settings methods ever touch `sections_data`. Resume Parser, ATS Engine, and JD Matching all continue to read/write the same canonical `Resume`/`DynamicResumeDocument` models, completely unaware that template settings exist.

## 20. Real PDF/DOCX quality verification performed (§40)

A temporary, uncommitted Node/TypeScript script (`_tmp_pdf_quality_check.ts` + a `pdf-parse`-based text-extraction check, both deleted before finishing; `pdf-parse` was already a pre-existing project dependency, not newly added) generated real PDFs/DOCX for a realistic test resume (6 experience entries, projects, education, skills, certifications, languages, one explicitly hidden section, and one `CUSTOM` section with custom fields) across all 5 templates and verified, via actual text extraction:

- Every PDF is a valid `%PDF-` file with selectable (non-image) text.
- The explicitly hidden section's title **never** appears in any template's output.
- Every experience entry (including the 6th/last one) is present — no content silently dropped.
- The `CUSTOM` section renders its heading and custom-field content correctly in every template.
- Page counts were reasonable (2–3 pages for genuinely heavy content) — no runaway blank pages.
- ATS-mode correctly produces a renderable PDF for the "technical" template with its sidebar collapsed.
- The generated `.docx` is a valid ZIP/OOXML file; unzipping and inspecting `word/document.xml` directly confirmed the same content/ordering/hidden-section guarantees for the sidebar (table-based) layout.

## 21. Files added

```
src/lib/ai/resume-versions/templates/template-schema.ts
src/lib/ai/resume-versions/templates/template-registry.ts
src/lib/ai/resume-versions/templates/template-styles.ts
src/lib/ai/resume-versions/templates/index.ts
src/lib/ai/resume-versions/templates/template-registry.test.ts
src/lib/ai/resume-versions/templates/template-styles.test.ts
src/lib/ai/resume-versions/dynamic/export/dynamic-resume-txt.ts
src/lib/ai/resume-versions/dynamic/resume-quality.ts
src/lib/ai/resume-versions/dynamic/resume-quality.test.ts
src/app/api/ai/resume/versions/[id]/template/route.ts
src/components/resume/builder/TemplateGallery.tsx
src/components/resume/builder/ThemeControls.tsx
src/components/resume/builder/DownloadMenu.tsx
src/components/resume/builder/ResumeQualityPanel.tsx
supabase/migrations/20260812000000_add_resume_versions_template_settings.sql
PHASE13_MILESTONE14_TEMPLATE_DESIGNER.md
```

## 22. Files modified

```
src/lib/ai/resume-versions/resume-version-types.ts          (+ template_settings/templateSettings fields)
src/lib/ai/resume-versions/resume-version-service.ts        (+ getTemplateSettings/saveTemplateSettings; createVersion/duplicateVersion carry the new column)
src/lib/ai/resume-versions/index.ts                          (+ export * from "./templates")
src/lib/ai/resume-versions/dynamic/index.ts                  (+ export * from "./resume-quality")
src/lib/ai/resume-versions/dynamic/export/index.ts            (+ export * from "./dynamic-resume-txt")
src/lib/ai/resume-versions/dynamic/export/dynamic-resume-pdf.ts    (template-aware colors/fonts/sizes/spacing, sidebar layout, page-break heuristics)
src/lib/ai/resume-versions/dynamic/export/dynamic-resume-docx.ts   (template-aware colors/fonts/sizes, sidebar-as-table layout)
src/app/api/ai/resume/versions/[id]/export/route.ts           (retired the legacy hard-coded branch — see §17; now always template-aware)
src/components/resume/builder/ResumePreview.tsx               (template-aware colors/fonts/sizes/spacing, sidebar layout)
src/components/resume/builder/ResumeBuilder.tsx                (+ Sections/Template/Design sub-tabs, template settings state + debounced persistence, Download menu + Quality panel wiring)
```

## 23. Files explicitly untouched

`ConversationService`, `Agent.run()`/`GraphState`/LangGraph topology, `PlannerService`, Tool Registry, Knowledge Pipeline/Knowledge Manager/RAG schema (including `rag_documents`/`rag_document_chunks` — confirmed, never referenced), the multi-agent architecture, the Resume Chatbot architecture, the live Phase 12 resume parser/schema, both ATS scorers' own computation logic, the JD-matching/rewrite engines' own computation logic (only their already-existing merge-output step interacts with `sections_data`, unchanged this milestone), `resume-enterprise/` (confirmed still unwired), authentication/authorization logic, the admin dashboard (no admin resume-management UI exists to extend), and all unrelated billing/analytics/interview/cover-letter/LinkedIn/recruiter UI. The unrelated jd-match export renderers (`jd-match/[jdMatchId]/export/*`) are untouched — only this route's *import* of them was removed, not the files themselves, since they remain in active use by their own separate route.

## 24. Validation

- `npm run lint` — 0 errors (1 pre-existing, unrelated warning about an `<img>` tag in a blog page).
- `npx tsc --noEmit` — 0 errors.
- `npm run build` — succeeds.
- `npx vitest run` — **219/219 tests passing** (20 new this milestone: template registry structure, `resolveTemplateStyles()`'s ATS-mode collapse/font-mapping/scale behavior, and `checkResumeQuality()`'s real, verifiable checks).
- Real generated-PDF/DOCX content verification performed and then discarded — see §20.
- API-level regression check (curl against a fresh `next start`): anonymous Resume Analyzer flow still `200`; the new `/template` GET/PATCH routes and the rewritten `/export` route all correctly return `401` when unauthenticated.
- `git status --short` reviewed — only files under `src/lib/ai/resume-versions/`, `src/components/resume/builder/`, the one new migration, and this doc changed; no unrelated feature was touched.

## Known limitations

1. **Interactive browser (click-through) testing was not performed.** As in the two preceding milestones, this Supabase project's PostgREST layer is still returning a stale-schema-cache error (`PGRST205`) for real SELECT/INSERT queries against `password_history`/`auth_sessions`/`security_events` — re-confirmed still present at the start of this milestone's testing — which blocks login/signup for any account, independent of anything in this milestone. Verification instead relied on the full automated test suite (219/219), a clean lint/tsc/build, curl-level confirmation of auth-gating and the unaffected anonymous flow, and — going further than the prior two milestones — **actual generated-PDF/DOCX content extraction and verification** (§20), which is the strongest evidence practical without a working login flow.
2. **`pageLength` is advisory, not enforced.** Setting it to "One Page" surfaces a warning in the Resume Quality panel if content is estimated to exceed one page; it does not truncate or auto-shrink content, per §24's explicit prohibition on silently deleting content.
3. **Template thumbnails in the gallery are a clipped, scaled-down live render**, not a distinct hand-designed thumbnail asset per template — an intentional choice per §4's "use the current resume data... do not create a completely separate fake resume for each template," at the cost of a less polished-looking card than a bespoke illustration would give.
4. **No true multi-page-aware live preview.** The on-screen preview is a continuous scroll view; only the PDF export enforces real page boundaries and page-break avoidance. This is called out explicitly in §8 above as a structural, not visual-parity, distinction between the two-column template's preview and its PDF/DOCX output.

## Recommended next milestone

Once the Supabase schema-cache issue clears: a manual click-through pass exercising every item in this milestone's own 37-step test list, in a real browser, with real screenshots of all 5 templates. Beyond that: (a) a true one-page auto-fit mode with explicit, user-visible content prioritization (rather than the current advisory-only page-length setting), (b) additional templates or per-template sidebar-section customization (letting a user choose which section types go in the "technical" template's sidebar, rather than the current fixed registry list), (c) hand-designed template thumbnail illustrations if the clipped-live-render cards prove insufficient once real users see them.
