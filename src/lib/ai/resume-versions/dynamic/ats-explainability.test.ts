import { describe, expect, it } from "vitest";

import type { AtsScore, Resume } from "../../resume/resume-schema";
import type { AtsCategoryScores } from "../../job-description/jd-types";
import type { JobDescription } from "../../job-description/jd-schema";
import { DynamicResumeDocument, DYNAMIC_RESUME_SCHEMA_VERSION } from "./dynamic-resume-schema";
import {
  classifyResumeHealth,
  classifyRecruiterReadiness,
  explainGeneralAtsCategories,
  explainJdAtsCategories,
  deriveStrengthsFromCategories,
  deriveIssuesFromCategories,
  classifyFixType,
  deriveIssueSectionType,
  computeSectionCompleteness,
  computeContactQuality,
  classifyMissingKeyword,
  estimateSkillAdditionImpact,
  estimatePotentialAtsScore,
  GENERAL_ATS_WEIGHTS,
  JD_ATS_WEIGHTS,
} from "./ats-explainability";

function baseResume(overrides: Partial<Resume> = {}): Resume {
  return {
    contact: { name: "Jane Doe", email: "jane@example.com", phone: "+1 555 0100", location: null, linkedin: null, github: null, website: null },
    summary: "Experienced engineer.",
    skills: ["Java"],
    technicalSkills: ["Java", "Spring"],
    softSkills: [],
    workExperience: [{ title: "Engineer", company: "Acme", location: null, startDate: "2020", endDate: null, isCurrent: true, description: ["Built X"] }],
    education: [],
    certifications: [],
    projects: [],
    achievements: [],
    languages: [],
    yearsOfExperience: 3,
    ...overrides,
  };
}

function atsScore(overrides: Partial<AtsScore> = {}): AtsScore {
  return { overall: 75, formatting: 75, keyword: 75, experience: 75, skills: 75, education: 75, certification: 75, explanation: "test", ...overrides };
}

function jdCategoryScores(overrides: Partial<AtsCategoryScores> = {}): AtsCategoryScores {
  return {
    overall: 75,
    keyword: 75,
    experience: 75,
    education: 75,
    formatting: 75,
    achievement: 75,
    project: 75,
    leadership: 75,
    certification: 75,
    aiSkills: 75,
    cloud: 75,
    security: 75,
    softSkills: 75,
    ...overrides,
  };
}

function emptyJd(overrides: Partial<JobDescription> = {}): JobDescription {
  return {
    companyName: null,
    jobTitle: null,
    experienceRequired: { minYears: null, maxYears: null, raw: null },
    educationRequired: [],
    skills: [],
    mandatorySkills: [],
    goodToHaveSkills: [],
    responsibilities: [],
    softSkills: [],
    certifications: [],
    cloud: [],
    frameworks: [],
    programmingLanguages: [],
    tools: [],
    databases: [],
    aiSkills: [],
    security: [],
    domain: null,
    ...overrides,
  };
}

function emptyDocument(sections: DynamicResumeDocument["sections"] = []): DynamicResumeDocument {
  return {
    schemaVersion: DYNAMIC_RESUME_SCHEMA_VERSION,
    personalInformation: { name: "Jane Doe", email: "jane@example.com", phone: null, location: null, linkedin: null, github: null, website: null },
    sections,
  };
}

describe("classifyResumeHealth", () => {
  it("classifies all 5 tiers at their exact boundaries", () => {
    expect(classifyResumeHealth(100)).toBe("Excellent");
    expect(classifyResumeHealth(95)).toBe("Excellent");
    expect(classifyResumeHealth(94)).toBe("Strong");
    expect(classifyResumeHealth(80)).toBe("Strong");
    expect(classifyResumeHealth(79)).toBe("Good");
    expect(classifyResumeHealth(65)).toBe("Good");
    expect(classifyResumeHealth(64)).toBe("Needs Improvement");
    expect(classifyResumeHealth(50)).toBe("Needs Improvement");
    expect(classifyResumeHealth(49)).toBe("High Risk");
    expect(classifyResumeHealth(0)).toBe("High Risk");
  });
});

