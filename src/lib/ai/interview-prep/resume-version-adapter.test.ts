import { vi } from "vitest";

// resumeVersionService.getVersion() is the ownership-checked boundary —
// mocked directly rather than mocking supabaseAdmin, since this file
// tests the ADAPTER's own logic, not resume-version-service.ts's DB
// query behavior (already covered by resume-version-service.test.ts).
// jdParser.parse() is the one genuinely unavoidable LLM call (see the
// adapter's own doc comment) — mocked so these tests are deterministic
// and never depend on live LLM output. Both declared via vi.hoisted()
// so they're safely referenceable inside the hoisted vi.mock() factories
// below (a plain top-level const would hit a TDZ ReferenceError).
// Mocked as a standalone module (not vi.importActual — the real
// resume-version-service.ts transitively imports supabaseAdmin, which
// needs real Supabase env vars at import time, same constraint every
// other test in this codebase that mocks a Supabase-backed service
// works around). ResumeVersionNotFoundError is redefined here identical
// to the real class (a plain, dependency-free Error subclass) rather
// than imported, so this test file has zero transitive dependency on
// the real module's own import graph. Everything referenced inside a
// vi.mock() factory must come from vi.hoisted() — factories are hoisted
// above every other top-level statement in the file.
const { getVersionMock, jdParserParseMock, MockResumeVersionNotFoundError } = vi.hoisted(() => {
  class MockResumeVersionNotFoundError extends Error {
    constructor() {
      super("Resume version not found.");
      this.name = "ResumeVersionNotFoundError";
    }
  }

  return {
    getVersionMock: vi.fn(),
    jdParserParseMock: vi.fn(),
    MockResumeVersionNotFoundError,
  };
});

vi.mock("../resume-versions/resume-version-service", () => ({
  resumeVersionService: { getVersion: getVersionMock },
  ResumeVersionNotFoundError: MockResumeVersionNotFoundError,
}));

vi.mock("../job-description/jd-parser", () => ({ jdParser: { parse: jdParserParseMock } }));

// jd-service.ts (imported transitively via jdMatchService below) imports
// job-description/optimizer.ts, which reaches the metered OpenAI client
// — whose module graph needs real Supabase env vars at import time (the
// same constraint job-description/optimizer.test.ts's own comment
// documents). Stubbed purely so the module graph is importable; the
// adapter never calls resumeOptimizer.optimize() (see its own doc
// comment — that LLM call is deliberately skipped in favor of reusing
// the version's already-persisted optimizedSections).
vi.mock("../openai", () => ({ openai: {} }));

import { beforeEach, describe, expect, it } from "vitest";

import { ResumeVersionMissingJdError, resolveInterviewPrepInputFromResumeVersion } from "./resume-version-adapter";
import { ResumeVersionNotFoundError } from "../resume-versions/resume-version-service";
import { ResumeVersionRecord } from "../resume-versions/resume-version-types";
import { jdMatchService } from "../job-description/jd-service";
import { resumeService } from "../resume/resume-service";
import { JobDescription } from "../job-description/jd-schema";
import { Resume } from "../resume/resume-schema";

// Phase 17 Milestone 2, §13 — deterministic tests for the Resume Version
// -> Interview Preparation adapter. No test depends on live LLM output:
// jdParser.parse() is mocked to a fixed, schema-valid JobDescription;
// resumeService/jdMatchService/resumeScorer/resumeSuggestionsEngine/
// computeJdMatch are all real (in-memory or pure/deterministic — no
// network, no Supabase) so these tests exercise the actual seeding
// methods end-to-end, not a hand-rolled fake.

function baseResume(overrides: Partial<Resume> = {}): Resume {
  return {
    contact: { name: "Jane Doe", email: "jane@example.com", phone: null, location: null, linkedin: null, github: null, website: null },
    summary: "Backend developer.",
    skills: [],
    technicalSkills: ["Java", "Spring Boot"],
    softSkills: [],
    workExperience: [{ title: "Senior Java Developer", company: "Acme Corp", location: null, startDate: "2020-01", endDate: null, isCurrent: true, description: ["Built REST APIs."] }],
    education: [],
    certifications: [],
    projects: [],
    achievements: [],
    languages: [],
    yearsOfExperience: 6,
    ...overrides,
  };
}

