# Phase 15 — Milestone 6: Professional Resume Preview, Pagination & Page-Layout Quality

## 1. Objective

Improve pagination and layout quality across the Resume Builder preview, PDF, and DOCX outputs, reusing the existing rendering pipeline rather than building a new one.

## 2. Existing Layout Architecture

Confirmed by reading every renderer in full before changing anything:

- **One shared content pipeline**: `prepareForRender()` (visible sections/entries only, sorted by order, empty ones dropped) and `getEntryPresentation()`/`formatFieldValue()` are the single source every renderer (React preview, PDF, DOCX) already draws from — established since Milestone 1, unmodified here.
- **One shared style pipeline**: `resolveTemplateStyles()` — established since Milestone 14, extended in Milestones 5–6.
- **PDF page-break avoidance already existed**: `renderSectionsInColumn()` already estimates heading/entry height via `heightOfString()` and starts a new page *before* drawing if it wouldn't fit — keeping headings from being orphaned and entries from splitting mid-block (§3/§4's core ask). This was already correct and needed no change.
- **DOCX already relies on Word's native table/paragraph reflow** — no manual page-break logic exists or was needed there.
- **Margin/page size (Milestone 5) already flowed into PDF/DOCX** — but, discovered in this milestone's audit, **not into the preview at all**.

## 3. Genuine Gaps Found

### 3.1 A real bug: sidebar overflow could corrupt the main column's position (PDF)

Tracing the "technical" template's sidebar-then-main-column drawing logic against §11's "verify page transitions behave predictably" turned up a concrete, previously-unnoticed defect:

```ts
const columnsTopY = doc.y;
renderSectionsInColumn(doc, sidebarSections, { x: ..., width: sidebarWidth }, styles); // no onPageBreak
doc.y = columnsTopY; // ← unconditional
renderSectionsInColumn(doc, mainSections, { x: ..., width: mainWidth }, styles, onPageBreak);
```

