import { AlignmentType, BorderStyle, Document, Footer, HeadingLevel, PageNumber, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";

import { DynamicResumeDocument } from "../dynamic-resume-schema";
import { getEntryPresentation, prepareForRender, RenderableSection } from "../dynamic-resume-render";
import { DEFAULT_TEMPLATE_SETTINGS, TemplateSettings } from "../../templates/template-schema";
import { resolveTemplateStyles, ResolvedTemplateStyles } from "../../templates/template-styles";

// Phase 13 — Milestone 14. Same content pipeline as the PDF/preview
// renderers (prepareForRender()); templateSettings changes only HOW
// this is laid out in the .docx. Sidebar layout rule (documented per
// §20/§29 — exact PDF visual parity isn't possible in a flowing .docx,
// so this maintains structural equivalence instead): the "technical"
// template's two columns are built as a single borderless one-row
// table (sidebar cell + main cell) — the standard, widely-supported
// technique for a resume sidebar in Word, and unlike the PDF export
// it does NOT need special page-break handling since Word tables
// reflow across pages natively.

function hex(value: string): string {
  return value.replace("#", "");
}

function headingBorder(styles: ResolvedTemplateStyles) {
  if (styles.sectionHeadingStyle !== "accent-left-border") return undefined;
  return { left: { style: BorderStyle.SINGLE, size: 24, color: hex(styles.accentHex), space: 8 } };
}

function sectionHeadingParagraph(section: RenderableSection, styles: ResolvedTemplateStyles): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const title = styles.sectionHeadingStyle === "underline" ? section.title : section.title.toUpperCase();
  const alignment = styles.sectionHeadingStyle === "centered-divider" ? AlignmentType.CENTER : AlignmentType.LEFT;
  const color = styles.sectionHeadingStyle === "accent-left-border" || styles.sectionHeadingStyle === "centered-divider" ? hex(styles.accentHex) : "111827";

  if (section.settings.showTitle) {
    paragraphs.push(
      new Paragraph({
        alignment,
        border: headingBorder(styles),
        children: [
          new TextRun({
            text: title,
            bold: true,
            font: styles.docxFontName,
            size: styles.sizes.heading * 2,
            color,
            underline: styles.sectionHeadingStyle === "underline" ? {} : undefined,
          }),
        ],
      })
    );
  }

  if (section.settings.showDivider) {
    paragraphs.push(new Paragraph({ text: "", border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC" } } }));
  }

  return paragraphs;
}

function entryParagraphs(entry: RenderableSection["entries"][number], styles: ResolvedTemplateStyles): Paragraph[] {
  const { heading, lines } = getEntryPresentation(entry);
  const paragraphs: Paragraph[] = [];

  if (heading) {
    paragraphs.push(new Paragraph({ children: [new TextRun({ text: heading.value, bold: true, font: styles.docxFontName, size: (styles.sizes.body + 2) * 2, color: "111827" })] }));
  }

  for (const line of lines) {
    paragraphs.push(
      new Paragraph({ children: [new TextRun({ text: `${line.label}: ${line.value}`, font: styles.docxFontName, size: styles.sizes.body * 2, color: "374151" })] })
    );
  }

  return paragraphs;
}

function sectionsToParagraphs(sections: RenderableSection[], styles: ResolvedTemplateStyles): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  for (const section of sections) {
    paragraphs.push(...sectionHeadingParagraph(section, styles));
    for (const entry of section.entries) {
      paragraphs.push(...entryParagraphs(entry, styles));
    }
  }

  return paragraphs;
}

export async function renderDynamicResumeDocx(document: DynamicResumeDocument, versionName: string, templateSettings: TemplateSettings = DEFAULT_TEMPLATE_SETTINGS): Promise<Buffer> {
  const styles = resolveTemplateStyles(templateSettings);
  const { personalInformation } = document;
  const sections = prepareForRender(document);

  const contactLine = [personalInformation.email, personalInformation.phone, personalInformation.location, personalInformation.linkedin, personalInformation.github, personalInformation.website]
    .filter((value): value is string => Boolean(value && value.trim()))
    .join("  ·  ");

  const headerAlignment = styles.headerAlign === "center" ? AlignmentType.CENTER : AlignmentType.LEFT;

  const children: (Paragraph | Table)[] = [
    new Paragraph({
      alignment: headerAlignment,
      heading: HeadingLevel.TITLE,
      children: [new TextRun({ text: personalInformation.name ?? "Candidate", font: styles.docxFontName, size: styles.sizes.name * 2, bold: true })],
    }),
    ...(contactLine
      ? [new Paragraph({ alignment: headerAlignment, children: [new TextRun({ text: contactLine, color: "666666", font: styles.docxFontName, size: styles.sizes.body * 2 })] })]
      : []),
  ];

  if (styles.layout === "sidebar" && styles.sidebarSectionTypes) {
    const sidebarTypes = new Set(styles.sidebarSectionTypes);
    const sidebarSections = sections.filter((section) => sidebarTypes.has(section.type));
    const mainSections = sections.filter((section) => !sidebarTypes.has(section.type));

    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
          top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
          bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
          left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
          right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
          insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
          insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        },
        rows: [
          new TableRow({
            children: [
              new TableCell({ width: { size: 32, type: WidthType.PERCENTAGE }, children: sectionsToParagraphs(sidebarSections, styles) }),
              new TableCell({ width: { size: 68, type: WidthType.PERCENTAGE }, children: sectionsToParagraphs(mainSections, styles) }),
            ],
          }),
        ],
      })
    );
  } else {
    children.push(...sectionsToParagraphs(sections, styles));
  }

  const doc = new Document({
    title: versionName,
    sections: [
      {
        properties: {
          page: {
            size: styles.docxPageSize,
            margin: { top: styles.docxMarginTwips, right: styles.docxMarginTwips, bottom: styles.docxMarginTwips, left: styles.docxMarginTwips },
          },
        },
        // Phase 15 Milestone 6 (§21) — docx's own standard, documented
        // PageNumber field, resolved by Word at open-time (Word always
        // knows the true final page count; unlike the PDF renderer's
        // buffer-then-stamp approach, there is nothing to compute
        // here). A single-page resume shows "Page 1 of 1", which is
        // normal, expected Word behavior — not a defect.
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ children: ["Page ", PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES], size: 16, color: "9ca3af", font: styles.docxFontName }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
  return Packer.toBuffer(doc);
}
