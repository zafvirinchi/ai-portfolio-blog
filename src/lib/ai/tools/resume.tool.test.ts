import { describe, expect, it, vi } from "vitest";

// resume.tool.ts is a Tool Registry member that fans out into ~20
// sibling services (billing, auth, recruiter, recruitment, linkedin,
// cover-letter, interview-prep, mock-interview, resume-rewriter,
// knowledge/RAG, ...) most of which transitively reach the metered
// OpenAI client and/or supabaseAdmin, neither of which have real
// credentials in this test environment. None of that machinery is
// exercised by the tests below (they only exercise the resume-context
// branch of execute()) — every sibling import is stubbed to the minimal
// shape resume.tool.ts actually calls, purely so the module can be
// imported at all. This is intentionally the one heavier test file in
// this milestone; seven all-new prompt-injection test files already
// cover the resume-rewriter package with lightweight, single-module
// imports (see resume-rewriter/*.test.ts).
const { noStore } = vi.hoisted(() => ({ noStore: { getStore: () => undefined } }));

vi.mock("../knowledge/rag.service", () => ({ ragKnowledge: { search: vi.fn(async () => ({ context: "fallback context", chunks: [] })) } }));
vi.mock("../job-description/jd-service", () => ({ jdMatchRequestContext: noStore, jdMatchService: { get: () => undefined } }));
vi.mock("../interview-prep/prep-service", () => ({ interviewPrepRequestContext: noStore, prepService: { get: () => undefined } }));
vi.mock("../mock-interview/session-service", () => ({ mockInterviewRequestContext: noStore, sessionService: { get: () => undefined } }));
vi.mock("../resume-rewriter/rewrite-service", () => ({ rewriteRequestContext: noStore, rewriteService: { get: () => undefined } }));
vi.mock("../cover-letter/cover-service", () => ({ coverRequestContext: noStore, coverLetterService: { get: () => undefined } }));
vi.mock("../linkedin/linkedin-service", () => ({ linkedinRequestContext: noStore, linkedinService: { get: () => undefined } }));
vi.mock("../recruiter/candidate-ranking", () => ({ computeRankingScore: vi.fn(() => 0) }));
vi.mock("../recruiter/candidate-service", () => ({
  candidateService: {
    list: () => [],
    findByNameFragment: () => [],
    searchBySkill: () => [],
    findReadyForInterview: () => [],
    listForSystemUse: () => [],
    searchBySkillForSystemUse: () => [],
  },
  recruiterRequestContext: noStore,
}));
vi.mock("../recruitment/candidate-stage", () => ({ daysInStage: vi.fn(() => 0) }));
vi.mock("../recruitment/interview-scheduler", () => ({ interviewScheduler: { list: () => [], generateFeedbackSummary: vi.fn() } }));
vi.mock("../recruitment/job-service", () => ({ jobService: { findByTitleFragment: () => [] } }));
vi.mock("../recruitment/pipeline-analytics", () => ({ computeAnalytics: vi.fn(() => ({ hiringFunnel: [] })) }));
vi.mock("../recruitment/pipeline-service", () => ({ recruitmentRequestContext: noStore, pipelineService: { list: () => [], listAll: () => [] } }));
vi.mock("../../saas/activity-service", () => ({ list: vi.fn(async () => []) }));
vi.mock("../../saas/tenant-context", () => ({ organizationRequestContext: noStore, listMyOrganizations: vi.fn(async () => []) }));
vi.mock("../../saas/team-service", () => ({ resolveEmail: vi.fn(async () => null) }));
vi.mock("../../auth/audit-auth", () => ({ list: vi.fn(async () => []) }));
vi.mock("../../auth/session-service", () => ({ list: vi.fn(async () => []) }));
vi.mock("../../auth/permission-service", () => ({ authRequestContext: noStore }));
vi.mock("../../billing/credit-service", () => ({ getCreditBalance: vi.fn(), listCreditBalances: vi.fn(async () => []) }));
vi.mock("../../billing/subscription-service", () => ({ getActiveSubscription: vi.fn() }));
vi.mock("../../billing/plan-service", () => ({ PLAN_DEFINITIONS: {} }));
vi.mock("../../billing/invoice-service", () => ({ list: vi.fn(async () => []) }));
vi.mock("../usage/usage-service", () => ({ getBalance: vi.fn(), getSummary: vi.fn(async () => ({ byFeature: [], totalCreditsUsed: 0 })) }));

// resume.tool.ts imports resumeRequestContext/resumeService from the
// resume/ package barrel ("../resume") — mocked with a controllable
// store/get pair so each test can simulate "no resumeId," "unknown/
// expired resumeId," and "active resumeId with a real record."
const { resumeStore, resumeGet } = vi.hoisted(() => ({
  resumeStore: vi.fn<() => { resumeId: string } | undefined>(),
  resumeGet: vi.fn(),
}));
vi.mock("../resume", () => ({ resumeRequestContext: { getStore: () => resumeStore() }, resumeService: { get: (id: string) => resumeGet(id) } }));

