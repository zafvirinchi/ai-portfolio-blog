"use client";

import type { DynamicResumeDocument } from "@/lib/ai/resume-versions/dynamic/dynamic-resume-schema";
import { getEntryPresentation, prepareForRender, RenderableSection } from "@/lib/ai/resume-versions/dynamic/dynamic-resume-render";
import { DEFAULT_TEMPLATE_SETTINGS, TemplateSettings } from "@/lib/ai/resume-versions/templates/template-schema";
import { resolveTemplateStyles, ResolvedTemplateStyles } from "@/lib/ai/resume-versions/templates/template-styles";

// Exactly what PDF/DOCX/Markdown export would produce — same
// prepareForRender() pipeline AND the same resolveTemplateStyles()
// resolution every renderer uses, so switching a template/accent/font/
// spacing option can never visually diverge between this live preview
// and the downloaded file. The web preview's sidebar layout mirrors
// the PDF/DOCX sidebar rule (documented in dynamic-resume-pdf.ts) in
// spirit — sidebar section types on the left, everything else on the
// right — but since this is a single continuous scroll view rather
// than a fixed-size page, it has no equivalent of the "sidebar only on
// page 1" pagination workaround PDF/DOCX need.
//
// Phase 15 Milestone 6 (§22) — margin and page size, added in
// Milestone 5, previously had NO visible effect here at all (a fixed
// `p-8` padding and no page-shaped width) even though both already
// drove real PDF/DOCX output — a genuine preview/export inconsistency.
// `previewMarginPx`/`previewPageWidthPx` (template-styles.ts) now
// give this component the same two settings, scaled for a browser.
// `break-words` is applied to every text node that could contain a
// long unbroken token (a URL, a long technology/company name):
// pdfkit and Word both already force-wrap such text on their own
// (verified — see dynamic-resume-pdf.ts's Milestone 6 comment), but a
// browser does NOT do this by default, so without it a long unbroken
// string could overflow this now-fixed-width container sideways.

function SectionHeading({ section, styles }: { section: RenderableSection; styles: ResolvedTemplateStyles }) {
  if (!section.settings.showTitle && !section.settings.showDivider) return null;

  const title = styles.sectionHeadingStyle === "underline" ? section.title : section.title.toUpperCase();

  return (
    <div
      className={`mb-3 ${section.settings.showDivider ? "border-b" : ""} ${styles.sectionHeadingStyle === "centered-divider" ? "text-center" : ""}`}
      style={{ borderColor: styles.sectionHeadingStyle === "accent-left-border" || styles.sectionHeadingStyle === "centered-divider" ? styles.accentHex : "#e2e8f0", paddingBottom: 4 }}
    >
      {section.settings.showTitle && (
        <h2
          className={`break-words font-bold tracking-wide ${styles.sectionHeadingStyle === "accent-left-border" ? "border-l-4 pl-2" : ""} ${styles.sectionHeadingStyle === "underline" ? "underline" : ""}`}
          style={{
            fontSize: styles.sizes.heading,
            color: styles.sectionHeadingStyle === "accent-left-border" || styles.sectionHeadingStyle === "centered-divider" ? styles.accentHex : "#1e293b",
            borderColor: styles.accentHex,
          }}
        >
          {title}
        </h2>
      )}
    </div>
  );
}

function SectionBlock({ section, styles }: { section: RenderableSection; styles: ResolvedTemplateStyles }) {
  return (
    <div style={{ marginBottom: `${styles.spacing.section * 2}rem` }}>
      <SectionHeading section={section} styles={styles} />
      <div className="space-y-3">
        {section.entries.map((entry) => {
          const { heading, lines } = getEntryPresentation(entry);
          return (
            <div key={entry.id} style={{ marginBottom: `${styles.spacing.entry}rem` }}>
              {heading && (
                <p className="break-words font-semibold" style={{ fontSize: styles.sizes.body + 2, color: "#1e293b" }}>
                  {heading.value}
                </p>
              )}
              {lines.map((line, index) => (
                <p key={index} className="break-words" style={{ fontSize: styles.sizes.body, color: "#475569" }}>
                  <span className="font-medium" style={{ color: "#64748b" }}>
                    {line.label}:
                  </span>{" "}
                  {line.value}
                </p>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ResumePreview({ document, templateSettings = DEFAULT_TEMPLATE_SETTINGS }: { document: DynamicResumeDocument; templateSettings?: TemplateSettings }) {
  const { personalInformation } = document;
  const sections = prepareForRender(document);
  const styles = resolveTemplateStyles(templateSettings);

  const contactLine = [personalInformation.email, personalInformation.phone, personalInformation.location, personalInformation.linkedin, personalInformation.github, personalInformation.website]
    .filter((value): value is string => Boolean(value && value.trim()))
    .join("  ·  ");

  const sidebarTypes = styles.sidebarSectionTypes ? new Set(styles.sidebarSectionTypes) : null;
  const sidebarSections = sidebarTypes ? sections.filter((section) => sidebarTypes.has(section.type)) : [];
  const mainSections = sidebarTypes ? sections.filter((section) => !sidebarTypes.has(section.type)) : sections;

  return (
    <div
      className="mx-auto w-full rounded-2xl border border-slate-200 bg-white shadow-sm"
      style={{ fontFamily: styles.webFontStack, padding: styles.previewMarginPx, maxWidth: styles.previewPageWidthPx }}
    >
      <div className={styles.headerAlign === "center" ? "text-center" : "text-left"}>
        <h1 className="break-words font-bold text-slate-900" style={{ fontSize: styles.sizes.name }}>
          {personalInformation.name ?? "Candidate"}
        </h1>
        {contactLine && (
          <p className="break-words mt-1 text-slate-500" style={{ fontSize: styles.sizes.body - 1 }}>
            {contactLine}
          </p>
        )}
      </div>

      <div className="mt-6">
        {sections.length === 0 && <p className="text-center text-sm text-slate-400">Nothing to preview yet — add a section to get started.</p>}

        {styles.layout === "sidebar" ? (
          <div className="grid grid-cols-[minmax(0,32%)_minmax(0,1fr)] gap-6">
            <div>
              {sidebarSections.map((section) => (
                <SectionBlock key={section.id} section={section} styles={styles} />
              ))}
            </div>
            <div>
              {mainSections.map((section) => (
                <SectionBlock key={section.id} section={section} styles={styles} />
              ))}
            </div>
          </div>
        ) : (
          <div>
            {sections.map((section) => (
              <SectionBlock key={section.id} section={section} styles={styles} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
