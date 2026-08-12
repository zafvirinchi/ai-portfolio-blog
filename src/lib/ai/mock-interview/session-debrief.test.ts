import { vi } from "vitest";

// Same transitive-import constraints as interview-coverage.test.ts /
// interview-intelligence-service.test.ts (this file's own dependency,
// via session-debrief.ts -> interview-coverage.ts -> question-generator.ts).
vi.mock("../openai", () => ({ openai: {} }));
vi.mock("../interview-chat/interview-search", () => ({ searchInterviewQuestions: vi.fn(async () => []) }));

const { sessionGetMock, prepGetMock, resumeGetMock, jdMatchGetMock } = vi.hoisted(() => ({
  sessionGetMock: vi.fn(),
  prepGetMock: vi.fn(),
  resumeGetMock: vi.fn(),
  jdMatchGetMock: vi.fn(),
}));

vi.mock("./session-service", () => ({ sessionService: { get: sessionGetMock } }));
vi.mock("../interview-prep/prep-service", () => ({ prepService: { get: prepGetMock } }));
vi.mock("../resume/resume-service", () => ({ resumeService: { get: resumeGetMock } }));
vi.mock("../job-description/jd-service", () => ({ jdMatchService: { get: jdMatchGetMock } }));

import { beforeEach, describe, expect, it } from "vitest";

import { buildSessionDebrief, SessionDebriefNotFoundError, SessionNotCompletedError } from "./session-debrief";
import { InterviewPreparationReport } from "../interview-prep/prep-schema";
import { JobDescription } from "../job-description/jd-schema";
import { Resume } from "../resume/resume-schema";
import { AnswerEvaluation, SessionQuestion, SessionReport, TranscriptTurn } from "./session-schema";
import { SessionRecord } from "./session-types";

// Phase 17 Milestone 5 — session-debrief.ts does no evaluation/scoring of
// its own; it composes an already-completed SessionRecord (sessionService,
// mocked here) with M3/M4's real, unmocked coverage/plan/study-plan math
// (interview-coverage.ts + interview-intelligence-service.ts, exercised
// end-to-end exactly like interview-intelligence-service.test.ts already
// does) via prepService/resumeService/jdMatchService (also mocked, same
// three getters M3's own test mocks).

const resume: Resume = {
  contact: { name: "Jane Doe", email: "jane@example.com", phone: null, location: null, linkedin: null, github: null, website: null },
  summary: "",
  skills: [],
  technicalSkills: ["Java", "Kafka"],
  softSkills: [],
  workExperience: [],
  education: [],
  certifications: [],
  projects: [{ name: "Inventory System", description: "A warehouse system.", technologies: ["Java"], url: null }],
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
  mandatorySkills: ["Java"],
  goodToHaveSkills: ["Kubernetes"],
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
};

const report: InterviewPreparationReport = {
  readinessScore: { overall: 65, resumeQuality: 65, jdMatch: 65, missingSkillsPenalty: 65, projectsScore: 65, experienceScore: 65, atsScore: 65, knowledgeBaseCoverage: 65 },
  technicalQuestions: [
    { question: "Explain your experience with Java.", difficulty: "Medium", topic: "Java", idealAnswer: { architecture: "", tradeoffs: "", bestPractices: "", performance: "", security: "" } },
    { question: "Explain your experience with Kafka.", difficulty: "Hard", topic: "Kafka", idealAnswer: { architecture: "", tradeoffs: "", bestPractices: "", performance: "", security: "" } },
  ],
  hrQuestions: [],
  projectQuestions: [
    { question: "Walk me through Inventory System.", projectName: "Inventory System", focus: "Architecture", idealAnswer: { situation: "", task: "", action: "", result: "" } },
  ],
  systemDesignQuestions: [],
  codingRecommendations: [],
  weaknessAnalysis: { weakAreas: [], missingSkills: [], knowledgeGaps: [], projectsToBuild: [], conceptsToLearn: [] },
  confidenceAnalysis: { strongAreas: [], weakAreas: [], highConfidenceTopics: [], lowConfidenceTopics: [] },
  learningRoadmap: [],
  cheatSheet: [],
};

