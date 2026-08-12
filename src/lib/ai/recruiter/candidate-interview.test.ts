import { describe, expect, it } from "vitest";

import { buildInterviewEligibility, buildInterviewReadinessView, isInterviewEligibleStatus, READY_FOR_INTERVIEW_THRESHOLD } from "./candidate-interview";
import { CandidateFitLevel, CandidateProfile, CandidateScoreBreakdown, CandidateSummary, EvaluationStatus } from "./candidate-types";
import { JdMatchResult } from "../job-description/jd-schema";
import { Resume } from "../resume/resume-schema";

// Phase 16 Milestone 8 — every function under test here is pure (no
// I/O, no mocking), same "plain data fixtures" pattern
// recruiter-analytics.test.ts/candidate-ranking.test.ts already use.

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

function candidate(overrides: Partial<CandidateSummary> = {}): CandidateSummary {
  return {
    candidateId: "c1",
    jobId: "job-1",
    name: "Jane Doe",
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
    fitScore: 70,
    fitLevel: "GOOD",
    recommendedAction: "",
    evaluationStatus: "not_evaluated",
    ...overrides,
  };
}

describe("isInterviewEligibleStatus (Phase 16 Milestone 8, §2)", () => {
  it("is true for the interview status itself and for statuses the existing transition graph already permits moving from", () => {
    expect(isInterviewEligibleStatus("Interview Scheduled")).toBe(true);
    expect(isInterviewEligibleStatus("Shortlisted")).toBe(true);
    expect(isInterviewEligibleStatus("On Hold")).toBe(true);
  });

  it("is false for statuses that cannot move directly to Interview Scheduled under the existing graph", () => {
    expect(isInterviewEligibleStatus("Pending Review")).toBe(false);
    expect(isInterviewEligibleStatus("Offer")).toBe(false);
    expect(isInterviewEligibleStatus("Hired")).toBe(false);
    expect(isInterviewEligibleStatus("Rejected")).toBe(false);
  });
});

describe("buildInterviewEligibility (Phase 16 Milestone 8, §2)", () => {
  it("is eligible when status allows the move, evaluation is complete, and a JD match exists", () => {
    const result = buildInterviewEligibility(
      candidate({ status: "Shortlisted", evaluationStatus: "complete", scores: scores({ jdMatch: 82 }), fitLevel: "STRONG", fitScore: 91 })
    );

    expect(result.eligible).toBe(true);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        expect.stringContaining("allows moving to interview"),
        "Candidate evaluation complete.",
        expect.stringContaining("JD Match available"),
        "Candidate Fit: STRONG (91/100).",
      ])
    );
    expect(result.warnings).toEqual([]);
  });

  it("is not eligible for an unevaluated candidate, and explains why", () => {
    const result = buildInterviewEligibility(candidate({ status: "Shortlisted", evaluationStatus: "not_evaluated" }));

    expect(result.eligible).toBe(false);
    expect(result.warnings).toContain("Candidate has not been evaluated against a job yet.");
  });

  it("is not eligible for a stale evaluation, and explains why", () => {
    const result = buildInterviewEligibility(candidate({ status: "Shortlisted", evaluationStatus: "stale", scores: scores({ jdMatch: 70 }) }));

    expect(result.eligible).toBe(false);
    expect(result.warnings).toContain("Evaluation is stale — the attached job's JD changed since the last match.");
  });

  it("is not eligible when the current status doesn't allow a direct move to interview", () => {
    const result = buildInterviewEligibility(candidate({ status: "Pending Review", evaluationStatus: "complete", scores: scores({ jdMatch: 70 }) }));

    expect(result.eligible).toBe(false);
    expect(result.warnings.some((warning) => warning.includes('does not allow moving directly to interview'))).toBe(true);
  });

  it("is not eligible when no JD match data is available even if otherwise evaluated", () => {
    const result = buildInterviewEligibility(candidate({ status: "Shortlisted", evaluationStatus: "complete", scores: scores({ jdMatch: null }) }));

    expect(result.eligible).toBe(false);
    expect(result.warnings).toContain("No JD match data available.");
  });

  it("surfaces missing skills as warnings without affecting eligibility (they're interview topics, not blockers)", () => {
    const result = buildInterviewEligibility(
      candidate({ status: "Shortlisted", evaluationStatus: "complete", scores: scores({ jdMatch: 75 }) }),
      ["Docker", "Kubernetes"]
    );

    expect(result.eligible).toBe(true);
    expect(result.warnings).toEqual(["Missing skills: Docker, Kubernetes."]);
  });

  it("an already Interview Scheduled candidate is reported as eligible with a distinct reason", () => {
    const result = buildInterviewEligibility(
      candidate({ status: "Interview Scheduled", evaluationStatus: "complete", scores: scores({ jdMatch: 75 }) })
    );

    expect(result.eligible).toBe(true);
    expect(result.reasons).toContain("Candidate is already scheduled for interview.");
  });
});