If the sidebar's *own* content (e.g. a long Skills/Certifications list) was long enough to overflow page 1, pdfkit's own `.text()` calls had already auto-paginated internally during the sidebar render (confirmed by reading pdfkit's `LineWrapper.nextSection()`, which calls `document.continueOnNewPage()` whenever no explicit `height` is given — exactly how this renderer calls `.text()`). The code would then unconditionally reset `doc.y` back to `columnsTopY` — a Y coordinate that made sense on page 1 — while `doc` was by then already on page 2+. The main column would start drawing at that stale position on the wrong page, overlapping whatever the sidebar's overflow had just drawn there.

**The fix**: track `doc.bufferedPageRange().count` before and after the sidebar render. If it grew, the main column continues from wherever the document currently is, at full page width (the same rule the main column's *own* overflow already used) — it never jumps backward. Verified with a new test rendering 40 sidebar entries (guaranteed to overflow one page) and confirming the output is a valid, multi-page PDF.

### 3.2 No page numbers (§21)

Neither renderer had any header/footer or page numbering. Both libraries support this cleanly with their own standard, documented features — not a new pagination system:
- **PDF**: pdfkit's own `bufferPages: true` + `bufferedPageRange()` + `switchToPage()` pattern (its documented way to stamp "X of Y" once the true final count is known). Only added when there's more than one page — a one-page resume gets no footer.
- **DOCX**: the `docx` library's own `Footer` + `PageNumber.CURRENT`/`PageNumber.TOTAL_PAGES` fields, resolved by Word itself at open-time.

### 3.3 Preview never reflected margin or page size (§22 — "one of the most important requirements")

`ResumePreview.tsx` used a fixed `p-8` Tailwind padding and no page-shaped width at all, regardless of the Margin/Page Size settings Milestone 5 added. Changing "Margin: Wide" or "Page Size: A4" had **zero visible effect** in the live preview, even though both already drove real PDF/DOCX output — a direct violation of "the user should see approximately the same layout in Preview and PDF." (This was even flagged as a known limitation in Milestone 5's own documentation — it's fixed now, not merely re-documented.)

### 3.4 No word-break protection in the preview (§9/§10)

Investigated whether long unbroken tokens (URLs, long company/technology names) could overflow a page — and found the answer differs by renderer:
- **PDF**: verified pdfkit already force-wraps a long unbroken word within its column width (read `LineWrapper.eachWord`'s explicit character-level splitting fallback, then confirmed empirically: `heightOfString()` on a 190-character unbroken URL in a 200pt column returns a ~7-line wrapped height, not a single overflowing line). **Confirmed non-gap** — no PDF change needed.
- **DOCX**: Word wraps long unbroken text natively; nothing in this renderer disables that. **Confirmed non-gap.**
- **Preview (browser)**: CSS does **not** auto-break long unbroken words by default. This *was* a real gap — a long unbroken URL or company name could overflow the (now page-width-constrained) preview container sideways.

## 4. Files Modified

- `src/lib/ai/resume-versions/dynamic/export/dynamic-resume-pdf.ts` — sidebar-overflow fix (§3.1); page-number footer (§3.2).
- `src/lib/ai/resume-versions/dynamic/export/dynamic-resume-docx.ts` — page-number footer (§3.2).
- `src/lib/ai/resume-versions/templates/template-styles.ts` — added `previewMarginPx`/`previewPageWidthPx` resolved values.
- `src/components/resume/builder/ResumePreview.tsx` — reflects margin/page size visually; `break-words` added to every text node that could contain a long unbroken token.
- `src/lib/ai/resume-versions/dynamic/export/dynamic-resume-export.test.ts`, `src/lib/ai/resume-versions/templates/template-styles.test.ts`, `src/lib/ai/resume-versions/resume-version-service.test.ts` — extended with Milestone 6 tests.

## 5. Files Intentionally Untouched

`dynamic-resume-render.ts` (`prepareForRender`/`getEntryPresentation` — already correct, confirmed by re-reading), `resume-score.ts`, `jd-matcher.ts`, `resume-version-route-helpers.ts` (no new API surface, no new error type needed), `template-registry.ts`, `TemplateGallery.tsx`.

## 6. Pagination Behavior

Unchanged in strategy, one bug fixed: sections are never made unbreakable (a section with many entries can still span pages, entry by entry — avoiding the large-blank-area problem §24 warns about); headings stay with their first entry or move to the next page; entries are kept together where they fit, and an entry too large to fit *any* page safely flows across multiple pages on its own via pdfkit's built-in auto-pagination (verified, not newly built). The one change is the sidebar-column fix in §3.1.

## 7. Section-Break Strategy

Unchanged, confirmed correct by re-reading `renderSectionsInColumn()`: estimates `heading + first entry` height before drawing a heading, page-breaking first if it wouldn't fit — so a heading can never be stranded alone at the bottom of a page.

## 8. Entry-Break Strategy

Unchanged, confirmed correct: an entry's full height is estimated before drawing; if it doesn't fit in the remaining space, a new page starts first, so entries are never split mid-block by this renderer's own logic. If a single entry is taller than one whole page, pdfkit's own internal auto-pagination (not this renderer's logic) safely flows it across pages — verified by reading pdfkit's `LineWrapper.nextSection()`.

## 9. Long-Content Handling

Verified (not newly built) that PDF and DOCX already handle long summaries, long bullet lists, long descriptions, and long unbroken tokens (URLs, long company/technology names) without overflow, truncation, or crashes — see §3.4. The preview's word-break gap was fixed.

## 10. Dynamic Sections

Unchanged — every renderer still iterates `prepareForRender()`'s output generically; nothing assumes a fixed set of section types. A regression test with a CUSTOM section is included in the existing representative-document fixture.

## 11. Empty Sections

Unchanged, confirmed correct: `prepareForRender()` already drops a section entirely once it has zero renderable entries — no blank heading is ever produced.

## 12. Optional Fields

Unchanged, confirmed correct: `renderableFieldsFor()` already filters out empty/undefined fields before a line is ever constructed, so no "undefined"/"null"/empty-bullet artifacts can reach any renderer.

## 13. URL Handling

Long URLs render as plain, selectable text (no display-text/canonical-URL substitution was implemented — the spec permitted this "where the existing renderer supports it," and the existing renderer has no such link-text abstraction; adding one would be new functionality, not a layout fix). Overflow is handled per §3.4/§9.

## 14. Column/Sidebar Handling

The one genuine defect (§3.1) is fixed. Column width overflow (long content within a narrow sidebar column) was already correctly handled — `region.width` is passed to every `.text()` call, and pdfkit already wraps within it.

## 15. A4 / 16. Letter

Both already worked (Milestone 5); now also visually distinguishable in the preview (§3.3). New tests render every template against both page sizes.

## 17. Margins

Already worked in PDF/DOCX (Milestone 5); now also reflected in the preview (§3.3).

## 18. Typography / 19. Spacing

Unchanged — already validated in Milestone 5; re-confirmed here to not interact badly with the page-break estimation (which already uses the live `styles.sizes`/`styles.spacing` values, not hardcoded ones).

## 20. Header / Contact Area

Unchanged and already correct: the contact line already only joins present values (`.filter(Boolean)`); the header's own text is now also `break-words`-protected in the preview.

## 21. Page Header / Footer

Page numbers added — see §3.2. No page header (beyond the resume's own name/contact block, which already serves that role) was added; not requested.

## 22. Preview vs. PDF Consistency

The most significant fix in this milestone — see §3.3. Section order, entry order, fonts, spacing, colors, and now margin/page-size are all driven from the same `resolveTemplateStyles()` call in both places.

## 23. DOCX Consistency

Unchanged and already correct: all content, sections, and entries exist; ordering matches; formatting settings are respected (font, size, spacing, accent, margin, page size — all resolved the same way as PDF); page numbers now added.

## 24. Security

No `dangerouslySetInnerHTML`, no raw HTML/CSS injection surface exists in any renderer (confirmed again by re-reading all three) — React's own escaping handles the preview; pdfkit/`docx` both take structured drawing calls, never markup strings.

## 25. Performance

The 50-entry regression test (§34) completes as part of the normal test run (well under a second) — no expensive repeated calculation was introduced; the sidebar-overflow fix adds one `bufferedPageRange().count` comparison (O(1)) per sidebar render, and page-number stamping is one pass over the already-buffered pages, not a new rendering pass.

## 26. Accessibility

No interactive controls were changed in this milestone. `break-words` and the page-shaped `maxWidth` are pure CSS — the preview's heading structure (`<h1>`/`<h2>`) was already semantic and is unchanged.

## 27. Tests

10 new deterministic tests, all non-LLM:

- `dynamic-resume-export.test.ts` (+8): PDF and DOCX each remain stable with 50 experience entries (no artificial limit); PDF spans multiple pages for 50 entries (verified via a page-count heuristic, not just "doesn't throw"); both renderers handle a very long unbroken URL/company name without throwing; a sidebar template whose *own* sidebar content overflows page 1 renders successfully and produces a genuinely multi-page PDF — the exact scenario the §3.1 fix targets.
- `template-styles.test.ts` (+3): default preview margin/width match the preview's own former hardcoded values; margin options resolve to distinct, increasing preview px values; A4 resolves to a narrower preview width than Letter.
- `resume-version-service.test.ts` (+1): 50 entries added through the full service layer remain correctly ordered in both `sectionsData` and the synced `resumeData`, and the deterministic ATS scorer completes without throwing.

A lightweight PDF page-counter (`countPdfPages()`, based on an empirically-verified pdfkit serialization pattern — see the test file's own comment) was added specifically to give the sidebar-overflow fix a real, verifiable regression signal beyond "renders without throwing," consistent with this project's established "no new PDF-parsing dependency" constraint (documented since Milestone 4).

## 28. Validation Results

| Command | Result |
|---|---|
| `npx vitest run` | **588/588 passing** (up from the Milestone 5 baseline of 578; +10 new tests, 0 regressions, 48/48 test files) |
| `npx tsc --noEmit` | Clean, 0 errors |
| `npm run lint` | 0 errors, 1 pre-existing unrelated warning (`no-img-element`) — unchanged |
| `npm run build` | `✓ Compiled successfully` |

## 29. Live Validation

Started a production server and probed the export route directly, without authentication:

- `GET /api/ai/resume/versions/[id]/export?format=pdf` (no auth) → `401`

Confirms the route (unchanged by this milestone) remains reachable and auth-gated.

**What was not live-tested**: an authenticated click-through (open the builder, view the preview at different margin/page-size settings, export a multi-page PDF/DOCX and visually confirm page numbers and no overlapping content in a sidebar template, confirm ATS/JD scores unaffected). Same pre-existing Supabase auth/schema-cache limitation as every prior milestone in this phase — reported honestly rather than assumed. The §3.1 fix in particular — a visual, positional bug — could only be verified by code-level reasoning (tracing pdfkit's exact pagination API) plus the page-count regression test in §27, not by visual inspection, consistent with this project's documented lack of PDF-rendering-inspection tooling.

## 30. Database Changes

None.

## 31. Known Limitations

- No golden-file/visual-diff testing exists for PDF/DOCX layout (same documented limitation as Milestones 4–5) — the sidebar-overflow fix is verified by API-level reasoning and a page-count regression test, not a pixel/glyph-position check.
- URLs are not converted to shortened "display text with the real URL preserved as a hyperlink" — they render as plain selectable text at full length. This was explicitly permitted to be skipped ("where the existing renderer supports it" — it doesn't have a link-abstraction today), and adding one would be new rendering functionality rather than a layout fix.
- The preview's page-shaped `maxWidth` is a visual approximation (`96dpi` CSS-px conversion) for "approximately the same layout," not a claim of print-pixel precision.
- Authenticated end-to-end live testing remains blocked by the pre-existing Supabase limitation (§29).

## 32. Recommended Next Milestone

A "Download Preview" or per-page indicator inside the live web preview itself (e.g., a subtle horizontal rule showing where PDF page breaks would fall, computed from the same height-estimation logic `dynamic-resume-pdf.ts` already uses) — would close the preview/PDF gap even further by letting users see pagination before exporting, without duplicating the renderer.
