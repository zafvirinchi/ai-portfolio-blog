# Phase 15 — Milestone 5: Advanced Resume Formatting & Controlled Template Customization

## 1. Objective

Extend the existing template system so users can customize presentation (font, color, spacing, margins, page size) while keeping resume content, ordering, ATS score, and JD match completely stable — reusing whatever already exists rather than rebuilding it.

## 2. Audit Findings

Milestone 4 already established that the template system originated from Phase 13 Milestone 14. This milestone's audit confirmed that customization itself — not just template selection — was already substantially built:

| Spec question | Finding |
|---|---|
| Font selection | Already exists — `FONT_FAMILIES` (5 options), `ThemeControls.tsx`'s Font Family `<select>` |
| Font size | Already exists — `FONT_SIZES` (compact/standard/large), a `SegmentedControl` |
| Accent color | Already exists — `ACCENT_COLORS` (6 options), swatch buttons with checkmarks |
| Text/secondary/muted colors | Not user-configurable, and correctly so — every renderer derives these from a fixed, safe palette (`#111827`/`#374151`/`#6b7280`), not from user input; only the accent is themeable |
| Spacing/density | Already exists — `SPACING_OPTIONS` (compact/standard/spacious) |
| Page margins | **Did not exist** — the PDF renderer hardcoded `PAGE_MARGIN = 50`; DOCX used the `docx` library's implicit default |
| Page size (A4/Letter) | **Did not exist** — neither renderer set an explicit page size |
| Section heading style / layout density | Already exists as template-intrinsic properties (`sectionHeadingStyle`, `layout`), correctly not user-overridable independent of template choice |
| Customization panel UI | Already exists — `ThemeControls.tsx`, fully accessible (`role="group"`, `aria-pressed`, labeled selects) |
| Server-side validation | Already exists — every option is a closed Zod enum (`z.enum(...)`), rejecting anything else with a 400 |
| Ownership | Already exists — `saveTemplateSettings()` routes through the same `getVersion()` check every other mutation uses |
| Content/ATS/JD stability | Already true by construction — `template_settings` is a completely separate DB column from `resume_data`/`sections_data`/`ats_score`/`jd_match_score`, confirmed in Milestone 4 |
| Reset Design | **Did not exist** — no way to restore a template's own defaults after customizing |

## 3. Genuine Gaps Found

1. **No margin control.** The PDF renderer's page margin was a fixed constant; DOCX had no explicit margin at all.
2. **No page size control.** Neither renderer let the user choose A4 vs. Letter.
3. **No "Reset Design" action.**
4. **A real backward-compatibility bug this milestone's own schema change would otherwise introduce**, found during implementation, not in the original spec: `resume-version-service.ts`'s `getTemplateSettings()` returned the raw stored `template_settings` JSONB value without re-validating it through `templateSettingsSchema`. Every field in that schema has a `.default(...)`, but a default only applies when Zod actually parses the value — simply returning the stored object bypasses that entirely. A resume whose `template_settings` was saved *before* this milestone added `margin`/`pageSize` would have neither key at all; every downstream lookup (`PDF_MARGIN_PT[settings.margin]`, etc.) would then receive `undefined` and the export would break. This is exactly the "existing resumes must continue working" failure mode Part 41 warns about, made concrete by this milestone's own change — so it had to be fixed as part of this milestone, not deferred.

## 4. Files Modified

