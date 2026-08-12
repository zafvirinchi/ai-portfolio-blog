import { DynamicPersonalInformation, DynamicResumeDocument, SectionType, dynamicResumeDocumentSchema } from "./dynamic-resume-schema";
import { getSectionDefinition } from "./section-registry";
import { TemplateSettings, templateSettingsSchema } from "../templates/template-schema";
import { ResumeQualityReport } from "./resume-quality";
import { ContactQualityRow, SectionCompletenessRow, computeContactQuality, computeSectionCompleteness } from "./ats-explainability";

// Phase 15 Milestone 10 — the Final Resume Quality Gate. Answers "is
// this resume ready to submit," not "can AI make it better" (§2) — it
// NEVER re-scores ATS/JD (both are accepted as already-computed
// inputs, reused verbatim) and NEVER calls an LLM. Every check here is
// either a thin reuse of an existing engine (Section Completeness,
// Contact Quality, template/document schema validation) or a new,
// genuinely-missing deterministic check (dates, placeholders,
// duplicated content) — resume-quality.ts's own doc comment from
// Milestone 1 explicitly flagged date/chronology checking as
// out-of-scope THEN ("this codebase doesn't have real date parsing for
// free-text date fields") — this milestone is what finally builds it,
// deliberately lightweight and honest about its own limits (never
// guesses a date it can't confidently parse).

export type IssueSeverity = "critical" | "high" | "medium" | "low";
export type ReadinessLevel = "READY" | "NEEDS_IMPROVEMENT" | "NEEDS_REVIEW";

export interface QualityIssue {
  id: string;
  category: "contact" | "summary" | "experience" | "education" | "skills" | "projects" | "certifications" | "dates" | "duplication" | "placeholder" | "template" | "export" | "completeness";
  severity: IssueSeverity;
  title: string;
  description: string;
  sectionType: SectionType | null;
  actionable: boolean;
}

export interface QualityGateReport {
  readiness: ReadinessLevel;
  issues: QualityIssue[];
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  exportSafe: boolean;
  sectionCompleteness: SectionCompletenessRow[];
  contactQuality: ContactQualityRow[];
  personalInfoStatus: "Complete" | "Partial" | "Missing";
}

// ---------------------------------------------------------------------------
// Lightweight resume date parsing (§7) — deliberately small: only the
// formats resumes actually use ("Jan 2022", "January 2022", "01/2022",
// "2022-01", "2022", "Present"/"Current"). Returns null (never a guess)
// for anything else — every check below only ever compares dates BOTH
// sides of which parsed successfully, so an unparseable date never
// produces a false "invalid" report.
// ---------------------------------------------------------------------------

const MONTH_NAMES = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

export interface ParsedResumeDate {
  year: number;
  /** 1-12. Defaults to 1 (January) when only a year was given — comparisons involving a year-only date are therefore only precise to the year; documented here rather than silently claimed as exact. */
  month: number;
  /** True for "Present"/"Current"/"Now" — a deliberately far-future sentinel for range comparisons, never a real calendar date. */
  isPresent: boolean;
}

export function parseResumeDate(text: string | null | undefined): ParsedResumeDate | null {
  if (!text) return null;
  const trimmed = text.trim().toLowerCase();
  if (!trimmed) return null;

  if (["present", "current", "now", "ongoing"].includes(trimmed)) {
    return { year: 9999, month: 12, isPresent: true };
  }

  // "January 2022" / "Jan 2022" / "Jan. 2022"
  const monthYear = trimmed.match(/^([a-z]+)\.?\s+(\d{4})$/);
  if (monthYear) {
    const monthIndex = MONTH_NAMES.findIndex((name) => name.startsWith(monthYear[1]) && monthYear[1].length >= 3);
    if (monthIndex !== -1) return { year: Number(monthYear[2]), month: monthIndex + 1, isPresent: false };
  }

  // "01/2022" or "1/2022"
  const slash = trimmed.match(/^(\d{1,2})\/(\d{4})$/);
  if (slash && Number(slash[1]) >= 1 && Number(slash[1]) <= 12) {
    return { year: Number(slash[2]), month: Number(slash[1]), isPresent: false };
  }

  // "2022-01"
  const iso = trimmed.match(/^(\d{4})-(\d{1,2})$/);
  if (iso && Number(iso[2]) >= 1 && Number(iso[2]) <= 12) {
    return { year: Number(iso[1]), month: Number(iso[2]), isPresent: false };
  }

  // "2022" — year only
  const yearOnly = trimmed.match(/^(\d{4})$/);
  if (yearOnly) return { year: Number(yearOnly[1]), month: 1, isPresent: false };

  return null;
}

