import PDFDocument from "pdfkit";

import { DynamicResumeDocument } from "../dynamic-resume-schema";
import { getEntryPresentation, prepareForRender, RenderableSection } from "../dynamic-resume-render";
import { DEFAULT_TEMPLATE_SETTINGS, TemplateSettings } from "../../templates/template-schema";
import { resolveTemplateStyles, ResolvedTemplateStyles } from "../../templates/template-styles";

// Phase 13 — Milestone 14: Enterprise Resume Template Designer. Same
// canonical pipeline as before (DynamicResumeDocument -> prepareForRender()
// -> pdfkit drawing) — templateSettings only changes HOW this content is
// drawn (colors/fonts/sizes/spacing/layout/page breaks), never WHAT
// content exists. No separate "PDF resume model."
//
// Page-break strategy (§23): before drawing a section heading, or any
// individual entry, this renderer estimates its height with pdfkit's
// own heightOfString() and starts a new page first if it wouldn't fit
// in the remaining space — keeping a heading from being orphaned at
// the bottom of a page, and keeping a single entry from being split
// mid-block. Sections themselves are NOT made unbreakable — a section
// with many entries can still span multiple pages, entry by entry,
// which is what avoids large blank areas (§23's own explicit warning
// against making every section unbreakable).
//
// Sidebar layout rule (documented per §20's "if a template requires
// layout rules, document them clearly"): the "technical" template's
// sidebar renders ONLY on page 1, alongside the main column. If the
// main column's content needs to continue past page 1, subsequent
// pages render the remaining main-column content at FULL page width —
// the sidebar is not repeated on later pages. This avoids ever
// clipping or overlapping sidebar content against a page break, at
// the cost of a (common, real-world) two-column-on-page-1-only layout
// for longer resumes.
//
// Phase 15 Milestone 6 — a real bug found while auditing this rule: if
// the SIDEBAR's own content is long enough to overflow page 1, the
// code used to unconditionally reset `doc.y = columnsTopY` before
// drawing the main column — jumping back to a Y coordinate that made
// sense on page 1, but pdfkit was by then already on page 2+ (its own
// `.text()` auto-paginates internally when content overflows — see
// `nextSection()`/`continueOnNewPage()` in pdfkit's LineWrapper). The
// main column would then start drawing at that stale Y on the WRONG
// page, overlapping whatever the sidebar's overflow had just drawn
// there. Fixed by tracking the buffered page count across the sidebar
// render: if it grew, the main column continues from wherever the
// document currently is, at full page width (the same "subsequent
// pages go full-width" rule the main column's own overflow already
// used) — it never jumps backward.
//
// pdfkit's own line-wrapping was verified (by reading LineWrapper's
// `eachWord`/`canFit` and confirming empirically via heightOfString())
// to already force-wrap a long unbroken word/URL within the given
// column width, and its `.text()` calls already auto-paginate when
// content exceeds the current page — so a single oversized entry (or
// one very long unbroken token) safely spans multiple pages on its
// own, with no separate handling needed here (§4/§9/§10/§15).
//
// Page numbers ("Page X of Y", §21): pdfkit's own documented pattern —
// `bufferPages: true` plus a post-pass over `bufferedPageRange()` —
// stamps every page once the true final count is known, without a
// second pagination system. Only added when there's more than one
// page; a one-page resume gets no footer, matching how a print-ready
// one-pager normally looks.

const COLUMN_GUTTER = 24;
const SIDEBAR_WIDTH_RATIO = 0.32;

interface ColumnRegion {
  x: number;
  width: number;
}

function contentBottom(doc: PDFKit.PDFDocument): number {
  return doc.page.height - doc.page.margins.bottom;
}

function estimateEntryHeight(doc: PDFKit.PDFDocument, entry: RenderableSection["entries"][number], width: number, styles: ResolvedTemplateStyles): number {
  const { heading, lines } = getEntryPresentation(entry);
  let height = 0;

  if (heading) {
    doc.font(styles.pdfFont.bold).fontSize(styles.sizes.body + 2);
    height += doc.heightOfString(heading.value, { width }) + 2;
  }

  doc.font(styles.pdfFont.regular).fontSize(styles.sizes.body);
  for (const line of lines) {
    height += doc.heightOfString(`${line.label}: ${line.value}`, { width }) + 2;
  }

  return height;
}

