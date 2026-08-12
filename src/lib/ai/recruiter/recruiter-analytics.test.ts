import { describe, expect, it } from "vitest";

import {
  buildRecruiterAnalytics,
  computeAttentionQueue,
  computeConversionRates,
  computeEvaluationDistribution,
  computeFitDistribution,
  computeInterviewFunnelMetrics,
  computeJobAnalytics,
  computeOverallAnalytics,
  computeScreeningFunnel,
  computeSkillGaps,
  computeStatusDistribution,
} from "./recruiter-analytics";
import { CANDIDATE_STATUSES, CandidateStatus } from "./candidate-schema";
import { CandidateFitLevel, CandidateScoreBreakdown, CandidateSummary, DecisionHistoryEntry, EvaluationStatus, RankedCandidate } from "./candidate-types";
import { RecruiterJobRecord } from "./recruiter-job-types";

// Phase 16 Milestone 6 — every function under test here is pure (no
// I/O, no mocking needed): fixtures are plain data, matching this
// session's established pattern for candidate-ranking.test.ts.

function scores(overrides: Partial<CandidateScoreBreakdown> = {}): CandidateScoreBreakdown {
  return {
    resumeScore: null,
    atsScore: null,
    jdMatch: null,
    experienceScore: null,
    skillsScore: null,
    projectsScore: null,
    leadershipScore: null,
    communicationScore: null,
    cloudScore: null,
    aiScore: null,
    devOpsScore: null,
    certificationScore: null,
    interviewReadiness: null,
    overallScore: null,
    ...overrides,
  };
}

function candidate(id: string, overrides: Partial<CandidateSummary> = {}): CandidateSummary {
  return {
    candidateId: id,
    jobId: null,
    name: `Candidate ${id}`,
    email: null,
    phone: null,
    currentRole: null,
    currentCompany: null,
    experienceYears: null,
    location: null,
    noticePeriod: null,
    expectedSalary: null,
    status: "Pending Review",
    tags: [],
    scores: scores(),
    importedAt: new Date().toISOString(),
    evaluatedAt: null,
    fitScore: 0,
    fitLevel: "LOW",
    recommendedAction: "",
    evaluationStatus: "not_evaluated",
    ...overrides,
  };
}

function job(id: string, overrides: Partial<RecruiterJobRecord> = {}): RecruiterJobRecord {
  return {
    id,
    recruiterId: "recruiter-x",
    title: `Job ${id}`,
    company: null,
    jobDescriptionText: "text",
    normalizedJd: null,
    status: "Active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("computeOverallAnalytics", () => {
  it("handles an empty recruiter workspace", () => {
    const result = computeOverallAnalytics([], []);
    expect(result).toEqual({
      totalJobs: 0,
      totalCandidates: 0,
      evaluatedCandidates: 0,
      unevaluatedCandidates: 0,
      staleCandidates: 0,
      averageJdMatch: null,
      averageAtsScore: null,
      averageCandidateFit: null,
    });
  });

  it("averages only present scores, never treating a missing score as 0", () => {
    const candidates = [
      candidate("a", { scores: scores({ atsScore: 80, jdMatch: null }), fitScore: 80 }),
      candidate("b", { scores: scores({ atsScore: null, jdMatch: 60 }), fitScore: 60 }),
    ];

    const result = computeOverallAnalytics(candidates, [job("j1")]);
    expect(result.averageAtsScore).toBe(80); // only "a" had one — not (80+0)/2
    expect(result.averageJdMatch).toBe(60); // only "b" had one
    expect(result.averageCandidateFit).toBe(70); // both always have a fitScore
    expect(result.totalCandidates).toBe(2);
  });

  it("counts evaluated/unevaluated/stale correctly", () => {
    const candidates = [
      candidate("a", { evaluationStatus: "complete" }),
      candidate("b", { evaluationStatus: "stale" }),
      candidate("c", { evaluationStatus: "not_evaluated" }),
    ];

    const result = computeOverallAnalytics(candidates, []);
    expect(result.evaluatedCandidates).toBe(2); // complete + stale both count as "evaluated at least once"
    expect(result.unevaluatedCandidates).toBe(1);
    expect(result.staleCandidates).toBe(1);
  });
});