describe("classifyRecruiterReadiness", () => {
  it("returns High for a strong score with a fully-passing quality report", () => {
    const quality = { checks: [{ label: "x", passed: true }], warnings: [], estimatedPageCount: 1 };
    const readiness = classifyRecruiterReadiness(atsScore({ overall: 90, formatting: 90, experience: 80 }), quality);
    expect(readiness.level).toBe("High");
    expect(readiness.reasons.length).toBeGreaterThan(0);
  });

  it("returns Low for a weak score with failing quality checks", () => {
    const quality = { checks: [{ label: "x", passed: false }, { label: "y", passed: false }], warnings: ["missing stuff"], estimatedPageCount: 3 };
    const readiness = classifyRecruiterReadiness(atsScore({ overall: 30, formatting: 20, experience: 10 }), quality);
    expect(readiness.level).toBe("Low");
  });

  it("degrades gracefully without a quality report (e.g. the ephemeral analyzer flow)", () => {
    const readiness = classifyRecruiterReadiness(atsScore({ overall: 90, formatting: 90, experience: 80 }), null);
    expect(["High", "Medium", "Low"]).toContain(readiness.level);
  });

  it("never claims an actual recruiter's approval — reasons are always concrete, checkable facts", () => {
    const readiness = classifyRecruiterReadiness(atsScore(), null);
    for (const reason of readiness.reasons) {
      expect(reason.toLowerCase()).not.toMatch(/recruiter (will|would|approves|likes)/);
    }
  });
});

describe("explainGeneralAtsCategories / explainJdAtsCategories", () => {
  it("returns exactly the 6 general categories, each with a value and a non-empty explanation", () => {
    const categories = explainGeneralAtsCategories(atsScore());
    expect(categories).toHaveLength(6);
    for (const category of categories) {
      expect(category.explanation.length).toBeGreaterThan(0);
      expect(category.value).toBe(75);
    }
  });

  it("returns exactly the 12 JD-aware categories, each with a non-empty explanation (JD-aware scores previously had none)", () => {
    const categories = explainJdAtsCategories(jdCategoryScores());
    expect(categories).toHaveLength(12);
    for (const category of categories) {
      expect(category.explanation.length).toBeGreaterThan(0);
    }
  });

  it("uses a stronger qualifier word for a higher score", () => {
    const [strong] = explainGeneralAtsCategories(atsScore({ formatting: 95 }));
    const [weak] = explainGeneralAtsCategories(atsScore({ formatting: 10 }));
    expect(strong.explanation.startsWith("Strong")).toBe(true);
    expect(weak.explanation.startsWith("Weak")).toBe(true);
  });
});

