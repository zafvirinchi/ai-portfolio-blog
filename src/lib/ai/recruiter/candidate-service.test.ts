import { describe, expect, it, vi } from "vitest";

// Phase 16 Milestone 3 — CandidateService moved from an in-memory Map
// to supabaseAdmin-backed persistence (recruiter_candidates /
// recruiter_jobs). These tests exercise ownership + persistence
// through the REAL candidate-service.ts and recruiter-job-service.ts
// against a mocked supabaseAdmin (makeMultiTableSupabaseAdminMock —
// the same extended chainable-query-builder pattern
// resume-version-service.test.ts already established), not a
// hand-rolled fake service — so a regression in the actual .eq()
// ownership-scoping code is what these tests would catch.

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
    // The test-controlled "email" for duplicate-detection tests is
    // smuggled through the upload buffer's content (importOne()'s
    // optional 3rd arg) — analyzeUpload() only ever receives
    // {filename, buffer} in production too, so this mirrors the real
    // shape rather than inventing a parallel test-only input.
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

const jdMatchAnalyze = vi.fn(async (input: { resumeId: string; jd: { text: string } }) => ({
  jdMatchId: `jdmatch-${input.resumeId}-${input.jd.text.length}`,
  resumeId: input.resumeId,
  jobDescription: { companyName: null, jobTitle: null },
  matchResult: { overallMatch: 77, atsScore: 77, matchedSkills: ["Java"], missingSkills: [] },
  createdAt: new Date().toISOString(),
}));

vi.mock("../job-description/jd-service", () => ({
  jdMatchService: { get: () => undefined, analyze: (...args: [{ resumeId: string; jd: { text: string } }]) => jdMatchAnalyze(...args) },
}));

vi.mock("../interview-prep/prep-service", () => ({ prepService: { get: () => undefined, generate: vi.fn() } }));

// candidate-insights.ts/candidate-comparison.ts/candidate-recommendation.ts
// import the shared metered `openai` client, which transitively reaches
// billing/subscription-service.ts -> supabaseAdmin's REAL constructor
// (not this test's mock, since that import path is separate) at
// MODULE LOAD time — throws in this test env with no Supabase env vars
// configured. Mocked to keep the import graph loadable AND to return a
// schema-valid stub completion — Milestone 5's same-job comparison
// tests exercise compare()'s success path (generateComparisonRecommendation),
// which parses this response with comparisonRecommendationLlmOutputSchema.
vi.mock("../openai", () => ({
  openai: {
    chat: {
      completions: {
        create: vi.fn(async () => ({
          choices: [{ message: { content: JSON.stringify({ recommendation: "stub", rankingRationale: "stub", perCandidateNotes: [] }) } }],
        })),
      },
    },
  },
}));

// jd-parser.ts (used by recruiter-job-service.ts's createJob/updateJob)
// is the one real LLM call in this file's dependency graph — mocked to
// a deterministic stub so job creation never hits the network.
vi.mock("../job-description/jd-parser", () => ({
  jdParser: { parse: vi.fn(async (input: { text: string }) => ({ companyName: null, jobTitle: null, skills: [], raw: input.text })) },
}));

import { candidateService, CandidateNotFoundError } from "./candidate-service";
import { recruiterJobService, RecruiterJobNotFoundError } from "./recruiter-job-service";
import { openai } from "../openai";

function importOne(recruiterId: string, filename: string, jobId: string | null = null, email = "") {
  return candidateService.importResumes(recruiterId, [{ filename, buffer: Buffer.from(email) }], jobId);
}

describe("CandidateService — recruiter ownership & persistence (Phase 16 Milestone 3)", () => {
  it("scopes list() to only the requesting recruiter's own candidates", async () => {
    const { imported: importedA } = await importOne("recruiter-a", "a.pdf");
    const { imported: importedB } = await importOne("recruiter-b", "b.pdf");

    expect((await candidateService.list("recruiter-a")).map((c) => c.candidateId)).toEqual(importedA.map((c) => c.candidateId));
    expect((await candidateService.list("recruiter-b")).map((c) => c.candidateId)).toEqual(importedB.map((c) => c.candidateId));
  });

  it("get()/getProfile() return the record for its owner and undefined for anyone else", async () => {
    const { imported } = await importOne("recruiter-c", "c.pdf");
    const candidateId = imported[0].candidateId;

    expect(await candidateService.get(candidateId, "recruiter-c")).toBeDefined();
    expect(await candidateService.get(candidateId, "recruiter-x")).toBeUndefined();
    expect(await candidateService.getProfile(candidateId, "recruiter-c")).toBeDefined();
    expect(await candidateService.getProfile(candidateId, "recruiter-x")).toBeUndefined();
  });

  it("rejects a cross-recruiter mutation (updateStatus) with CandidateNotFoundError, and the owner's own call still succeeds and persists", async () => {
    const { imported } = await importOne("recruiter-d", "d.pdf");
    const candidateId = imported[0].candidateId;

    await expect(candidateService.updateStatus(candidateId, "recruiter-y", "Shortlisted")).rejects.toThrow(CandidateNotFoundError);

    const updated = await candidateService.updateStatus(candidateId, "recruiter-d", "Shortlisted");
    expect(updated.status).toBe("Shortlisted");

    // Re-read through a fresh, independent query — not served from any process-local cache.
    const reread = await candidateService.get(candidateId, "recruiter-d");
    expect(reread?.status).toBe("Shortlisted");
  });

  it("never distinguishes 'exists but not yours' from 'does not exist' for candidates (enumeration protection)", async () => {
    const { imported } = await importOne("recruiter-e", "e.pdf");
    const candidateId = imported[0].candidateId;

    let crossRecruiterMessage = "";
    let nonexistentMessage = "";

    try {
      await candidateService.updateStatus(candidateId, "recruiter-z", "Rejected");
    } catch (error) {
      crossRecruiterMessage = (error as Error).message;
    }

    try {
      await candidateService.updateStatus("00000000-0000-0000-0000-000000000000", "recruiter-e", "Rejected");
    } catch (error) {
      nonexistentMessage = (error as Error).message;
    }

    expect(crossRecruiterMessage).not.toBe("");
    expect(crossRecruiterMessage).toBe(nonexistentMessage);
  });

  it("rejects cross-recruiter addNote/updateTags/remove the same way — notes never leak to another recruiter", async () => {
    const { imported } = await importOne("recruiter-f", "f.pdf");
    const candidateId = imported[0].candidateId;

    await expect(candidateService.addNote(candidateId, "recruiter-intruder", "Recruiter", "note")).rejects.toThrow(CandidateNotFoundError);
    await expect(candidateService.updateTags(candidateId, "recruiter-intruder", ["Backend"])).rejects.toThrow(CandidateNotFoundError);
    await expect(candidateService.remove(candidateId, "recruiter-intruder")).rejects.toThrow(CandidateNotFoundError);

    // Still there for the real owner, and the intruder never saw the note.
    const ownerProfile = await candidateService.getProfile(candidateId, "recruiter-f");
    expect(ownerProfile?.record.notes).toHaveLength(0);
  });

  it("scopes computeDashboard() and computeRanking() to only the requesting recruiter's own candidates", async () => {
    const { imported: mine } = await importOne("recruiter-i", "i.pdf");
    await importOne("recruiter-j", "j.pdf");

    const dashboard = await candidateService.computeDashboard("recruiter-i");
    expect(dashboard.totalCandidates).toBe(1);

    const ranking = await candidateService.computeRanking("recruiter-i");
    expect(ranking.map((r) => r.candidateId)).toEqual(mine.map((c) => c.candidateId));
  });

  it("getForSystemUse()/listForSystemUse() intentionally bypass ownership for internal cross-service callers (pipeline-service.ts)", async () => {
    const { imported } = await importOne("recruiter-k", "k.pdf");
    const candidateId = imported[0].candidateId;

    expect((await candidateService.getForSystemUse(candidateId))?.candidateId).toBe(candidateId);
    expect((await candidateService.listForSystemUse()).some((c) => c.candidateId === candidateId)).toBe(true);
  });
});

