import { describe, expect, it } from "vitest";

import { DynamicResumeDocument, DYNAMIC_RESUME_SCHEMA_VERSION, ResumeEntry, ResumeSection } from "./dynamic-resume-schema";
import { DEFAULT_TEMPLATE_SETTINGS } from "../templates/template-schema";
import { checkResumeQuality } from "./resume-quality";
import { resolveTemplateStyles } from "../templates/template-styles";
import { buildQualityGateReport, parseResumeDate } from "./quality-gate";

function entry(overrides: Partial<ResumeEntry> = {}): ResumeEntry {
  return { id: "entry-1", order: 0, visible: true, fields: {}, hiddenFieldKeys: [], customFields: [], ...overrides };
}

function section(overrides: Partial<ResumeSection> = {}): ResumeSection {
  return { id: "section-1", type: "EXPERIENCE", title: "Experience", order: 0, visible: true, custom: false, entries: [], settings: { showTitle: true, showDivider: true }, ...overrides };
}

function document(sections: ResumeSection[], overrides: Partial<DynamicResumeDocument["personalInformation"]> = {}): DynamicResumeDocument {
  return {
    schemaVersion: DYNAMIC_RESUME_SCHEMA_VERSION,
    personalInformation: { name: "Jane Doe", email: "jane@example.com", phone: "+1 555 0100", location: null, linkedin: null, github: null, website: null, ...overrides },
    sections,
  };
}

/** A document with every recommended section populated, no dates, no placeholders — the "everything's fine" baseline most tests start from. */
function healthyDocument(): DynamicResumeDocument {
  return document([
    section({ id: "summary", type: "SUMMARY", title: "Summary", order: 0, entries: [entry({ fields: { content: "Experienced backend engineer with a focus on distributed systems." } })] }),
    section({
      id: "experience",
      type: "EXPERIENCE",
      title: "Experience",
      order: 1,
      entries: [entry({ id: "job-1", fields: { jobTitle: "Engineer", company: "Acme", startDate: "Jan 2020", endDate: "Present", current: true, achievements: ["Built and shipped a payments platform."] } })],
    }),
    section({ id: "education", type: "EDUCATION", title: "Education", order: 2, entries: [entry({ fields: { degree: "B.Sc. Computer Science", institution: "State University" } })] }),
    section({ id: "skills", type: "SKILLS", title: "Skills", order: 3, entries: [entry({ fields: { category: "Technical Skills", skills: ["TypeScript", "React"] } })] }),
    // RECOMMENDED_SECTION_TYPES also includes PROJECTS/CERTIFICATIONS — included here so this fixture is genuinely complete (§3.C's "do not require every section" still means an ABSENT recommended section is flagged, just at low/medium severity, never critical/high — see the dedicated NEEDS_IMPROVEMENT test below for that case).
    section({ id: "projects", type: "PROJECTS", title: "Projects", order: 4, entries: [entry({ fields: { projectName: "Internal Tooling", description: "Built and maintained internal developer tooling." } })] }),
    section({ id: "certifications", type: "CERTIFICATIONS", title: "Certifications", order: 5, entries: [entry({ fields: { name: "AWS Certified Developer" } })] }),
  ]);
}

function buildReport(doc: DynamicResumeDocument) {
  const styles = resolveTemplateStyles(DEFAULT_TEMPLATE_SETTINGS);
  const qualityReport = checkResumeQuality(doc, styles);
  return buildQualityGateReport({ document: doc, templateSettings: DEFAULT_TEMPLATE_SETTINGS, qualityReport });
}

describe("parseResumeDate", () => {
  it("parses common resume date formats", () => {
    expect(parseResumeDate("Jan 2022")).toEqual({ year: 2022, month: 1, isPresent: false });
    expect(parseResumeDate("January 2022")).toEqual({ year: 2022, month: 1, isPresent: false });
    expect(parseResumeDate("2022")).toEqual({ year: 2022, month: 1, isPresent: false });
    expect(parseResumeDate("01/2022")).toEqual({ year: 2022, month: 1, isPresent: false });
    expect(parseResumeDate("2022-06")).toEqual({ year: 2022, month: 6, isPresent: false });
  });

  it("treats Present/Current as a far-future sentinel", () => {
    expect(parseResumeDate("Present")?.isPresent).toBe(true);
    expect(parseResumeDate("current")?.isPresent).toBe(true);
  });

  it("never guesses — returns null for anything it can't confidently parse", () => {
    expect(parseResumeDate("sometime last year")).toBeNull();
    expect(parseResumeDate("")).toBeNull();
    expect(parseResumeDate(null)).toBeNull();
    expect(parseResumeDate(undefined)).toBeNull();
  });
});