function makeEvaluation(overallScore: number, overrides: Partial<AnswerEvaluation> = {}): AnswerEvaluation {
  return {
    dimensions: {
      correctness: overallScore,
      completeness: overallScore,
      communication: null,
      confidence: null,
      technicalAccuracy: overallScore,
      problemSolving: null,
      architectureThinking: null,
      tradeoffs: null,
      bestPractices: null,
      security: null,
      performance: null,
      maintainability: null,
    },
    strengths: [],
    weaknesses: [],
    missingConcepts: [],
    betterAnswer: "",
    idealAnswer: "",
    improvementTips: [],
    followUpNeeded: false,
    followUpQuestion: null,
    overallScore,
    ...overrides,
  };
}

function makeQuestion(overrides: Partial<SessionQuestion>): SessionQuestion {
  return { id: "q1", text: "Explain your experience with Java.", type: "Technical", difficulty: "Medium", source: "prep", topic: "Java", ...overrides };
}

function makeReport(overrides: Partial<SessionReport> = {}): SessionReport {
  return {
    overallScore: 55,
    interviewReadiness: 55,
    categoryScores: { technical: 55, communication: 0, problemSolving: 0, architecture: 0, leadership: 0, confidence: 0, coding: 0, behavioral: 0 },
    topicScores: [],
    strengths: [],
    weaknesses: [],
    topImprovements: [],
    questionsMissed: [],
    learningRoadmap: [],
    ...overrides,
  };
}

function makeSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  const now = new Date().toISOString();
  return {
    sessionId: "s1",
    resumeId: "r1",
    jdMatchId: "j1",
    prepId: "p1",
    interviewType: "Mixed",
    mode: "practice",
    status: "completed",
    questions: [],
    currentIndex: -1,
    transcript: [],
    pendingFollowUp: null,
    askedQuestionKeys: [],
    preferredDifficulty: null,
    questionsMissedText: [],
    report: makeReport(),
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeTurn(question: SessionQuestion, overallScore: number, overrides: Partial<TranscriptTurn> = {}): TranscriptTurn {
  const now = new Date().toISOString();
  return { question, answerText: "My answer.", evaluation: makeEvaluation(overallScore), isFollowUp: false, askedAt: now, answeredAt: now, ...overrides };
}

beforeEach(() => {
  sessionGetMock.mockReset();
  prepGetMock.mockReset();
  resumeGetMock.mockReset();
  jdMatchGetMock.mockReset();
});

describe("buildSessionDebrief — session lookup errors", () => {
  it("throws SessionDebriefNotFoundError for an invalid/nonexistent sessionId (also covers cross-user access — no user concept exists for this ephemeral bearer-token family, same as every sibling mock-interview route)", () => {
    sessionGetMock.mockReturnValue(undefined);
    expect(() => buildSessionDebrief("nonexistent")).toThrow(SessionDebriefNotFoundError);
  });

  it("throws SessionNotCompletedError for a session still in_progress (partially completed)", () => {
    sessionGetMock.mockReturnValue(makeSession({ status: "in_progress", report: null }));
    expect(() => buildSessionDebrief("s1")).toThrow(SessionNotCompletedError);
  });

  it("throws SessionNotCompletedError when status is completed but report is somehow null", () => {
    sessionGetMock.mockReturnValue(makeSession({ status: "completed", report: null }));
    expect(() => buildSessionDebrief("s1")).toThrow(SessionNotCompletedError);
  });
});

describe("buildSessionDebrief — session summary", () => {
  it("computes totals, skip count, and completion percentage from the session's own questions/transcript", () => {
    const qJava = makeQuestion({ id: "q1", topic: "Java" });
    const qKafka = makeQuestion({ id: "q2", topic: "Kafka", text: "Explain your experience with Kafka." });
    const qUnanswered = makeQuestion({ id: "q3", topic: "Kubernetes", text: "Tell me about Kubernetes." });

    sessionGetMock.mockReturnValue(
      makeSession({
        prepId: null,
        questions: [qJava, qKafka, qUnanswered],
        transcript: [makeTurn(qJava, 80)],
        questionsMissedText: [qKafka.text],
      })
    );

    const debrief = buildSessionDebrief("s1");

    expect(debrief.summary.totalQuestions).toBe(3);
    expect(debrief.summary.answeredQuestions).toBe(1);
    expect(debrief.summary.skippedQuestions).toBe(1);
    expect(debrief.summary.completionPercentage).toBe(33); // round(1/3 * 100)
  });

  it("never divides by zero for an empty session (0 questions, all skipped or none asked)", () => {
    sessionGetMock.mockReturnValue(makeSession({ prepId: null, questions: [], transcript: [] }));
    const debrief = buildSessionDebrief("s1");
    expect(debrief.summary.totalQuestions).toBe(0);
    expect(debrief.summary.completionPercentage).toBe(0);
  });
});

describe("buildSessionDebrief — category performance", () => {
  it("marks a category 'Not Assessed' (never a fabricated score) when the session never asked it anything", () => {
    sessionGetMock.mockReturnValue(makeSession({ prepId: null, questions: [], transcript: [] }));
    const debrief = buildSessionDebrief("s1");

    for (const category of debrief.categoryPerformance) {
      expect(category.performanceLevel).toBe("Not Assessed");
      expect(category.averageScore).toBeNull();
    }
  });

  it("aggregates asked/answered counts and average score per category, distinct from mock-interview's own 8-key CategoryScores taxonomy", () => {
    const qJava = makeQuestion({ id: "q1", topic: "Java", type: "Technical" });
    const qKafka = makeQuestion({ id: "q2", topic: "Kafka", type: "Technical", text: "Explain your experience with Kafka." });

    sessionGetMock.mockReturnValue(
      makeSession({
        prepId: null,
        questions: [qJava, qKafka],
        transcript: [makeTurn(qJava, 85), makeTurn(qKafka, 25)],
      })
    );

    const debrief = buildSessionDebrief("s1");
    const technical = debrief.categoryPerformance.find((c) => c.category === "technical")!;

    expect(technical.questionsAsked).toBe(2);
    expect(technical.questionsAnswered).toBe(2);
    expect(technical.averageScore).toBe(55); // round((85+25)/2)
    expect(technical.performanceLevel).toBe("Moderate");
  });
});

describe("buildSessionDebrief — no linked Interview Preparation report", () => {
  it("returns null coverage/study-plan sections with an explicit reason when the session has no prepId", () => {
    sessionGetMock.mockReturnValue(makeSession({ prepId: null }));
    const debrief = buildSessionDebrief("s1");

    expect(debrief.coverageImpact).toBeNull();
    expect(debrief.criticalWeaknesses).toBeNull();
    expect(debrief.strongAreas).toBeNull();
    expect(debrief.practiceRecommendations).toBeNull();
    expect(debrief.updatedStudyPlan).toBeNull();
    expect(debrief.coverageUnavailableReason).toMatch(/wasn't linked/i);
  });

  it("returns the same graceful shape when the linked prep report has since expired", () => {
    sessionGetMock.mockReturnValue(makeSession({ prepId: "p1" }));
    prepGetMock.mockReturnValue(undefined);

    const debrief = buildSessionDebrief("s1");

    expect(debrief.coverageImpact).toBeNull();
    expect(debrief.coverageUnavailableReason).toMatch(/expired/i);
  });
});

describe("buildSessionDebrief — coverage cross-reference, priority weaknesses/strengths, and study-plan reprioritization", () => {
  beforeEach(() => {
    prepGetMock.mockReturnValue({ prepId: "p1", resumeId: "r1", jdMatchId: "j1", report, createdAt: new Date().toISOString() });
    resumeGetMock.mockReturnValue({ resume });
    jdMatchGetMock.mockReturnValue({ jobDescription, matchResult: {} });
  });

  it("classifies a well-answered CRITICAL topic as Demonstrated and a poorly-answered topic as Not demonstrated — never 'Not assessed' for a topic that genuinely was asked", () => {
    const qJava = makeQuestion({ id: "q1", topic: "Java", type: "Technical" });
    const qKafka = makeQuestion({ id: "q2", topic: "Kafka", type: "Technical", text: "Explain your experience with Kafka." });

    sessionGetMock.mockReturnValue(
      makeSession({
        questions: [qJava, qKafka],
        transcript: [makeTurn(qJava, 85), makeTurn(qKafka, 25)],
        report: makeReport({ interviewReadiness: 55 }),
      })
    );

    const debrief = buildSessionDebrief("s1");
    const javaImpact = debrief.coverageImpact!.find((i) => i.topic === "Java")!;
    const kafkaImpact = debrief.coverageImpact!.find((i) => i.topic === "Kafka")!;
    const kubernetesImpact = debrief.coverageImpact!.find((i) => i.topic === "Kubernetes")!;

    expect(javaImpact.priority).toBe("CRITICAL"); // mandatory JD skill
    expect(javaImpact.status).toBe("Demonstrated");
    expect(kafkaImpact.status).toBe("Not demonstrated");
    // Kubernetes (good-to-have JD skill) was never asked about in this session.
    expect(kubernetesImpact.status).toBe("Not assessed");
  });

  it("never concludes a candidate 'lacks' a skill merely because the session didn't ask about it — Kubernetes stays 'Not assessed', not 'Not demonstrated'", () => {
    sessionGetMock.mockReturnValue(makeSession({ questions: [], transcript: [] }));
    const debrief = buildSessionDebrief("s1");
    const kubernetesImpact = debrief.coverageImpact!.find((i) => i.topic === "Kubernetes")!;
    expect(kubernetesImpact.status).toBe("Not assessed");
  });

  it("surfaces a poorly-demonstrated HIGH/CRITICAL topic as a critical weakness with a deterministic practice recommendation, and a well-demonstrated one as a strong area", () => {
    const qJava = makeQuestion({ id: "q1", topic: "Java", type: "Technical" });
    const qKafka = makeQuestion({ id: "q2", topic: "Kafka", type: "Technical", text: "Explain your experience with Kafka." });

    sessionGetMock.mockReturnValue(
      makeSession({
        questions: [qJava, qKafka],
        transcript: [makeTurn(qJava, 85), makeTurn(qKafka, 25)],
        report: makeReport({ interviewReadiness: 55 }),
      })
    );

    const debrief = buildSessionDebrief("s1");

    expect(debrief.criticalWeaknesses!.some((w) => w.topic === "Kafka")).toBe(true);
    expect(debrief.strongAreas!.some((s) => s.topic === "Java")).toBe(true);
    expect(debrief.practiceRecommendations).toContain("Revisit Kafka and practice another answer on it.");
  });

  it("moves a weakly-demonstrated topic to the top of the reprioritized study plan and explains why, leaving strong topics in place", () => {
    const qJava = makeQuestion({ id: "q1", topic: "Java", type: "Technical" });
    const qKafka = makeQuestion({ id: "q2", topic: "Kafka", type: "Technical", text: "Explain your experience with Kafka." });

    sessionGetMock.mockReturnValue(
      makeSession({
        questions: [qJava, qKafka],
        transcript: [makeTurn(qJava, 85), makeTurn(qKafka, 25)],
        report: makeReport({ interviewReadiness: 55 }),
      })
    );

    const debrief = buildSessionDebrief("s1");
    const plan = debrief.updatedStudyPlan!;

    // Originally: Java (CRITICAL) is priority-sorted ahead of Kafka (HIGH) —
    // Kafka only outranks it here because it was demonstrably weak THIS session.
    expect(plan[0].topic).toBe("Kafka");
    expect(plan[0].moved).toBe(true);
    expect(plan[0].moveReason).toMatch(/scored below the readiness threshold \(25\/100\)/);

    const javaEntry = plan.find((entry) => entry.topic === "Java")!;
    expect(javaEntry.moved).toBe(false);
    expect(javaEntry.moveReason).toBeNull();

    // Never a fabricated calendar date.
    expect(JSON.stringify(plan)).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("collapses near-duplicate questions on the same topic before averaging (Step 10) — only the first, kept turn's score counts", () => {
    const q1 = makeQuestion({ id: "q1", topic: "Kafka", type: "Technical", text: "Explain your experience with Kafka." });
    const q2 = makeQuestion({ id: "q2", topic: "Kafka", type: "Technical", text: "Explain your experience with Kafka." }); // exact duplicate text

    sessionGetMock.mockReturnValue(
      makeSession({
        questions: [q1, q2],
        transcript: [makeTurn(q1, 20), makeTurn(q2, 90)],
      })
    );

    const debrief = buildSessionDebrief("s1");
    const kafkaImpact = debrief.coverageImpact!.find((i) => i.topic === "Kafka")!;

    expect(kafkaImpact.averageScore).toBe(20); // the second (duplicate) turn's 90 never gets blended in
  });

  it("treats a skipped question's topic as Not demonstrated, not Not assessed, and moves it up the study plan with a skip-specific reason", () => {
    // Kafka (HIGH) — unlike Java (CRITICAL, already sorted first), Kafka
    // only outranks its original position because it was skipped, so this
    // also exercises the "moved" flag's skip-specific message.
    const qKafka = makeQuestion({ id: "q1", topic: "Kafka", type: "Technical", text: "Explain your experience with Kafka." });

    sessionGetMock.mockReturnValue(
      makeSession({
        questions: [qKafka],
        transcript: [],
        questionsMissedText: [qKafka.text],
      })
    );

    const debrief = buildSessionDebrief("s1");
    const kafkaImpact = debrief.coverageImpact!.find((i) => i.topic === "Kafka")!;

    expect(kafkaImpact.status).toBe("Not demonstrated");
    expect(kafkaImpact.averageScore).toBeNull();

    const kafkaEntry = debrief.updatedStudyPlan!.find((e) => e.topic === "Kafka")!;
    expect(kafkaEntry.moved).toBe(true);
    expect(kafkaEntry.moveReason).toMatch(/skipped/i);
  });

  it("prefers a real answered turn over a skip for the same topic (an earlier skip followed by a real later answer on a re-asked question)", () => {
    const qJavaSkipped = makeQuestion({ id: "q1", topic: "Java", type: "Technical", text: "Explain your experience with Java (v1)." });
    const qJavaAnswered = makeQuestion({ id: "q2", topic: "Java", type: "Technical", text: "Explain your experience with Java (v2)." });

    sessionGetMock.mockReturnValue(
      makeSession({
        questions: [qJavaSkipped, qJavaAnswered],
        transcript: [makeTurn(qJavaAnswered, 90)],
        questionsMissedText: [qJavaSkipped.text],
      })
    );

    const debrief = buildSessionDebrief("s1");
    const javaImpact = debrief.coverageImpact!.find((i) => i.topic === "Java")!;

    expect(javaImpact.status).toBe("Demonstrated");
    expect(javaImpact.averageScore).toBe(90);
  });
});

describe("buildSessionDebrief — readiness recommendation thresholds (no linked prep report, so criticalWeaknessCount is always 0 here — isolates the interviewReadiness boundary)", () => {
  it("returns READY_FOR_INTERVIEW at/above the 60-point threshold with zero critical gaps", () => {
    sessionGetMock.mockReturnValue(makeSession({ prepId: null, report: makeReport({ interviewReadiness: 70 }) }));
    expect(buildSessionDebrief("s1").readinessRecommendation).toBe("READY_FOR_INTERVIEW");
  });

  it("returns PRACTICE_BEFORE_INTERVIEW in the 30-59 band", () => {
    sessionGetMock.mockReturnValue(makeSession({ prepId: null, report: makeReport({ interviewReadiness: 45 }) }));
    expect(buildSessionDebrief("s1").readinessRecommendation).toBe("PRACTICE_BEFORE_INTERVIEW");
  });

  it("returns NEEDS_FOCUSED_PREPARATION below 30", () => {
    sessionGetMock.mockReturnValue(makeSession({ prepId: null, report: makeReport({ interviewReadiness: 20 }) }));
    expect(buildSessionDebrief("s1").readinessRecommendation).toBe("NEEDS_FOCUSED_PREPARATION");
  });
});