describe("RecruiterJobService — ownership & persistence", () => {
  it("scopes listJobs()/getJob() to only the owning recruiter, and rejects a non-owner with the same error as a nonexistent job", async () => {
    const jobA = await recruiterJobService.createJob("recruiter-a", { title: "Backend Engineer", jobDescriptionText: "Java, Spring Boot" });
    await recruiterJobService.createJob("recruiter-b", { title: "Frontend Engineer", jobDescriptionText: "React" });

    expect((await recruiterJobService.listJobs("recruiter-a")).map((j) => j.id)).toEqual([jobA.id]);

    await expect(recruiterJobService.getJob("recruiter-b", jobA.id)).rejects.toThrow(RecruiterJobNotFoundError);

    let crossMessage = "";
    let nonexistentMessage = "";
    try {
      await recruiterJobService.getJob("recruiter-b", jobA.id);
    } catch (error) {
      crossMessage = (error as Error).message;
    }
    try {
      await recruiterJobService.getJob("recruiter-a", "00000000-0000-0000-0000-000000000000");
    } catch (error) {
      nonexistentMessage = (error as Error).message;
    }
    expect(crossMessage).toBe(nonexistentMessage);
  });

  it("rejects a non-owner's updateJob/deleteJob", async () => {
    const job = await recruiterJobService.createJob("recruiter-c", { title: "DevOps Engineer", jobDescriptionText: "Kubernetes, Terraform" });

    await expect(recruiterJobService.updateJob("recruiter-intruder", job.id, { title: "Hijacked" })).rejects.toThrow(RecruiterJobNotFoundError);
    await expect(recruiterJobService.deleteJob("recruiter-intruder", job.id)).rejects.toThrow(RecruiterJobNotFoundError);

    const stillOwned = await recruiterJobService.getJob("recruiter-c", job.id);
    expect(stillOwned.title).toBe("DevOps Engineer");
  });

  it("persists an update through a fresh, independent read", async () => {
    const job = await recruiterJobService.createJob("recruiter-d", { title: "QA Engineer", jobDescriptionText: "Selenium" });
    await recruiterJobService.updateJob("recruiter-d", job.id, { title: "Senior QA Engineer" });

    const reread = await recruiterJobService.getJob("recruiter-d", job.id);
    expect(reread.title).toBe("Senior QA Engineer");
  });
});

describe("Job/candidate relationship — cross-recruiter attachment is impossible (Phase 16 Milestone 3, §10)", () => {
  it("Recruiter A cannot attach Recruiter B's candidate to Recruiter A's job", async () => {
    const jobA = await recruiterJobService.createJob("recruiter-a2", { title: "Java Developer", jobDescriptionText: "Java" });
    const { imported: candidatesB } = await importOne("recruiter-b2", "candidate-b.pdf");
    const candidateBId = candidatesB[0].candidateId;

    await expect(candidateService.matchCandidate(candidateBId, "recruiter-a2", jobA.id)).rejects.toThrow(CandidateNotFoundError);
  });

  it("Recruiter A cannot match their own candidate against Recruiter B's job", async () => {
    const { imported: candidatesA } = await importOne("recruiter-a3", "candidate-a.pdf");
    const candidateAId = candidatesA[0].candidateId;
    const jobB = await recruiterJobService.createJob("recruiter-b3", { title: "Backend Role", jobDescriptionText: "Spring" });

    await expect(candidateService.matchCandidate(candidateAId, "recruiter-a3", jobB.id)).rejects.toThrow(RecruiterJobNotFoundError);
  });

  it("a genuine match against the recruiter's own job persists the JD match result", async () => {
    const job = await recruiterJobService.createJob("recruiter-a4", { title: "Full Stack Developer", jobDescriptionText: "Java, React" });
    const { imported } = await importOne("recruiter-a4", "candidate.pdf");
    const candidateId = imported[0].candidateId;

    const matched = await candidateService.matchCandidate(candidateId, "recruiter-a4", job.id);
    expect(matched.jobId).toBe(job.id);
    expect(matched.jdMatchResult).not.toBeNull();

    // Recruiter B can never retrieve Recruiter A's evaluation.
    const profileForIntruder = await candidateService.getProfile(candidateId, "recruiter-intruder2");
    expect(profileForIntruder).toBeUndefined();
  });
});

