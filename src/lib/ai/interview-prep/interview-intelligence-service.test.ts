import { vi } from "vitest";

// Same transitive-import constraints as interview-coverage.test.ts
// (this file's own dependency, via question-generator.ts).
vi.mock("../openai", () => ({ openai: {} }));
vi.mock("../interview-chat/interview-search", () => ({ searchInterviewQuestions: vi.fn(async () => []) }));

const { prepGetMock, resumeGetMock, jdMatchGetMock } = vi.hoisted(() => ({
  prepGetMock: vi.fn(),
  resumeGetMock: vi.fn(),
  jdMatchGetMock: vi.fn(),
}));

vi.mock("./prep-service", () => ({ prepService: { get: prepGetMock } }));
vi.mock("../resume/resume-service", () => ({ resumeService: { get: resumeGetMock } }));
vi.mock("../job-description/jd-service", () => ({ jdMatchService: { get: jdMatchGetMock } }));

import { beforeEach, describe, expect, it } from "vitest";

import { computeInterviewIntelligence, InterviewIntelligenceNotFoundError } from "./interview-intelligence-service";
import { InterviewPreparationReport } from "./prep-schema";
import { Resume } from "../resume/resume-schema";
import { JobDescription } from "../job-description/jd-schema";

// Phase 17 Milestone 3 — this orchestrator does no computation of its
// own beyond composing three EXISTING getters (prepService.get(),
// resumeService.get(), jdMatchService.get() — all mocked here) with the
// pure interview-coverage.ts functions (real, unmocked — exercised
// end-to-end). Proves the wiring, not the coverage math itself (already
// covered by interview-coverage.test.ts).

const resume: Resume = {
  contact: { name: "Jane Doe", email: "jane@example.com", phone: null, location: null, linkedin: null, github: null, website: null },
  summary: "",
  skills: [],
  technicalSkills: ["Java"],
  softSkills: [],
  workExperience: [],
  education: [],
  certifications: [],
  projects: [],
  achievements: [],
  languages: [],
  yearsOfExperience: 5,
};

const jobDescription: JobDescription = {
  companyName: "TestCo",
  jobTitle: "Backend Engineer",
  experienceRequired: { minYears: 3, maxYears: null, raw: "3+ years" },
  educationRequired: [],
  skills: [],
  mandatorySkills: ["Kubernetes"],
  goodToHaveSkills: [],
  responsibilities: [],
  softSkills: [],
  certifications: [],
  cloud: [],
  frameworks: [],
  programmingLanguages: ["Java"],
  tools: [],
  databases: [],
  aiSkills: [],
  security: [],
  domain: null,
};

const report: InterviewPreparationReport = {
  readinessScore: { overall: 65, resumeQuality: 65, jdMatch: 65, missingSkillsPenalty: 65, projectsScore: 65, experienceScore: 65, atsScore: 65, knowledgeBaseCoverage: 65 },
  technicalQuestions: [{ question: "Explain Java.", difficulty: "Medium", topic: "Java", idealAnswer: { architecture: "", tradeoffs: "", bestPractices: "", performance: "", security: "" } }],
  hrQuestions: [],
  projectQuestions: [],
  systemDesignQuestions: [],
  codingRecommendations: [],
  weaknessAnalysis: { weakAreas: [], missingSkills: [], knowledgeGaps: [], projectsToBuild: [], conceptsToLearn: [] },
  confidenceAnalysis: { strongAreas: [], weakAreas: [], highConfidenceTopics: [], lowConfidenceTopics: [] },
  learningRoadmap: [],
  cheatSheet: [],
};

beforeEach(() => {
  prepGetMock.mockReset();
  resumeGetMock.mockReset();
  jdMatchGetMock.mockReset();
});

describe("computeInterviewIntelligence — orchestration (Phase 17 Milestone 3)", () => {
  it("throws InterviewIntelligenceNotFoundError when the prep report itself doesn't exist/has expired", () => {
    prepGetMock.mockReturnValue(undefined);
    expect(() => computeInterviewIntelligence("fake-id")).toThrow(InterviewIntelligenceNotFoundError);
  });

  it("throws the same error when the underlying resume/JD-match ephemeral records have since expired, rather than computing coverage against missing context", () => {
    prepGetMock.mockReturnValue({ prepId: "p1", resumeId: "r1", jdMatchId: "j1", report, createdAt: new Date().toISOString() });
    resumeGetMock.mockReturnValue(undefined);
    jdMatchGetMock.mockReturnValue({ jobDescription, matchResult: {} });

    expect(() => computeInterviewIntelligence("p1")).toThrow(InterviewIntelligenceNotFoundError);
  });

  it("composes coverage + plan + totals from real (mocked) upstream data, with zero LLM calls", () => {
    prepGetMock.mockReturnValue({ prepId: "p1", resumeId: "r1", jdMatchId: "j1", report, createdAt: new Date().toISOString() });
    resumeGetMock.mockReturnValue({ resume });
    jdMatchGetMock.mockReturnValue({ jobDescription, matchResult: {} });

    const result = computeInterviewIntelligence("p1");

    expect(result.prepId).toBe("p1");
    expect(result.coverage.technical.covered).toContain("Java");
    expect(result.coverage.jd.missing).toContain("Kubernetes");
    expect(result.totals.totalQuestions).toBe(1);
    expect(result.plan.some((item) => item.topic === "Kubernetes" && item.tier === "Must Prepare")).toBe(true);
  });
});
