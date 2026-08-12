import { z } from "zod";

// Phase 13 — Dynamic Resume Sections, Fields & Entries. Zod schemas
// for the dynamic, section-based resume document — validated at every
// write (saveDynamicDocument) so a malformed document can never reach
// rendering/export. Mirrors the snake_case/camelCase split every prior
// milestone's *-schema.ts establishes, adapted here since this is a
// nested document rather than a flat DB row.

export const SECTION_TYPES = [
  "SUMMARY",
  "EXPERIENCE",
  "EDUCATION",
  "PROJECTS",
  "SKILLS",
  "CERTIFICATIONS",
  "AWARDS",
  "ACHIEVEMENTS",
  "LANGUAGES",
  "PUBLICATIONS",
  "PATENTS",
  "COURSES",
  "TRAINING",
  "VOLUNTEER",
  "LEADERSHIP",
  "PROFESSIONAL_MEMBERSHIPS",
  "INTERESTS",
  "REFERENCES",
  "CUSTOM",
] as const;

export type SectionType = (typeof SECTION_TYPES)[number];

// A field's value is intentionally a small, closed union — string
// (text/textarea/date/url), string[] (a bullet/tag list), boolean
// (e.g. "Current"), or null (not set). Never `any`/`unknown` — every
// renderer and the empty-field check (dynamic-resume-render.ts) needs
// to exhaustively handle exactly these 4 shapes.
export const fieldValueSchema = z.union([z.string(), z.array(z.string()), z.boolean(), z.null()]);
export type FieldValue = z.infer<typeof fieldValueSchema>;

export const customFieldSchema = z.object({
  id: z.string(),
  label: z.string().min(1).max(100),
  value: z.string().max(2000),
  order: z.number().int(),
  visible: z.boolean().default(true),
});
export type CustomField = z.infer<typeof customFieldSchema>;

export const resumeEntrySchema = z.object({
  id: z.string(),
  order: z.number().int(),
  visible: z.boolean().default(true),
  fields: z.record(z.string(), fieldValueSchema).default({}),
  /** Field keys the user explicitly hid — independent of emptiness; an empty field is already never rendered (see dynamic-resume-render.ts's isFieldEmpty), this is for a field that HAS a value but the user doesn't want shown. */
  hiddenFieldKeys: z.array(z.string()).default([]),
  customFields: z.array(customFieldSchema).default([]),
});
export type ResumeEntry = z.infer<typeof resumeEntrySchema>;

/** Rendering toggles a template can honor uniformly for any section, regardless of type — deliberately small: only what every renderer (React preview, PDF, DOCX, Markdown) already knows how to respect. Not a template/theme system — see dynamic-resume-render.ts. */
export const sectionSettingsSchema = z.object({
  showTitle: z.boolean().default(true),
  showDivider: z.boolean().default(true),
});
export type SectionSettings = z.infer<typeof sectionSettingsSchema>;

export const resumeSectionSchema = z.object({
  id: z.string(),
  type: z.enum(SECTION_TYPES),
  title: z.string().min(1).max(100),
  order: z.number().int(),
  visible: z.boolean().default(true),
  /** Always kept in sync with `type === "CUSTOM"` by the document service — never set independently, so it can never disagree with `type`. Exposed as its own field because callers (and the milestone's own spec'd shape) shouldn't need to know CUSTOM is the sentinel value. */
  custom: z.boolean().default(false),
  entries: z.array(resumeEntrySchema).default([]),
  settings: sectionSettingsSchema.default({ showTitle: true, showDivider: true }),
});
export type ResumeSection = z.infer<typeof resumeSectionSchema>;

export const dynamicPersonalInformationSchema = z.object({
  name: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  location: z.string().nullable(),
  linkedin: z.string().nullable(),
  github: z.string().nullable(),
  website: z.string().nullable(),
});
export type DynamicPersonalInformation = z.infer<typeof dynamicPersonalInformationSchema>;

// schemaVersion lets a future migration distinguish "no dynamic
// document yet" (column is null) from "an old dynamic-document shape
// that needs upgrading" (column is set, version is stale) without
// touching every existing row.
export const DYNAMIC_RESUME_SCHEMA_VERSION = 1;

export const dynamicResumeDocumentSchema = z.object({
  schemaVersion: z.literal(DYNAMIC_RESUME_SCHEMA_VERSION),
  personalInformation: dynamicPersonalInformationSchema,
  sections: z.array(resumeSectionSchema).default([]),
});
export type DynamicResumeDocument = z.infer<typeof dynamicResumeDocumentSchema>;

// ---------------------------------------------------------------------------
// API request-body validation — the section type is ALWAYS validated
// against SECTION_TYPES server-side (z.enum below rejects anything
// else with a 400), never trusted as an arbitrary client string. A
// custom section's title is capped (max 100) and is rendered only as
// plain text (React escapes it automatically; the PDF/DOCX renderers
// pass it through pdfkit/docx's own text APIs, never string-templated
// into markup) — there is no template-injection surface here.
// ---------------------------------------------------------------------------

// Every field optional (a PATCH-style partial update) and empty-string
// normalized to null so "clear this field" and "field was never set"
// stay indistinguishable, matching dynamicPersonalInformationSchema's
// own all-nullable shape.
const optionalTrimmedString = z
  .string()
  .trim()
  .max(200)
  .optional()
  .transform((value) => (value ? value : value === "" ? null : value));

export const updatePersonalInformationSchema = z.object({
  name: optionalTrimmedString,
  email: optionalTrimmedString,
  phone: optionalTrimmedString,
  location: optionalTrimmedString,
  linkedin: optionalTrimmedString,
  github: optionalTrimmedString,
  website: optionalTrimmedString,
});

export const addSectionSchema = z.object({
  type: z.enum(SECTION_TYPES),
  title: z.string().trim().min(1).max(100).optional(),
});

export const updateSectionSchema = z.object({
  title: z.string().trim().min(1).max(100).optional(),
  visible: z.boolean().optional(),
  settings: z.object({ showTitle: z.boolean().optional(), showDivider: z.boolean().optional() }).optional(),
});

export const reorderSectionsSchema = z.object({
  orderedSectionIds: z.array(z.string()).min(1),
});

export const addEntrySchema = z.object({
  fields: z.record(z.string(), fieldValueSchema).optional(),
});

export const updateEntrySchema = z.object({
  fields: z.record(z.string(), fieldValueSchema).optional(),
  visible: z.boolean().optional(),
  hiddenFieldKeys: z.array(z.string()).optional(),
});

export const reorderEntriesSchema = z.object({
  orderedEntryIds: z.array(z.string()).min(1),
});

export const addCustomFieldSchema = z.object({
  label: z.string().trim().min(1).max(100),
  value: z.string().max(2000).default(""),
});

export const updateCustomFieldSchema = z.object({
  label: z.string().trim().min(1).max(100).optional(),
  value: z.string().max(2000).optional(),
  visible: z.boolean().optional(),
});