describe("Duplicate candidate detection (Phase 16 Milestone 4, §7)", () => {
  it("same candidate (same email) + same job → detected as a duplicate, no second row created", async () => {
    const job = await recruiterJobService.createJob("recruiter-dup1", { title: "Backend Engineer", jobDescriptionText: "Java" });

    const first = await importOne("recruiter-dup1", "resume-v1.pdf", job.id, "jane@example.com");
    expect(first.duplicates).toHaveLength(0);
    expect(first.imported).toHaveLength(1);

    const second = await importOne("recruiter-dup1", "resume-v2.pdf", job.id, "Jane@Example.com "); // same email, different case/whitespace/filename
    expect(second.imported).toHaveLength(0);
    expect(second.duplicates).toEqual([{ filename: "resume-v2.pdf", existingCandidateId: first.imported[0].candidateId }]);

    expect((await candidateService.list("recruiter-dup1")).filter((c) => c.jobId === job.id)).toHaveLength(1);
  });

  it("same candidate + a DIFFERENT job → allowed as a separate candidate row", async () => {
    const jobA = await recruiterJobService.createJob("recruiter-dup2", { title: "Backend Role", jobDescriptionText: "Java" });
    const jobB = await recruiterJobService.createJob("recruiter-dup2", { title: "Frontend Role", jobDescriptionText: "React" });

    const forJobA = await importOne("recruiter-dup2", "a.pdf", jobA.id, "sam@example.com");
    const forJobB = await importOne("recruiter-dup2", "b.pdf", jobB.id, "sam@example.com");

    expect(forJobA.duplicates).toHaveLength(0);
    expect(forJobB.duplicates).toHaveLength(0);
    expect(forJobA.imported[0].candidateId).not.toBe(forJobB.imported[0].candidateId);
  });

  it("different recruiter + same email → isolated, never reported as a duplicate across recruiters", async () => {
    const jobX = await recruiterJobService.createJob("recruiter-dup3x", { title: "Role X", jobDescriptionText: "Java" });
    const jobY = await recruiterJobService.createJob("recruiter-dup3y", { title: "Role Y", jobDescriptionText: "Java" });

    const forX = await importOne("recruiter-dup3x", "x.pdf", jobX.id, "shared@example.com");
    const forY = await importOne("recruiter-dup3y", "y.pdf", jobY.id, "shared@example.com");

    expect(forX.duplicates).toHaveLength(0);
    expect(forY.duplicates).toHaveLength(0);
  });

  it("a resume with no email is never flagged as a duplicate (no stable identifier to compare)", async () => {
    const first = await importOne("recruiter-dup4", "no-email-1.pdf", null, "");
    const second = await importOne("recruiter-dup4", "no-email-2.pdf", null, "");

    expect(first.duplicates).toHaveLength(0);
    expect(second.duplicates).toHaveLength(0);
    expect(await candidateService.list("recruiter-dup4")).toHaveLength(2);
  });
});

describe("Stale evaluation + re-evaluation (Phase 16 Milestone 4, §20/§21)", () => {
  it("a fresh match is 'complete'; editing the job's JD later marks the candidate 'stale'", async () => {
    const job = await recruiterJobService.createJob("recruiter-stale1", { title: "Platform Engineer", jobDescriptionText: "Kubernetes" });
    const { imported } = await importOne("recruiter-stale1", "candidate.pdf", job.id, "p1@example.com");
    const candidateId = imported[0].candidateId;

    const freshList = await candidateService.list("recruiter-stale1");
    expect(freshList.find((c) => c.candidateId === candidateId)?.evaluationStatus).toBe("complete");

    await new Promise((resolve) => setTimeout(resolve, 5));
    await recruiterJobService.updateJob("recruiter-stale1", job.id, { jobDescriptionText: "Kubernetes, Terraform, AWS" });

    const afterJobEdit = await candidateService.list("recruiter-stale1");
    expect(afterJobEdit.find((c) => c.candidateId === candidateId)?.evaluationStatus).toBe("stale");

    const profile = await candidateService.getProfile(candidateId, "recruiter-stale1");
    expect(profile?.summary.evaluationStatus).toBe("stale");
  });

  it("re-evaluating clears staleness and bumps evaluatedAt", async () => {
    const job = await recruiterJobService.createJob("recruiter-stale2", { title: "SRE", jobDescriptionText: "Terraform" });
    const { imported } = await importOne("recruiter-stale2", "candidate.pdf", job.id, "p2@example.com");
    const candidateId = imported[0].candidateId;
    const beforeEvaluatedAt = (await candidateService.get(candidateId, "recruiter-stale2"))?.evaluatedAt;

    await new Promise((resolve) => setTimeout(resolve, 5));
    await recruiterJobService.updateJob("recruiter-stale2", job.id, { jobDescriptionText: "Terraform, Ansible" });

    const staleList = await candidateService.list("recruiter-stale2");
    expect(staleList.find((c) => c.candidateId === candidateId)?.evaluationStatus).toBe("stale");

    await candidateService.reEvaluateCandidate(candidateId, "recruiter-stale2");

    const afterList = await candidateService.list("recruiter-stale2");
    expect(afterList.find((c) => c.candidateId === candidateId)?.evaluationStatus).toBe("complete");

    const afterRecord = await candidateService.get(candidateId, "recruiter-stale2");
    expect(afterRecord?.evaluatedAt).not.toBe(beforeEvaluatedAt);
  });

  it("re-evaluate rejects a non-owner", async () => {
    const job = await recruiterJobService.createJob("recruiter-stale3", { title: "QA", jobDescriptionText: "Selenium" });
    const { imported } = await importOne("recruiter-stale3", "candidate.pdf", job.id, "p3@example.com");
    const candidateId = imported[0].candidateId;

    await expect(candidateService.reEvaluateCandidate(candidateId, "recruiter-intruder3")).rejects.toThrow(CandidateNotFoundError);
  });

  it("re-evaluate refuses a candidate that has never been attached to a job", async () => {
    const { imported } = await importOne("recruiter-stale4", "unattached.pdf", null, "p4@example.com");
    const candidateId = imported[0].candidateId;

    await expect(candidateService.reEvaluateCandidate(candidateId, "recruiter-stale4")).rejects.toThrow(/attach/i);
  });

  it("an unmatched candidate is 'not_evaluated', never silently 0% or fabricated", async () => {
    const { imported } = await importOne("recruiter-stale5", "unmatched.pdf", null, "p5@example.com");
    const summary = imported[0];

    expect(summary.evaluationStatus).toBe("not_evaluated");
    expect(summary.scores.jdMatch).toBeNull();
  });
});