function drawSectionHeading(doc: PDFKit.PDFDocument, section: RenderableSection, region: ColumnRegion, styles: ResolvedTemplateStyles) {
  if (section.settings.showTitle) {
    const title = styles.sectionHeadingStyle === "underline" ? section.title : section.title.toUpperCase();
    doc.font(styles.pdfFont.bold).fontSize(styles.sizes.heading);

    if (styles.sectionHeadingStyle === "accent-left-border") {
      const headingY = doc.y;
      const headingHeight = doc.heightOfString(title, { width: region.width - 10 });
      doc.fillColor(styles.accentHex).rect(region.x, headingY, 3, headingHeight).fill();
      doc.fillColor("#111827").text(title, region.x + 10, headingY, { width: region.width - 10 });
    } else if (styles.sectionHeadingStyle === "centered-divider") {
      doc.fillColor(styles.accentHex).text(title, region.x, doc.y, { width: region.width, align: "center" });
      doc.fillColor("#111827");
    } else if (styles.sectionHeadingStyle === "underline") {
      doc.fillColor("#111827").text(title, region.x, doc.y, { width: region.width, underline: true });
    } else {
      doc.fillColor("#111827").text(title, region.x, doc.y, { width: region.width });
    }

    doc.moveDown(0.2);
  }

  if (section.settings.showDivider) {
    const lineColor = styles.sectionHeadingStyle === "accent-left-border" || styles.sectionHeadingStyle === "centered-divider" ? styles.accentHex : "#cccccc";
    doc
      .strokeColor(lineColor)
      .lineWidth(1)
      .moveTo(region.x, doc.y)
      .lineTo(region.x + region.width, doc.y)
      .stroke();
    doc.strokeColor("#111827").fillColor("#111827");
    doc.moveDown(styles.spacing.section);
  }
}

function drawEntry(doc: PDFKit.PDFDocument, entry: RenderableSection["entries"][number], region: ColumnRegion, styles: ResolvedTemplateStyles) {
  const { heading, lines } = getEntryPresentation(entry);

  if (heading) {
    doc
      .font(styles.pdfFont.bold)
      .fontSize(styles.sizes.body + 2)
      .fillColor("#111827")
      .text(heading.value, region.x, doc.y, { width: region.width });
  }

  doc.font(styles.pdfFont.regular).fontSize(styles.sizes.body).fillColor("#374151");
  for (const line of lines) {
    doc.text(`${line.label}: ${line.value}`, region.x, doc.y, { width: region.width });
  }

  doc.fillColor("#111827").moveDown(styles.spacing.entry);
}

/**
 * Renders a list of sections into one column region, with page-break
 * avoidance for headings and entries. `onPageBreak` (when given) is
 * called after a page break so the caller can widen the column for a
 * sidebar template's main-column continuation (see the module-level
 * doc comment above).
 */
function renderSectionsInColumn(doc: PDFKit.PDFDocument, sections: RenderableSection[], startRegion: ColumnRegion, styles: ResolvedTemplateStyles, onPageBreak?: () => ColumnRegion): void {
  let region = startRegion;

  for (const section of sections) {
    const firstEntry = section.entries[0];
    const headingEstimate = styles.sizes.heading + 10 + (firstEntry ? estimateEntryHeight(doc, firstEntry, region.width, styles) : 0);

    if (doc.y + headingEstimate > contentBottom(doc)) {
      doc.addPage();
      if (onPageBreak) region = onPageBreak();
    }

    drawSectionHeading(doc, section, region, styles);

    for (const entry of section.entries) {
      const entryHeight = estimateEntryHeight(doc, entry, region.width, styles);

      if (doc.y + entryHeight > contentBottom(doc)) {
        doc.addPage();
        if (onPageBreak) region = onPageBreak();
      }

      drawEntry(doc, entry, region, styles);
    }

    doc.moveDown(styles.spacing.section * 0.5);
  }
}