import { resumeTool } from "./resume.tool";
import type { ResumeRecord } from "../resume/resume-types";

// Phase 13 Milestone 23, Part 10/13 — Phase 9 resume-tool regression
// coverage. Verifies the four named scenarios (no resumeId / valid
// resumeId / expired-unknown resumeId / resume intent stays grounded)
// and that the SPECIAL MODE directive — the one thing that makes
// resume-aware chat answer as "this candidate" instead of falling back
// to "information not available in the knowledge base" — is preserved
// byte-for-byte.

function fakeRecord(overrides: Partial<ResumeRecord> = {}): ResumeRecord {
  return {
    resumeId: "resume-1",
    filename: "resume.pdf",
    uploadedAt: new Date().toISOString(),
    resume: {
      contact: { name: "Jane Doe", email: "jane@example.com", phone: null, location: null, linkedin: null, github: null, website: null },
      summary: "Backend developer.",
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
    },
    analysis: {
      professionalSummary: "Solid backend engineer.",
      careerLevel: "Senior",
      suitableRoles: ["Backend Engineer"],
      technologyStack: ["Java", "Spring Boot"],
      keyStrengths: ["Strong Java fundamentals"],
      weaknesses: ["Limited cloud exposure"],
      missingSkills: ["Kubernetes"],
      improvementSuggestions: ["Add a cloud project"],
    },
    atsScore: { overall: 78, formatting: 80, keyword: 75, experience: 80, skills: 76, education: 70, certification: 60, explanation: "Solid ATS fit." },
    skillGap: {
      missingJavaSkills: [],
      missingSpringSkills: [],
      missingCloudSkills: ["Kubernetes"],
      missingDevOpsSkills: [],
      missingAiSkills: [],
      missingDatabaseSkills: [],
      recommendedCourses: [],
      recommendedCertifications: [],
      recommendedProjects: [],
    },
    ...overrides,
  } as ResumeRecord;
}

describe("resume.tool.ts — Phase 9 regression (Part 10)", () => {
  it("No resumeId: falls back to the existing RAG knowledge-base search, unchanged", async () => {
    resumeStore.mockReturnValue(undefined);

    const response = await resumeTool.execute("What is my ATS score?");

    expect(response.success).toBe(true);
    expect(response.result.context).toBe("fallback context");
  });

  it("Valid resumeId: the active uploaded resume is used, grounded in real data — never the 'not available in the knowledge base' fallback", async () => {
    resumeStore.mockReturnValue({ resumeId: "resume-1" });
    resumeGet.mockReturnValue(fakeRecord());

    const response = await resumeTool.execute("What is my ATS score?");

    expect(response.success).toBe(true);
    expect(response.result.context).toContain("SPECIAL MODE — RESUME ANALYSIS");
    expect(response.result.context).toContain("ATS overall score: 78/100");
    expect(response.result.context).not.toContain("not available in the knowledge base");
  });

  it("Expired/unknown resumeId: gracefully falls back to RAG search instead of crashing the chat pipeline", async () => {
    resumeStore.mockReturnValue({ resumeId: "expired-id" });
    resumeGet.mockReturnValue(undefined);

    const response = await resumeTool.execute("What is my ATS score?");

    expect(response.success).toBe(true);
    expect(response.result.context).toBe("fallback context");
  });

  it("preserves the exact Phase 9 SPECIAL MODE directive text (never weakened or removed)", async () => {
    resumeStore.mockReturnValue({ resumeId: "resume-1" });
    resumeGet.mockReturnValue(fakeRecord());

    const response = await resumeTool.execute("What are my biggest skill gaps?");

    expect(response.result.context).toContain(
      "SPECIAL MODE — RESUME ANALYSIS: The user has uploaded their own resume for analysis below. For this question, answer as a resume-analysis assistant for THIS candidate (not about Zafrul). This data is real and provided — never say the information is unavailable."
    );
  });

  it("includes career level, suitable roles, strengths, weaknesses, and skill gaps in the grounded context", async () => {
    resumeStore.mockReturnValue({ resumeId: "resume-1" });
    resumeGet.mockReturnValue(fakeRecord());

    const response = await resumeTool.execute("Which roles are suitable for this resume?");
    const context = response.result.context;

    expect(context).toContain("Career level: Senior");
    expect(context).toContain("Suitable roles: Backend Engineer");
    expect(context).toContain("Key strengths: Strong Java fundamentals");
    expect(context).toContain("Weaknesses: Limited cloud exposure");
    expect(context).toContain("Missing Cloud skills: Kubernetes");
  });
});