function dateOrdinal(date: ParsedResumeDate): number {
  return date.year * 12 + date.month;
}

// ---------------------------------------------------------------------------
// Placeholder detection (§12) — a fixed, deliberately conservative list.
// Matches are whole-value or clearly-a-placeholder-phrase, never a
// substring that could appear in legitimate content (e.g. "test" alone
// is excluded — "Tested and deployed microservices" must never be
// flagged).
// ---------------------------------------------------------------------------

const PLACEHOLDER_PATTERNS: RegExp[] = [
  /^lorem ipsum/i,
  /^\[.*\]$/, // "[Company Name]", "[Your Title]"
  /^your name$/i,
  /^company name$/i,
  /^job title$/i,
  /^description here$/i,
  /^todo:?$/i,
  /^tbd$/i,
  /^n\/a$/i,
  /^xxx+$/i,
  /^sample (text|resume|company|project)$/i,
  /^enter (your )?[a-z ]+ here$/i,
];

function isPlaceholder(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(trimmed));
}

// ---------------------------------------------------------------------------
// Duplicate content detection (§11) — normalized exact-match comparison
// only (lowercase, whitespace-collapsed) — never fuzzy/semantic
// similarity, so two genuinely different bullets that merely share
// common words are never flagged. Only text long enough to be a real
// sentence (not a single skill/date token) is compared, to avoid
// flagging legitimate short repeats (e.g. "React" appearing in both
// Skills and a project's technologies is normal, not a duplication bug).
// ---------------------------------------------------------------------------

const DUPLICATE_MIN_LENGTH = 25;