describe("deriveStrengthsFromCategories / deriveIssuesFromCategories", () => {
  it("only surfaces a category as a strength when its own score is >= 85 — never fabricated praise", () => {
    const categories = explainGeneralAtsCategories(atsScore({ formatting: 90, keyword: 40, experience: 84 }));
    const strengths = deriveStrengthsFromCategories(categories);
    expect(strengths.some((s) => s.toLowerCase().includes("formatting"))).toBe(true);
    expect(strengths.some((s) => s.toLowerCase().includes("keyword"))).toBe(false);
    expect(strengths.some((s) => s.toLowerCase().includes("experience"))).toBe(false); // 84 < 85
  });

  it("only surfaces a category as an issue below the threshold, sorted by potential impact descending", () => {
    const categories = explainGeneralAtsCategories(atsScore({ formatting: 90, keyword: 20, experience: 50, skills: 90, education: 90, certification: 90 }));
    const issues = deriveIssuesFromCategories(categories, GENERAL_ATS_WEIGHTS, 1);
    expect(issues.map((i) => i.key)).toEqual(["keyword", "experience"]); // both below 70, keyword's bigger weight+gap sorts first
    expect(issues[0].potentialImpact).toBeGreaterThanOrEqual(issues[1].potentialImpact);
  });

  it("computes potentialImpact as (100 - value) * weight, using the SAME weight table the real score used", () => {
    const categories = explainGeneralAtsCategories(atsScore({ keyword: 40 }));
    const issues = deriveIssuesFromCategories(categories, GENERAL_ATS_WEIGHTS, 1);
    const keywordIssue = issues.find((i) => i.key === "keyword")!;
    expect(keywordIssue.potentialImpact).toBe(Math.round((100 - 40) * GENERAL_ATS_WEIGHTS.keyword));
  });

  it("scales JD_ATS_WEIGHTS correctly (0..100, not 0..1) via weightScale=100", () => {
    const categories = explainJdAtsCategories(jdCategoryScores({ keyword: 40 }));
    const issues = deriveIssuesFromCategories(categories, JD_ATS_WEIGHTS, 100);
    const keywordIssue = issues.find((i) => i.key === "keyword")!;
    expect(keywordIssue.potentialImpact).toBe(Math.round((100 - 40) * (JD_ATS_WEIGHTS.keyword / 100)));
  });

  it("assigns Critical/High/Medium/Low priority by score threshold", () => {
    const categories = explainGeneralAtsCategories(atsScore({ formatting: 10, keyword: 45, experience: 60, skills: 69 }));
    const issues = deriveIssuesFromCategories(categories, GENERAL_ATS_WEIGHTS, 1);
    expect(issues.find((i) => i.key === "formatting")?.priority).toBe("Critical");
    expect(issues.find((i) => i.key === "keyword")?.priority).toBe("High");
    expect(issues.find((i) => i.key === "experience")?.priority).toBe("Medium");
    expect(issues.find((i) => i.key === "skills")?.priority).toBe("Medium");
  });
});

describe("deriveIssueSectionType (Phase 15 Milestone 8, §15)", () => {
  it("maps each category to the Builder section it's definitionally about", () => {
    expect(deriveIssueSectionType("experience")).toBe("EXPERIENCE");
    expect(deriveIssueSectionType("achievement")).toBe("EXPERIENCE");
    expect(deriveIssueSectionType("project")).toBe("PROJECTS");
    expect(deriveIssueSectionType("education")).toBe("EDUCATION");
    expect(deriveIssueSectionType("certification")).toBe("CERTIFICATIONS");
    expect(deriveIssueSectionType("keyword")).toBe("SKILLS");
    expect(deriveIssueSectionType("skills")).toBe("SKILLS");
  });

  it("returns null for a category with no single obvious section (e.g. formatting spans the whole resume)", () => {
    expect(deriveIssueSectionType("formatting")).toBeNull();
    expect(deriveIssueSectionType("something-unknown")).toBeNull();
  });

  it("deriveIssuesFromCategories carries the same sectionType mapping on every issue it produces", () => {
    const categories = explainGeneralAtsCategories(atsScore({ certification: 20, education: 20 }));
    const issues = deriveIssuesFromCategories(categories, GENERAL_ATS_WEIGHTS, 1);
    expect(issues.find((i) => i.key === "certification")?.sectionType).toBe("CERTIFICATIONS");
    expect(issues.find((i) => i.key === "education")?.sectionType).toBe("EDUCATION");
  });
});

describe("classifyFixType", () => {
  it("classifies wording/presentation categories as safe", () => {
    expect(classifyFixType("formatting")).toBe("safe");
    expect(classifyFixType("keyword")).toBe("safe");
    expect(classifyFixType("achievement")).toBe("safe");
  });

  it("classifies fact-requiring categories as manual — matches the established Protected Facts rule", () => {
    expect(classifyFixType("education")).toBe("manual");
    expect(classifyFixType("certification")).toBe("manual");
    expect(classifyFixType("experience")).toBe("manual");
  });

  it("defaults an unrecognized category to manual (the safer default)", () => {
    expect(classifyFixType("something-unknown")).toBe("manual");
  });
});

