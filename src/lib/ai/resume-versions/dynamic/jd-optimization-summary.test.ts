import { describe, expect, it } from "vitest";

import { buildJdOptimizationSummary } from "./jd-optimization-summary";
import { buildEducationAndCertificationProposals } from "./optimization-review";
import { DynamicResumeDocument, DYNAMIC_RESUME_SCHEMA_VERSION, ResumeSection } from "./dynamic-resume-schema";
import { EducationRequirementMatch, CertificationRequirementMatch } from "../../job-description/keyword-engine";
import { JdMatchResult, JobDescription } from "../../job-description/jd-schema";
import { Resume } from "../../resume/resume-schema";

// Phase 13 Milestone 18 — the summary builder is a pure reshaping of
// already-computed data, so these fixtures only need to be internally
// consistent (education/certification classifications matching what a
// resume/JD pair would actually produce), not run through the real
// classifiers — the classifiers themselves are already covered by
// keyword-engine.test.ts and jd-matcher.test.ts.

function baseMatchResult(overrides: Partial<JdMatchResult> = {}): JdMatchResult {
  return {
    overallMatch: 70,
    atsScore: 70,
    keywordScore: 70,
    experienceScore: 70,
    educationScore: 70,
    formattingScore: 70,
    achievementScore: 70,
    projectScore: 70,
    leadershipScore: 70,
    certificationScore: 70,
    aiScore: 70,
    cloudScore: 70,
    securityScore: 70,
    softSkillsScore: 70,
    matchedSkills: [],
    partialSkills: [],
    missingSkills: [],
    additionalSkills: [],
    resumeStrengths: [],
    resumeWeaknesses: [],
    experienceMatch: { level: "Good", score: 70, reasoning: "Your experience covers most of the stated responsibilities." },
    educationMatch: { matched: [], missing: [], betterAlternatives: [] },
    optimizedSummary: "",
    optimizedExperience: [],
    optimizedProjects: [],
    optimizedSkills: [],
    missingKeywordsSection: [],
    missingKeywords: [],
    improvementSuggestions: [],
    ...overrides,
  };
}