function normalizeForComparison(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function collectComparableTexts(document: DynamicResumeDocument): { sectionType: SectionType; text: string }[] {
  const texts: { sectionType: SectionType; text: string }[] = [];

  for (const section of document.sections) {
    for (const entry of section.entries) {
      for (const value of Object.values(entry.fields)) {
        if (typeof value === "string" && value.trim().length >= DUPLICATE_MIN_LENGTH) {
          texts.push({ sectionType: section.type, text: value });
        } else if (Array.isArray(value)) {
          for (const item of value) {
            if (item.trim().length >= DUPLICATE_MIN_LENGTH) texts.push({ sectionType: section.type, text: item });
          }
        }
      }
    }
  }

  return texts;
}

// ---------------------------------------------------------------------------
// Per-check functions — each returns the issues it finds; the
// aggregator (buildQualityGateReport) below just concatenates them.
// ---------------------------------------------------------------------------

function checkPlaceholders(document: DynamicResumeDocument): QualityIssue[] {
  const issues: QualityIssue[] = [];

  for (const section of document.sections) {
    for (const entry of section.entries) {
      for (const [key, value] of Object.entries(entry.fields)) {
        const values = typeof value === "string" ? [value] : Array.isArray(value) ? value : [];
        if (values.some((v) => isPlaceholder(v))) {
          issues.push({
            id: `placeholder-${entry.id}-${key}`,
            category: "placeholder",
            severity: "medium",
            title: `Placeholder text found in ${getSectionDefinition(section.type).label}`,
            description: `The "${key}" field still contains placeholder text that looks like it was never replaced with real content.`,
            sectionType: section.type,
            actionable: true,
          });
        }
      }
    }
  }

  return issues;
}

function checkDuplicateContent(document: DynamicResumeDocument): QualityIssue[] {
  const texts = collectComparableTexts(document);
  const seen = new Map<string, SectionType>();
  const flaggedNormalized = new Set<string>();
  const issues: QualityIssue[] = [];

  for (const { sectionType, text } of texts) {
    const normalized = normalizeForComparison(text);
    if (seen.has(normalized) && !flaggedNormalized.has(normalized)) {
      flaggedNormalized.add(normalized);
      issues.push({
        id: `duplicate-${normalized.slice(0, 24)}`,
        category: "duplication",
        severity: "medium",
        title: "Duplicated content detected",
        description: `The same text appears in more than one place (e.g. "${text.slice(0, 60)}${text.length > 60 ? "..." : ""}"). Consider making each entry distinct.`,
        sectionType,
        actionable: true,
      });
    }
    if (!seen.has(normalized)) seen.set(normalized, sectionType);
  }

  return issues;
}

/** §7 — within one EXPERIENCE/EDUCATION entry: end date before start date is mathematically invalid, reported distinctly from a mere overlap between two different entries. */
function checkDateRanges(document: DynamicResumeDocument): QualityIssue[] {
  const issues: QualityIssue[] = [];

  for (const section of document.sections) {
    if (section.type !== "EXPERIENCE" && section.type !== "EDUCATION") continue;

    for (const entry of section.entries) {
      const start = parseResumeDate(typeof entry.fields.startDate === "string" ? entry.fields.startDate : null);
      const end = parseResumeDate(typeof entry.fields.endDate === "string" ? entry.fields.endDate : null);
      if (!start || !end) continue; // never guess — only compare when both sides confidently parsed

      if (!end.isPresent && dateOrdinal(end) < dateOrdinal(start)) {
        issues.push({
          id: `date-range-${entry.id}`,
          category: "dates",
          severity: "high",
          title: `Invalid date range in ${getSectionDefinition(section.type).label}`,
          description: "The end date is earlier than the start date for this entry.",
          sectionType: section.type,
          actionable: true,
        });
      }
    }
  }

  return issues;
}

/** §7 — across EXPERIENCE entries only (education overlap, e.g. concurrent part-time study, is common and not flagged). Reported as "potential" — never "invalid" — since legitimately overlapping roles (e.g. consulting alongside a full-time job) do happen. */
function checkDateOverlaps(document: DynamicResumeDocument): QualityIssue[] {
  const experienceSection = document.sections.find((section) => section.type === "EXPERIENCE");
  if (!experienceSection) return [];

  const ranges = experienceSection.entries
    .map((entry) => {
      const start = parseResumeDate(typeof entry.fields.startDate === "string" ? entry.fields.startDate : null);
      const end = parseResumeDate(typeof entry.fields.endDate === "string" ? entry.fields.endDate : null);
      const isCurrent = entry.fields.current === true;
      const effectiveEnd = isCurrent ? { year: 9999, month: 12, isPresent: true } : end;
      return start && effectiveEnd ? { entryId: entry.id, start, end: effectiveEnd } : null;
    })
    .filter((range): range is { entryId: string; start: ParsedResumeDate; end: ParsedResumeDate } => range !== null);

  const issues: QualityIssue[] = [];
  const flaggedPairs = new Set<string>();

  for (let i = 0; i < ranges.length; i++) {
    for (let j = i + 1; j < ranges.length; j++) {
      const a = ranges[i];
      const b = ranges[j];
      const overlaps = dateOrdinal(a.start) <= dateOrdinal(b.end) && dateOrdinal(b.start) <= dateOrdinal(a.end);
      const pairKey = [a.entryId, b.entryId].sort().join(":");

      if (overlaps && !flaggedPairs.has(pairKey)) {
        flaggedPairs.add(pairKey);
        issues.push({
          id: `date-overlap-${pairKey}`,
          category: "dates",
          severity: "medium",
          title: "Potential date overlap in Experience",
          description: "Two experience entries have overlapping date ranges. This may be intentional (e.g. concurrent roles) — review to confirm it's correct.",
          sectionType: "EXPERIENCE",
          actionable: true,
        });
      }
    }
  }

  return issues;
}

/** §8 — duplicate skill names within the same category, case-insensitive. Never removes/adds anything — reporting only. */
function checkSkillsQuality(document: DynamicResumeDocument): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const skillsSection = document.sections.find((section) => section.type === "SKILLS");
  if (!skillsSection) return issues;

  for (const entry of skillsSection.entries) {
    const skills = Array.isArray(entry.fields.skills) ? entry.fields.skills : [];
    const seen = new Set<string>();
    const duplicates = new Set<string>();

    for (const skill of skills) {
      const key = skill.trim().toLowerCase();
      if (!key) continue;
      if (seen.has(key)) duplicates.add(skill.trim());
      seen.add(key);
    }

    if (duplicates.size > 0) {
      issues.push({
        id: `skills-duplicate-${entry.id}`,
        category: "skills",
        severity: "low",
        title: "Duplicate skills listed",
        description: `"${[...duplicates].join(", ")}" appears more than once in the same skills list.`,
        sectionType: "SKILLS",
        actionable: true,
      });
    }
  }

  return issues;
}

