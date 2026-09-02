import { z } from "zod";
import { SectionType } from "../dynamic/dynamic-resume-schema";

// Phase 13 — Milestone 14. Presentation-only settings for a resume
// version, deliberately kept OUT of DynamicResumeDocument (which stays
// template-independent per the milestone's own architecture rule:
// "Resume Data → Template Renderer → Template Layout → Preview →
// PDF/DOCX Export", never the reverse). Persisted as a sibling nullable
// JSONB column on resume_versions (see resume-version-service.ts),
// exactly like sections_data was added in the previous milestone — one
// additive column, no new table, no second persistence system.

export const TEMPLATE_IDS = ["modern", "executive", "classic", "minimal", "technical", "gcc", "graduate", "academic"] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

// Phase 25 Milestone 1 — structured, filterable template metadata (the
// Template Gallery's category chips / ATS-only / one-page toggles read
// these directly, rather than parsing the free-text `recommendedFor`
// string). Additive to every existing template; no rendering code
// changes based on these — layout/rendering stays driven entirely by
// the existing layout/accent/font/headerAlign/sectionHeadingStyle
// fields below, exactly as before this milestone.
export const TEMPLATE_CATEGORIES = ["ATS_CLASSIC", "PROFESSIONAL", "MODERN", "EXECUTIVE", "TECH", "GRADUATE", "GCC_PROFESSIONAL", "ACADEMIC"] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

export const EXPERIENCE_LEVELS = ["entry", "mid", "senior", "executive"] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

// A small, closed palette — never an arbitrary color picker. Every
// value below was chosen to keep body/heading text at a safe contrast
// ratio against a white page background (Color Safety, §12) — no
// pastels, no low-contrast light tones.
export const ACCENT_COLORS = ["blue", "navy", "green", "purple", "black", "gray"] as const;
export type AccentColor = (typeof ACCENT_COLORS)[number];

// Every option here has both a real web font-stack (for the live
// preview) AND a safe mapping onto one of pdfkit's 14 standard,
// always-embedded PDF fonts (see template-styles.ts's PDF_FONT_MAP) —
// never a font that could be missing in the PDF generation
// environment. DOCX behaves differently (Word substitutes an
// installed font at open-time), so DOCX export passes the real font
// name through as-is.
export const FONT_FAMILIES = ["inter", "arial", "helvetica", "georgia", "times"] as const;
export type FontFamily = (typeof FONT_FAMILIES)[number];

export const FONT_SIZES = ["compact", "standard", "large"] as const;
export type FontSizeOption = (typeof FONT_SIZES)[number];

export const SPACING_OPTIONS = ["compact", "standard", "spacious"] as const;
export type SpacingOption = (typeof SPACING_OPTIONS)[number];

export const PAGE_LENGTHS = ["auto", "one", "two"] as const;
export type PageLength = (typeof PAGE_LENGTHS)[number];

// Phase 15 Milestone 5 — controlled page-margin presets, never an
// arbitrary CSS/point value (§11). "normal" is defined to match this
// renderer's own pre-existing hardcoded margin exactly (see
// template-styles.ts's PDF_MARGIN_PT), so a version saved before this
// milestone and one that explicitly picks "Normal" today render
// identically.
export const MARGIN_OPTIONS = ["narrow", "normal", "wide"] as const;
export type MarginOption = (typeof MARGIN_OPTIONS)[number];

// "letter" is defined to match both pdfkit's and the docx library's
// own pre-existing implicit default page size, for the same
// backward-compatibility reason as MARGIN_OPTIONS above (§12/§41).
export const PAGE_SIZES = ["letter", "a4"] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

export const templateSettingsSchema = z.object({
  templateId: z.enum(TEMPLATE_IDS).default("modern"),
  accentColor: z.enum(ACCENT_COLORS).default("blue"),
  fontFamily: z.enum(FONT_FAMILIES).default("inter"),
  fontSize: z.enum(FONT_SIZES).default("standard"),
  spacing: z.enum(SPACING_OPTIONS).default("standard"),
  /** A rendering configuration, never a second resume data model (§21) — every renderer reads this flag directly off TemplateSettings, never off DynamicResumeDocument. */
  atsMode: z.boolean().default(false),
  pageLength: z.enum(PAGE_LENGTHS).default("auto"),
  margin: z.enum(MARGIN_OPTIONS).default("normal"),
  pageSize: z.enum(PAGE_SIZES).default("letter"),
});
export type TemplateSettings = z.infer<typeof templateSettingsSchema>;

export const DEFAULT_TEMPLATE_SETTINGS: TemplateSettings = templateSettingsSchema.parse({});

/** PATCH body — every field optional so a client only sends what actually changed; the service layer merges onto the version's existing settings (or the defaults), mirroring updateSectionSchema's own partial-patch pattern from Milestone 13. */
export const updateTemplateSettingsSchema = z.object({
  templateId: z.enum(TEMPLATE_IDS).optional(),
  accentColor: z.enum(ACCENT_COLORS).optional(),
  fontFamily: z.enum(FONT_FAMILIES).optional(),
  fontSize: z.enum(FONT_SIZES).optional(),
  spacing: z.enum(SPACING_OPTIONS).optional(),
  atsMode: z.boolean().optional(),
  pageLength: z.enum(PAGE_LENGTHS).optional(),
  margin: z.enum(MARGIN_OPTIONS).optional(),
  pageSize: z.enum(PAGE_SIZES).optional(),
});
export type UpdateTemplateSettingsInput = z.infer<typeof updateTemplateSettingsSchema>;

export interface TemplateDefinition {
  id: TemplateId;
  name: string;
  description: string;
  /** "sidebar" templates split visible sections into two columns by section type (see template-registry.ts's sidebarSectionTypes) — collapsed to a single column whenever atsMode is on, since a multi-column layout is exactly the kind of structure §21 asks ATS mode to avoid. */
  layout: "single-column" | "sidebar";
  recommendedFor: string;
  defaultAccent: AccentColor;
  defaultFont: FontFamily;
  /** A rendering-characteristic label, not a numeric score — the existing content-based ATS Score feature (resume-score.ts) is a completely separate, unrelated concept (§31). */
  atsFriendliness: "high" | "medium";
  /** Only meaningful when layout === "sidebar" — which section TYPES render in the sidebar column, in the user's own order among themselves. Every other visible section renders in the main column, in the user's own order among themselves. The two-column split itself is the one thing the template layout requires; ordering within each column is always the user's. */
  sidebarSectionTypes?: SectionType[];
  /** Template-intrinsic visual flavor — NOT a user-configurable setting (only accent/font/fontSize/spacing/atsMode/pageLength are, per §9–§11's deliberately small, safe control set). Distinguishes the 5 templates from each other beyond color/font alone. */
  headerAlign: "left" | "center";
  sectionHeadingStyle: "accent-left-border" | "centered-divider" | "underline" | "plain-caps";
  /** Structured classification for the Template Gallery's filters — see the module-level comment above `TEMPLATE_CATEGORIES`. */
  category: TemplateCategory;
  experienceLevels: ExperienceLevel[];
  /** Structured, filterable tags (e.g. "general", "technology", "gcc", "academic") — distinct from `recommendedFor`, which stays free-text display copy. */
  industries: string[];
  /** Informational only — whether this template's default density/spacing is well-suited to a single page. Never enforced by the renderer (pageLength in TemplateSettings already covers that); purely a gallery filter hint. */
  isOnePage: boolean;
}
