import { SectionType } from "../dynamic/dynamic-resume-schema";
import { getTemplateDefinition } from "./template-registry";
import { AccentColor, FontFamily, FontSizeOption, MarginOption, PageSize, SpacingOption, TemplateId, TemplateSettings } from "./template-schema";

// The ONE place TemplateId + TemplateSettings resolve into concrete
// presentation values — the live preview, PDF renderer, and DOCX
// renderer all call this same function, so switching a font/accent/
// spacing option can never visually diverge between the three outputs
// (the same guarantee dynamic-resume-render.ts's prepareForRender()
// already gives the content layer).

/** Every value chosen for a safe contrast ratio against a white page background — no pastels, no low-contrast light tones (Color Safety, §12). */
export const ACCENT_HEX: Record<AccentColor, string> = {
  blue: "#2563eb",
  navy: "#1e3a5f",
  green: "#15803d",
  purple: "#7c3aed",
  black: "#111827",
  gray: "#4b5563",
};

/** Real web font stacks with system-safe fallbacks — used by the React live preview only. */
export const WEB_FONT_STACKS: Record<FontFamily, string> = {
  inter: '"Inter", ui-sans-serif, system-ui, -apple-system, sans-serif',
  arial: 'Arial, "Helvetica Neue", Helvetica, sans-serif',
  helvetica: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  georgia: 'Georgia, "Times New Roman", serif',
  times: '"Times New Roman", Times, serif',
};

/**
 * pdfkit ships exactly 14 standard fonts, always embedded, never
 * missing at render time — every FontFamily option maps onto one of
 * them rather than a system font pdfkit's serverless environment
 * might not have (§10's explicit "must have fallback fonts" rule).
 */
export const PDF_FONT_MAP: Record<FontFamily, { regular: string; bold: string }> = {
  inter: { regular: "Helvetica", bold: "Helvetica-Bold" },
  arial: { regular: "Helvetica", bold: "Helvetica-Bold" },
  helvetica: { regular: "Helvetica", bold: "Helvetica-Bold" },
  georgia: { regular: "Times-Roman", bold: "Times-Bold" },
  times: { regular: "Times-Roman", bold: "Times-Bold" },
};

/** DOCX behaves differently from PDF: Word substitutes an installed font at open-time if the named one is missing, so the real font name is passed straight through rather than remapped. */
export const DOCX_FONT_NAME: Record<FontFamily, string> = {
  inter: "Inter",
  arial: "Arial",
  helvetica: "Helvetica",
  georgia: "Georgia",
  times: "Times New Roman",
};

interface SizeSet {
  name: number;
  heading: number;
  body: number;
}

/** Point sizes shared verbatim by the PDF renderer (pdfkit's fontSize is already in points) and, scaled to px, by the web preview — a controlled 3-step scale, never an arbitrary user-entered number (§11). */
const FONT_SIZE_SCALE: Record<FontSizeOption, SizeSet> = {
  compact: { name: 18, heading: 12, body: 9 },
  standard: { name: 22, heading: 14, body: 10 },
  large: { name: 26, heading: 16, body: 11 },
};

interface SpacingSet {
  /** pdfkit moveDown() multiplier after a section heading/divider. */
  section: number;
  /** pdfkit moveDown() multiplier after each entry. */
  entry: number;
}

const SPACING_SCALE: Record<SpacingOption, SpacingSet> = {
  compact: { section: 0.2, entry: 0.35 },
  standard: { section: 0.3, entry: 0.5 },
  spacious: { section: 0.45, entry: 0.75 },
};

// Phase 15 Milestone 5 — page margin, in points (what pdfkit's own
// `margin` option already expects). "normal" (50) is the renderer's
// own pre-existing hardcoded value, kept byte-identical so a version
// saved before this milestone renders exactly as it always did.
const PDF_MARGIN_PT: Record<MarginOption, number> = {
  narrow: 36,
  normal: 50,
  wide: 72,
};

// Twips (1/20 pt = 1/1440 inch) — what the `docx` library's page
// margin option expects. "normal" (1440 = 1 inch on every side) is
// that library's own well-known default, again kept identical to
// what a pre-Milestone-5 export already produced.
const DOCX_MARGIN_TWIPS: Record<MarginOption, number> = {
  narrow: 720,
  normal: 1440,
  wide: 2160,
};

/** pdfkit accepts these two page-size strings natively — no dimension math needed. */
const PDF_PAGE_SIZE: Record<PageSize, "LETTER" | "A4"> = {
  letter: "LETTER",
  a4: "A4",
};

