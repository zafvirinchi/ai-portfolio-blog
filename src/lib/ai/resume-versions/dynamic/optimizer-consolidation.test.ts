import { describe, expect, it } from "vitest";

import { toDynamicResumeDocument } from "./resume-migration";
import { applyChangeProposals, buildChangeProposals, buildEducationAndCertificationProposals, gapSkillsFor } from "./optimization-review";
import { buildJdOptimizationSummary } from "./jd-optimization-summary";
import { computeJdMatch } from "../../job-description/jd-matcher";
import { classifyCertificationRequirements, classifyEducationRequirements } from "../../job-description/keyword-engine";
import { jdMatchResultSchema, JobDescription, OptimizerOutput } from "../../job-description/jd-schema";
import { Resume } from "../../resume/resume-schema";

// Phase 13 Milestone 19 — Resume Optimizer Consolidation regression
// fixture. Milestone 19 made no changes to any matching/scoring/proposal
// LOGIC (only a symbol rename disambiguating optimizer.ts from
// resume-optimizer.ts, plus documentation) — this test exercises the
// REAL deterministic pipeline (computeJdMatch -> classifiers ->
// buildChangeProposals/buildEducationAndCertificationProposals ->
// buildJdOptimizationSummary) end-to-end on one fixed resume/JD fixture
// and asserts on stable, semantic fields only. IDs are randomly
// generated (toDynamicResumeDocument, buildChangeProposals) and are
// deliberately never compared — a future refactor is free to change how
// IDs are minted as long as the section/field/status/priority/safety
// semantics asserted here hold.
//
// The one LLM call this pipeline would normally make (optimizer.ts's
// resumeOptimizer.optimize()) is replaced with a fixed, hand-written
// OptimizerOutput fixture — consistent with how optimization-review.test.ts
// already tests buildChangeProposals() without a real model call.

const resume: Resume = {
  contact: { name: "Jane Doe", email: "jane@example.com", phone: null, location: null, linkedin: null, github: null, website: null },
  summary: "Backend developer with experience building web applications.",
  skills: [],
  technicalSkills: ["Java", "Spring Boot"],
  softSkills: [],
  workExperience: [
    {
      title: "Software Engineer",
      company: "Acme Corp",
      location: "Remote",
      startDate: "2020-01",
      endDate: null,
      isCurrent: true,
      description: ["Built REST APIs for internal tools.", "Fixed production bugs."],
    },
  ],
  education: [{ degree: "B.Tech Computer Science", institution: "State University", location: null, startDate: null, endDate: null, gpa: null }],
  certifications: [
    { name: "AWS Certified Developer - Associate", issuer: "AWS", date: null },
    { name: "Microsoft Certified: Azure Administrator Associate", issuer: "Microsoft", date: null },
  ],
  projects: [{ name: "Internal Tool", description: "A tool used by the team.", technologies: ["Java"], url: null }],
  achievements: [],
  languages: [],
  yearsOfExperience: 4,
};

const jobDescription: JobDescription = {
  companyName: "TestCo",
  jobTitle: "Backend Engineer",
  experienceRequired: { minYears: 3, maxYears: null, raw: "3+ years" },
  educationRequired: ["Master's in Data Science"],
  skills: ["Java", "Kubernetes", "AWS", "Spring Framework"],
  mandatorySkills: ["Java", "Kubernetes"],
  goodToHaveSkills: ["AWS", "Spring Framework"],
  responsibilities: [],
  softSkills: [],
  certifications: ["AWS Certified Developer - Associate", "Certified Kubernetes Administrator", "Microsoft Certified: Azure Solutions Architect Expert"],
  cloud: [],
  frameworks: [],
  programmingLanguages: [],
  tools: [],
  databases: [],
  aiSkills: [],
  security: [],
  domain: null,
};

const optimizerOutput: OptimizerOutput = {
  optimizedSummary: "Backend engineer experienced in Java and Kubernetes-based deployments, building reliable web applications.",
  optimizedExperience: [{ original: "Built REST APIs for internal tools.", optimized: "Built and deployed REST APIs to Kubernetes for internal tools.", starFormat: false }],
  optimizedProjects: [],
  optimizedSkills: ["Java", "Spring Boot"],
  missingSkillsSection: ["Kubernetes", "AWS"],
  improvementSuggestions: [],
};