describe("buildQualityGateReport — readiness classification", () => {
  it("classifies a complete, issue-free resume as READY", () => {
    const report = buildReport(healthyDocument());
    expect(report.readiness).toBe("READY");
    expect(report.criticalCount).toBe(0);
    expect(report.highCount).toBe(0);
  });

  it("classifies a resume with only a medium issue (e.g. a missing recommended section) as NEEDS_IMPROVEMENT", () => {
    const doc = document([
      section({ id: "summary", type: "SUMMARY", entries: [entry({ fields: { content: "A summary long enough to not be flagged as thin content here." } })] }),
      section({
        id: "experience",
        type: "EXPERIENCE",
        order: 1,
        entries: [entry({ fields: { jobTitle: "Engineer", company: "Acme" } })],
      }),
      // No EDUCATION, no SKILLS — both recommended, both missing.
    ]);
    const report = buildReport(doc);
    expect(report.readiness).toBe("NEEDS_IMPROVEMENT");
    expect(report.criticalCount).toBe(0);
    expect(report.highCount).toBe(0);
    expect(report.mediumCount).toBeGreaterThan(0);
  });

  it("classifies a resume with a high-severity issue (missing email) as NEEDS_REVIEW", () => {
    const report = buildReport(document([], { email: null }));
    expect(report.readiness).toBe("NEEDS_REVIEW");
    expect(report.issues.some((issue) => issue.id === "missing-contact-email")).toBe(true);
  });

  it("classifies a resume with an invalid date range as NEEDS_REVIEW", () => {
    const doc = document([
      section({
        id: "experience",
        type: "EXPERIENCE",
        entries: [entry({ fields: { jobTitle: "Engineer", company: "Acme", startDate: "Jan 2022", endDate: "Jan 2020" } })],
      }),
    ]);
    const report = buildReport(doc);
    expect(report.readiness).toBe("NEEDS_REVIEW");
    expect(report.issues.some((issue) => issue.category === "dates" && issue.severity === "high")).toBe(true);
  });
});

describe("buildQualityGateReport — date validation", () => {
  it("does not flag a valid, in-order date range", () => {
    const doc = document([section({ id: "experience", type: "EXPERIENCE", entries: [entry({ fields: { jobTitle: "Engineer", company: "Acme", startDate: "Jan 2020", endDate: "Jan 2022" } })] })]);
    const report = buildReport(doc);
    expect(report.issues.filter((i) => i.category === "dates")).toHaveLength(0);
  });

  it("flags two overlapping EXPERIENCE entries as a potential (not definite) overlap", () => {
    const doc = document([
      section({
        id: "experience",
        type: "EXPERIENCE",
        entries: [
          entry({ id: "job-1", fields: { jobTitle: "Engineer", company: "Acme", startDate: "Jan 2020", endDate: "Dec 2021" } }),
          entry({ id: "job-2", fields: { jobTitle: "Consultant", company: "Beta", startDate: "Jun 2021", endDate: "Jun 2022" } }),
        ],
      }),
    ]);
    const report = buildReport(doc);
    const overlapIssue = report.issues.find((i) => i.id.startsWith("date-overlap-"));
    expect(overlapIssue).toBeDefined();
    expect(overlapIssue?.severity).toBe("medium"); // never "invalid" — see §7
    expect(overlapIssue?.title).toContain("Potential");
  });

  it("does not flag non-overlapping experience entries", () => {
    const doc = document([
      section({
        id: "experience",
        type: "EXPERIENCE",
        entries: [
          entry({ id: "job-1", fields: { jobTitle: "Engineer", company: "Acme", startDate: "Jan 2018", endDate: "Dec 2019" } }),
          entry({ id: "job-2", fields: { jobTitle: "Consultant", company: "Beta", startDate: "Jan 2020", endDate: "Dec 2021" } }),
        ],
      }),
    ]);
    const report = buildReport(doc);
    expect(report.issues.some((i) => i.id.startsWith("date-overlap-"))).toBe(false);
  });

  it("never flags a date issue when one side is unparseable — no guessing", () => {
    const doc = document([section({ id: "experience", type: "EXPERIENCE", entries: [entry({ fields: { jobTitle: "Engineer", company: "Acme", startDate: "a while back", endDate: "Jan 2020" } })] })]);
    const report = buildReport(doc);
    expect(report.issues.filter((i) => i.category === "dates")).toHaveLength(0);
  });
});

