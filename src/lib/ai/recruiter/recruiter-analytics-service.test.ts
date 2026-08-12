import { describe, expect, it, vi } from "vitest";

// Phase 16 Milestone 6 — exercises getRecruiterAnalytics() against the
// REAL candidateService/recruiterJobService (mocked supabaseAdmin
// query builder, same pattern candidate-service.test.ts already
// established), so a regression in the actual ownership-scoping code
// is what these tests would catch — not a hand-rolled fake.

const { tables } = vi.hoisted(() => ({
  tables: { recruiter_jobs: [], recruiter_candidates: [] } as Record<string, Record<string, unknown>[]>,
}));

vi.mock("../../supabase/admin", async () => {
  const { makeMultiTableSupabaseAdminMock } = await import("./recruiter-test-helpers");
  return { supabaseAdmin: makeMultiTableSupabaseAdminMock(tables) };
});

interface FakeResumeRecord {
  resumeId: string;
  filename: string;
  uploadedAt: string;
  resume: {
    contact: { name: string | null; email: string | null; phone: null; location: null; linkedin: null; github: null; website: null };
    summary: string;
    skills: string[];
    technicalSkills: string[];
    softSkills: string[];
    workExperience: never[];
    education: never[];
    certifications: never[];
    projects: never[];
    achievements: never[];
    languages: never[];
    yearsOfExperience: number;
  };
  analysis: Record<string, unknown>;
  atsScore: { overall: number };
  skillGap: Record<string, unknown>;
  processingTimeMs: number;
}

const resumeRecords = new Map<string, FakeResumeRecord>();
let resumeCounter = 0;

vi.mock("../resume/resume-service", () => ({
  resumeService: {
    get: (resumeId: string) => resumeRecords.get(resumeId),
    analyzeUpload: vi.fn(async (input: { filename: string; buffer: Buffer }) => {
      resumeCounter += 1;
      const resumeId = `resume-${resumeCounter}`;
      const email = input.buffer.toString() || null;
      const record: FakeResumeRecord = {
        resumeId,
        filename: input.filename,
        uploadedAt: new Date().toISOString(),
        resume: {
          contact: { name: input.filename, email, phone: null, location: null, linkedin: null, github: null, website: null },
          summary: "",
          skills: ["Java"],
          technicalSkills: ["Java"],
          softSkills: [],
          workExperience: [],
          education: [],
          certifications: [],
          projects: [],
          achievements: [],
          languages: [],
          yearsOfExperience: 3,
        },
        analysis: {},
        atsScore: { overall: 80 },
        skillGap: {},
        processingTimeMs: 0,
      };
      resumeRecords.set(resumeId, record);
      return record;
    }),
  },
}));

vi.mock("../job-description/jd-service", () => ({
  jdMatchService: {
    get: () => undefined,
    analyze: vi.fn(async (input: { resumeId: string; jd: { text: string } }) => ({
      jdMatchId: `jdmatch-${input.resumeId}`,
      resumeId: input.resumeId,
      jobDescription: { companyName: null, jobTitle: null },
      matchResult: { overallMatch: 75, atsScore: 75, matchedSkills: ["Java"], missingSkills: ["Docker"] },
      createdAt: new Date().toISOString(),
    })),
  },
}));

vi.mock("../interview-prep/prep-service", () => ({ prepService: { get: () => undefined, generate: vi.fn() } }));
vi.mock("../openai", () => ({ openai: { chat: { completions: { create: vi.fn() } } } }));
vi.mock("../job-description/jd-parser", () => ({
  jdParser: { parse: vi.fn(async (input: { text: string }) => ({ companyName: null, jobTitle: null, skills: [], raw: input.text })) },
}));

import { candidateService } from "./candidate-service";
import { getRecruiterAnalytics } from "./recruiter-analytics-service";
import { recruiterJobService, RecruiterJobNotFoundError } from "./recruiter-job-service";

function importOne(recruiterId: string, filename: string, jobId: string | null = null, email = "") {
  return candidateService.importResumes(recruiterId, [{ filename, buffer: Buffer.from(email) }], jobId);
}