const document = toDynamicResumeDocument(resume);
const computation = computeJdMatch(resume, jobDescription);
const matchResult = jdMatchResultSchema.parse({
  overallMatch: computation.overallMatch,
  atsScore: computation.ats.overall,
  keywordScore: computation.ats.keyword,
  experienceScore: computation.ats.experience,
  educationScore: computation.ats.education,
  formattingScore: computation.ats.formatting,
  achievementScore: computation.ats.achievement,
  projectScore: computation.ats.project,
  leadershipScore: computation.ats.leadership,
  certificationScore: computation.ats.certification,
  aiScore: computation.ats.aiSkills,
  cloudScore: computation.ats.cloud,
  securityScore: computation.ats.security,
  softSkillsScore: computation.ats.softSkills,
  matchedSkills: computation.keywordMatch.matched,
  partialSkills: computation.keywordMatch.partial,
  missingSkills: computation.keywordMatch.missing,
  additionalSkills: computation.keywordMatch.additional,
  resumeStrengths: computation.strengths,
  resumeWeaknesses: computation.weaknesses,
  experienceMatch: computation.experienceMatch,
  educationMatch: computation.educationMatch,
  optimizedSummary: optimizerOutput.optimizedSummary,
  optimizedExperience: optimizerOutput.optimizedExperience,
  optimizedProjects: optimizerOutput.optimizedProjects,
  optimizedSkills: optimizerOutput.optimizedSkills,
  missingKeywordsSection: optimizerOutput.missingSkillsSection,
  missingKeywords: computation.keywordMatch.missing,
  improvementSuggestions: optimizerOutput.improvementSuggestions,
});

const educationMatches = classifyEducationRequirements(resume.education.map((entry) => entry.degree), jobDescription.educationRequired);
const certificationMatches = classifyCertificationRequirements(resume.certifications.map((cert) => cert.name), jobDescription.certifications);
const gapSkills = gapSkillsFor(matchResult.missingSkills, matchResult.partialSkills);
const proposals = [...buildChangeProposals(document, optimizerOutput, gapSkills), ...buildEducationAndCertificationProposals(document, resume, jobDescription)];
const summary = buildJdOptimizationSummary({ document, resumeData: resume, jobDescription, matchResult, educationMatches, certificationMatches });

describe("optimizer consolidation golden fixture — keyword/education/certification matching", () => {
  it("matches the mandatory skill, misses the mandatory gap, and partially matches the family-related skill", () => {
    expect(matchResult.matchedSkills).toEqual(["Java"]);
    expect(matchResult.missingSkills.sort()).toEqual(["AWS", "Kubernetes"].sort());
    expect(matchResult.partialSkills.map((p) => p.jdSkill)).toEqual(["Spring Framework"]);
  });

  it("classifies education as missing (a Bachelor's does not satisfy a Master's requirement)", () => {
    expect(educationMatches).toEqual([{ requirement: "Master's in Data Science", status: "missing", resumeEvidence: null }]);
  });

  it("classifies certifications as matched / missing / related respectively", () => {
    const byRequirement = new Map(certificationMatches.map((m) => [m.requirement, m]));
    expect(byRequirement.get("AWS Certified Developer - Associate")).toEqual({ requirement: "AWS Certified Developer - Associate", status: "matched", resumeEvidence: "AWS Certified Developer - Associate" });
    expect(byRequirement.get("Certified Kubernetes Administrator")).toEqual({ requirement: "Certified Kubernetes Administrator", status: "missing", resumeEvidence: null });
    expect(byRequirement.get("Microsoft Certified: Azure Solutions Architect Expert")).toEqual({
      requirement: "Microsoft Certified: Azure Solutions Architect Expert",
      status: "related",
      resumeEvidence: "Microsoft Certified: Azure Administrator Associate",
    });
  });
});

