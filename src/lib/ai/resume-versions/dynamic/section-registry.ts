import { SectionType } from "./dynamic-resume-schema";

// The single source of truth for "what fields exist on an entry of
// this section type" — drives the generic SectionEditor/EntryEditor
// UI (which fields to render inputs for) AND documents the expected
// shape for AI-populated content. Entries are never restricted to
// ONLY these fields (a user can always add custom fields on top, per
// the milestone's own "however, do not make the system dependent on
// these fields only" instruction) — this registry is a rendering/UI
// hint, not a validation whitelist (resumeEntrySchema's `fields` is a
// free-form record).

export type FieldType = "text" | "textarea" | "date" | "boolean" | "list" | "url";

export interface FieldDefinition {
  key: string;
  label: string;
  type: FieldType;
}

export interface SectionTypeDefinition {
  type: SectionType;
  label: string;
  /** SUMMARY/SKILLS-as-freeform-list/INTERESTS are "one implicit entry" sections in spirit, but are still modeled as entries[] (usually length 1) for a single rendering/editing code path — this flag only affects whether the UI shows "+ Add Entry" or treats the section as single-entry. */
  supportsMultipleEntries: boolean;
  entryFields: FieldDefinition[];
  /** The noun used for this section's "+ Add {defaultEntryLabel}" button — e.g. "+ Add Experience", "+ Add Certification". */
  defaultEntryLabel: string;
  /** Which group the "+ Add Section" picker lists this type under. CUSTOM is handled separately (always listed last, in its own row) and has no group. */
  group: "recommended" | "more" | null;
}

const EXPERIENCE_FIELDS: FieldDefinition[] = [
  { key: "jobTitle", label: "Job Title", type: "text" },
  { key: "company", label: "Company", type: "text" },
  { key: "location", label: "Location", type: "text" },
  { key: "startDate", label: "Start Date", type: "date" },
  { key: "endDate", label: "End Date", type: "date" },
  { key: "current", label: "Current Position", type: "boolean" },
  { key: "description", label: "Description", type: "textarea" },
  { key: "achievements", label: "Achievements", type: "list" },
  { key: "technologies", label: "Technologies", type: "list" },
];

const EDUCATION_FIELDS: FieldDefinition[] = [
  { key: "degree", label: "Degree", type: "text" },
  { key: "institution", label: "Institution", type: "text" },
  { key: "location", label: "Location", type: "text" },
  { key: "startDate", label: "Start Date", type: "date" },
  { key: "endDate", label: "End Date", type: "date" },
  { key: "gpa", label: "GPA", type: "text" },
  { key: "description", label: "Description", type: "textarea" },
];

const PROJECT_FIELDS: FieldDefinition[] = [
  { key: "projectName", label: "Project Name", type: "text" },
  { key: "role", label: "Role", type: "text" },
  { key: "description", label: "Description", type: "textarea" },
  { key: "technologies", label: "Technologies", type: "list" },
  { key: "url", label: "URL", type: "url" },
  { key: "startDate", label: "Start Date", type: "date" },
  { key: "endDate", label: "End Date", type: "date" },
  { key: "achievements", label: "Achievements", type: "list" },
];

const CERTIFICATION_FIELDS: FieldDefinition[] = [
  { key: "name", label: "Certification Name", type: "text" },
  { key: "issuer", label: "Issuer", type: "text" },
  { key: "issueDate", label: "Issue Date", type: "date" },
  { key: "expirationDate", label: "Expiration Date", type: "date" },
  { key: "credentialId", label: "Credential ID", type: "text" },
  { key: "credentialUrl", label: "Credential URL", type: "url" },
];

const AWARD_FIELDS: FieldDefinition[] = [
  { key: "title", label: "Award Title", type: "text" },
  { key: "issuer", label: "Issuer", type: "text" },
  { key: "date", label: "Date", type: "date" },
  { key: "description", label: "Description", type: "textarea" },
];

const PUBLICATION_FIELDS: FieldDefinition[] = [
  { key: "title", label: "Title", type: "text" },
  { key: "publisher", label: "Publisher", type: "text" },
  { key: "publicationDate", label: "Publication Date", type: "date" },
  { key: "url", label: "URL", type: "url" },
  { key: "description", label: "Description", type: "textarea" },
];