describe("computeFitDistribution / computeEvaluationDistribution", () => {
  it("buckets every fit level and evaluation status, including zero counts", () => {
    const candidates = [candidate("a", { fitLevel: "STRONG", evaluationStatus: "complete" })];

    expect(computeFitDistribution(candidates)).toEqual({ strongCount: 1, goodCount: 0, moderateCount: 0, lowCount: 0 });
    expect(computeEvaluationDistribution(candidates)).toEqual({ notEvaluated: 0, complete: 1, stale: 0 });
  });

  const FIT_COUNT_KEY: Record<CandidateFitLevel, "strongCount" | "goodCount" | "moderateCount" | "lowCount"> = {
    STRONG: "strongCount",
    GOOD: "goodCount",
    MODERATE: "moderateCount",
    LOW: "lowCount",
  };

  it.each<CandidateFitLevel>(["STRONG", "GOOD", "MODERATE", "LOW"])("counts %s fit level correctly across a mixed set", (level) => {
    const candidates = [candidate("a", { fitLevel: level }), candidate("b", { fitLevel: "LOW" })];
    const result = computeFitDistribution(candidates);
    expect(result[FIT_COUNT_KEY[level]]).toBeGreaterThanOrEqual(1);
  });

  it.each<EvaluationStatus>(["not_evaluated", "complete", "stale"])("counts %s evaluation status correctly", (status) => {
    const result = computeEvaluationDistribution([candidate("a", { evaluationStatus: status })]);
    const total = result.notEvaluated + result.complete + result.stale;
    expect(total).toBe(1);
  });
});

describe("computeStatusDistribution", () => {
  it("returns every existing CandidateStatus, even those with zero candidates", () => {
    const result = computeStatusDistribution([candidate("a", { status: "Shortlisted" })]);

    expect(Object.keys(result).sort()).toEqual([...CANDIDATE_STATUSES].sort());
    expect(result["Shortlisted"]).toBe(1);
    expect(result["Rejected"]).toBe(0);
  });

  it("never invents a status outside the existing enum", () => {
    const result = computeStatusDistribution([]);
    for (const status of Object.keys(result)) {
      expect(CANDIDATE_STATUSES).toContain(status as CandidateStatus);
    }
  });
});

describe("computeScreeningFunnel", () => {
  it("builds all 5 stages from real existing fields only", () => {
    const candidates = [
      candidate("a", { evaluationStatus: "complete", fitLevel: "STRONG", status: "Shortlisted" }),
      candidate("b", { evaluationStatus: "not_evaluated", fitLevel: "LOW", status: "Pending Review" }),
      candidate("c", { evaluationStatus: "complete", fitLevel: "GOOD", status: "Interview Scheduled" }),
    ];

    const funnel = computeScreeningFunnel(candidates);
    const byStage = Object.fromEntries(funnel.map((f) => [f.stage, f.count]));

    expect(byStage["Imported"]).toBe(3);
    expect(byStage["Evaluated"]).toBe(2);
    expect(byStage["Strong/Good Fit"]).toBe(2);
    expect(byStage["Shortlisted"]).toBe(1);
    expect(byStage["Interview/Selected"]).toBe(1);
  });

  it("stages are independently counted, not strictly nested", () => {
    // A shortlisted candidate who was never evaluated — the data model allows this.
    const candidates = [candidate("a", { evaluationStatus: "not_evaluated", status: "Shortlisted" })];
    const funnel = computeScreeningFunnel(candidates);
    const byStage = Object.fromEntries(funnel.map((f) => [f.stage, f.count]));

    expect(byStage["Evaluated"]).toBe(0);
    expect(byStage["Shortlisted"]).toBe(1); // still counted on its own criterion
  });
});

