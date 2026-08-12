# Phase 15 — Milestone 4: Professional Resume Template & Layout System

## 1. Objective

Give the Dynamic Resume Builder a professional, template-driven presentation layer: multiple templates, live preview, immediate switching with zero content mutation, persistence, and PDF/DOCX export — while reusing whatever already exists rather than rebuilding it.

## 2. Audit Findings

This milestone's audit produced the most lopsided result of the phase so far: **the entire system this spec asks for already exists**, built in Phase 13 Milestone 14 ("Enterprise Resume Template Designer"), well before this Phase 15 sequence began. Confirmed by reading every file the spec's own checklist names:

| Spec question | Finding |
|---|---|
| Does a template system already exist? | Yes — `templates/template-schema.ts`, `template-registry.ts`, `template-styles.ts` |
| Does a template registry already exist? | Yes — `TEMPLATE_REGISTRY`, one authoritative definition per template, no duplication across builder/preview/PDF/DOCX |
| Does template selection already exist? | Yes — `TemplateGallery.tsx`, wired into `ResumeBuilder.tsx`'s "template" tab |
| Is template metadata already persisted? | Yes — a nullable `template_settings` JSONB column on `resume_versions`, sibling to `sections_data`, via `getTemplateSettings`/`saveTemplateSettings` |
| Do preview and export share the same renderer? | Yes — `resolveTemplateStyles()` is the one function the React preview, PDF renderer, and DOCX renderer all call; content itself still flows through the same `prepareForRender()` from Milestones 1–3 |
| Are PDF/DOCX renderers already template-aware? | Yes — both read `ResolvedTemplateStyles` for fonts/colors/spacing/heading style/layout, confirmed by reading both files in full |
| Is there already a layout abstraction? | Yes — `layout: "single-column" | "sidebar"`, with `sidebarSectionTypes` for which section types go in a sidebar column |
| Is there already a default template? | Yes — `modern`, via `DEFAULT_TEMPLATE_SETTINGS` |