const PATENT_FIELDS: FieldDefinition[] = [
  { key: "title", label: "Title", type: "text" },
  { key: "patentNumber", label: "Patent Number", type: "text" },
  { key: "filingDate", label: "Filing Date", type: "date" },
  { key: "status", label: "Status", type: "text" },
  { key: "url", label: "URL", type: "url" },
  { key: "description", label: "Description", type: "textarea" },
];

const LANGUAGE_FIELDS: FieldDefinition[] = [
  { key: "language", label: "Language", type: "text" },
  { key: "proficiency", label: "Proficiency", type: "text" },
];

const COURSE_FIELDS: FieldDefinition[] = [
  { key: "name", label: "Course Name", type: "text" },
  { key: "provider", label: "Provider", type: "text" },
  { key: "date", label: "Date", type: "date" },
  { key: "url", label: "URL", type: "url" },
];

const TRAINING_FIELDS: FieldDefinition[] = [
  { key: "name", label: "Training Name", type: "text" },
  { key: "provider", label: "Provider", type: "text" },
  { key: "date", label: "Date", type: "date" },
  { key: "description", label: "Description", type: "textarea" },
];

const MEMBERSHIP_FIELDS: FieldDefinition[] = [
  { key: "organization", label: "Organization", type: "text" },
  { key: "role", label: "Role", type: "text" },
  { key: "startDate", label: "Start Date", type: "date" },
  { key: "endDate", label: "End Date", type: "date" },
];

const VOLUNTEER_FIELDS: FieldDefinition[] = [
  { key: "organization", label: "Organization", type: "text" },
  { key: "role", label: "Role", type: "text" },
  { key: "startDate", label: "Start Date", type: "date" },
  { key: "endDate", label: "End Date", type: "date" },
  { key: "description", label: "Description", type: "textarea" },
];

const LEADERSHIP_FIELDS: FieldDefinition[] = [
  { key: "title", label: "Title", type: "text" },
  { key: "organization", label: "Organization", type: "text" },
  { key: "startDate", label: "Start Date", type: "date" },
  { key: "endDate", label: "End Date", type: "date" },
  { key: "description", label: "Description", type: "textarea" },
];

const ACHIEVEMENT_FIELDS: FieldDefinition[] = [{ key: "description", label: "Achievement", type: "textarea" }];

const REFERENCE_FIELDS: FieldDefinition[] = [
  { key: "name", label: "Name", type: "text" },
  { key: "title", label: "Title", type: "text" },
  { key: "company", label: "Company", type: "text" },
  { key: "email", label: "Email", type: "text" },
  { key: "phone", label: "Phone", type: "text" },
];

const SUMMARY_FIELDS: FieldDefinition[] = [{ key: "content", label: "Summary", type: "textarea" }];

const SKILLS_FIELDS: FieldDefinition[] = [
  { key: "category", label: "Category", type: "text" },
  { key: "skills", label: "Skills", type: "list" },
];

const INTERESTS_FIELDS: FieldDefinition[] = [{ key: "items", label: "Interests", type: "list" }];

