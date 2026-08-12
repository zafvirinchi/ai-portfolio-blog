import { describe, expect, it } from "vitest";

import { matchExperience } from "./experience-engine";
import { Resume } from "../resume/resume-schema";
import { JobDescription } from "./jd-schema";

function baseResume(overrides: Partial<Resume> = {}): Resume {
  return {
    contact: { name: "Jane Doe", email: "jane@example.com", phone: null, location: null, linkedin: null, github: null, website: null },
    summary: null,
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

describe("matchExperience — Milestone 15, Test 6 (never inflates years)", () => {
  it("never claims the resume has more years than it actually does when the JD asks for more", () => {
    const resume = baseResume({ yearsOfExperience: 2 });
    const jd = baseJd({ experienceRequired: { minYears: 10, maxYears: null, raw: "10+ years" } });

    const result = matchExperience(resume, jd);

    expect(result.reasoning).toContain("10+ years");
    expect(result.reasoning).toContain("2");
    expect(result.reasoning).not.toMatch(/you have 10/i); // never asserts the resume HAS the required 10 years
  });

  it("scores a 10-years-required/2-years-actual gap strictly lower than a fully met requirement", () => {
    const resume = baseResume({ yearsOfExperience: 2 });
    const shortfallJd = baseJd({ experienceRequired: { minYears: 10, maxYears: null, raw: "10+ years" } });
    const metJd = baseJd({ experienceRequired: { minYears: 2, maxYears: null, raw: "2+ years" } });

    const shortfall = matchExperience(resume, shortfallJd);
    const met = matchExperience(resume, metJd);

    expect(shortfall.score).toBeLessThan(met.score);
  });

  it("never inflates a 2-years-actual/10-years-required gap into an 'Excellent' rating", () => {
    const resume = baseResume({ yearsOfExperience: 2 });
    const jd = baseJd({ experienceRequired: { minYears: 10, maxYears: null, raw: "10+ years" } });

    const result = matchExperience(resume, jd);
    expect(result.level).not.toBe("Excellent");
  });

  it("reports a strong match when years meet or exceed the requirement", () => {
    const resume = baseResume({ yearsOfExperience: 10 });
    const jd = baseJd({ experienceRequired: { minYears: 5, maxYears: null, raw: "5+ years" } });

    const result = matchExperience(resume, jd);
    expect(result.level).toBe("Excellent");
  });

  it("never fabricates a years figure when the resume states none at all", () => {
    const resume = baseResume({ yearsOfExperience: null });
    const jd = baseJd({ experienceRequired: { minYears: 5, maxYears: null, raw: "5+ years" } });

    const result = matchExperience(resume, jd);
    expect(result.reasoning).toContain("unstated amount of");
  });
});
