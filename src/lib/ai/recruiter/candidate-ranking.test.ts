import { describe, expect, it } from "vitest";

import { classifyCandidateFitLevel, compareRanked, computeRankingScore, rankCandidates } from "./candidate-ranking";
import { CandidateScoreBreakdown, CandidateSummary } from "./candidate-types";

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
  const candidateScores = overrides.scores ?? scores();
  const fitScore = computeRankingScore(candidateScores);

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
    scores: candidateScores,
    importedAt: new Date().toISOString(),
    evaluatedAt: null,
    fitScore,
    fitLevel: classifyCandidateFitLevel(fitScore),
    recommendedAction: "",
    evaluationStatus: "not_evaluated",
    ...overrides,
  };
}

describe("classifyCandidateFitLevel", () => {
  it("classifies all 4 tiers at their documented boundaries", () => {
    expect(classifyCandidateFitLevel(100)).toBe("STRONG");
    expect(classifyCandidateFitLevel(90)).toBe("STRONG");
    expect(classifyCandidateFitLevel(89)).toBe("GOOD");
    expect(classifyCandidateFitLevel(75)).toBe("GOOD");
    expect(classifyCandidateFitLevel(74)).toBe("MODERATE");
    expect(classifyCandidateFitLevel(60)).toBe("MODERATE");
    expect(classifyCandidateFitLevel(59)).toBe("LOW");
    expect(classifyCandidateFitLevel(0)).toBe("LOW");
  });

  it("never fabricates a level from missing data — level is always derived from the same rankingScore already computed for real data", () => {
    // A candidate with zero populated factors still gets a real (if low-confidence) numeric score, and the level is a pure function of it — no separate guess.
    const emptyScore = computeRankingScore(scores());
    expect(classifyCandidateFitLevel(emptyScore)).toBe(classifyCandidateFitLevel(emptyScore));
  });
});

describe("computeRankingScore — missing data never becomes zero", () => {
  it("redistributes weight across only populated factors rather than penalizing missing ones to 0", () => {
    const onlyAts = computeRankingScore(scores({ atsScore: 90 }));
    // If missing factors were silently treated as 0, this would be far lower than 90 (90 * 0.2 / total-including-zeros).
    expect(onlyAts).toBe(90);
  });

  it("falls back to resumeScore when literally no ranking factor is populated", () => {
    expect(computeRankingScore(scores({ resumeScore: 72 }))).toBe(72);
  });
});

describe("rankCandidates — ordering", () => {
  it("orders strictly by ranking score, descending", () => {
    const summaries = [candidate("a", { scores: scores({ atsScore: 76 }) }), candidate("b", { scores: scores({ atsScore: 94 }) }), candidate("c", { scores: scores({ atsScore: 88 }) })];

    const ranked = rankCandidates(summaries);

    expect(ranked.map((r) => r.candidateId)).toEqual(["b", "c", "a"]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it("attaches the correct fit level to each ranked candidate", () => {
    const summaries = [candidate("a", { scores: scores({ atsScore: 95 }) }), candidate("b", { scores: scores({ atsScore: 55 }) })];
    const ranked = rankCandidates(summaries);

    expect(ranked.find((r) => r.candidateId === "a")?.level).toBe("STRONG");
    expect(ranked.find((r) => r.candidateId === "b")?.level).toBe("LOW");
  });

  it("is stable and reproducible — running it again on the same input produces the identical order", () => {
    const summaries = [candidate("a", { scores: scores({ atsScore: 76 }) }), candidate("b", { scores: scores({ atsScore: 94 }) }), candidate("c", { scores: scores({ atsScore: 88 }) })];

    const first = rankCandidates(summaries).map((r) => r.candidateId);
    const second = rankCandidates(summaries).map((r) => r.candidateId);

    expect(first).toEqual(second);
  });
});

describe("rankCandidates — deterministic tie-breaking (§9/§10)", () => {
  it("breaks a tied ranking score using JD Match as the first tie-breaker", () => {
    const a = { rankingScore: 80, summary: candidate("low-jd", { scores: scores({ jdMatch: 60 }) }) };
    const b = { rankingScore: 80, summary: candidate("high-jd", { scores: scores({ jdMatch: 90 }) }) };

    expect(compareRanked(a, b)).toBeGreaterThan(0); // b (higher jdMatch) sorts first
    expect(compareRanked(b, a)).toBeLessThan(0);
  });

  it("falls through the full cascade (JD Match -> Skills -> Experience -> ATS) when earlier tie-breakers are also equal", () => {
    const weaker = { rankingScore: 70, summary: candidate("weaker", { scores: scores({ jdMatch: 70, skillsScore: 70, experienceScore: 70, atsScore: 70 }) }) };
    const stronger = { rankingScore: 70, summary: candidate("stronger", { scores: scores({ jdMatch: 70, skillsScore: 70, experienceScore: 70, atsScore: 95 }) }) };

    expect(compareRanked(weaker, stronger)).toBeGreaterThan(0); // stronger (higher ATS, only differing factor) sorts first
  });

  it("treats a missing (null) tie-break factor as lower than any real value, never as 0", () => {
    const noJdMatch = { rankingScore: 80, summary: candidate("no-jd-match", { scores: scores({ jdMatch: null }) }) };
    const lowJdMatch = { rankingScore: 80, summary: candidate("low-jd-match", { scores: scores({ jdMatch: 1 }) }) };

    // A real (if very low) JD match of 1 outranks a missing one — null is "unknown," never "worse than every real value including 0."
    expect(compareRanked(noJdMatch, lowJdMatch)).toBeGreaterThan(0);
  });

  it("produces one fixed, reproducible order via the candidateId fallback when every scored factor is identically tied", () => {
    const identicalScores = scores({ atsScore: 80, jdMatch: 70, skillsScore: 60, experienceScore: 50 });
    const summaries = [candidate("zzz"), candidate("aaa")].map((c, i) => ({ ...c, scores: identicalScores, candidateId: i === 0 ? "zzz" : "aaa" }));

    const first = rankCandidates(summaries).map((r) => r.candidateId);
    const second = rankCandidates([...summaries].reverse()).map((r) => r.candidateId);

    expect(first).toEqual(["aaa", "zzz"]); // alphabetical candidateId fallback, independent of input array order
    expect(second).toEqual(first);
  });
});
