import { describe, expect, it } from "vitest";

import { resolveTemplateStyles } from "./template-styles";
import { DEFAULT_TEMPLATE_SETTINGS, TemplateSettings, templateSettingsSchema } from "./template-schema";

function settings(overrides: Partial<TemplateSettings> = {}): TemplateSettings {
  return templateSettingsSchema.parse({ ...DEFAULT_TEMPLATE_SETTINGS, ...overrides });
}

describe("resolveTemplateStyles", () => {
  it("defaults to the modern template's single-column layout", () => {
    const resolved = resolveTemplateStyles(settings());
    expect(resolved.templateId).toBe("modern");
    expect(resolved.layout).toBe("single-column");
    expect(resolved.sidebarSectionTypes).toBeNull();
  });

  it("reports the technical template's real sidebar layout when ATS mode is off", () => {
    const resolved = resolveTemplateStyles(settings({ templateId: "technical" }));
    expect(resolved.layout).toBe("sidebar");
    expect(resolved.sidebarSectionTypes).toContain("SKILLS");
    expect(resolved.atsFriendliness).toBe("medium");
  });

  it("collapses the technical template to single-column and reports high ATS friendliness when ATS mode is on", () => {
    const resolved = resolveTemplateStyles(settings({ templateId: "technical", atsMode: true }));
    expect(resolved.layout).toBe("single-column");
    expect(resolved.sidebarSectionTypes).toBeNull();
    expect(resolved.atsFriendliness).toBe("high");
  });

  it("never changes an already single-column template's layout or ATS friendliness when ATS mode toggles", () => {
    const off = resolveTemplateStyles(settings({ templateId: "classic", atsMode: false }));
    const on = resolveTemplateStyles(settings({ templateId: "classic", atsMode: true }));
    expect(off.layout).toBe("single-column");
    expect(on.layout).toBe("single-column");
    expect(off.atsFriendliness).toBe("high");
    expect(on.atsFriendliness).toBe("high");
  });

  it("maps every font family to a real pdfkit standard font, never an arbitrary/missing one", () => {
    const pdfFonts = new Set(["Helvetica", "Helvetica-Bold", "Times-Roman", "Times-Bold"]);
    for (const fontFamily of ["inter", "arial", "helvetica", "georgia", "times"] as const) {
      const resolved = resolveTemplateStyles(settings({ fontFamily }));
      expect(pdfFonts.has(resolved.pdfFont.regular)).toBe(true);
      expect(pdfFonts.has(resolved.pdfFont.bold)).toBe(true);
    }
  });

  it("scales font sizes and spacing through a fixed 3-step scale, larger settings never producing smaller numbers", () => {
    const compact = resolveTemplateStyles(settings({ fontSize: "compact", spacing: "compact" }));
    const standard = resolveTemplateStyles(settings({ fontSize: "standard", spacing: "standard" }));
    const large = resolveTemplateStyles(settings({ fontSize: "large", spacing: "spacious" }));

    expect(compact.sizes.body).toBeLessThan(standard.sizes.body);
    expect(standard.sizes.body).toBeLessThan(large.sizes.body);
    expect(compact.spacing.entry).toBeLessThan(standard.spacing.entry);
    expect(standard.spacing.entry).toBeLessThan(large.spacing.entry);
  });

  it("resolves a real, non-empty accent hex for every accent color", () => {
    for (const accentColor of ["blue", "navy", "green", "purple", "black", "gray"] as const) {
      const resolved = resolveTemplateStyles(settings({ accentColor }));
      expect(resolved.accentHex).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("carries the header alignment and section heading flavor from the template registry untouched", () => {
    expect(resolveTemplateStyles(settings({ templateId: "executive" })).headerAlign).toBe("center");
    expect(resolveTemplateStyles(settings({ templateId: "modern" })).headerAlign).toBe("left");
  });

  it("resolves the default margin/pageSize to the renderers' own pre-Milestone-5 hardcoded values, byte-identical (backward compatibility)", () => {
    const resolved = resolveTemplateStyles(settings());
    expect(resolved.margin).toBe("normal");
    expect(resolved.pageMarginPt).toBe(50); // the PDF renderer's own former hardcoded PAGE_MARGIN constant
    expect(resolved.docxMarginTwips).toBe(1440); // the docx library's own standard 1-inch default
    expect(resolved.pageSize).toBe("letter");
    expect(resolved.pdfPageSize).toBe("LETTER");
    expect(resolved.docxPageSize).toEqual({ width: 12240, height: 15840 });
  });

  it("maps every margin option to a distinct, increasing pt/twips value", () => {
    const narrow = resolveTemplateStyles(settings({ margin: "narrow" }));
    const normal = resolveTemplateStyles(settings({ margin: "normal" }));
    const wide = resolveTemplateStyles(settings({ margin: "wide" }));

    expect(narrow.pageMarginPt).toBeLessThan(normal.pageMarginPt);
    expect(normal.pageMarginPt).toBeLessThan(wide.pageMarginPt);
    expect(narrow.docxMarginTwips).toBeLessThan(normal.docxMarginTwips);
    expect(normal.docxMarginTwips).toBeLessThan(wide.docxMarginTwips);
  });

  it("maps the a4 page size to real, distinct A4 dimensions in both renderers", () => {
    const resolved = resolveTemplateStyles(settings({ pageSize: "a4" }));
    expect(resolved.pdfPageSize).toBe("A4");
    expect(resolved.docxPageSize).toEqual({ width: 11906, height: 16838 });
  });

  it("margin/pageSize never affect font, color, or spacing resolution — independent axes", () => {
    const withNarrowMargin = resolveTemplateStyles(settings({ margin: "narrow", pageSize: "a4" }));
    const withDefaults = resolveTemplateStyles(settings());
    expect(withNarrowMargin.accentHex).toBe(withDefaults.accentHex);
    expect(withNarrowMargin.pdfFont).toEqual(withDefaults.pdfFont);
    expect(withNarrowMargin.sizes).toEqual(withDefaults.sizes);
    expect(withNarrowMargin.spacing).toEqual(withDefaults.spacing);
  });

  it("resolves preview-specific px values the web preview uses (Phase 15 Milestone 6) — 'normal'/'letter' matching the preview's own former hardcoded values", () => {
    const resolved = resolveTemplateStyles(settings());
    expect(resolved.previewMarginPx).toBe(32); // the preview's own former hardcoded `p-8` (2rem = 32px)
    expect(resolved.previewPageWidthPx).toBe(816); // Letter width at 96dpi
  });

  it("maps every margin option to a distinct, increasing preview px value, consistent with the PDF/DOCX ordering", () => {
    const narrow = resolveTemplateStyles(settings({ margin: "narrow" })).previewMarginPx;
    const normal = resolveTemplateStyles(settings({ margin: "normal" })).previewMarginPx;
    const wide = resolveTemplateStyles(settings({ margin: "wide" })).previewMarginPx;
    expect(narrow).toBeLessThan(normal);
    expect(normal).toBeLessThan(wide);
  });

  it("resolves a distinct, smaller preview width for a4 than letter", () => {
    const letter = resolveTemplateStyles(settings({ pageSize: "letter" })).previewPageWidthPx;
    const a4 = resolveTemplateStyles(settings({ pageSize: "a4" })).previewPageWidthPx;
    expect(a4).toBeLessThan(letter);
  });
});