describe("Database consistency invariant (Phase 16 Milestone 4, §25)", () => {
  it("a candidate's jobId, whenever set, always refers to a job owned by that same candidate's recruiter", async () => {
    const job = await recruiterJobService.createJob("recruiter-consistency", { title: "Consistency Role", jobDescriptionText: "Java" });
    const { imported } = await importOne("recruiter-consistency", "c.pdf", job.id, "consistency@example.com");
    const candidateId = imported[0].candidateId;

    const record = await candidateService.get(candidateId, "recruiter-consistency");
    expect(record?.jobId).toBe(job.id);

    // The only way jobId could ever point at a job owned by someone else is
    // through matchCandidate()/importResumes(), and both already run every
    // jobId through recruiterJobService.getJob(recruiterId, jobId) — an
    // ownership check — before it's ever written. Verifying that check
    // is what M3's "cross-recruiter attachment is impossible" tests above
    // already do end-to-end; this asserts the resulting invariant directly.
    const ownerCheck = await recruiterJobService.getJob("recruiter-consistency", record!.jobId!);
    expect(ownerCheck.recruiterId).toBe(record!.recruiterId);
  });
});

describe("Ranking regression against persisted, evaluated candidates (Phase 16 Milestone 4, §19)", () => {
  it("computeRanking() still orders by descending fitScore/rankingScore after persistence + evaluation", async () => {
    const job = await recruiterJobService.createJob("recruiter-rank", { title: "Ranked Role", jobDescriptionText: "Java" });
    await importOne("recruiter-rank", "weak.pdf", job.id, "weak@example.com");
    await importOne("recruiter-rank", "strong.pdf", job.id, "strong@example.com");

    const ranking = await candidateService.computeRanking("recruiter-rank");

    expect(ranking).toHaveLength(2);
    expect(ranking[0].rank).toBe(1);
    expect(ranking[0].rankingScore).toBeGreaterThanOrEqual(ranking[1].rankingScore);
    // level is always a pure function of rankingScore (Milestone 1 — unchanged).
    ranking.forEach((entry) => expect(entry.level).toBeDefined());
  });
});

describe("Job-scoped list() (Phase 16 Milestone 5, §3)", () => {
  it("list(recruiterId, {jobId}) returns only that job's candidates, server-side scoped", async () => {
    const jobA = await recruiterJobService.createJob("recruiter-scope1", { title: "Job A", jobDescriptionText: "Java" });
    const jobB = await recruiterJobService.createJob("recruiter-scope1", { title: "Job B", jobDescriptionText: "React" });

    const { imported: forA } = await importOne("recruiter-scope1", "a.pdf", jobA.id, "a@example.com");
    await importOne("recruiter-scope1", "b.pdf", jobB.id, "b@example.com");
    await importOne("recruiter-scope1", "unattached.pdf", null, "c@example.com");

    const scoped = await candidateService.list("recruiter-scope1", { jobId: jobA.id });
    expect(scoped.map((c) => c.candidateId)).toEqual(forA.map((c) => c.candidateId));

    const all = await candidateService.list("recruiter-scope1");
    expect(all).toHaveLength(3);
  });
});

describe("Bulk status update — ownership (Phase 16 Milestone 5, §10/§24)", () => {
  it("updates every candidate when all are owned by the requesting recruiter", async () => {
    const { imported: a } = await importOne("recruiter-bulk1", "a.pdf", null, "bulk1a@example.com");
    const { imported: b } = await importOne("recruiter-bulk1", "b.pdf", null, "bulk1b@example.com");

    const updated = await candidateService.bulkUpdateStatus("recruiter-bulk1", [a[0].candidateId, b[0].candidateId], "Shortlisted");

    expect(updated).toHaveLength(2);
    expect(updated.every((record) => record.status === "Shortlisted")).toBe(true);
  });

  it("rejects the WHOLE batch — no partial mutation — when one id belongs to another recruiter", async () => {
    const { imported: mine } = await importOne("recruiter-bulk2", "mine1.pdf", null, "bulk2a@example.com");
    const { imported: mine2 } = await importOne("recruiter-bulk2", "mine2.pdf", null, "bulk2b@example.com");
    const { imported: theirs } = await importOne("recruiter-bulk2-other", "theirs.pdf", null, "bulk2c@example.com");

    const candidateIds = [mine[0].candidateId, mine2[0].candidateId, theirs[0].candidateId];

    await expect(candidateService.bulkUpdateStatus("recruiter-bulk2", candidateIds, "Rejected")).rejects.toThrow(CandidateNotFoundError);

    // Neither of the OWNED candidates was touched either — the whole operation was rejected, not partially applied.
    const stillMine1 = await candidateService.get(mine[0].candidateId, "recruiter-bulk2");
    const stillMine2 = await candidateService.get(mine2[0].candidateId, "recruiter-bulk2");
    expect(stillMine1?.status).toBe("Pending Review");
    expect(stillMine2?.status).toBe("Pending Review");

    // The other recruiter's candidate is untouched too, and recruiter-bulk2 never learns it exists.
    const theirsStillTheirs = await candidateService.get(theirs[0].candidateId, "recruiter-bulk2-other");
    expect(theirsStillTheirs?.status).toBe("Pending Review");
  });

  it("rejects a batch containing a nonexistent id with the same error as an unauthorized one", async () => {
    const { imported: mine } = await importOne("recruiter-bulk3", "mine.pdf", null, "bulk3@example.com");

    await expect(
      candidateService.bulkUpdateStatus("recruiter-bulk3", [mine[0].candidateId, "00000000-0000-0000-0000-000000000000"], "On Hold")
    ).rejects.toThrow(CandidateNotFoundError);
  });

  it("a forged recruiterId (one the caller doesn't actually authenticate as) can never bulk-update someone else's candidates", async () => {
    const { imported } = await importOne("recruiter-bulk4-real", "c.pdf", null, "bulk4@example.com");

    await expect(candidateService.bulkUpdateStatus("recruiter-bulk4-forged", [imported[0].candidateId], "Shortlisted")).rejects.toThrow(
      CandidateNotFoundError
    );
  });
});