describe("buildInterviewReadinessView (Phase 16 Milestone 8, §1)", () => {
  function profile(overrides: {
    interviewReadinessScore?: number | null;
    jdMatchResult?: Partial<JdMatchResult> | null;
    gaps?: string[];
    fitScore?: number;
    fitLevel?: CandidateFitLevel;
    atsScore?: number | null;
    jdMatch?: number | null;
    evaluationStatus?: EvaluationStatus;
  }): CandidateProfile {
    const jdMatchResult = overrides.jdMatchResult === null ? null : ({ keywordScore: 65, experienceScore: 72, missingSkills: ["Docker"], ...overrides.jdMatchResult } as JdMatchResult);

    return {
      summary: candidate({
        fitScore: overrides.fitScore ?? 70,
        fitLevel: overrides.fitLevel ?? "GOOD",
        scores: scores({ atsScore: overrides.atsScore ?? 80, jdMatch: overrides.jdMatch ?? 75 }),
        evaluationStatus: overrides.evaluationStatus ?? "complete",
      }),
      record: {
        candidateId: "c1",
        recruiterId: "r1",
        jobId: "job-1",
        filename: "resume.pdf",
        resumeId: "resume-1",
        resumeData: {} as Resume,
        atsScore: overrides.atsScore ?? 80,
        jdMatchResult,
        interviewReadinessScore: overrides.interviewReadinessScore ?? null,
        status: "Shortlisted",
        tags: [],
        notes: [],
        decisionHistory: [],
        noticePeriod: null,
        expectedSalary: null,
        insights: null,
        evaluatedAt: null,
        importedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      resume: {} as Resume,
      jdMatchResult,
      recruiterSummary: {
        strengths: [],
        gaps: overrides.gaps ?? ["Docker — not found on the resume"],
        dataAvailability: { jdMatch: "available", certifications: "not_provided", projects: "not_provided", education: "not_provided" },
        recommendedAction: "Proceed to screening",
      },
      atsExplanation: null,
    };
  }

  it("reports 'Not Generated' when no readiness score has ever been generated", () => {
    const view = buildInterviewReadinessView(profile({ interviewReadinessScore: null }));
    expect(view.readinessStatus).toBe("Not Generated");
    expect(view.readinessScore).toBeNull();
  });

  it(`reports 'Ready for Interview' at or above the existing ${READY_FOR_INTERVIEW_THRESHOLD}-point threshold (mirrors findReadyForInterview's default)`, () => {
    const view = buildInterviewReadinessView(profile({ interviewReadinessScore: 60 }));
    expect(view.readinessStatus).toBe("Ready for Interview");
  });

  it("reports 'Needs More Preparation' below the threshold", () => {
    const view = buildInterviewReadinessView(profile({ interviewReadinessScore: 59 }));
    expect(view.readinessStatus).toBe("Needs More Preparation");
  });

  it("maps technicalReadiness/roleAlignment from the JD matcher's own keywordScore/experienceScore, never a fabricated value", () => {
    const view = buildInterviewReadinessView(profile({ jdMatchResult: { keywordScore: 55, experienceScore: 88 } }));
    expect(view.technicalReadiness).toBe(55);
    expect(view.roleAlignment).toBe(88);
  });

  it("shows 'Not available' (null) for technicalReadiness/roleAlignment when no JD match exists — never invents one", () => {
    const view = buildInterviewReadinessView(profile({ jdMatchResult: null }));
    expect(view.technicalReadiness).toBeNull();
    expect(view.roleAlignment).toBeNull();
    expect(view.missingSkills).toEqual([]);
  });

  it("reuses buildRecruiterSummary's existing gaps verbatim as recommendedInterviewAreas — no new computation", () => {
    const view = buildInterviewReadinessView(profile({ gaps: ["Kubernetes — not found on the resume"] }));
    expect(view.recommendedInterviewAreas).toEqual(["Kubernetes — not found on the resume"]);
  });
});