describe("computeJobAnalytics", () => {
  it("groups already-fetched candidates by jobId with no extra query", () => {
    const jobs = [job("j1", { title: "Backend", company: "Acme" }), job("j2", { title: "Frontend" })];
    const candidates = [
      candidate("a", { jobId: "j1", scores: scores({ atsScore: 90, jdMatch: 80 }), fitScore: 85, fitLevel: "STRONG", evaluationStatus: "complete" }),
      candidate("b", { jobId: "j1", scores: scores({ atsScore: 70 }), fitScore: 60, fitLevel: "MODERATE", evaluationStatus: "stale" }),
    ];

    const result = computeJobAnalytics(jobs, candidates);
    const j1 = result.find((r) => r.jobId === "j1")!;
    const j2 = result.find((r) => r.jobId === "j2")!;

    expect(j1.candidateCount).toBe(2);
    expect(j1.evaluatedCount).toBe(2);
    expect(j1.averageAtsScore).toBe(80);
    expect(j1.strongFitCount).toBe(1);
    expect(j1.moderateFitCount).toBe(1);
    expect(j1.staleCount).toBe(1);

    // §12 — job with zero candidates gets an all-zero/null entry, not an omitted row.
    expect(j2.candidateCount).toBe(0);
    expect(j2.averageAtsScore).toBeNull();
    expect(j2.averageCandidateFit).toBeNull();
  });
});

describe("computeSkillGaps", () => {
  it("aggregates missing skills across candidates, most-missing first", () => {
    const result = computeSkillGaps([
      { candidateId: "a", missingSkills: ["Docker", "Kafka"] },
      { candidateId: "b", missingSkills: ["Docker"] },
      { candidateId: "c", missingSkills: ["Redis"] },
    ]);

    expect(result[0]).toEqual({ skill: "Docker", missingCount: 2 });
    expect(result.map((r) => r.skill)).toContain("Kafka");
    expect(result.map((r) => r.skill)).toContain("Redis");
  });

  it("normalizes case/whitespace duplicates into a single entry", () => {
    const result = computeSkillGaps([
      { candidateId: "a", missingSkills: ["Docker"] },
      { candidateId: "b", missingSkills: ["docker"] },
      { candidateId: "c", missingSkills: [" Docker "] },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].missingCount).toBe(3);
  });

  it("returns an empty array for candidates with no missing-skill data, never fabricating a gap", () => {
    expect(computeSkillGaps([])).toEqual([]);
    expect(computeSkillGaps([{ candidateId: "a", missingSkills: [] }])).toEqual([]);
  });
});