describe("getRecruiterAnalytics — recruiter isolation (Phase 16 Milestone 6, §10)", () => {
  it("recruiter A's overall analytics never include recruiter B's jobs or candidates", async () => {
    const jobA = await recruiterJobService.createJob("recruiter-an-a", { title: "Job A", jobDescriptionText: "Java" });
    await importOne("recruiter-an-a", "a.pdf", jobA.id, "ana@example.com");

    const jobB = await recruiterJobService.createJob("recruiter-an-b", { title: "Job B", jobDescriptionText: "React" });
    await importOne("recruiter-an-b", "b.pdf", jobB.id, "anb@example.com");
    await importOne("recruiter-an-b", "b2.pdf", jobB.id, "anb2@example.com");

    const analyticsA = await getRecruiterAnalytics("recruiter-an-a");
    expect(analyticsA.overall.totalJobs).toBe(1);
    expect(analyticsA.overall.totalCandidates).toBe(1);
    expect(analyticsA.jobAnalytics.map((j) => j.jobId)).toEqual([jobA.id]);

    const analyticsB = await getRecruiterAnalytics("recruiter-an-b");
    expect(analyticsB.overall.totalJobs).toBe(1);
    expect(analyticsB.overall.totalCandidates).toBe(2);
  });

  it("a foreign jobId returns the same RecruiterJobNotFoundError as a nonexistent one (safe 404)", async () => {
    const jobA = await recruiterJobService.createJob("recruiter-an-c", { title: "Job C", jobDescriptionText: "Java" });

    await expect(getRecruiterAnalytics("recruiter-an-d", jobA.id)).rejects.toThrow(RecruiterJobNotFoundError);

    let crossMessage = "";
    let nonexistentMessage = "";
    try {
      await getRecruiterAnalytics("recruiter-an-d", jobA.id);
    } catch (error) {
      crossMessage = (error as Error).message;
    }
    try {
      await getRecruiterAnalytics("recruiter-an-c", "00000000-0000-0000-0000-000000000000");
    } catch (error) {
      nonexistentMessage = (error as Error).message;
    }
    expect(crossMessage).toBe(nonexistentMessage);
  });

  it("job-scoped analytics for one recruiter never leak another recruiter's candidate count into the same job id namespace", async () => {
    const jobX = await recruiterJobService.createJob("recruiter-an-e", { title: "Job X", jobDescriptionText: "Java" });
    await importOne("recruiter-an-e", "x1.pdf", jobX.id, "x1@example.com");
    await importOne("recruiter-an-e", "x2.pdf", jobX.id, "x2@example.com");

    const scoped = await getRecruiterAnalytics("recruiter-an-e", jobX.id);
    expect(scoped.overall.totalCandidates).toBe(2);
    expect(scoped.scope.job?.recruiterId).toBe("recruiter-an-e");
  });

  it("listMissingSkills() is recruiter-scoped — never aggregates another recruiter's skill gaps", async () => {
    const jobF = await recruiterJobService.createJob("recruiter-an-f", { title: "Job F", jobDescriptionText: "Java" });
    await importOne("recruiter-an-f", "f.pdf", jobF.id, "f@example.com");

    const jobG = await recruiterJobService.createJob("recruiter-an-g", { title: "Job G", jobDescriptionText: "Java" });
    await importOne("recruiter-an-g", "g.pdf", jobG.id, "g@example.com");

    const skillsF = await candidateService.listMissingSkills("recruiter-an-f", jobF.id);
    expect(skillsF).toHaveLength(1);

    const skillsFromWrongRecruiter = await candidateService.listMissingSkills("recruiter-an-h", jobF.id);
    expect(skillsFromWrongRecruiter).toHaveLength(0);
  });

  it("computeRanking(recruiterId, {jobId}) only ranks that recruiter's own job candidates", async () => {
    const job = await recruiterJobService.createJob("recruiter-an-i", { title: "Job I", jobDescriptionText: "Java" });
    const { imported } = await importOne("recruiter-an-i", "i.pdf", job.id, "i@example.com");

    const ranking = await candidateService.computeRanking("recruiter-an-i", { jobId: job.id });
    expect(ranking.map((r) => r.candidateId)).toEqual(imported.map((c) => c.candidateId));

    const rankingForOther = await candidateService.computeRanking("recruiter-an-j", { jobId: job.id });
    expect(rankingForOther).toHaveLength(0);
  });

  it("getRecruiterAnalytics() ranks candidates without a second, redundant list() fetch (Phase 16 Milestone 10, §13)", async () => {
    const job = await recruiterJobService.createJob("recruiter-an-k", { title: "Job K", jobDescriptionText: "Java" });
    const { imported } = await importOne("recruiter-an-k", "k.pdf", job.id, "k@example.com");

    const listSpy = vi.spyOn(candidateService, "list");
    listSpy.mockClear();

    const analytics = await getRecruiterAnalytics("recruiter-an-k", job.id);

    // Previously this called BOTH candidateService.list() directly AND
    // candidateService.computeRanking() (which internally re-runs
    // list() with the same arguments) — a fully redundant duplicate
    // fetch on every analytics request. It must now be fetched exactly
    // once, with rankCandidates() applied directly to that result.
    expect(listSpy).toHaveBeenCalledTimes(1);
    expect(analytics.topCandidates.map((r) => r.candidateId)).toEqual(imported.map((c) => c.candidateId));

    listSpy.mockRestore();
  });
});