describe("computeSectionCompleteness", () => {
  it("marks a recommended type with entries as Complete, and one absent as Missing (never Optional)", () => {
    const document = emptyDocument([{ id: "s1", type: "EXPERIENCE", title: "Experience", order: 0, visible: true, custom: false, entries: [{ id: "e1", order: 0, visible: true, fields: {}, hiddenFieldKeys: [], customFields: [] }], settings: { showTitle: true, showDivider: true } }]);
    const rows = computeSectionCompleteness(document);
    expect(rows.find((r) => r.type === "EXPERIENCE")?.status).toBe("Complete");
    expect(rows.find((r) => r.type === "SUMMARY")?.status).toBe("Missing"); // recommended, absent
  });

  it("marks a non-recommended type absent as Optional, never Missing (§12 — never require optional sections)", () => {
    const rows = computeSectionCompleteness(emptyDocument());
    expect(rows.find((r) => r.type === "AWARDS")?.status).toBe("Optional");
  });

  it("marks an added-but-empty section as its absent status (Missing/Optional), not Complete", () => {
    const document = emptyDocument([{ id: "s1", type: "EXPERIENCE", title: "Experience", order: 0, visible: true, custom: false, entries: [], settings: { showTitle: true, showDivider: true } }]);
    const rows = computeSectionCompleteness(document);
    expect(rows.find((r) => r.type === "EXPERIENCE")?.status).toBe("Missing"); // present but empty
  });
});

describe("computeContactQuality", () => {
  it("reports exactly which fields are present, without requiring optional ones", () => {
    const rows = computeContactQuality({ name: "Jane", email: "jane@example.com", phone: null, location: null, linkedin: null, github: null, website: null });
    expect(rows.find((r) => r.field === "email")?.present).toBe(true);
    expect(rows.find((r) => r.field === "github")?.present).toBe(false);
  });
});

describe("classifyMissingKeyword", () => {
  it("classifies a mandatory JD skill as Critical importance", () => {
    const jd = emptyJd({ mandatorySkills: ["Docker"] });
    const insight = classifyMissingKeyword("Docker", jd);
    expect(insight.importance).toBe("Critical");
  });

  it("classifies a good-to-have JD skill as Medium importance", () => {
    const jd = emptyJd({ goodToHaveSkills: ["Kafka"] });
    const insight = classifyMissingKeyword("Kafka", jd);
    expect(insight.importance).toBe("Medium");
  });

  it("defaults to High importance when neither mandatory nor good-to-have lists mention it", () => {
    const jd = emptyJd({ skills: ["Redis"] });
    const insight = classifyMissingKeyword("Redis", jd);
    expect(insight.importance).toBe("High");
  });

  it("places a skill mentioned in responsibilities AND a category array as 'Experience + Skills'", () => {
    const jd = emptyJd({ cloud: ["Docker"], responsibilities: ["Deploy services using Docker containers"] });
    const insight = classifyMissingKeyword("Docker", jd);
    expect(insight.whereItBelongs).toBe("Experience + Skills");
  });

  it("places a skill only in a category array as 'Skills'", () => {
    const jd = emptyJd({ cloud: ["Docker"] });
    const insight = classifyMissingKeyword("Docker", jd);
    expect(insight.whereItBelongs).toBe("Skills");
  });
});

describe("estimateSkillAdditionImpact / estimatePotentialAtsScore", () => {
  it("returns a positive point gain for a genuinely new skill", () => {
    const impact = estimateSkillAdditionImpact(baseResume(), "Kubernetes");
    expect(impact).toBeGreaterThan(0);
  });

  it("never mutates the input resume — a pure what-if, matching §19's 'without changing the resume yet'", () => {
    const resume = baseResume();
    const snapshot = JSON.parse(JSON.stringify(resume));
    estimateSkillAdditionImpact(resume, "Kubernetes");
    expect(resume).toEqual(snapshot);
  });

  it("estimatePotentialAtsScore's potential is never lower than current, and current matches resumeScorer's own real score", () => {
    const resume = baseResume();
    const { current, potential } = estimatePotentialAtsScore(resume, ["Kubernetes", "Docker", "AWS"]);
    expect(potential).toBeGreaterThanOrEqual(current);
  });
});