- `src/lib/ai/resume-versions/templates/template-schema.ts` — added `MARGIN_OPTIONS`/`MarginOption`, `PAGE_SIZES`/`PageSize`; added `margin`/`pageSize` to both `templateSettingsSchema` and `updateTemplateSettingsSchema`.
- `src/lib/ai/resume-versions/templates/template-styles.ts` — added `PDF_MARGIN_PT`, `DOCX_MARGIN_TWIPS`, `PDF_PAGE_SIZE`, `DOCX_PAGE_SIZE_TWIPS` lookup tables; extended `ResolvedTemplateStyles` and `resolveTemplateStyles()`.
- `src/lib/ai/resume-versions/dynamic/export/dynamic-resume-pdf.ts` — replaced the hardcoded `PAGE_MARGIN` constant with `styles.pageMarginPt`; added `size: styles.pdfPageSize` to the `PDFDocument` constructor.
- `src/lib/ai/resume-versions/dynamic/export/dynamic-resume-docx.ts` — added `properties.page.size`/`margin` (resolved from `styles.docxPageSize`/`styles.docxMarginTwips`) to the `Document`'s section.
- `src/lib/ai/resume-versions/resume-version-service.ts` — `getTemplateSettings()` now parses the stored value through `templateSettingsSchema` instead of returning it raw (§3.4's fix).
- `src/components/resume/builder/ThemeControls.tsx` — added Margin and Page Size `SegmentedControl` rows; added a "Reset Design" button; added specific `aria-label`s to the accent swatches and the two new controls, matching the spec's own phrasing examples.
- `src/lib/ai/resume-versions/templates/template-registry.test.ts`, `template-styles.test.ts`, `dynamic-resume-export.test.ts`, `resume-version-service.test.ts` — extended with Milestone 5 tests.

## 5. Files Added

- `src/lib/ai/resume-versions/templates/template-schema.test.ts` (new — no schema-level test file existed before this milestone).

## 6. Files Intentionally Untouched

`template-registry.ts` (template definitions themselves — margin/pageSize are user settings, not template-intrinsic properties, so no per-template change was needed), `TemplateGallery.tsx`, `ResumePreview.tsx`, `dynamic-resume-render.ts`, `resume-score.ts`, `jd-matcher.ts`, `resume-version-route-helpers.ts` (no new error type was needed — Zod's existing `ZodError` → 400 mapping already covers every new rejection case).

## 7. Presentation Settings Architecture

Unchanged in shape — `TemplateSettings` (the one existing, centralized model) simply gained two more fields, `margin: MarginOption` and `pageSize: PageSize`, alongside the six that already existed. No second settings model was created. `PresentationSettings` from the spec's own conceptual sketch **is** `TemplateSettings` — reused, not duplicated.

## 8. Template Interaction

No per-template restriction logic was added. Every existing template already applies `accentColor`/`fontFamily`/`fontSize`/`spacing` uniformly (confirmed by re-reading `dynamic-resume-pdf.ts`/`dynamic-resume-docx.ts` — every renderer reads these off `ResolvedTemplateStyles`, never off the template definition itself), and the same is true for the two new fields — margin and page size have no template-specific meaning to disable. The one genuinely template-dependent property, `layout` (single-column vs. sidebar), was already handled correctly *before* this milestone: it's derived fresh from `getTemplateDefinition(newTemplateId)` on every `resolveTemplateStyles()` call, never carried over from the previous template, so switching from a sidebar template to a single-column one can never produce an invalid combination. Part 14/33's "disable unsupported options" and "don't carry incompatible settings across templates" concerns were therefore already satisfied by the existing architecture — nothing needed to change.

## 9. Font System

Unchanged — already a curated, closed 5-option set (`inter`/`arial`/`helvetica`/`georgia`/`times`), each mapped to both a real pdfkit standard font (§6's "must have fallback fonts" requirement) and a DOCX font name. No arbitrary font-family string is ever accepted.

## 10. Color System

Unchanged — a closed 6-color palette, each value pre-vetted for safe contrast against a white background (per `template-styles.ts`'s own existing comment). No raw CSS, hex input, or arbitrary color is ever accepted.

## 11. Spacing System

Unchanged — a closed 3-option scale, already used by both renderers.

## 12. Margin System (new)

Three controlled presets — `narrow` (36pt / 720 twips), `normal` (50pt / 1440 twips), `wide` (72pt / 2160 twips) — never an arbitrary numeric value. `normal` was deliberately defined to match the PDF renderer's own pre-existing hardcoded constant and the `docx` library's own standard 1-inch default exactly, so a version that has never touched this setting (the default, and every pre-Milestone-5 saved version) renders byte-identically to before.

## 13. Page Size (new)

Two options — `letter` (12240×15840 twips / pdfkit's `"LETTER"`) and `a4` (11906×16838 twips / pdfkit's `"A4"`) — standard, well-known dimensions, not computed or guessed. `letter` is the default, matching both renderers' prior implicit behavior.

## 14. Layout

No change. Layout (single-column vs. sidebar) remains entirely template-intrinsic, as it already was; `atsMode` (pre-existing) continues to be the one lever that collapses a sidebar template to single-column. No independent "layout" override field was added — the spec's own Part 13 permits reusing existing capability rather than inventing a redundant one, and an independently user-settable layout would risk producing combinations (e.g. "sidebar" forced on a template with no `sidebarSectionTypes`) the trusted renderer was never designed to handle.

## 15. Persistence

No schema/table change — `margin`/`pageSize` live inside the existing `template_settings` JSONB column, the same column every other presentation setting already used. A migration was not needed because JSONB columns don't require a schema migration to gain new keys; the only change needed was the `getTemplateSettings()` re-parse fix (§3.4) so old rows resolve the two new keys to their defaults instead of `undefined`.

## 16. Security

- `margin`/`pageSize` are validated the same way every other presentation field already is: `z.enum(...)` at both the route (`updateTemplateSettingsSchema`) and the service layer (`templateSettingsSchema.parse()` on the merged result).
- New tests confirm a script-injection payload (`"<script>alert(1)</script>"`, `"javascript:alert(1)"`) in place of a valid enum value is rejected the same as any other invalid string — there is no code path where an enum-typed field's raw string value ever reaches a renderer or a URL/attribute.
- No new authorization mechanism.

## 17. Ownership

Unchanged — `saveTemplateSettings()`/`getTemplateSettings()` continue to route through `getVersion(userId, versionId)`.

## 18. Accessibility

- Added `optionAriaLabel` support to the shared `SegmentedControl` component (backward compatible — existing callers that don't pass it are unaffected) and used it for the two new controls: `"Select Narrow margin"`, `"Select A4 page size"`, etc., matching the spec's own phrasing.
- The accent-color swatches' `aria-label` was upgraded from just the color name (`"Navy"`) to `"Select Navy accent color"`, per Part 36's literal example.
- The new "Reset Design" button has its own `aria-label`.
- All existing keyboard-navigable, focus-visible `<button>`/`<select>` patterns were reused — no new interaction pattern was introduced.

## 19. Preview

No change — `ResumePreview.tsx` already resolves the full `TemplateSettings` object (now including the two new fields) through the same `resolveTemplateStyles()`; margin/page-size do not currently have a distinct visual effect in the React preview (a live web page isn't paginated the way a PDF/DOCX is), which is expected and consistent with how `atsMode`'s layout-collapse is the only setting with a preview-visible page-geometry effect.

## 20. PDF

`renderDynamicResumePdf()` now sources both the page margin and page size from `ResolvedTemplateStyles` instead of a hardcoded constant and an unset (pdfkit-default) size, respectively — the one and only change to this renderer's construction call.

## 21. DOCX

`renderDynamicResumeDocx()` now sets `sections[0].properties.page.size`/`margin` from the same resolved values. This is the first place this renderer has ever configured page geometry explicitly; previously it relied entirely on the `docx` library's own defaults (which happen to equal this milestone's `normal`/`letter` defaults, preserving prior output exactly).

## 22. ATS Compatibility

Unaffected — confirmed by a new test asserting `ats_score` is byte-identical before and after a `margin`/`pageSize` change (the deterministic scorer only ever reads `resume_data`, a column this change never touches).

## 23. JD Compatibility

Unaffected — a new test asserts `jd_match_score`/`matchedSkills` are untouched and `computeJdMatchForResume` (the JD pipeline's real LLM call) is invoked zero additional times by a presentation-only save.

## 24. Content Immutability

Confirmed unaffected two ways: by construction (a completely separate DB column, as established in Milestone 4), and by an explicit new test comparing `resumeData`/`sectionsData` before and after a `saveTemplateSettings()` call with new field values.

## 25. Database Changes

None. `template_settings` (JSONB, added in Phase 13 Milestone 14) accepts the two new keys without a migration; `getTemplateSettings()`'s re-parse fix (a code change, not a schema change) is what makes old rows resolve correctly.

## 26. Tests

19 new deterministic tests, all non-LLM:

- `template-schema.test.ts` (+9, new file): default values include the new fields; parsing a legacy (pre-Milestone-5-shaped) object fills in correct defaults; unregistered `margin`/`pageSize`/`accentColor` rejected; script-injection payloads rejected; partial-patch schema accepts/rejects correctly.
- `template-styles.test.ts` (+4): default margin/pageSize resolve to the renderers' exact former hardcoded values; every margin option maps to a distinct, increasing value in both units; `a4` resolves to correct dimensions; margin/pageSize never affect font/color/spacing resolution (independent axes).
- `dynamic-resume-export.test.ts` (+3): PDF renders successfully (valid `%PDF` signature) for every margin option and every page size option; DOCX renders successfully (valid `PK` zip signature) for every margin×pageSize combination.
- `resume-version-service.test.ts` (+6, in a new "Presentation settings" describe block): margin/pageSize persist and survive reload; the backward-compatibility fix is verified directly (a simulated legacy row resolves missing fields to defaults while preserving fields that did already exist); unregistered values rejected end-to-end; content/ATS/JD stability under a margin/pageSize change; a Reset-Design-equivalent patch restores exact template defaults.

## 27. Validation Results

| Command | Result |
|---|---|
| `npx vitest run` | **578/578 passing** (up from the Milestone 4 baseline of 559; +19 new tests, 0 regressions, 48/48 test files) |
| `npx tsc --noEmit` | Clean, 0 errors |
| `npm run lint` | 0 errors, 1 pre-existing unrelated warning (`no-img-element`) — unchanged |
| `npm run build` | `✓ Compiled successfully` |

## 28. Live Validation

Started a production server and probed the template route directly, without authentication:

- `PATCH /api/ai/resume/versions/[id]/template` with `{"margin":"extra-wide"}` (no auth) → `401`
- `PATCH /api/ai/resume/versions/[id]/template` with `{"fontFamily":"<script>alert(1)</script>"}` (no auth) → `401`

Both confirm auth is checked before validation, consistent with every route in this phase.

**What was not live-tested**: an authenticated click-through (change font/spacing/accent/margin/page size in the builder, confirm the preview and export reflect them, refresh and confirm persistence, click Reset Design and confirm defaults return, run ATS/JD-match and confirm scores are unaffected). Same pre-existing Supabase auth/schema-cache limitation as every prior milestone in this phase — reported honestly rather than assumed. The underlying behavior is instead established by the 19 new tests in §26, which exercise the same service, resolver, and renderer functions the UI calls, including the exact backward-compatibility scenario a real pre-Milestone-5 resume would hit.

## 29. Known Limitations

- Authenticated end-to-end live testing remains blocked by the pre-existing Supabase limitation (§28).
- Margin/page size have no visually distinct effect in the React live preview (only in PDF/DOCX export), since a scrolling web page isn't paginated the way an exported document is — consistent with how `atsMode`'s only preview-visible effect is a layout collapse, not a page-count change.
- No contrast-ratio calculation was added for accent colors (Part 9's "if practical, calculate contrast") — the existing palette is already pre-vetted by design (documented in `template-styles.ts` since Milestone 14) rather than checked at runtime; adding a runtime contrast calculator for a fixed, already-safe 6-color set would be complexity without a corresponding safety gain.
- No golden-file/binary-content assertions verify the exact rendered margin/page dimensions inside a PDF or DOCX buffer — consistent with Milestone 4's documented decision not to add new PDF-text-extraction/DOCX-XML-inspection tooling; tests confirm successful, well-formed rendering for every option instead.

## 30. Recommended Next Milestone

A small "presentation settings summary" badge in the builder header (e.g. "Executive · Navy · A4") so the currently-active combination is visible without opening the Design tab — UI-only, no new architecture, and a natural finishing touch now that the full settings surface (template, font, size, color, spacing, margin, page size, ATS mode) is complete.