export function renderDynamicResumePdf(document: DynamicResumeDocument, versionName: string, templateSettings: TemplateSettings = DEFAULT_TEMPLATE_SETTINGS): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const styles = resolveTemplateStyles(templateSettings);
    const doc = new PDFDocument({ margin: styles.pageMarginPt, size: styles.pdfPageSize, info: { Title: versionName }, bufferPages: true });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const { personalInformation } = document;
    const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    doc
      .font(styles.pdfFont.bold)
      .fontSize(styles.sizes.name)
      .fillColor("#111827")
      .text(personalInformation.name ?? "Candidate", { align: styles.headerAlign, width: contentWidth });

    const contactLine = [personalInformation.email, personalInformation.phone, personalInformation.location, personalInformation.linkedin, personalInformation.github, personalInformation.website]
      .filter((value): value is string => Boolean(value && value.trim()))
      .join("  ·  ");

    if (contactLine) {
      doc
        .font(styles.pdfFont.regular)
        .fontSize(styles.sizes.body)
        .fillColor("#6b7280")
        .text(contactLine, { align: styles.headerAlign, width: contentWidth });
    }

    doc.fillColor("#111827").moveDown();

    const sections = prepareForRender(document);

    if (styles.layout === "sidebar" && styles.sidebarSectionTypes) {
      const sidebarTypes = new Set(styles.sidebarSectionTypes);
      const sidebarSections = sections.filter((section) => sidebarTypes.has(section.type));
      const mainSections = sections.filter((section) => !sidebarTypes.has(section.type));

      const sidebarWidth = contentWidth * SIDEBAR_WIDTH_RATIO;
      const mainWidth = contentWidth - sidebarWidth - COLUMN_GUTTER;
      const columnsTopY = doc.y;
      const pageCountBeforeSidebar = doc.bufferedPageRange().count;

      // Sidebar renders once, page 1 only (see module doc comment) — no page-break handling passed.
      renderSectionsInColumn(doc, sidebarSections, { x: doc.page.margins.left, width: sidebarWidth }, styles);

      const sidebarOverflowedToANewPage = doc.bufferedPageRange().count > pageCountBeforeSidebar;

      if (sidebarOverflowedToANewPage) {
        // The sidebar itself ran past page 1 — pdfkit already auto-paginated
        // during that render, so `doc` is now on a later page. Continue the
        // main column from right where the document already is, at full
        // width, rather than jumping `doc.y` back to a page-1 coordinate.
        renderSectionsInColumn(doc, mainSections, { x: doc.page.margins.left, width: contentWidth }, styles, () => ({
          x: doc.page.margins.left,
          width: contentWidth,
        }));
      } else {
        // Main column starts alongside the sidebar at the same top Y; once
        // it needs to page-break, subsequent pages widen to the full
        // content width (the sidebar isn't repeated).
        doc.y = columnsTopY;
        renderSectionsInColumn(doc, mainSections, { x: doc.page.margins.left + sidebarWidth + COLUMN_GUTTER, width: mainWidth }, styles, () => ({
          x: doc.page.margins.left,
          width: contentWidth,
        }));
      }
    } else {
      renderSectionsInColumn(doc, sections, { x: doc.page.margins.left, width: contentWidth }, styles);
    }

    const pageRange = doc.bufferedPageRange();
    if (pageRange.count > 1) {
      for (let i = pageRange.start; i < pageRange.start + pageRange.count; i++) {
        doc.switchToPage(i);
        doc
          .font(styles.pdfFont.regular)
          .fontSize(8)
          .fillColor("#9ca3af")
          .text(`Page ${i + 1} of ${pageRange.count}`, doc.page.margins.left, doc.page.height - styles.pageMarginPt / 2 - 4, { width: contentWidth, align: "center" });
      }
    }

    doc.end();
  });
}