/** §6/§9/§10 — an entry with none of its defining fields filled in is empty in substance, even if it technically exists. Never invents what's missing — only reports that it's missing. */
const PRIMARY_FIELD_KEYS: Partial<Record<SectionType, string[]>> = {
  EXPERIENCE: ["jobTitle", "company"],
  EDUCATION: ["degree", "institution"],
  PROJECTS: ["projectName"],
  CERTIFICATIONS: ["name"],
};

function isFieldValueEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function checkEntryCompleteness(document: DynamicResumeDocument): QualityIssue[] {
  const issues: QualityIssue[] = [];

  for (const section of document.sections) {
    const primaryKeys = PRIMARY_FIELD_KEYS[section.type];
    if (!primaryKeys) continue;

    for (const entry of section.entries) {
      const allEmpty = primaryKeys.every((key) => isFieldValueEmpty(entry.fields[key]));
      if (allEmpty) {
        issues.push({
          id: `empty-entry-${entry.id}`,
          category: sectionCategoryFor(section.type),
          severity: "medium",
          title: `Empty entry in ${getSectionDefinition(section.type).label}`,
          description: `An entry in ${getSectionDefinition(section.type).label} has no ${primaryKeys.join(" or ")} filled in.`,
          sectionType: section.type,
          actionable: true,
        });
      }
    }
  }

  return issues;
}

function sectionCategoryFor(type: SectionType): QualityIssue["category"] {
  if (type === "EXPERIENCE") return "experience";
  if (type === "EDUCATION") return "education";
  if (type === "PROJECTS") return "projects";
  if (type === "CERTIFICATIONS") return "certifications";
  if (type === "SKILLS") return "skills";
  return "completeness";
}

/** §14/§15 — reuses the SAME schemas already enforced on every save (Milestone 1/5) — this is a defensive re-check, not a new validation mechanism. In normal operation this should never fail for a version that was ever successfully saved; it exists for the rare case of a legacy/corrupted row. */
function checkTemplateAndExportSafety(document: DynamicResumeDocument, templateSettings: TemplateSettings): { issues: QualityIssue[]; exportSafe: boolean } {
  const issues: QualityIssue[] = [];
  let exportSafe = true;

  const documentResult = dynamicResumeDocumentSchema.safeParse(document);
  if (!documentResult.success) {
    exportSafe = false;
    issues.push({
      id: "export-invalid-document",
      category: "export",
      severity: "critical",
      title: "Resume document failed validation",
      description: "This version's document structure is invalid and cannot be safely exported.",
      sectionType: null,
      actionable: false,
    });
  }

  const templateResult = templateSettingsSchema.safeParse(templateSettings);
  if (!templateResult.success) {
    exportSafe = false;
    issues.push({
      id: "export-invalid-template",
      category: "template",
      severity: "critical",
      title: "Template configuration is invalid",
      description: "This version's template/design settings are invalid and cannot be safely exported.",
      sectionType: null,
      actionable: false,
    });
  }

  return { issues, exportSafe };
}

function checkContact(personalInformation: DynamicPersonalInformation): { issues: QualityIssue[]; rows: ContactQualityRow[]; status: "Complete" | "Partial" | "Missing" } {
  const rows = computeContactQuality(personalInformation);
  const issues: QualityIssue[] = [];

  const hasName = rows.find((r) => r.field === "name")?.present ?? false;
  const hasEmail = rows.find((r) => r.field === "email")?.present ?? false;
  const hasPhone = rows.find((r) => r.field === "phone")?.present ?? false;

  if (!hasEmail) {
    issues.push({
      id: "missing-contact-email",
      category: "contact",
      severity: "high",
      title: "Email address is missing",
      description: "Recruiters may not have a reliable way to contact you.",
      sectionType: null,
      actionable: true,
    });
  }
  if (!hasPhone) {
    issues.push({
      id: "missing-contact-phone",
      category: "contact",
      severity: "low",
      title: "Phone number is missing",
      description: "A phone number is optional but commonly expected on a resume.",
      sectionType: null,
      actionable: true,
    });
  }

  // §4 — Complete/Partial/Missing, using only name+email+phone (the fields §4 itself calls out as not-optional-in-spirit); LinkedIn/GitHub/portfolio remain bonus fields, never required for "Complete".
  const status: "Complete" | "Partial" | "Missing" = !hasName && !hasEmail ? "Missing" : hasName && hasEmail && hasPhone ? "Complete" : "Partial";

  return { issues, rows, status };
}