function baseJd(overrides: Partial<JobDescription> = {}): JobDescription {
  return {
    companyName: "TestCo",
    jobTitle: "Full Stack Engineer",
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

function baseResume(overrides: Partial<Resume> = {}): Resume {
  return {
    contact: { name: "Jane Doe", email: "jane@example.com", phone: null, location: null, linkedin: null, github: null, website: null },
    summary: "Experienced full stack engineer.",
    skills: [],
    technicalSkills: [],
    softSkills: [],
    workExperience: [],
    education: [],
    certifications: [],
    projects: [],
    achievements: [],
    languages: [],
    yearsOfExperience: null,
    ...overrides,
  };
}

function section(overrides: Partial<ResumeSection> & { id: string; type: ResumeSection["type"] }): ResumeSection {
  return {
    title: overrides.type,
    order: 0,
    visible: true,
    custom: false,
    settings: { showTitle: true, showDivider: true },
    entries: [],
    ...overrides,
  };
}

function baseDocument(sections: ResumeSection[] = []): DynamicResumeDocument {
  return {
    schemaVersion: DYNAMIC_RESUME_SCHEMA_VERSION,
    personalInformation: { name: "Jane Doe", email: "jane@example.com", phone: null, location: null, linkedin: null, github: null, website: null },
    sections,
  };
}

const NO_ENTRIES: ResumeSection["entries"] = [];
const ONE_ENTRY: ResumeSection["entries"] = [{ id: "entry-1", order: 0, visible: true, fields: {}, hiddenFieldKeys: [], customFields: [] }];

describe("buildJdOptimizationSummary — Test 1: all requirements matched", () => {
  it("reports full matched count, zero missing, and no gap priorities", () => {
    const matchResult = baseMatchResult({ overallMatch: 95, matchedSkills: ["Angular", "AWS", "Java"] });
    const education: EducationRequirementMatch[] = [{ requirement: "Bachelor's in CS", status: "matched", resumeEvidence: "B.Tech CS" }];
    const certifications: CertificationRequirementMatch[] = [{ requirement: "AWS Certified", status: "matched", resumeEvidence: "AWS Certified" }];

    const summary = buildJdOptimizationSummary({
      document: baseDocument(),
      resumeData: baseResume(),
      jobDescription: baseJd(),
      matchResult,
      educationMatches: education,
      certificationMatches: certifications,
    });

    expect(summary.overallMatchScore).toBe(95);
    expect(summary.matchedCount).toBe(5); // 3 skills + 1 education + 1 certification
    expect(summary.relatedCount).toBe(0);
    expect(summary.missingCount).toBe(0);
    expect(summary.priorities).toEqual([]);
    expect(summary.gaps).toEqual([]);
  });
});

describe("buildJdOptimizationSummary — Test 2: mixed matched/related/missing", () => {
  it("keeps matched, related, and missing cleanly separated — never inflates related into matched", () => {
    const matchResult = baseMatchResult({
      overallMatch: 60,
      matchedSkills: ["Angular"],
      partialSkills: [{ jdSkill: "Spring Framework", resumeSkill: "Spring Boot", reason: "Same family, not confirmed exact." }],
      missingSkills: ["Kubernetes"],
    });
    const education: EducationRequirementMatch[] = [{ requirement: "Bachelor's in CS", status: "equivalent_or_higher", resumeEvidence: "M.Tech CS" }];
    const certifications: CertificationRequirementMatch[] = [{ requirement: "Azure Solutions Architect", status: "related", resumeEvidence: "Azure Administrator" }];

    const summary = buildJdOptimizationSummary({
      document: baseDocument(),
      resumeData: baseResume(),
      jobDescription: baseJd(),
      matchResult,
      educationMatches: education,
      certificationMatches: certifications,
    });

    // equivalent-or-higher satisfies the requirement outright (matches
    // the existing gap-proposal architecture, which never flags it) —
    // so it counts as matched, not related.
    expect(summary.matchedCount).toBe(2); // Angular + equivalent-or-higher degree
    expect(summary.relatedCount).toBe(2); // partial skill + related cert
    expect(summary.missingCount).toBe(1); // Kubernetes
  });
});

describe("buildJdOptimizationSummary — Test 3: all requirements missing", () => {
  it("surfaces every requirement as missing with no fabricated matches", () => {
    const matchResult = baseMatchResult({ overallMatch: 10, missingSkills: ["AWS", "Kubernetes"] });
    const education: EducationRequirementMatch[] = [{ requirement: "Master's in CS", status: "missing", resumeEvidence: null }];
    const certifications: CertificationRequirementMatch[] = [{ requirement: "CKA", status: "missing", resumeEvidence: null }];

    const summary = buildJdOptimizationSummary({
      document: baseDocument(),
      resumeData: baseResume(),
      jobDescription: baseJd(),
      matchResult,
      educationMatches: education,
      certificationMatches: certifications,
    });

    expect(summary.matchedCount).toBe(0);
    expect(summary.missingCount).toBe(4);
    expect(summary.gaps.map((gap) => gap.title).sort()).toEqual(["AWS", "CKA", "Kubernetes", "Master's in CS"].sort());
  });
});

describe("buildJdOptimizationSummary — Tests 4-6: education breakdown", () => {
  it("Test 4: counts a matched degree under education.matched", () => {
    const summary = buildJdOptimizationSummary({
      document: baseDocument(),
      resumeData: baseResume(),
      jobDescription: baseJd(),
      matchResult: baseMatchResult(),
      educationMatches: [{ requirement: "Bachelor's in CS", status: "matched", resumeEvidence: "Bachelor's in CS" }],
      certificationMatches: [],
    });

    expect(summary.education).toEqual({ matched: 1, equivalentOrHigher: 0, missing: 0 });
  });

  it("Test 5: counts an equivalent-or-higher degree under education.equivalentOrHigher, not matched or missing", () => {
    const summary = buildJdOptimizationSummary({
      document: baseDocument(),
      resumeData: baseResume(),
      jobDescription: baseJd(),
      matchResult: baseMatchResult(),
      educationMatches: [{ requirement: "Bachelor's in CS", status: "equivalent_or_higher", resumeEvidence: "M.Tech CS" }],
      certificationMatches: [],
    });

    expect(summary.education).toEqual({ matched: 0, equivalentOrHigher: 1, missing: 0 });
  });

  it("Test 6: counts a truly absent degree requirement under education.missing", () => {
    const summary = buildJdOptimizationSummary({
      document: baseDocument(),
      resumeData: baseResume(),
      jobDescription: baseJd(),
      matchResult: baseMatchResult(),
      educationMatches: [{ requirement: "Master's in Data Science", status: "missing", resumeEvidence: null }],
      certificationMatches: [],
    });

    expect(summary.education).toEqual({ matched: 0, equivalentOrHigher: 0, missing: 1 });
  });
});

describe("buildJdOptimizationSummary — Tests 7-9: certification breakdown", () => {
  it("Test 7: counts a matched certification under certifications.matched", () => {
    const summary = buildJdOptimizationSummary({
      document: baseDocument(),
      resumeData: baseResume(),
      jobDescription: baseJd(),
      matchResult: baseMatchResult(),
      educationMatches: [],
      certificationMatches: [{ requirement: "AWS Certified Solutions Architect", status: "matched", resumeEvidence: "AWS Certified Solutions Architect" }],
    });

    expect(summary.certifications).toEqual({ matched: 1, related: 0, missing: 0 });
  });

  it("Test 8: counts a related-but-not-exact certification under certifications.related, never matched", () => {
    const summary = buildJdOptimizationSummary({
      document: baseDocument(),
      resumeData: baseResume(),
      jobDescription: baseJd(),
      matchResult: baseMatchResult(),
      educationMatches: [],
      certificationMatches: [{ requirement: "Microsoft Certified: Azure Solutions Architect", status: "related", resumeEvidence: "Microsoft Certified: Azure Administrator" }],
    });

    expect(summary.certifications).toEqual({ matched: 0, related: 1, missing: 0 });
  });

  it("Test 9: counts a wholly absent certification under certifications.missing", () => {
    const summary = buildJdOptimizationSummary({
      document: baseDocument(),
      resumeData: baseResume(),
      jobDescription: baseJd(),
      matchResult: baseMatchResult(),
      educationMatches: [],
      certificationMatches: [{ requirement: "CKAD", status: "missing", resumeEvidence: null }],
    });

    expect(summary.certifications).toEqual({ matched: 0, related: 0, missing: 1 });
  });
});

describe("buildJdOptimizationSummary — Tests 10-12: deterministic priority levels", () => {
  it("Test 10 (+ CRITICAL): a mandatory missing skill is critical; an ambiguous missing skill (not categorized mandatory/good-to-have) is high", () => {
    const jobDescription = baseJd({ mandatorySkills: ["AWS"], skills: ["AWS", "Docker"] });
    const matchResult = baseMatchResult({ missingSkills: ["AWS", "Docker"] });

    const summary = buildJdOptimizationSummary({
      document: baseDocument(),
      resumeData: baseResume(),
      jobDescription,
      matchResult,
      educationMatches: [],
      certificationMatches: [],
    });

    const awsPriority = summary.priorities.find((p) => p.title === "AWS");
    const dockerPriority = summary.priorities.find((p) => p.title === "Docker");
    expect(awsPriority?.priority).toBe("critical");
    expect(dockerPriority?.priority).toBe("high");
  });

  it("Test 11: a missing good-to-have skill is medium priority", () => {
    const jobDescription = baseJd({ goodToHaveSkills: ["GraphQL"], skills: ["GraphQL"] });
    const matchResult = baseMatchResult({ missingSkills: ["GraphQL"] });

    const summary = buildJdOptimizationSummary({
      document: baseDocument(),
      resumeData: baseResume(),
      jobDescription,
      matchResult,
      educationMatches: [],
      certificationMatches: [],
    });

    expect(summary.priorities.find((p) => p.title === "GraphQL")?.priority).toBe("medium");
  });

  it("Test 12: a partially-matched good-to-have skill is low priority", () => {
    const jobDescription = baseJd({ goodToHaveSkills: ["Spring Framework"], skills: ["Spring Framework"] });
    const matchResult = baseMatchResult({ partialSkills: [{ jdSkill: "Spring Framework", resumeSkill: "Spring Boot", reason: "Same family, not confirmed exact." }] });

    const summary = buildJdOptimizationSummary({
      document: baseDocument(),
      resumeData: baseResume(),
      jobDescription,
      matchResult,
      educationMatches: [],
      certificationMatches: [],
    });

    expect(summary.priorities.find((p) => p.title === "Spring Framework")?.priority).toBe("low");
  });
});

describe("buildJdOptimizationSummary — Test 13: no fabricated information", () => {
  it("never lists a missing skill as a strength, and a related certification's evidence is the genuinely different cert it already is — never renamed to the JD's own requirement text", () => {
    const matchResult = baseMatchResult({ missingSkills: ["Kubernetes"] });
    const certifications: CertificationRequirementMatch[] = [{ requirement: "Azure Solutions Architect", status: "related", resumeEvidence: "Azure Administrator Associate" }];

    const summary = buildJdOptimizationSummary({
      document: baseDocument(),
      resumeData: baseResume(),
      jobDescription: baseJd(),
      matchResult,
      educationMatches: [],
      certificationMatches: certifications,
    });

    expect(summary.strengths.some((s) => s.title === "Kubernetes")).toBe(false);
    expect(summary.gaps.some((g) => g.title === "Kubernetes")).toBe(true);

    const relatedGap = summary.gaps.find((g) => g.title === "Azure Solutions Architect");
    expect(relatedGap).toBeUndefined(); // "related" is neither a matched strength nor a flat gap — see priorities (medium)
    const relatedPriority = summary.priorities.find((p) => p.title === "Azure Solutions Architect");
    // The related certification's own (genuinely different) name is named honestly in the reason — never silently renamed to look like the JD's requirement text.
    expect(relatedPriority?.reason).toContain("Azure Administrator Associate");
    expect(relatedPriority?.reason.includes("Azure Solutions Architect")).toBe(true); // names the JD requirement too, but as a requirement, not as an equivalent match
    expect(certifications[0].resumeEvidence).not.toBe(certifications[0].requirement);
  });
});

describe("buildJdOptimizationSummary — Test 14: protected content detection", () => {
  it("lists a protected item only for sections/data that genuinely exist and are populated", () => {
    const document = baseDocument([
      section({ id: "exp-1", type: "EXPERIENCE", entries: ONE_ENTRY }),
      section({ id: "edu-1", type: "EDUCATION", entries: ONE_ENTRY }),
      section({ id: "cert-1", type: "CERTIFICATIONS", entries: ONE_ENTRY }),
      section({ id: "proj-1", type: "PROJECTS", entries: ONE_ENTRY }),
    ]);

    const summary = buildJdOptimizationSummary({
      document,
      resumeData: baseResume(),
      jobDescription: baseJd(),
      matchResult: baseMatchResult(),
      educationMatches: [],
      certificationMatches: [],
    });

    expect(summary.protectedContent).toHaveLength(5); // PII + 4 populated sections
    expect(summary.protectedContent.map((item) => item.sectionType).sort()).toEqual(["CERTIFICATIONS", "EDUCATION", "EXPERIENCE", "PROJECTS", null].sort());
    expect(summary.protectedContent.every((item) => item.reason.includes("factually incorrect"))).toBe(true);
  });

  it("never claims a protected fact for a section that doesn't exist or has no entries", () => {
    const document = baseDocument([section({ id: "exp-1", type: "EXPERIENCE", entries: NO_ENTRIES })]);
    const resumeData = baseResume({ contact: { name: null, email: null, phone: null, location: null, linkedin: null, github: null, website: null } });

    const summary = buildJdOptimizationSummary({
      document,
      resumeData,
      jobDescription: baseJd(),
      matchResult: baseMatchResult(),
      educationMatches: [],
      certificationMatches: [],
    });

    expect(summary.protectedContent).toEqual([]);
  });
});

describe("buildJdOptimizationSummary — Test 15: existing proposal compatibility", () => {
  it("agrees with buildEducationAndCertificationProposals() on which requirements are gaps, without depending on it", () => {
    const document = baseDocument([section({ id: "edu-1", type: "EDUCATION", entries: ONE_ENTRY }), section({ id: "cert-1", type: "CERTIFICATIONS", entries: ONE_ENTRY })]);
    const resumeData = baseResume({
      education: [{ degree: "B.Tech Computer Science", institution: "State University", location: null, startDate: null, endDate: null, gpa: null }],
      certifications: [],
    });
    const jobDescription = baseJd({ educationRequired: ["Master's in Computer Science"], certifications: ["AWS Certified Solutions Architect"] });

    const proposals = buildEducationAndCertificationProposals(document, resumeData, jobDescription);
    const gapRequirements = new Set(proposals.map((p) => p.matchedRequirement));

    const educationMatches: EducationRequirementMatch[] = [{ requirement: "Master's in Computer Science", status: "missing", resumeEvidence: null }];
    const certificationMatches: CertificationRequirementMatch[] = [{ requirement: "AWS Certified Solutions Architect", status: "missing", resumeEvidence: null }];

    const summary = buildJdOptimizationSummary({ document, resumeData, jobDescription, matchResult: baseMatchResult(), educationMatches, certificationMatches });
    const summaryGapTitles = new Set(summary.gaps.map((g) => g.title));

    expect(gapRequirements).toEqual(summaryGapTitles);
    expect(proposals.every((p) => p.autoApplicable === false)).toBe(true); // Milestone 16/17 safety rule — this milestone changes none of it
  });
});

describe("buildJdOptimizationSummary — Test 16: existing JD optimization response compatibility (purity)", () => {
  it("never mutates any of its inputs", () => {
    const matchResult = baseMatchResult({ missingSkills: ["Kubernetes"], partialSkills: [{ jdSkill: "Spring Framework", resumeSkill: "Spring Boot", reason: "x" }] });
    const educationMatches: EducationRequirementMatch[] = [{ requirement: "Bachelor's in CS", status: "missing", resumeEvidence: null }];
    const certificationMatches: CertificationRequirementMatch[] = [{ requirement: "AWS Certified", status: "related", resumeEvidence: "AWS Developer" }];
    const document = baseDocument([section({ id: "edu-1", type: "EDUCATION", entries: ONE_ENTRY })]);
    const jobDescription = baseJd();
    const resumeData = baseResume();

    const matchResultBefore = JSON.parse(JSON.stringify(matchResult));
    const educationBefore = JSON.parse(JSON.stringify(educationMatches));
    const certificationsBefore = JSON.parse(JSON.stringify(certificationMatches));
    const documentBefore = JSON.parse(JSON.stringify(document));

    buildJdOptimizationSummary({ document, resumeData, jobDescription, matchResult, educationMatches, certificationMatches });

    expect(matchResult).toEqual(matchResultBefore);
    expect(educationMatches).toEqual(educationBefore);
    expect(certificationMatches).toEqual(certificationsBefore);
    expect(document).toEqual(documentBefore);
  });
});