describe("computeAttentionQueue", () => {
  it("flags a stale candidate as HIGH priority with a real, data-derived reason", () => {
    const result = computeAttentionQueue([candidate("a", { evaluationStatus: "stale" })]);
    expect(result).toHaveLength(1);
    expect(result[0].priority).toBe("HIGH");
    expect(result[0].reason).toMatch(/stale/i);
  });

  it("flags high JD match + low ATS, and separately high ATS + low JD match", () => {
    const highJdLowAts = candidate("a", { scores: scores({ jdMatch: 90, atsScore: 40 }), evaluationStatus: "complete" });
    const highAtsLowJd = candidate("b", { scores: scores({ jdMatch: 30, atsScore: 95 }), evaluationStatus: "complete" });

    const result = computeAttentionQueue([highJdLowAts, highAtsLowJd]);
    expect(result.find((r) => r.candidateId === "a")?.reason).toMatch(/JD match/i);
    expect(result.find((r) => r.candidateId === "b")?.reason).toMatch(/ATS/i);
  });

  it("flags an evaluated-but-still-pending candidate for a recruiter decision", () => {
    const result = computeAttentionQueue([candidate("a", { status: "Pending Review", evaluationStatus: "complete", fitLevel: "LOW" })]);
    expect(result[0].reason).toMatch(/decision/i);
  });

  it("gives each candidate exactly one reason (first-match priority order), never duplicate entries", () => {
    // Matches BOTH "stale" and "strong fit" criteria — stale must win (checked first).
    const result = computeAttentionQueue([candidate("a", { evaluationStatus: "stale", fitLevel: "STRONG" })]);
    expect(result).toHaveLength(1);
    expect(result[0].reason).toMatch(/stale/i);
  });

  it("omits a candidate that matches no rule at all", () => {
    const result = computeAttentionQueue([candidate("a", { evaluationStatus: "complete", fitLevel: "MODERATE", status: "On Hold" })]);
    expect(result).toHaveLength(0);
  });

  it("flags STRONG/GOOD fit as informational when no higher-priority rule matched", () => {
    const result = computeAttentionQueue([candidate("a", { evaluationStatus: "complete", fitLevel: "STRONG", status: "Shortlisted" })]);
    expect(result[0].priority).toBe("INFORMATIONAL");
  });
});

describe("buildRecruiterAnalytics — top candidates + scope", () => {
  it("passes through the existing ranking engine's top 5, without recomputing anything", () => {
    const ranked: RankedCandidate[] = Array.from({ length: 8 }, (_, i) => ({
      candidateId: `c${i}`,
      rank: i + 1,
      rankingScore: 100 - i,
      level: "GOOD",
      summary: candidate(`c${i}`),
    }));

    const result = buildRecruiterAnalytics({
      scope: { jobId: null, job: null },
      candidates: [],
      jobs: [],
      ranked,
      missingSkillsByCandidate: [],
      decisionHistories: [],
    });

    expect(result.topCandidates).toHaveLength(5);
    expect(result.topCandidates[0].candidateId).toBe("c0");
  });

  it("only computes skillGaps and omits jobAnalytics when scoped to one job", () => {
    const result = buildRecruiterAnalytics({
      scope: { jobId: "j1", job: job("j1") },
      candidates: [],
      jobs: [job("j1"), job("j2")],
      ranked: [],
      missingSkillsByCandidate: [{ candidateId: "a", missingSkills: ["Docker"] }],
      decisionHistories: [],
    });

    expect(result.jobAnalytics).toEqual([]);
    expect(result.skillGaps).toEqual([{ skill: "Docker", missingCount: 1 }]);
  });

  it("computes jobAnalytics and leaves skillGaps empty in the overall (all-jobs) view", () => {
    const result = buildRecruiterAnalytics({
      scope: { jobId: null, job: null },
      candidates: [],
      jobs: [job("j1")],
      ranked: [],
      missingSkillsByCandidate: [{ candidateId: "a", missingSkills: ["Docker"] }],
      decisionHistories: [],
    });

    expect(result.jobAnalytics).toHaveLength(1);
    expect(result.skillGaps).toEqual([]);
  });
});

describe("computeConversionRates (Phase 16 Milestone 7, §9)", () => {
  it("computes percentages relative to total candidates from existing status counts", () => {
    const distribution = computeStatusDistribution([
      candidate("a", { status: "Shortlisted" }),
      candidate("b", { status: "Interview Scheduled" }),
      candidate("c", { status: "Hired" }),
      candidate("d", { status: "Pending Review" }),
    ]);

    const rates = computeConversionRates(distribution, 4);
    expect(rates).toEqual({ shortlistRate: 25, interviewRate: 25, hireRate: 25 });
  });

  it("returns null (never a fabricated 0%) when there are no candidates to divide by", () => {
    const distribution = computeStatusDistribution([]);
    const rates = computeConversionRates(distribution, 0);
    expect(rates).toEqual({ shortlistRate: null, interviewRate: null, hireRate: null });
  });

  it("returns 0% (a real, computed rate) when candidates exist but none are in the target status", () => {
    const distribution = computeStatusDistribution([candidate("a", { status: "Pending Review" })]);
    const rates = computeConversionRates(distribution, 1);
    expect(rates).toEqual({ shortlistRate: 0, interviewRate: 0, hireRate: 0 });
  });
});