// ---------------------------------------------------------------------------
// The aggregator (§17/§20/§21) — combines every check above with the
// ALREADY-COMPUTED, reused inputs (ATS score, Section Completeness,
// resume-quality.ts's own report) into one readiness classification.
// Never recomputes ATS/JD; never introduces a second "Resume Score."
// ---------------------------------------------------------------------------

/**
 * Readiness rule (documented per §17's explicit "do not use arbitrary
 * thresholds without documenting the reason"):
 * - NEEDS_REVIEW: at least one critical (export-blocking/structural) or
 *   high (e.g. missing email, invalid date range) issue — something a
 *   recruiter or the export pipeline would actually trip over.
 * - NEEDS_IMPROVEMENT: no critical/high issue, but at least one medium
 *   issue (placeholder text, duplicated content, an empty entry,
 *   incomplete contact info) — nothing blocking, but worth fixing.
 * - READY: only low-severity issues (or none) remain.
 */
function classifyReadiness(criticalCount: number, highCount: number, mediumCount: number): ReadinessLevel {
  if (criticalCount > 0 || highCount > 0) return "NEEDS_REVIEW";
  if (mediumCount > 0) return "NEEDS_IMPROVEMENT";
  return "READY";
}

export function buildQualityGateReport(params: {
  document: DynamicResumeDocument;
  templateSettings: TemplateSettings;
  qualityReport: ResumeQualityReport;
}): QualityGateReport {
  const { document, templateSettings, qualityReport } = params;

  const sectionCompleteness = computeSectionCompleteness(document);
  const contact = checkContact(document.personalInformation);
  const { issues: templateExportIssues, exportSafe } = checkTemplateAndExportSafety(document, templateSettings);

  const missingRecommendedSections = sectionCompleteness.filter((row) => row.status === "Missing");
  const completenessIssues: QualityIssue[] = missingRecommendedSections.map((row) => ({
    id: `missing-section-${row.type}`,
    category: "completeness",
    severity: "medium",
    title: `${row.label} section is missing`,
    description: `${row.label} is a commonly-expected section that hasn't been added yet.`,
    sectionType: row.type,
    actionable: true,
  }));

  // resume-quality.ts's own warnings (empty/thin sections, page-length concerns) reused verbatim, not recomputed — mapped to "low" since none of them are export-blocking.
  const qualityWarningIssues: QualityIssue[] = qualityReport.warnings.map((warning, index) => ({
    id: `resume-quality-${index}`,
    category: "completeness",
    severity: "low",
    title: "Resume quality note",
    description: warning,
    sectionType: null,
    actionable: false,
  }));

  const issues: QualityIssue[] = [
    ...contact.issues,
    ...completenessIssues,
    ...checkEntryCompleteness(document),
    ...checkDateRanges(document),
    ...checkDateOverlaps(document),
    ...checkPlaceholders(document),
    ...checkDuplicateContent(document),
    ...checkSkillsQuality(document),
    ...templateExportIssues,
    ...qualityWarningIssues,
  ];

  const criticalCount = issues.filter((i) => i.severity === "critical").length;
  const highCount = issues.filter((i) => i.severity === "high").length;
  const mediumCount = issues.filter((i) => i.severity === "medium").length;
  const lowCount = issues.filter((i) => i.severity === "low").length;

  return {
    readiness: classifyReadiness(criticalCount, highCount, mediumCount),
    issues,
    criticalCount,
    highCount,
    mediumCount,
    lowCount,
    exportSafe,
    sectionCompleteness,
    contactQuality: contact.rows,
    personalInfoStatus: contact.status,
  };
}