export const SECTION_REGISTRY: Record<SectionType, SectionTypeDefinition> = {
  SUMMARY: { type: "SUMMARY", label: "Professional Summary", supportsMultipleEntries: false, entryFields: SUMMARY_FIELDS, defaultEntryLabel: "Summary", group: "recommended" },
  EXPERIENCE: { type: "EXPERIENCE", label: "Experience", supportsMultipleEntries: true, entryFields: EXPERIENCE_FIELDS, defaultEntryLabel: "Experience", group: "recommended" },
  EDUCATION: { type: "EDUCATION", label: "Education", supportsMultipleEntries: true, entryFields: EDUCATION_FIELDS, defaultEntryLabel: "Education", group: "recommended" },
  PROJECTS: { type: "PROJECTS", label: "Projects", supportsMultipleEntries: true, entryFields: PROJECT_FIELDS, defaultEntryLabel: "Project", group: "recommended" },
  SKILLS: { type: "SKILLS", label: "Skills", supportsMultipleEntries: true, entryFields: SKILLS_FIELDS, defaultEntryLabel: "Skill Category", group: "recommended" },
  CERTIFICATIONS: { type: "CERTIFICATIONS", label: "Certifications", supportsMultipleEntries: true, entryFields: CERTIFICATION_FIELDS, defaultEntryLabel: "Certification", group: "recommended" },
  AWARDS: { type: "AWARDS", label: "Awards", supportsMultipleEntries: true, entryFields: AWARD_FIELDS, defaultEntryLabel: "Award", group: "more" },
  ACHIEVEMENTS: { type: "ACHIEVEMENTS", label: "Achievements", supportsMultipleEntries: true, entryFields: ACHIEVEMENT_FIELDS, defaultEntryLabel: "Achievement", group: "more" },
  PUBLICATIONS: { type: "PUBLICATIONS", label: "Publications", supportsMultipleEntries: true, entryFields: PUBLICATION_FIELDS, defaultEntryLabel: "Publication", group: "more" },
  PATENTS: { type: "PATENTS", label: "Patents", supportsMultipleEntries: true, entryFields: PATENT_FIELDS, defaultEntryLabel: "Patent", group: "more" },
  LANGUAGES: { type: "LANGUAGES", label: "Languages", supportsMultipleEntries: true, entryFields: LANGUAGE_FIELDS, defaultEntryLabel: "Language", group: "more" },
  VOLUNTEER: { type: "VOLUNTEER", label: "Volunteer Experience", supportsMultipleEntries: true, entryFields: VOLUNTEER_FIELDS, defaultEntryLabel: "Volunteer Experience", group: "more" },
  LEADERSHIP: { type: "LEADERSHIP", label: "Leadership", supportsMultipleEntries: true, entryFields: LEADERSHIP_FIELDS, defaultEntryLabel: "Leadership Role", group: "more" },
  COURSES: { type: "COURSES", label: "Courses", supportsMultipleEntries: true, entryFields: COURSE_FIELDS, defaultEntryLabel: "Course", group: "more" },
  TRAINING: { type: "TRAINING", label: "Training", supportsMultipleEntries: true, entryFields: TRAINING_FIELDS, defaultEntryLabel: "Training", group: "more" },
  PROFESSIONAL_MEMBERSHIPS: {
    type: "PROFESSIONAL_MEMBERSHIPS",
    label: "Professional Memberships",
    supportsMultipleEntries: true,
    entryFields: MEMBERSHIP_FIELDS,
    defaultEntryLabel: "Membership",
    group: "more",
  },
  INTERESTS: { type: "INTERESTS", label: "Interests", supportsMultipleEntries: false, entryFields: INTERESTS_FIELDS, defaultEntryLabel: "Interests", group: "more" },
  REFERENCES: { type: "REFERENCES", label: "References", supportsMultipleEntries: true, entryFields: REFERENCE_FIELDS, defaultEntryLabel: "Reference", group: "more" },
  CUSTOM: { type: "CUSTOM", label: "Custom Section", supportsMultipleEntries: true, entryFields: [], defaultEntryLabel: "Entry", group: null },
};

/** Every type offered by the "+ Add Section" picker, "Recommended" group first, in the milestone spec's own order — the section-registry's own `group` field is the single source of truth this list is derived from. */
export const ADDABLE_SECTION_TYPES: SectionType[] = Object.values(SECTION_REGISTRY)
  .filter((definition) => definition.group === "recommended")
  .map((definition) => definition.type)
  .concat(
    Object.values(SECTION_REGISTRY)
      .filter((definition) => definition.group === "more")
      .map((definition) => definition.type),
    ["CUSTOM"]
  );

/** The "+ Add Section" picker's two labeled groups (Recommended / More), each in registry-declaration order — what `AddSectionMenu` actually renders. `CUSTOM` is always offered as its own trailing option, never grouped. */
export const RECOMMENDED_SECTION_TYPES: SectionType[] = Object.values(SECTION_REGISTRY)
  .filter((definition) => definition.group === "recommended")
  .map((definition) => definition.type);

export const MORE_SECTION_TYPES: SectionType[] = Object.values(SECTION_REGISTRY)
  .filter((definition) => definition.group === "more")
  .map((definition) => definition.type);

export function getSectionDefinition(type: SectionType): SectionTypeDefinition {
  return SECTION_REGISTRY[type];
}