describe("Comparison same-job restriction (Phase 16 Milestone 5, §17)", () => {
  it("rejects comparing candidates scored against different jobs", async () => {
    const jobA = await recruiterJobService.createJob("recruiter-cmp1", { title: "Job A", jobDescriptionText: "Java" });
    const jobB = await recruiterJobService.createJob("recruiter-cmp1", { title: "Job B", jobDescriptionText: "React" });

    const { imported: forA } = await importOne("recruiter-cmp1", "a.pdf", jobA.id, "cmp1a@example.com");
    const { imported: forB } = await importOne("recruiter-cmp1", "b.pdf", jobB.id, "cmp1b@example.com");

    await expect(candidateService.compare("recruiter-cmp1", [forA[0].candidateId, forB[0].candidateId])).rejects.toThrow(
      /must belong to the same job/i
    );
  });

  it("allows comparing candidates scored against the SAME job", async () => {
    const job = await recruiterJobService.createJob("recruiter-cmp2", { title: "Shared Job", jobDescriptionText: "Java" });
    const { imported: a } = await importOne("recruiter-cmp2", "a.pdf", job.id, "cmp2a@example.com");
    const { imported: b } = await importOne("recruiter-cmp2", "b.pdf", job.id, "cmp2b@example.com");

    const result = await candidateService.compare("recruiter-cmp2", [a[0].candidateId, b[0].candidateId]);
    expect(result.candidateIds).toEqual([a[0].candidateId, b[0].candidateId]);
  });

  it("allows comparing candidates that are all unattached (no job for any of them)", async () => {
    const { imported: a } = await importOne("recruiter-cmp3", "a.pdf", null, "cmp3a@example.com");
    const { imported: b } = await importOne("recruiter-cmp3", "b.pdf", null, "cmp3b@example.com");

    const result = await candidateService.compare("recruiter-cmp3", [a[0].candidateId, b[0].candidateId]);
    expect(result.candidateIds).toEqual([a[0].candidateId, b[0].candidateId]);
  });

  it("a candidate belonging to another recruiter can never be smuggled into a comparison (IDOR)", async () => {
    const { imported: mine } = await importOne("recruiter-cmp4", "mine.pdf", null, "cmp4a@example.com");
    const { imported: theirs } = await importOne("recruiter-cmp4-other", "theirs.pdf", null, "cmp4b@example.com");

    await expect(candidateService.compare("recruiter-cmp4", [mine[0].candidateId, theirs[0].candidateId])).rejects.toThrow(CandidateNotFoundError);
  });
});

describe("Status transitions (Phase 16 Milestone 7, §1/§6)", () => {
  it("allows a valid transition (Pending Review -> Shortlisted, the default import status)", async () => {
    const { imported } = await importOne("recruiter-tx1", "a.pdf", null, "tx1@example.com");
    const candidateId = imported[0].candidateId;

    const updated = await candidateService.updateStatus(candidateId, "recruiter-tx1", "Shortlisted");
    expect(updated.status).toBe("Shortlisted");
  });

  it("rejects an invalid transition (Pending Review -> Hired is not a direct jump)", async () => {
    const { imported } = await importOne("recruiter-tx2", "a.pdf", null, "tx2@example.com");
    const candidateId = imported[0].candidateId;

    await expect(candidateService.updateStatus(candidateId, "recruiter-tx2", "Hired")).rejects.toThrow(/cannot move/i);

    // The rejected transition must not have partially applied.
    const stillPending = await candidateService.get(candidateId, "recruiter-tx2");
    expect(stillPending?.status).toBe("Pending Review");
  });

  it("a same-status 'transition' is always valid — idempotent shortlist (§14)", async () => {
    const { imported } = await importOne("recruiter-tx3", "a.pdf", null, "tx3@example.com");
    const candidateId = imported[0].candidateId;

    await candidateService.updateStatus(candidateId, "recruiter-tx3", "Shortlisted");
    const secondCall = await candidateService.updateStatus(candidateId, "recruiter-tx3", "Shortlisted");
    expect(secondCall.status).toBe("Shortlisted");
  });

  it("Hired/Rejected can be reopened to Pending Review but not to arbitrary other statuses", async () => {
    const { imported } = await importOne("recruiter-tx4", "a.pdf", null, "tx4@example.com");
    const candidateId = imported[0].candidateId;

    await candidateService.updateStatus(candidateId, "recruiter-tx4", "Shortlisted");
    await candidateService.updateStatus(candidateId, "recruiter-tx4", "Interview Scheduled");
    await candidateService.updateStatus(candidateId, "recruiter-tx4", "Offer");
    await candidateService.updateStatus(candidateId, "recruiter-tx4", "Hired");

    await expect(candidateService.updateStatus(candidateId, "recruiter-tx4", "Interview Scheduled")).rejects.toThrow(/cannot move/i);

    const reopened = await candidateService.updateStatus(candidateId, "recruiter-tx4", "Pending Review");
    expect(reopened.status).toBe("Pending Review");
  });

  it("every status change automatically appends a decision_history entry with a server-derived recruiterId", async () => {
    const { imported } = await importOne("recruiter-tx5", "a.pdf", null, "tx5@example.com");
    const candidateId = imported[0].candidateId;

    const updated = await candidateService.updateStatus(candidateId, "recruiter-tx5", "Shortlisted", "Strong Java background");

    expect(updated.decisionHistory).toHaveLength(1);
    expect(updated.decisionHistory[0]).toMatchObject({
      recruiterId: "recruiter-tx5",
      previousStatus: "Pending Review",
      newStatus: "Shortlisted",
      note: "Strong Java background",
    });
  });

  it("a decision note reuses the EXISTING notes mechanism rather than a parallel store", async () => {
    const { imported } = await importOne("recruiter-tx6", "a.pdf", null, "tx6@example.com");
    const candidateId = imported[0].candidateId;

    const updated = await candidateService.updateStatus(candidateId, "recruiter-tx6", "Shortlisted", "Great communicator");

    expect(updated.notes).toHaveLength(1);
    expect(updated.notes[0]).toMatchObject({ category: "Recruiter", text: "Great communicator" });
  });

  it("never trusts a recruiterId other than the one making the call — cross-recruiter status change is denied like any other mutation", async () => {
    const { imported } = await importOne("recruiter-tx7-real", "a.pdf", null, "tx7@example.com");
    const candidateId = imported[0].candidateId;

    await expect(candidateService.updateStatus(candidateId, "recruiter-tx7-forged", "Shortlisted")).rejects.toThrow(CandidateNotFoundError);
  });
});