describe("computeInterviewFunnelMetrics (Phase 16 Milestone 8, §9)", () => {
  function entry(previousStatus: CandidateStatus, newStatus: CandidateStatus): DecisionHistoryEntry {
    return { id: `${previousStatus}-${newStatus}`, recruiterId: "r1", previousStatus, newStatus, note: null, timestamp: new Date().toISOString() };
  }

  it("counts candidates currently in Interview Scheduled and currently Hired directly", () => {
    const candidates = [
      candidate("a", { status: "Interview Scheduled" }),
      candidate("b", { status: "Hired" }),
      candidate("c", { status: "Pending Review" }),
    ];

    const result = computeInterviewFunnelMetrics(candidates, []);
    expect(result.interviewCandidates).toBe(1);
    expect(result.hireCount).toBe(1);
  });

  it("counts interview-eligible candidates who are not already interviewing", () => {
    const candidates = [
      candidate("a", { status: "Shortlisted", evaluationStatus: "complete", scores: scores({ jdMatch: 80 }) }),
      candidate("b", { status: "Interview Scheduled", evaluationStatus: "complete", scores: scores({ jdMatch: 80 }) }),
      candidate("c", { status: "Pending Review", evaluationStatus: "complete", scores: scores({ jdMatch: 80 }) }),
    ];

    const result = computeInterviewFunnelMetrics(candidates, []);
    // Only "a" (Shortlisted + evaluated + JD match) is eligible AND not already interviewing.
    expect(result.interviewEligibleCandidates).toBe(1);
  });

  it("computes shortlist-to-interview cohort rate from decision_history, not from current status alone", () => {
    const candidates = [candidate("a", { status: "Interview Scheduled" }), candidate("b", { status: "Rejected" }), candidate("c", { status: "Shortlisted" })];
    const histories = [
      { candidateId: "a", decisionHistory: [entry("Pending Review", "Shortlisted"), entry("Shortlisted", "Interview Scheduled")] },
      { candidateId: "b", decisionHistory: [entry("Pending Review", "Shortlisted"), entry("Shortlisted", "Rejected")] },
      { candidateId: "c", decisionHistory: [entry("Pending Review", "Shortlisted")] },
    ];

    const result = computeInterviewFunnelMetrics(candidates, histories);
    // 3 candidates ever reached Shortlisted; only "a" ever reached Interview Scheduled too.
    expect(result.shortlistToInterviewRate).toBe(33);
  });

  it("computes interview-to-hire cohort rate and rejected-after-interview count from decision_history", () => {
    const candidates = [candidate("a", { status: "Hired" }), candidate("b", { status: "Rejected" })];
    const histories = [
      { candidateId: "a", decisionHistory: [entry("Shortlisted", "Interview Scheduled"), entry("Interview Scheduled", "Offer"), entry("Offer", "Hired")] },
      { candidateId: "b", decisionHistory: [entry("Shortlisted", "Interview Scheduled"), entry("Interview Scheduled", "Rejected")] },
    ];

    const result = computeInterviewFunnelMetrics(candidates, histories);
    expect(result.interviewToHireRate).toBe(50);
    expect(result.rejectedAfterInterviewCount).toBe(1);
  });

  it("returns null cohort rates (never a fabricated 0%) when the relevant cohort is empty", () => {
    const result = computeInterviewFunnelMetrics([candidate("a", { status: "Pending Review" })], []);
    expect(result.shortlistToInterviewRate).toBeNull();
    expect(result.interviewToHireRate).toBeNull();
  });
});
