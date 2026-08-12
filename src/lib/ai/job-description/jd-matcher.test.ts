import { describe, expect, it } from "vitest";

import { computeJdMatch } from "./jd-matcher";
import { Resume } from "../resume/resume-schema";
import { JobDescription } from "./jd-schema";

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

describe("computeJdMatch — Milestone 15, Test 1 (strong match)", () => {
  it("produces a high overall match when the resume covers every JD skill and meets experience", () => {
    const resume = baseResume({
      technicalSkills: ["Angular", "AWS", "Java", "Spring Boot", "Kubernetes"],
      yearsOfExperience: 8,
    });
    const jd = baseJd({
      skills: ["Angular", "AWS", "Java", "Spring Boot", "Kubernetes"],
      experienceRequired: { minYears: 5, maxYears: null, raw: "5+ years" },
    });

    const result = computeJdMatch(resume, jd);
    expect(result.overallMatch).toBeGreaterThanOrEqual(80);
    expect(result.keywordMatch.missing).toEqual([]);
  });
});

describe("computeJdMatch — Milestone 15, Test 2 (weak match)", () => {
  it("produces a low overall match and meaningful gaps when the resume covers almost none of the JD", () => {
    const resume = baseResume({ technicalSkills: ["PHP", "WordPress"], yearsOfExperience: 1 });
    const jd = baseJd({
      skills: ["Angular", "AWS", "Java", "Spring Boot", "Kubernetes"],
      experienceRequired: { minYears: 8, maxYears: null, raw: "8+ years" },
    });

    const result = computeJdMatch(resume, jd);
    expect(result.overallMatch).toBeLessThan(40);
    expect(result.keywordMatch.missing.length).toBeGreaterThan(0);
    expect(result.weaknesses.length).toBeGreaterThan(0);
  });
});

describe("computeJdMatch — Milestone 15, Test 3 (missing technology surfaces under Missing)", () => {
  it("lists a JD-required technology absent from the resume under missingSkills, not matched", () => {
    const resume = baseResume({ technicalSkills: ["Angular", "AWS", "Java"] });
    const jd = baseJd({ skills: ["Angular", "AWS", "Java", "Kubernetes"] });

    const result = computeJdMatch(resume, jd);
    expect(result.keywordMatch.matched).toEqual(expect.arrayContaining(["Angular", "AWS", "Java"]));
    expect(result.keywordMatch.missing).toEqual(["Kubernetes"]);
  });
});

describe("computeJdMatch — worked example from the spec's own MATCH CATEGORIES section (§8)", () => {
  it("Angular/AWS/Java matched, RxJS/Kubernetes missing", () => {
    const resume = baseResume({ technicalSkills: ["Angular", "AWS", "Java"] });
    const jd = baseJd({ skills: ["Angular", "RxJS", "AWS", "Kubernetes", "Java"] });

    const result = computeJdMatch(resume, jd);
    expect(result.keywordMatch.matched.sort()).toEqual(["AWS", "Angular", "Java"].sort());
    expect(result.keywordMatch.missing.sort()).toEqual(["Kubernetes", "RxJS"].sort());
  });
});

// Milestone 17 — regression coverage for jd-matcher.ts's matchEducation()
// after it was consolidated onto classifyEducationRequirements()/
// classifyCertificationRequirements() (keyword-engine.ts). These assert
// computeJdMatch()'s educationMatch field is unchanged in shape and
// behavior: a degree-level-equivalent match and a merely-related
// certification both surface as "matched" (not missing), and true gaps
// still land in "missing" — exactly as the pre-refactor implementation
// produced via its own separate matchEducationRequirements()/
// matchKeywords() calls.
describe("computeJdMatch — educationMatch (Milestone 17 consolidation regression)", () => {
  it("promotes an equivalent-or-higher degree to matched, not missing", () => {
    const resume = baseResume({ education: [{ degree: "M.Tech Computer Science", institution: "IIT", location: null, startDate: null, endDate: null, gpa: null }] });
    const jd = baseJd({ educationRequired: ["Bachelor's in Computer Science"] });

    const result = computeJdMatch(resume, jd);
    expect(result.educationMatch.matched).toEqual(["Bachelor's in Computer Science"]);
    expect(result.educationMatch.missing).toEqual([]);
  });

  it("lists a truly absent degree requirement under missing", () => {
    const resume = baseResume({ education: [] });
    const jd = baseJd({ educationRequired: ["Master's in Data Science"] });

    const result = computeJdMatch(resume, jd);
    expect(result.educationMatch.missing).toEqual(["Master's in Data Science"]);
    expect(result.educationMatch.matched).toEqual([]);
  });

  it("surfaces an exact certification match as matched", () => {
    const resume = baseResume({ certifications: [{ name: "AWS Certified Solutions Architect", issuer: "AWS", date: null }] });
    const jd = baseJd({ certifications: ["AWS Certified Solutions Architect"] });

    const result = computeJdMatch(resume, jd);
    expect(result.educationMatch.matched).toEqual(["AWS Certified Solutions Architect"]);
  });

  it("surfaces a related-but-not-exact certification under betterAlternatives, and neither matched nor missing", () => {
    const resume = baseResume({ certifications: [{ name: "Microsoft Certified: Azure Administrator Associate", issuer: "Microsoft", date: null }] });
    const jd = baseJd({ certifications: ["Microsoft Certified: Azure Solutions Architect Expert"] });

    const result = computeJdMatch(resume, jd);
    expect(result.educationMatch.betterAlternatives).toEqual(["Microsoft Certified: Azure Solutions Architect Expert"]);
    expect(result.educationMatch.missing).toEqual([]);
    expect(result.educationMatch.matched).toEqual([]);
  });

  it("never flags AWS/GCP-style short vendor prefixes as related (documented threshold, not a regression)", () => {
    const resume = baseResume({ certifications: [{ name: "AWS Certified Developer – Associate", issuer: "AWS", date: null }] });
    const jd = baseJd({ certifications: ["AWS Certified Solutions Architect – Associate"] });

    const result = computeJdMatch(resume, jd);
    expect(result.educationMatch.betterAlternatives).toEqual([]);
    expect(result.educationMatch.missing).toEqual(["AWS Certified Solutions Architect – Associate"]);
  });
});