describe("buildQualityGateReport — placeholder detection", () => {
  it("flags obvious placeholder text", () => {
    const doc = document([section({ id: "summary", type: "SUMMARY", entries: [entry({ fields: { content: "Lorem ipsum dolor sit amet" } })] })]);
    const report = buildReport(doc);
    expect(report.issues.some((i) => i.category === "placeholder")).toBe(true);
  });

  it("flags bracket-style placeholders", () => {
    const doc = document([section({ id: "experience", type: "EXPERIENCE", entries: [entry({ fields: { jobTitle: "Engineer", company: "[Company Name]" } })] })]);
    const report = buildReport(doc);
    expect(report.issues.some((i) => i.category === "placeholder")).toBe(true);
  });

  it("does not flag legitimate content that happens to share a word with a placeholder pattern", () => {
    const doc = document([section({ id: "experience", type: "EXPERIENCE", entries: [entry({ fields: { jobTitle: "QA Test Engineer", company: "Acme", achievements: ["Tested and validated payment flows before release."] } })] })]);
    const report = buildReport(doc);
    expect(report.issues.filter((i) => i.category === "placeholder")).toHaveLength(0);
  });
});

describe("buildQualityGateReport — duplicate content detection", () => {
  it("flags the same long text appearing in two different places", () => {
    const repeated = "Led a cross-functional team to deliver a major platform migration.";
    const doc = document([
      section({ id: "summary", type: "SUMMARY", entries: [entry({ fields: { content: repeated } })] }),
      section({ id: "experience", type: "EXPERIENCE", order: 1, entries: [entry({ fields: { jobTitle: "Engineer", company: "Acme", achievements: [repeated] } })] }),
    ]);
    const report = buildReport(doc);
    expect(report.issues.some((i) => i.category === "duplication")).toBe(true);
  });

  it("does not flag short, legitimately-repeated tokens (e.g. a skill name appearing in Skills and a project)", () => {
    const doc = document([
      section({ id: "skills", type: "SKILLS", entries: [entry({ fields: { category: "Technical Skills", skills: ["React"] } })] }),
      section({ id: "projects", type: "PROJECTS", order: 1, entries: [entry({ fields: { projectName: "Dashboard", technologies: ["React"] } })] }),
    ]);
    const report = buildReport(doc);
    expect(report.issues.filter((i) => i.category === "duplication")).toHaveLength(0);
  });

  it("does not flag two similar-but-genuinely-different bullets", () => {
    const doc = document([
      section({
        id: "experience",
        type: "EXPERIENCE",
        entries: [entry({ fields: { jobTitle: "Engineer", company: "Acme", achievements: ["Built the payments service from scratch.", "Built the notifications service from scratch."] } })],
      }),
    ]);
    const report = buildReport(doc);
    expect(report.issues.filter((i) => i.category === "duplication")).toHaveLength(0);
  });
});

describe("buildQualityGateReport — skills quality", () => {
  it("flags a duplicate skill within the same category", () => {
    const doc = document([section({ id: "skills", type: "SKILLS", entries: [entry({ fields: { category: "Technical Skills", skills: ["Java", "java", "Spring"] } })] })]);
    const report = buildReport(doc);
    expect(report.issues.some((i) => i.category === "skills")).toBe(true);
  });

  it("does not flag a skills list with no duplicates", () => {
    const doc = document([section({ id: "skills", type: "SKILLS", entries: [entry({ fields: { category: "Technical Skills", skills: ["Java", "Spring"] } })] })]);
    const report = buildReport(doc);
    expect(report.issues.filter((i) => i.category === "skills")).toHaveLength(0);
  });
});

describe("buildQualityGateReport — entry completeness", () => {
  it("flags an experience entry with no job title or company", () => {
    const doc = document([section({ id: "experience", type: "EXPERIENCE", entries: [entry({ fields: { startDate: "Jan 2020" } })] })]);
    const report = buildReport(doc);
    expect(report.issues.some((i) => i.id.startsWith("empty-entry-"))).toBe(true);
  });

  it("does not flag an entry that has at least one primary field filled in", () => {
    const doc = document([section({ id: "experience", type: "EXPERIENCE", entries: [entry({ fields: { jobTitle: "Engineer" } })] })]);
    const report = buildReport(doc);
    expect(report.issues.filter((i) => i.id.startsWith("empty-entry-"))).toHaveLength(0);
  });
});

describe("buildQualityGateReport — template/export safety", () => {
  it("a normally-saved document/template is always export-safe", () => {
    const report = buildReport(healthyDocument());
    expect(report.exportSafe).toBe(true);
  });
});

describe("buildQualityGateReport — reuses existing signals, never fabricates", () => {
  it("carries the exact sectionCompleteness/contactQuality rows from the existing Milestone 7 functions", () => {
    const report = buildReport(healthyDocument());
    expect(report.sectionCompleteness.length).toBeGreaterThan(0);
    expect(report.contactQuality.length).toBe(7); // the 7 DynamicPersonalInformation fields
  });

  it("classifies personal info status as Complete when name/email/phone are all present", () => {
    const report = buildReport(healthyDocument());
    expect(report.personalInfoStatus).toBe("Complete");
  });

  it("classifies personal info status as Missing when name and email are both absent", () => {
    const report = buildReport(document([], { name: null, email: null, phone: null }));
    expect(report.personalInfoStatus).toBe("Missing");
  });
});