describe("optimizer consolidation golden fixture — proposals", () => {
  it("produces an auto-applicable summary proposal that introduces the gap skill it claims to address", () => {
    const summaryProposal = proposals.find((p) => p.sectionType === "SUMMARY" && p.fieldKey === "summary");
    expect(summaryProposal?.autoApplicable).toBe(true);
    expect(summaryProposal?.proposedValue).toBe(optimizerOutput.optimizedSummary);
    expect(summaryProposal?.matchedRequirement).toBe("Kubernetes");
  });

  it("produces an auto-applicable achievement proposal for the rewritten bullet", () => {
    const achievementProposal = proposals.find((p) => p.fieldKey === "achievement");
    expect(achievementProposal?.autoApplicable).toBe(true);
    expect(achievementProposal?.originalValue).toBe("Built REST APIs for internal tools.");
    expect(achievementProposal?.proposedValue).toBe(optimizerOutput.optimizedExperience[0].optimized);
  });

  it("produces non-auto-applicable education/certification gap proposals only for genuinely unmet requirements — never for the already-held certification", () => {
    const gapProposals = proposals.filter((p) => p.fieldKey === "educationGap" || p.fieldKey === "certificationGap");
    const gapRequirements = gapProposals.map((p) => p.matchedRequirement).sort();

    expect(gapRequirements).toEqual(["Certified Kubernetes Administrator", "Master's in Data Science", "Microsoft Certified: Azure Solutions Architect Expert"].sort());
    expect(gapProposals.every((p) => p.autoApplicable === false)).toBe(true);
    expect(gapProposals.some((p) => p.matchedRequirement === "AWS Certified Developer - Associate")).toBe(false);
  });

  it("never fabricates or renames resume content when applying proposals, even if a gap proposal is included in the accepted list", () => {
    const { document: updated } = applyChangeProposals(document, proposals);

    const educationSection = updated.sections.find((s) => s.type === "EDUCATION");
    const certificationsSection = updated.sections.find((s) => s.type === "CERTIFICATIONS");
    const experienceSection = updated.sections.find((s) => s.type === "EXPERIENCE");

    // Degree/institution and certification names are untouched — the
    // gap proposals targeting these sections are informational only
    // (autoApplicable: false) and applyOneProposal() rejects them
    // regardless of what the caller passes in (Milestone 16 §5).
    expect(educationSection?.entries[0].fields.degree).toBe("B.Tech Computer Science");
    expect(educationSection?.entries[0].fields.institution).toBe("State University");
    expect(certificationsSection?.entries.map((e) => e.fields.name)).toEqual(["AWS Certified Developer - Associate", "Microsoft Certified: Azure Administrator Associate"]);

    // Employment facts (company, dates) are untouched — only the
    // achievement bullet text the optimizer actually rewrote changes.
    expect(experienceSection?.entries[0].fields.company).toBe("Acme Corp");
    expect(experienceSection?.entries[0].fields.startDate).toBe("2020-01");
    expect(experienceSection?.entries[0].fields.achievements).toEqual(["Built and deployed REST APIs to Kubernetes for internal tools.", "Fixed production bugs."]);
  });
});

describe("optimizer consolidation golden fixture — Milestone 18 summary", () => {
  it("preserves overallMatchScore as a direct passthrough of the matcher's own score", () => {
    expect(summary.overallMatchScore).toBe(matchResult.overallMatch);
  });

  it("keeps matched/related/missing counts distinct across skills, education, and certifications", () => {
    expect(summary.matchedCount).toBe(2); // Java + AWS Certified Developer - Associate
    expect(summary.relatedCount).toBe(2); // Spring Framework (partial) + Microsoft cert (related)
    expect(summary.missingCount).toBe(4); // Kubernetes, AWS, Master's in Data Science, Certified Kubernetes Administrator
  });

  it("assigns deterministic priority levels consistent with mandatory/good-to-have evidence", () => {
    const byTitle = new Map(summary.priorities.map((p) => [p.title, p.priority]));
    expect(byTitle.get("Kubernetes")).toBe("critical"); // mandatory, fully missing
    expect(byTitle.get("AWS")).toBe("medium"); // good-to-have, fully missing
    expect(byTitle.get("Spring Framework")).toBe("low"); // good-to-have, partially matched
    expect(byTitle.get("Master's in Data Science")).toBe("high"); // education requirement missing
    expect(byTitle.get("Certified Kubernetes Administrator")).toBe("high"); // certification missing
    expect(byTitle.get("Microsoft Certified: Azure Solutions Architect Expert")).toBe("medium"); // related certification
  });

  it("lists protected content for every populated section plus personal information", () => {
    const sectionTypes = summary.protectedContent.map((item) => item.sectionType).sort();
    expect(sectionTypes).toEqual(["CERTIFICATIONS", "EDUCATION", "EXPERIENCE", "PROJECTS", null].sort());
  });
});