describe("Bulk status update — transition validation (Phase 16 Milestone 7, §4)", () => {
  it("rejects the WHOLE batch when one candidate's current status can't reach the target — no partial mutation", async () => {
    const { imported: a } = await importOne("recruiter-bulktx1", "a.pdf", null, "bulktx1a@example.com");
    const { imported: b } = await importOne("recruiter-bulktx1", "b.pdf", null, "bulktx1b@example.com");

    // Move "a" all the way to Hired (terminal-ish) while "b" stays at Pending Review.
    await candidateService.updateStatus(a[0].candidateId, "recruiter-bulktx1", "Shortlisted");
    await candidateService.updateStatus(a[0].candidateId, "recruiter-bulktx1", "Interview Scheduled");
    await candidateService.updateStatus(a[0].candidateId, "recruiter-bulktx1", "Offer");
    await candidateService.updateStatus(a[0].candidateId, "recruiter-bulktx1", "Hired");

    // Hired -> Interview Scheduled is invalid for "a"; "b" (Pending Review) COULD legally make this move.
    await expect(
      candidateService.bulkUpdateStatus("recruiter-bulktx1", [a[0].candidateId, b[0].candidateId], "Interview Scheduled")
    ).rejects.toThrow(/cannot move/i);

    // "b" must remain untouched — the whole batch was rejected, not partially applied.
    const bStill = await candidateService.get(b[0].candidateId, "recruiter-bulktx1");
    expect(bStill?.status).toBe("Pending Review");
  });

  it("bulk update appends a decision_history entry per candidate, each with its own previousStatus", async () => {
    const { imported: a } = await importOne("recruiter-bulktx2", "a.pdf", null, "bulktx2a@example.com");
    const { imported: b } = await importOne("recruiter-bulktx2", "b.pdf", null, "bulktx2b@example.com");
    await candidateService.updateStatus(b[0].candidateId, "recruiter-bulktx2", "On Hold");

    const updated = await candidateService.bulkUpdateStatus(
      "recruiter-bulktx2",
      [a[0].candidateId, b[0].candidateId],
      "Shortlisted",
      "Bulk-shortlisted after screening call"
    );

    const aRecord = updated.find((r) => r.candidateId === a[0].candidateId)!;
    const bRecord = updated.find((r) => r.candidateId === b[0].candidateId)!;

    expect(aRecord.decisionHistory.at(-1)).toMatchObject({ previousStatus: "Pending Review", newStatus: "Shortlisted" });
    expect(bRecord.decisionHistory.at(-1)).toMatchObject({ previousStatus: "On Hold", newStatus: "Shortlisted" });
  });

  it("still rejects the full batch on a foreign candidate (Milestone 5 regression, extended with transition validation present)", async () => {
    const { imported: mine } = await importOne("recruiter-bulktx3", "mine.pdf", null, "bulktx3a@example.com");
    const { imported: theirs } = await importOne("recruiter-bulktx3-other", "theirs.pdf", null, "bulktx3b@example.com");

    await expect(
      candidateService.bulkUpdateStatus("recruiter-bulktx3", [mine[0].candidateId, theirs[0].candidateId], "Shortlisted")
    ).rejects.toThrow(CandidateNotFoundError);

    const mineStill = await candidateService.get(mine[0].candidateId, "recruiter-bulktx3");
    expect(mineStill?.status).toBe("Pending Review");
  });
});