/** Standard page dimensions in twips — the `docx` library takes explicit width/height rather than a named preset. */
const DOCX_PAGE_SIZE_TWIPS: Record<PageSize, { width: number; height: number }> = {
  letter: { width: 12240, height: 15840 },
  a4: { width: 11906, height: 16838 },
};

// Phase 15 Milestone 6 (§22) — the live web preview had no visual
// representation of margin/pageSize at all (a fixed `p-8` Tailwind
// padding regardless of the Margin setting, and no page-shaped width
// regardless of A4/Letter) — a real "preview vs. export consistency"
// gap. These give ResumePreview.tsx the same three inputs the PDF/
// DOCX renderers already have, scaled for a browser: CSS px, not pt
// or twips. "normal" (32px) matches the preview's own prior hardcoded
// `p-8` exactly, so a version that has never touched this setting
// looks unchanged.
const PREVIEW_MARGIN_PX: Record<MarginOption, number> = {
  narrow: 22,
  normal: 32,
  wide: 48,
};

/** Standard CSS-px-at-96dpi page widths — just enough for the preview to visually suggest the target page shape, never claimed as print-precise. */
const PREVIEW_PAGE_WIDTH_PX: Record<PageSize, number> = {
  letter: 816,
  a4: 794,
};

export interface ResolvedTemplateStyles {
  templateId: TemplateId;
  name: string;
  /** The EFFECTIVE layout after ATS-mode collapse — a "sidebar" template's own `layout` stays "sidebar" in the registry, but resolveTemplateStyles() reports "single-column" here whenever atsMode is on, since every renderer should key off this resolved value, never the registry's raw layout. */
  layout: "single-column" | "sidebar";
  sidebarSectionTypes: SectionType[] | null;
  headerAlign: "left" | "center";
  sectionHeadingStyle: "accent-left-border" | "centered-divider" | "underline" | "plain-caps";
  accentHex: string;
  webFontStack: string;
  pdfFont: { regular: string; bold: string };
  docxFontName: string;
  sizes: SizeSet;
  spacing: SpacingSet;
  /** high/medium, adjusted for ATS mode — a sidebar template forced into a single column by atsMode is reported as "high" here, since the effective rendering characteristic (not the template's default) is what should ever be shown to the user (§31). */
  atsFriendliness: "high" | "medium";
  atsMode: boolean;
  pageLength: TemplateSettings["pageLength"];
  margin: MarginOption;
  pageMarginPt: number;
  docxMarginTwips: number;
  pageSize: PageSize;
  pdfPageSize: "LETTER" | "A4";
  docxPageSize: { width: number; height: number };
  previewMarginPx: number;
  previewPageWidthPx: number;
}

export function resolveTemplateStyles(settings: TemplateSettings): ResolvedTemplateStyles {
  const definition = getTemplateDefinition(settings.templateId);
  const layout = settings.atsMode ? "single-column" : definition.layout;

  return {
    templateId: definition.id,
    name: definition.name,
    layout,
    sidebarSectionTypes: layout === "sidebar" ? definition.sidebarSectionTypes ?? null : null,
    headerAlign: definition.headerAlign,
    sectionHeadingStyle: definition.sectionHeadingStyle,
    accentHex: ACCENT_HEX[settings.accentColor],
    webFontStack: WEB_FONT_STACKS[settings.fontFamily],
    pdfFont: PDF_FONT_MAP[settings.fontFamily],
    docxFontName: DOCX_FONT_NAME[settings.fontFamily],
    sizes: FONT_SIZE_SCALE[settings.fontSize],
    spacing: SPACING_SCALE[settings.spacing],
    atsFriendliness: layout === "single-column" ? "high" : definition.atsFriendliness,
    atsMode: settings.atsMode,
    pageLength: settings.pageLength,
    margin: settings.margin,
    pageMarginPt: PDF_MARGIN_PT[settings.margin],
    docxMarginTwips: DOCX_MARGIN_TWIPS[settings.margin],
    pageSize: settings.pageSize,
    pdfPageSize: PDF_PAGE_SIZE[settings.pageSize],
    docxPageSize: DOCX_PAGE_SIZE_TWIPS[settings.pageSize],
    previewMarginPx: PREVIEW_MARGIN_PX[settings.margin],
    previewPageWidthPx: PREVIEW_PAGE_WIDTH_PX[settings.pageSize],
  };
}