Also already true, confirmed by reading the code (not assumed):
- **Zero AI calls**: `saveTemplateSettings()` is a synchronous DB write; no LLM client is imported anywhere in the templates package.
- **No new version created on template switch**: `saveTemplateSettings()` updates the existing version row in place.
- **Content immutability**: `saveTemplateSettings()` only ever writes the `template_settings` column — never `sections_data`, `resume_data`, `ats_score`, or `jd_match_score`.
- **Ownership**: `saveTemplateSettings()` calls `getTemplateSettings()` → `getVersion()`, the same ownership check every other mutation in the service uses.
- **Unknown template rejection**: both `templateSettingsSchema` and `updateTemplateSettingsSchema` type `templateId` as `z.enum(TEMPLATE_IDS)` — an unregistered value is a 400 before it ever reaches the service.
- **No arbitrary CSS/HTML/component injection possible**: the client can only ever submit a `TemplateId` (one of 5, now 6, fixed strings) plus a closed set of accent/font/spacing enums — never a template definition itself, which lives only in server-side source.
- **Live thumbnail previews** (the spec's own "Preferred" approach, §7): `TemplateGallery.tsx` already renders each card's thumbnail via the real `ResumePreview` component fed the user's actual current document — not a static screenshot.
- **Hidden/empty sections, personal-info-only-if-present, section/entry order**: all already correctly handled, because every renderer (preview, PDF, DOCX) still funnels through Milestone 1–3's unmodified `prepareForRender()`.
- **ATS safety**: confirmed by reading `dynamic-resume-pdf.ts` — no images, no canvas, no icon-only content; every value is drawn as real selectable text via `doc.text()`.
- **Page-break handling**: the PDF renderer already estimates entry/heading height and starts a new page before an orphaned heading or a split entry — a page-break quality feature, already built, matching §26.

## 3. Genuine Gaps Found

Given how comprehensive the existing system was, this milestone's actual work was narrow:

1. **The "GCC Professional" template did not exist.** The spec names 5 templates; 4 already existed under matching names/concepts (Classic≈ATS Classic, Modern≈Modern Professional, Executive≈Executive, Technical≈Technical). GCC Professional was the one genuinely missing template.
2. **No test file existed for the PDF or DOCX export renderers at all**, despite both being template-aware since Milestone 14 — a real, if pre-existing, testing gap directly relevant to this milestone's explicit "Export" testing requirement (§37).
3. **Minor accessibility gap**: `TemplateGallery.tsx`'s "Use This Template" buttons had no template-specific `aria-label` — a screen reader scanning six identical-text buttons across cards can't tell them apart without one. The spec's own example (`"Select ATS Classic resume template"`) was used verbatim as the target phrasing.

Nothing else needed to change.

## 4. Files Added

- `src/lib/ai/resume-versions/dynamic/export/dynamic-resume-export.test.ts` (new)

## 5. Files Modified

- `src/lib/ai/resume-versions/templates/template-schema.ts` — added `"gcc"` to `TEMPLATE_IDS`.
- `src/lib/ai/resume-versions/templates/template-registry.ts` — added the `gcc` `TemplateDefinition`.
- `src/lib/ai/resume-versions/templates/template-registry.test.ts` — updated stale "exactly the 5" wording; added a GCC-specific assertion.
- `src/components/resume/builder/TemplateGallery.tsx` — added `aria-label`s to the select button; marked the decorative live-thumbnail region `aria-hidden`.
- `src/lib/ai/resume-versions/resume-version-service.test.ts` — added the Milestone 4 template-selection test suite.

## 6. Files Intentionally Untouched

`template-styles.ts`, `dynamic-resume-pdf.ts`, `dynamic-resume-docx.ts`, `dynamic-resume-render.ts`, `ResumePreview.tsx`, `ThemeControls.tsx`, `ResumeBuilder.tsx`, the `/template` route, `resume-version-service.ts`'s `getTemplateSettings`/`saveTemplateSettings` — all already correct, none needed a change for this milestone's requirements.

## 7. The New GCC Professional Template

```ts
gcc: {
  id: "gcc",
  name: "GCC Professional",
  description: "A conservative, single-column layout with a clean contact line and strong emphasis on experience — formatted for GCC/Middle East recruiter expectations.",
  layout: "single-column",
  recommendedFor: "UAE, Saudi Arabia, Qatar, Oman, Kuwait, and Bahrain applications",
  defaultAccent: "green",
  defaultFont: "arial",
  atsFriendliness: "high",
  headerAlign: "left",
  sectionHeadingStyle: "underline",
}
```

- `layout: "single-column"` and `atsFriendliness: "high"` per the spec's own "conservative… recruiter-friendly… ATS-friendly" description.
- `defaultAccent: "green"` and `defaultFont: "arial"` were chosen because they were the only accent color and font family not already used as any existing template's default — giving GCC Professional a genuinely distinct look in the gallery rather than visually duplicating an existing card.
- `sectionHeadingStyle: "underline"` reuses an existing, already-implemented value (shared with `classic`) rather than inventing a new style variant — consistent with "do not introduce unnecessary abstraction."
- Not claimed as endorsed by any company or platform, per the spec's explicit instruction — an original, application-authored layout like the other five.
- The default template remains `modern`, unchanged. Per the spec's own instruction ("Default: ATS Classic **unless the current application already has a different established default**"), `modern` was already Milestone 14's established default long before this milestone, so it was left as-is rather than switched — changing a long-standing default is a behavior change outside a template-addition milestone's scope.

## 8. Template Selection UI

Unchanged in structure — `TemplateGallery.tsx` already rendered the spec's requested card format (name, description, `recommendedFor`, live thumbnail, selected-state badge, action button) for every template in `TEMPLATE_LIST`, so the new GCC card appears automatically with zero additional UI code. Only the accessibility labeling (§3.3) was added.

## 9. Persistence

Unchanged — `template_settings` (nullable JSONB, sibling to `sections_data`), written only by `saveTemplateSettings()`, read (with a `DEFAULT_TEMPLATE_SETTINGS` fallback) by `getTemplateSettings()`. Existing resumes with no template selection continue to resolve to the `modern` default, exactly as before.

## 10. Preview

Unchanged — `ResumePreview.tsx` already resolves `templateSettings` via `resolveTemplateStyles()` for every render; `TemplateGallery.tsx`'s thumbnails reuse this exact component.

## 11. PDF Export

Unchanged — `renderDynamicResumePdf()` already resolves styles per-call and draws every section from `prepareForRender()`'s already-ordered, already-visibility-filtered, already-empty-section-dropped output. The new `gcc` template renders through this same unmodified code path (single-column, so it uses the simple one-region layout, not the sidebar branch).

## 12. DOCX Export

Unchanged — same reasoning as §11; `renderDynamicResumeDocx()` is equally template-parameterized and unmodified.

## 13. Dynamic Sections / Custom Sections

Unchanged and already correct — every renderer iterates `prepareForRender()`'s output, which includes any `CUSTOM` section type exactly like a built-in one; nothing in any renderer hard-codes a fixed list of sections.

## 14. Section & Entry Order Compatibility

Unchanged — `prepareForRender()` (Milestone 1) already sorts sections and entries by `.order` before any renderer sees them; no template applies its own ordering.

## 15. ATS Compatibility

Confirmed unaffected, both by design (a completely separate DB column, never read by `resume-score.ts`) and by a new explicit test: switching a version's template leaves `ats_score` byte-identical.

## 16. JD Compatibility

Confirmed unaffected the same way: a new test asserts `jd_match_score`/`matchedSkills` are untouched by a template switch, and that `computeJdMatchForResume` (the JD-optimizer's real LLM pipeline) is never called by it.

## 17. Security

- `templateId` is validated against `z.enum(TEMPLATE_IDS)` at both the route (`updateTemplateSettingsSchema`) and, redundantly-but-safely, inside `saveTemplateSettings()` itself (`templateSettingsSchema.parse()` on the merged result) — an unregistered id is rejected before ever reaching a renderer.
- No route accepts HTML, CSS, JS, a component name, or a renderer path — only the fixed enum values in `updateTemplateSettingsSchema`.
- No new authorization mechanism — same `requireUserId()` + service-layer ownership check as every other route.

## 18. Ownership

Unchanged — `saveTemplateSettings()`/`getTemplateSettings()` both route through `getVersion(userId, versionId)`, the one ownership check this service has always used. A new test confirms cross-user rejection (`ResumeVersionNotFoundError`).

## 19. Accessibility

- `TemplateGallery.tsx`'s select button: `aria-label={selected ? "{name} resume template is currently in use" : "Select {name} resume template"}` — matches the spec's own phrasing example.
- The live-thumbnail region is now `aria-hidden="true"`: it is a decorative, scaled-down re-render of the user's own resume content, already available elsewhere on the page — exposing its full text to screen readers again on every one of the six cards would be redundant noise, not new information. This is a genuine accessibility improvement (less clutter), not just a literal checklist match.
- Keyboard navigation and focus states were already free — every interactive element here was already a plain `<button>`.

## 20. Tests

11 new deterministic tests, all non-LLM:

- `template-registry.test.ts` (+1): the new `gcc` template's `layout`/`atsFriendliness`/`name`.
- `dynamic-resume-export.test.ts` (+4, new file): PDF and DOCX renderers each render successfully for **every** registered template (looping `TEMPLATE_IDS`, so the sidebar `technical` layout and the new `gcc` template are both exercised) producing a real, non-empty, correctly-signed buffer (`%PDF` / `PK` zip header); both also handle an all-hidden/all-empty document without throwing.
- `resume-version-service.test.ts` (+6): template switch leaves `resumeData`/`atsScore`/`jdMatchScore`/`matchedSkills`/`sectionsData` byte-identical and calls the JD pipeline zero additional times; switching twice never creates a second version; a version with no saved settings resolves to the `modern` default; an unregistered `templateId` is rejected; cross-user access is rejected; a template switch is allowed on the Master Resume (a deterministic, non-AI, presentation-only edit, consistent with the same reasoning `updateSection`'s settings patch already established).

## 21. Validation Results

| Command | Result |
|---|---|
| `npx vitest run` | **559/559 passing** (up from the Milestone 3 baseline of 548; +11 new tests, 0 regressions, 47/47 test files) |
| `npx tsc --noEmit` | Clean, 0 errors |
| `npm run lint` | 0 errors, 1 pre-existing unrelated warning (`no-img-element`) — unchanged |
| `npm run build` | `✓ Compiled successfully` |

## 22. Live Validation

Started a production server and probed the template route directly, without authentication:

- `GET /api/ai/resume/versions/[id]/template` (no auth) → `401`
- `PATCH /api/ai/resume/versions/[id]/template` with an invalid `templateId` (no auth) → `401`

Both confirm auth is checked before validation ever runs — consistent with every other route in this phase.

**What was not live-tested**: an authenticated click-through (select each template, confirm the preview updates, export PDF/DOCX per template, refresh and confirm persistence, reorder a section and confirm the template still respects it, run ATS/JD-match and confirm scores are unaffected). Same pre-existing Supabase auth/schema-cache limitation as every prior milestone in this phase — reported honestly rather than assumed. The underlying behavior (content immutability, score stability, zero LLM calls, ownership, rejection of unknown ids, and rendering success for every template including the new one) is instead established by the 11 new tests in §20, which exercise the same service and renderer functions the UI calls.

## 23. Database Changes

None. `template_settings` already existed (Milestone 14); no migration was needed to add a template that lives entirely in application-level `TEMPLATE_REGISTRY` source, not the database.

## 24. Known Limitations

- Authenticated end-to-end live testing remains blocked by the pre-existing Supabase limitation (§22).
- Pixel-perfect visual parity between PDF and DOCX for the sidebar (`technical`) layout is not attempted — DOCX uses a borderless table for structural equivalence instead, a pre-existing, documented, and correct design decision from Milestone 14, unchanged here.
- No golden-file/binary-content assertions exist for PDF/DOCX output (only "renders without throwing, produces a well-formed non-empty buffer") — the project has no existing PDF-text-extraction or DOCX-XML-inspection test tooling, and adding one solely for this milestone's test coverage would itself be a new dependency, which the spec explicitly discourages. Documented rather than worked around.

## 25. Recommended Next Milestone

A user-facing "Download as PDF/DOCX" preview-per-template affordance directly inside `TemplateGallery.tsx`'s cards (currently export only happens from the separate `DownloadMenu`, using whatever template is currently *saved*, not necessarily the one being looked at in the gallery) — small, UI-only, no new architecture, and a natural next step now that every template is confirmed to export correctly.