describe("Interview-stage transitions (Phase 16 Milestone 8, §6)", () => {
  it("allows Shortlisted -> Interview Scheduled, the direct legal move into interview", async () => {
    const { imported } = await importOne("recruiter-itx1", "a.pdf", null, "itx1@example.com");
    const candidateId = imported[0].candidateId;

    await candidateService.updateStatus(candidateId, "recruiter-itx1", "Shortlisted");
    const updated = await candidateService.updateStatus(candidateId, "recruiter-itx1", "Interview Scheduled");

    expect(updated.status).toBe("Interview Scheduled");
    expect(updated.decisionHistory.at(-1)).toMatchObject({ previousStatus: "Shortlisted", newStatus: "Interview Scheduled" });
  });

  it("rejects Pending Review -> Interview Scheduled (not a direct move under the existing graph)", async () => {
    const { imported } = await importOne("recruiter-itx2", "a.pdf", null, "itx2@example.com");
    const candidateId = imported[0].candidateId;

    await expect(candidateService.updateStatus(candidateId, "recruiter-itx2", "Interview Scheduled")).rejects.toThrow(/cannot move/i);
  });

  it("allows Interview Scheduled -> Rejected, and records decision history for it", async () => {
    const { imported } = await importOne("recruiter-itx3", "a.pdf", null, "itx3@example.com");
    const candidateId = imported[0].candidateId;

    await candidateService.updateStatus(candidateId, "recruiter-itx3", "Shortlisted");
    await candidateService.updateStatus(candidateId, "recruiter-itx3", "Interview Scheduled");
    const rejected = await candidateService.updateStatus(candidateId, "recruiter-itx3", "Rejected");

    expect(rejected.status).toBe("Rejected");
    expect(rejected.decisionHistory.at(-1)).toMatchObject({ previousStatus: "Interview Scheduled", newStatus: "Rejected" });
  });

  it("bulk-moves a batch of Shortlisted candidates to Interview Scheduled atomically", async () => {
    const { imported: a } = await importOne("recruiter-itx4", "a.pdf", null, "itx4a@example.com");
    const { imported: b } = await importOne("recruiter-itx4", "b.pdf", null, "itx4b@example.com");
    await candidateService.updateStatus(a[0].candidateId, "recruiter-itx4", "Shortlisted");
    await candidateService.updateStatus(b[0].candidateId, "recruiter-itx4", "Shortlisted");

    const updated = await candidateService.bulkUpdateStatus("recruiter-itx4", [a[0].candidateId, b[0].candidateId], "Interview Scheduled");
    expect(updated.every((record) => record.status === "Interview Scheduled")).toBe(true);
  });

  it("rejects the whole bulk batch when one selected candidate is not yet Shortlisted/On Hold — no partial mutation", async () => {
    const { imported: a } = await importOne("recruiter-itx5", "a.pdf", null, "itx5a@example.com");
    const { imported: b } = await importOne("recruiter-itx5", "b.pdf", null, "itx5b@example.com");
    await candidateService.updateStatus(a[0].candidateId, "recruiter-itx5", "Shortlisted"); // eligible
    // b stays at Pending Review — not eligible for a direct move to Interview Scheduled

    await expect(
      candidateService.bulkUpdateStatus("recruiter-itx5", [a[0].candidateId, b[0].candidateId], "Interview Scheduled")
    ).rejects.toThrow(/cannot move/i);

    const aStill = await candidateService.get(a[0].candidateId, "recruiter-itx5");
    expect(aStill?.status).toBe("Shortlisted"); // untouched, not advanced to Interview Scheduled
  });
});

describe("listDecisionHistories (Phase 16 Milestone 8, §9)", () => {
  it("returns each of the requesting recruiter's own candidates' decision history, scoped by recruiter_id", async () => {
    const { imported: mine } = await importOne("recruiter-hist1", "a.pdf", null, "hist1a@example.com");
    await importOne("recruiter-hist1-other", "b.pdf", null, "hist1b@example.com");
    await candidateService.updateStatus(mine[0].candidateId, "recruiter-hist1", "Shortlisted");

    const histories = await candidateService.listDecisionHistories("recruiter-hist1");
    expect(histories).toHaveLength(1);
    expect(histories[0].candidateId).toBe(mine[0].candidateId);
    expect(histories[0].decisionHistory).toHaveLength(1);
  });

  it("narrows to one job when jobId is given, the same pattern as listMissingSkills()", async () => {
    const jobA = await recruiterJobService.createJob("recruiter-hist2", { title: "Role A", jobDescriptionText: "Java" });
    const jobB = await recruiterJobService.createJob("recruiter-hist2", { title: "Role B", jobDescriptionText: "React" });
    const { imported: forA } = await importOne("recruiter-hist2", "a.pdf", jobA.id, "hist2a@example.com");
    await importOne("recruiter-hist2", "b.pdf", jobB.id, "hist2b@example.com");

    const histories = await candidateService.listDecisionHistories("recruiter-hist2", jobA.id);
    expect(histories.map((h) => h.candidateId)).toEqual([forA[0].candidateId]);
  });
});

describe("listByIds — 'Export Selected' ownership (Phase 16 Milestone 9, §3)", () => {
  it("returns summaries for every requested id when all belong to the requesting recruiter", async () => {
    const { imported: a } = await importOne("recruiter-exp1", "a.pdf", null, "exp1a@example.com");
    const { imported: b } = await importOne("recruiter-exp1", "b.pdf", null, "exp1b@example.com");

    const result = await candidateService.listByIds("recruiter-exp1", [a[0].candidateId, b[0].candidateId]);
    expect(result.map((c) => c.candidateId).sort()).toEqual([a[0].candidateId, b[0].candidateId].sort());
  });

  it("rejects the WHOLE export when even one requested id belongs to another recruiter — never a partial export", async () => {
    const { imported: mine } = await importOne("recruiter-exp2", "mine.pdf", null, "exp2a@example.com");
    const { imported: theirs } = await importOne("recruiter-exp2-other", "theirs.pdf", null, "exp2b@example.com");

    await expect(candidateService.listByIds("recruiter-exp2", [mine[0].candidateId, theirs[0].candidateId])).rejects.toThrow(CandidateNotFoundError);
  });

  it("rejects the whole export for a nonexistent id with the SAME error as a foreign one (enumeration protection)", async () => {
    const { imported: mine } = await importOne("recruiter-exp3", "mine.pdf", null, "exp3a@example.com");

    let foreignMessage = "";
    let nonexistentMessage = "";
    try {
      await candidateService.listByIds("recruiter-exp3", [mine[0].candidateId, "00000000-0000-0000-0000-000000000000"]);
    } catch (error) {
      nonexistentMessage = (error as Error).message;
    }
    try {
      const { imported: theirs } = await importOne("recruiter-exp3-other", "theirs.pdf", null, "exp3b@example.com");
      await candidateService.listByIds("recruiter-exp3", [mine[0].candidateId, theirs[0].candidateId]);
    } catch (error) {
      foreignMessage = (error as Error).message;
    }
    expect(nonexistentMessage).not.toBe("");
    expect(nonexistentMessage).toBe(foreignMessage);
  });
});