function baseVersion(overrides: Partial<ResumeVersionRecord> = {}): ResumeVersionRecord {
  return {
    id: "version-1",
    userId: "user-1",
    versionName: "Backend Role",
    versionNumber: 1,
    isMaster: false,
    isArchived: false,
    sourceVersionId: null,
    targetJobTitle: "Backend Engineer",
    targetCompany: "TestCo",
    targetLocation: null,
    jobDescriptionText: "We need a backend engineer with Java and Kubernetes experience.",
    resumeData: baseResume(),
    atsScore: 80,
    jdMatchScore: 75,
    matchedSkills: ["Java"],
    missingSkills: ["Kubernetes"],
    optimizedSections: {
      optimizedSummary: "Optimized summary from prior JD-optimization.",
      optimizedExperience: [],
      optimizedProjects: [],
      optimizedSkills: ["Java", "Spring Boot"],
      improvementSuggestions: [],
    },
    rewrittenSections: null,
    sectionsData: null,
    templateSettings: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

const fakeJobDescription: JobDescription = {
  companyName: "TestCo",
  jobTitle: "Backend Engineer",
  experienceRequired: { minYears: 3, maxYears: null, raw: "3+ years" },
  educationRequired: [],
  skills: ["Java", "Kubernetes"],
  mandatorySkills: ["Java", "Kubernetes"],
  goodToHaveSkills: [],
  responsibilities: [],
  softSkills: [],
  certifications: [],
  cloud: ["Kubernetes"],
  frameworks: [],
  programmingLanguages: ["Java"],
  tools: [],
  databases: [],
  aiSkills: [],
  security: [],
  domain: null,
};

beforeEach(() => {
  getVersionMock.mockReset();
  jdParserParseMock.mockReset();
  jdParserParseMock.mockResolvedValue(fakeJobDescription);
});

describe("resolveInterviewPrepInputFromResumeVersion — ownership (Phase 17 Milestone 2, §9/§13)", () => {
  it("an owned Resume Version resolves to a real, resolvable {resumeId, jdMatchId} pair", async () => {
    getVersionMock.mockResolvedValue(baseVersion());

    const result = await resolveInterviewPrepInputFromResumeVersion("user-1", "version-1");

    expect(getVersionMock).toHaveBeenCalledWith("user-1", "version-1");
    expect(resumeService.get(result.resumeId)).toBeDefined();
    expect(jdMatchService.get(result.jdMatchId)).toBeDefined();
  });

  it("a non-owned/missing Resume Version is rejected with the same safe error every other resume-version route uses", async () => {
    getVersionMock.mockRejectedValue(new ResumeVersionNotFoundError());

    await expect(resolveInterviewPrepInputFromResumeVersion("user-2", "version-1")).rejects.toThrow(ResumeVersionNotFoundError);
  });

  it("never trusts a client-supplied userId — the caller's userId is passed straight through to the existing ownership check unmodified", async () => {
    getVersionMock.mockResolvedValue(baseVersion());

    await resolveInterviewPrepInputFromResumeVersion("real-authenticated-user", "version-1");

    expect(getVersionMock).toHaveBeenCalledWith("real-authenticated-user", "version-1");
  });
});

describe("resolveInterviewPrepInputFromResumeVersion — JD resolution (§4/§11)", () => {
  it("rejects a version with no attached JD and no override, rather than silently proceeding", async () => {
    getVersionMock.mockResolvedValue(baseVersion({ jobDescriptionText: null, optimizedSections: null }));

    await expect(resolveInterviewPrepInputFromResumeVersion("user-1", "version-1")).rejects.toThrow(ResumeVersionMissingJdError);
    expect(jdParserParseMock).not.toHaveBeenCalled();
  });

  it("calls jdParser.parse() exactly once — the one unavoidable LLM call — never twice, never a second parser", async () => {
    getVersionMock.mockResolvedValue(baseVersion());

    await resolveInterviewPrepInputFromResumeVersion("user-1", "version-1");

    expect(jdParserParseMock).toHaveBeenCalledTimes(1);
  });

  it("reuses the version's own already-persisted optimizedSections rather than recomputing them via a second LLM call", async () => {
    getVersionMock.mockResolvedValue(baseVersion());

    const result = await resolveInterviewPrepInputFromResumeVersion("user-1", "version-1");
    const jdMatchRecord = jdMatchService.get(result.jdMatchId);

    expect(jdMatchRecord?.matchResult.optimizedSummary).toBe("Optimized summary from prior JD-optimization.");
  });

  it("an explicit jobDescriptionText override differing from the version's own JD does not reuse the (now-mismatched) optimizedSections", async () => {
    getVersionMock.mockResolvedValue(baseVersion());

    const result = await resolveInterviewPrepInputFromResumeVersion("user-1", "version-1", "A completely different job description text.");
    const jdMatchRecord = jdMatchService.get(result.jdMatchId);

    expect(jdMatchRecord?.matchResult.optimizedSummary).toBe("");
  });
});

describe("resolveInterviewPrepInputFromResumeVersion — current-version consistency (§7)", () => {
  it("interview prep sees the CURRENT resume content, never a stale earlier snapshot", async () => {
    // Simulates: user edits "Senior Java Developer" to "Lead Java Developer" in the Resume Builder.
    const editedResume = baseResume({
      workExperience: [{ title: "Lead Java Developer", company: "Acme Corp", location: null, startDate: "2020-01", endDate: null, isCurrent: true, description: ["Built REST APIs."] }],
    });
    getVersionMock.mockResolvedValue(baseVersion({ resumeData: editedResume }));

    const result = await resolveInterviewPrepInputFromResumeVersion("user-1", "version-1");
    const resumeRecord = resumeService.get(result.resumeId);

    expect(resumeRecord?.resume.workExperience[0].title).toBe("Lead Java Developer");
  });

  it("never fabricates resume content — the seeded record's resume is byte-for-byte the version's own resumeData", async () => {
    const resume = baseResume({ skills: ["Docker", "AWS"] });
    getVersionMock.mockResolvedValue(baseVersion({ resumeData: resume }));

    const result = await resolveInterviewPrepInputFromResumeVersion("user-1", "version-1");
    const resumeRecord = resumeService.get(result.resumeId);

    expect(resumeRecord?.resume).toEqual(resume);
  });
});