describe("exportCandidateListCsv — filter/selection-aware export (Phase 16 Milestone 9, §2/§3)", () => {
  it("scopes a jobId-based export to only that job's candidates, unchanged from Milestone 5", async () => {
    const jobA = await recruiterJobService.createJob("recruiter-exp4", { title: "Job A", jobDescriptionText: "Java" });
    const jobB = await recruiterJobService.createJob("recruiter-exp4", { title: "Job B", jobDescriptionText: "React" });
    await importOne("recruiter-exp4", "a.pdf", jobA.id, "exp4a@example.com");
    await importOne("recruiter-exp4", "b.pdf", jobB.id, "exp4b@example.com");

    const csv = await candidateService.exportCandidateListCsv("recruiter-exp4", { jobId: jobA.id });
    expect(csv.split("\n")).toHaveLength(2); // header + 1 candidate row
  });

  it("candidateIds takes precedence and is ownership-verified through listByIds — a foreign id exports nothing", async () => {
    const { imported: mine } = await importOne("recruiter-exp5", "mine.pdf", null, "exp5a@example.com");
    const { imported: theirs } = await importOne("recruiter-exp5-other", "theirs.pdf", null, "exp5b@example.com");

    await expect(candidateService.exportCandidateListCsv("recruiter-exp5", { candidateIds: [mine[0].candidateId, theirs[0].candidateId] })).rejects.toThrow(
      CandidateNotFoundError
    );
  });

  it("a candidateIds export includes exactly the selected candidates' names, regardless of the recruiter's other candidates", async () => {
    const { imported: a } = await importOne("recruiter-exp6", "a.pdf", null, "exp6a@example.com");
    await importOne("recruiter-exp6", "b.pdf", null, "exp6b@example.com"); // not selected

    const csv = await candidateService.exportCandidateListCsv("recruiter-exp6", { candidateIds: [a[0].candidateId] });
    expect(csv.split("\n")).toHaveLength(2);
    expect(csv).toContain(a[0].name);
  });
});

describe("buildComparisonExport / exportComparisonCsv — deterministic, zero LLM calls (Phase 16 Milestone 9, §7)", () => {
  it("never calls the LLM-backed recommendation generator that compare() uses", async () => {
    const job = await recruiterJobService.createJob("recruiter-exp7", { title: "Shared Job", jobDescriptionText: "Java" });
    const { imported: a } = await importOne("recruiter-exp7", "a.pdf", job.id, "exp7a@example.com");
    const { imported: b } = await importOne("recruiter-exp7", "b.pdf", job.id, "exp7b@example.com");

    vi.mocked(openai.chat.completions.create).mockClear();

    const { candidates, table } = await candidateService.buildComparisonExport("recruiter-exp7", [a[0].candidateId, b[0].candidateId]);

    expect(openai.chat.completions.create).not.toHaveBeenCalled();
    expect(candidates).toHaveLength(2);
    expect(table.length).toBeGreaterThan(0);
  });

  it("reuses the exact same ownership + same-job restriction as compare() — a cross-job pair is rejected", async () => {
    const jobA = await recruiterJobService.createJob("recruiter-exp8", { title: "Job A", jobDescriptionText: "Java" });
    const jobB = await recruiterJobService.createJob("recruiter-exp8", { title: "Job B", jobDescriptionText: "React" });
    const { imported: forA } = await importOne("recruiter-exp8", "a.pdf", jobA.id, "exp8a@example.com");
    const { imported: forB } = await importOne("recruiter-exp8", "b.pdf", jobB.id, "exp8b@example.com");

    await expect(candidateService.buildComparisonExport("recruiter-exp8", [forA[0].candidateId, forB[0].candidateId])).rejects.toThrow(/must belong to the same job/i);
  });

  it("exportComparisonCsv renders a real CSV from the deterministic table", async () => {
    const job = await recruiterJobService.createJob("recruiter-exp9", { title: "Shared Job", jobDescriptionText: "Java" });
    const { imported: a } = await importOne("recruiter-exp9", "a.pdf", job.id, "exp9a@example.com");
    const { imported: b } = await importOne("recruiter-exp9", "b.pdf", job.id, "exp9b@example.com");

    const csv = await candidateService.exportComparisonCsv("recruiter-exp9", [a[0].candidateId, b[0].candidateId]);
    expect(csv.split("\n")[0]).toContain("Metric");
    expect(csv).toContain("Status");
  });
});

describe("listCandidateMatchDetails (Phase 16 Milestone 9, §1)", () => {
  it("is recruiter-scoped and narrows by jobId, the same pattern as listMissingSkills()/listDecisionHistories()", async () => {
    const jobA = await recruiterJobService.createJob("recruiter-exp10", { title: "Job A", jobDescriptionText: "Java" });
    const { imported: forA } = await importOne("recruiter-exp10", "a.pdf", jobA.id, "exp10a@example.com");
    await importOne("recruiter-exp10-other", "b.pdf", null, "exp10b@example.com");

    const details = await candidateService.listCandidateMatchDetails("recruiter-exp10", jobA.id);
    expect(details.map((d) => d.candidateId)).toEqual([forA[0].candidateId]);
    expect(details[0].matchedSkills).toEqual(["Java"]);
  });
});

describe("getInterviewLinkParams (Phase 16 Milestone 8, §10)", () => {
  it("returns resumeId/jdMatchId derived from the candidate's own attached job when a match exists", async () => {
    const job = await recruiterJobService.createJob("recruiter-link1", { title: "Backend Role", jobDescriptionText: "Java" });
    const { imported } = await importOne("recruiter-link1", "a.pdf", job.id, "link1@example.com");

    const link = await candidateService.getInterviewLinkParams(imported[0].candidateId, "recruiter-link1");
    expect(link).not.toBeNull();
    expect(typeof link?.resumeId).toBe("string");
    expect(typeof link?.jdMatchId).toBe("string");
  });

  it("returns null (never a fabricated id) for an unattached candidate with no JD match yet", async () => {
    const { imported } = await importOne("recruiter-link2", "a.pdf", null, "link2@example.com");

    const link = await candidateService.getInterviewLinkParams(imported[0].candidateId, "recruiter-link2");
    expect(link).toBeNull();
  });

  it("never accepts an arbitrary job — it can only ever resolve to the candidate's own attachment, and is ownership-checked like every other read", async () => {
    const job = await recruiterJobService.createJob("recruiter-link3", { title: "Backend Role", jobDescriptionText: "Java" });
    const { imported } = await importOne("recruiter-link3", "a.pdf", job.id, "link3@example.com");

    await expect(candidateService.getInterviewLinkParams(imported[0].candidateId, "recruiter-link3-intruder")).rejects.toThrow(CandidateNotFoundError);
  });
});
