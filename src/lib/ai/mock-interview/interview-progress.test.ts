import { vi } from "vitest";

// Same transitive-import constraints as session-debrief.test.ts (this
// file's own dependency, via interview-progress.ts -> interview-coverage.ts
// -> question-generator.ts).
vi.mock("../openai", () => ({ openai: {} }));
vi.mock("../interview-chat/interview-search", () => ({ searchInterviewQuestions: vi.fn(async () => []) }));

const { prepGetMock, resumeGetMock, jdMatchGetMock, sessionGetMock } = vi.hoisted(() => ({
  prepGetMock: vi.fn(),
  resumeGetMock: vi.fn(),
  jdMatchGetMock: vi.fn(),
  sessionGetMock: vi.fn(),
}));

vi.mock("../interview-prep/prep-service", () => ({ prepService: { get: prepGetMock } }));
vi.mock("../resume/resume-service", () => ({ resumeService: { get: resumeGetMock } }));
vi.mock("../job-description/jd-service", () => ({ jdMatchService: { get: jdMatchGetMock } }));
// Only session-debrief.ts's own internal sessionService.get() calls are
// exercised through this mock (in the last describe block below) — every
// other test in this file calls computeInterviewProgress() directly with
// hand-built SessionProgressPoint fixtures and never touches sessionService.
vi.mock("./session-service", () => ({ sessionService: { get: sessionGetMock } }));

import { beforeEach, describe, expect, it } from "vitest";

import { computeInterviewProgress, isSameContext, SessionProgressPoint } from "./interview-progress";
import { CoverageCategory, PriorityLevel } from "../interview-prep/interview-coverage";
import { InterviewPreparationReport } from "../interview-prep/prep-schema";
import { JobDescription } from "../job-description/jd-schema";
import { Resume } from "../resume/resume-schema";
import { buildSessionDebrief, CategoryPerformance, CoverageImpactItem, DemonstrationStatus, SessionDebrief } from "./session-debrief";
import { SessionRecord } from "./session-types";

// Phase 17 Milestone 6 — interview-progress.ts is deliberately session-
// list-agnostic: it consumes an already-resolved, already-context-
// filtered, already-chronologically-sorted array of { session, debrief }
// pairs. Most tests below hand-build SessionDebrief fixtures directly
// (M5's own classification logic is already covered by
// session-debrief.test.ts) — the last two tests exercise the real,
// unmocked M3/M4/M5 pipeline end-to-end (regression coverage, §20).

const ALL_CATEGORIES: CoverageCategory[] = ["technical", "resume", "jd", "behavioral", "systemDesign", "coding"];

function makeSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  const now = new Date().toISOString();
  return {
    sessionId: "s1",
    resumeId: "r1",
    jdMatchId: "j1",
    prepId: null,
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
    report: {
      overallScore: 70,
      interviewReadiness: 70,
      categoryScores: { technical: 70, communication: 0, problemSolving: 0, architecture: 0, leadership: 0, confidence: 0, coding: 0, behavioral: 0 },
      topicScores: [],
      strengths: [],
      weaknesses: [],
      topImprovements: [],
      questionsMissed: [],
      learningRoadmap: [],
    },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeCategoryPerformance(overrides: Partial<Record<CoverageCategory, number | null>> = {}): CategoryPerformance[] {
  return ALL_CATEGORIES.map((category) => {
    const averageScore = overrides[category] ?? null;
    return {
      category,
      questionsAsked: averageScore !== null ? 1 : 0,
      questionsAnswered: averageScore !== null ? 1 : 0,
      averageScore,
      performanceLevel: averageScore === null ? "Not Assessed" : averageScore >= 60 ? "Strong" : averageScore >= 30 ? "Moderate" : "Needs Practice",
      strengths: [],
      weaknesses: [],
    };
  });
}

function makeCoverageImpactItem(topic: string, category: CoverageCategory, priority: PriorityLevel, status: DemonstrationStatus): CoverageImpactItem {
  return { topic, category, priority, status, averageScore: status === "Demonstrated" ? 80 : status === "Not assessed" ? null : 20 };
}

function makeDebrief(overrides: Partial<SessionDebrief> = {}): SessionDebrief {
  return {
    sessionId: "s1",
    summary: { totalQuestions: 1, answeredQuestions: 1, skippedQuestions: 0, evaluatedQuestions: 1, overallScore: 70, readinessLevel: 70, completionPercentage: 100 },
    categoryPerformance: makeCategoryPerformance(),
    readinessRecommendation: "PRACTICE_BEFORE_INTERVIEW",
    coverageImpact: null,
    criticalWeaknesses: null,
    strongAreas: null,
    practiceRecommendations: null,
    updatedStudyPlan: null,
    coverageUnavailableReason: "test fixture — no linked prep report",
    ...overrides,
  };
}

function point(sessionOverrides: Partial<SessionRecord>, debriefOverrides: Partial<SessionDebrief>): SessionProgressPoint {
  return { session: makeSession(sessionOverrides), debrief: makeDebrief(debriefOverrides) };
}

describe("computeInterviewProgress — session counts (§1/§2)", () => {
  it("returns INSUFFICIENT_DATA and all-null history fields for zero sessions", () => {
    const progress = computeInterviewProgress([]);
    expect(progress.sessionsAttempted).toBe(0);
    expect(progress.sessionsCompleted).toBe(0);
    expect(progress.latestScore).toBeNull();
    expect(progress.trend).toBe("INSUFFICIENT_DATA");
    expect(progress.studyPlanUnavailableReason).toMatch(/no completed sessions/i);
  });

  it("counts an in-progress (unresolved-debrief) session toward sessionsAttempted but not sessionsCompleted", () => {
    const points: SessionProgressPoint[] = [{ session: makeSession({ status: "in_progress", report: null }), debrief: null }];
    const progress = computeInterviewProgress(points);
    expect(progress.sessionsAttempted).toBe(1);
    expect(progress.sessionsCompleted).toBe(0);
  });

  it("with exactly one completed session, reports latestScore but no previousScore/delta and marks trend INSUFFICIENT_DATA", () => {
    const points = [point({ report: { ...makeSession().report!, overallScore: 65, interviewReadiness: 65 } }, { summary: { ...makeDebrief().summary, overallScore: 65, readinessLevel: 65 } })];
    const progress = computeInterviewProgress(points);

    expect(progress.sessionsCompleted).toBe(1);
    expect(progress.latestScore).toBe(65);
    expect(progress.previousScore).toBeNull();
    expect(progress.scoreDelta).toBeNull();
    expect(progress.trend).toBe("INSUFFICIENT_DATA");
  });
});

describe("computeInterviewProgress — overall trend (§3)", () => {
  it("classifies a >=5 point improvement as IMPROVING, and reuses each session's own M5 readinessRecommendation directly (never a second, competing readiness label)", () => {
    const points = [
      point(
        { report: { ...makeSession().report!, overallScore: 50, interviewReadiness: 50 } },
        { summary: { ...makeDebrief().summary, overallScore: 50, readinessLevel: 50 }, readinessRecommendation: "NEEDS_FOCUSED_PREPARATION" }
      ),
      point(
        { report: { ...makeSession().report!, overallScore: 70, interviewReadiness: 70 } },
        { summary: { ...makeDebrief().summary, overallScore: 70, readinessLevel: 70 }, readinessRecommendation: "READY_FOR_INTERVIEW" }
      ),
    ];
    const progress = computeInterviewProgress(points);
    expect(progress.scoreDelta).toBe(20);
    expect(progress.trend).toBe("IMPROVING");
    expect(progress.latestReadiness).toBe("READY_FOR_INTERVIEW");
    expect(progress.previousReadiness).toBe("NEEDS_FOCUSED_PREPARATION");
  });

  it("classifies a >=5 point decline as DECLINING", () => {
    const points = [
      point({ report: { ...makeSession().report!, overallScore: 80 } }, { summary: { ...makeDebrief().summary, overallScore: 80 } }),
      point({ report: { ...makeSession().report!, overallScore: 55 } }, { summary: { ...makeDebrief().summary, overallScore: 55 } }),
    ];
    expect(computeInterviewProgress(points).trend).toBe("DECLINING");
  });

  it("classifies a small (<5 point) swing as STABLE, never fabricating improvement/decline from noise", () => {
    const points = [
      point({ report: { ...makeSession().report!, overallScore: 70 } }, { summary: { ...makeDebrief().summary, overallScore: 70 } }),
      point({ report: { ...makeSession().report!, overallScore: 72 } }, { summary: { ...makeDebrief().summary, overallScore: 72 } }),
    ];
    expect(computeInterviewProgress(points).trend).toBe("STABLE");
  });
});

describe("computeInterviewProgress — category trend analysis (§4)", () => {
  it("marks a category IMPROVING when its average score rises by >=5 points", () => {
    const points = [
      point({}, { categoryPerformance: makeCategoryPerformance({ technical: 60 }) }),
      point({}, { categoryPerformance: makeCategoryPerformance({ technical: 80 }) }),
    ];
    const progress = computeInterviewProgress(points);
    const technical = progress.categoryProgress.find((c) => c.category === "technical")!;
    expect(technical.trend).toBe("IMPROVING");
    expect(progress.improvingAreas.some((a) => a.category === "technical")).toBe(true);
  });

  it("marks a category DECLINING when its average score falls by >=5 points", () => {
    const points = [
      point({}, { categoryPerformance: makeCategoryPerformance({ behavioral: 82 }) }),
      point({}, { categoryPerformance: makeCategoryPerformance({ behavioral: 58 }) }),
    ];
    const progress = computeInterviewProgress(points);
    const behavioral = progress.categoryProgress.find((c) => c.category === "behavioral")!;
    expect(behavioral.trend).toBe("DECLINING");
    expect(progress.decliningAreas.some((a) => a.category === "behavioral")).toBe(true);
  });

  it("marks a category INSUFFICIENT_DATA with only one real data point, never inferring a trend from a single score", () => {
    const points = [point({}, { categoryPerformance: makeCategoryPerformance({ coding: 61 }) })];
    const progress = computeInterviewProgress(points);
    const coding = progress.categoryProgress.find((c) => c.category === "coding")!;
    expect(coding.trend).toBe("INSUFFICIENT_DATA");
    expect(progress.improvingAreas).toHaveLength(0);
    expect(progress.decliningAreas).toHaveLength(0);
  });

  it("marks a category never asked about (empty across every session) as INSUFFICIENT_DATA with null scores, never a fabricated 0", () => {
    const points = [point({}, { categoryPerformance: makeCategoryPerformance({ technical: 70 }) })]; // never touches "coding"
    const progress = computeInterviewProgress(points);
    const coding = progress.categoryProgress.find((c) => c.category === "coding")!;
    expect(coding.trend).toBe("INSUFFICIENT_DATA");
    expect(coding.latest).toBeNull();
  });
});

describe("computeInterviewProgress — persistent weakness and repeated misses (§5/§6)", () => {
  it("never classifies a topic assessed only once as persistent, even if the one assessment was weak", () => {
    const points = [point({}, { coverageImpact: [makeCoverageImpactItem("Kafka", "technical", "HIGH", "Not demonstrated")] })];
    const progress = computeInterviewProgress(points);
    expect(progress.persistentWeakAreas).toHaveLength(0);
    expect(progress.repeatedMisses).toHaveLength(0);
  });

  it("classifies a topic weak in >=2 assessed sessions, still weak in the latest, as PERSISTENT_WEAKNESS", () => {
    const points = [
      point({}, { coverageImpact: [makeCoverageImpactItem("Kafka", "technical", "HIGH", "Not demonstrated")] }),
      point({}, { coverageImpact: [makeCoverageImpactItem("Kafka", "technical", "HIGH", "Partially demonstrated")] }),
    ];
    const progress = computeInterviewProgress(points);
    expect(progress.persistentWeakAreas).toHaveLength(1);
    expect(progress.persistentWeakAreas[0]).toMatchObject({ topic: "Kafka", assessedCount: 2, weakCount: 2, status: "PERSISTENT_WEAKNESS" });
  });

  it("classifies a topic weak twice but Demonstrated in the latest session as IMPROVING, not persistent", () => {
    const points = [
      point({}, { coverageImpact: [makeCoverageImpactItem("Kafka", "technical", "HIGH", "Not demonstrated")] }),
      point({}, { coverageImpact: [makeCoverageImpactItem("Kafka", "technical", "HIGH", "Not demonstrated")] }),
      point({}, { coverageImpact: [makeCoverageImpactItem("Kafka", "technical", "HIGH", "Demonstrated")] }),
    ];
    const progress = computeInterviewProgress(points);
    expect(progress.persistentWeakAreas).toHaveLength(0);
    // Still a genuine repeated-difficulty signal historically, even though it's now improving.
    expect(progress.repeatedMisses.some((t) => t.topic === "Kafka" && t.status === "IMPROVING")).toBe(true);
  });

  it("never counts a 'Not assessed' occurrence as evidence of weakness", () => {
    const points = [
      point({}, { coverageImpact: [makeCoverageImpactItem("Kubernetes", "jd", "MEDIUM", "Not assessed")] }),
      point({}, { coverageImpact: [makeCoverageImpactItem("Kubernetes", "jd", "MEDIUM", "Not assessed")] }),
    ];
    const progress = computeInterviewProgress(points);
    expect(progress.persistentWeakAreas).toHaveLength(0);
    expect(progress.repeatedMisses).toHaveLength(0);
  });

  it("keeps the same topic name in two different categories as two separate entries (no over-normalization)", () => {
    const points = [
      point({}, { coverageImpact: [makeCoverageImpactItem("Communication", "behavioral", "MEDIUM", "Not demonstrated"), makeCoverageImpactItem("Communication", "jd", "MEDIUM", "Not demonstrated")] }),
      point({}, { coverageImpact: [makeCoverageImpactItem("Communication", "behavioral", "MEDIUM", "Not demonstrated"), makeCoverageImpactItem("Communication", "jd", "MEDIUM", "Not demonstrated")] }),
    ];
    const progress = computeInterviewProgress(points);
    expect(progress.persistentWeakAreas).toHaveLength(2);
    expect(progress.persistentWeakAreas.map((t) => t.category).sort()).toEqual(["behavioral", "jd"]);
  });
});

describe("computeInterviewProgress — practice recommendation ordering (§8/§17)", () => {
  it("orders recommendations HIGH, then MEDIUM, then CONTINUE", () => {
    const points = [
      point(
        {},
        {
          categoryPerformance: makeCategoryPerformance({ behavioral: 82 }),
          coverageImpact: [makeCoverageImpactItem("Kafka", "technical", "HIGH", "Not demonstrated"), makeCoverageImpactItem("System Design", "systemDesign", "MEDIUM", "Not demonstrated")],
        }
      ),
      point(
        {},
        {
          categoryPerformance: makeCategoryPerformance({ behavioral: 58 }),
          coverageImpact: [makeCoverageImpactItem("Kafka", "technical", "HIGH", "Not demonstrated"), makeCoverageImpactItem("System Design", "systemDesign", "MEDIUM", "Demonstrated")],
        }
      ),
    ];

    const progress = computeInterviewProgress(points);
    const priorities = progress.recommendedNextPractice.map((r) => r.priority);

    expect(priorities.indexOf("HIGH")).toBeLessThan(priorities.indexOf("MEDIUM"));
    expect(priorities.indexOf("MEDIUM")).toBeLessThan(priorities.indexOf("CONTINUE"));
    expect(progress.recommendedNextPractice.find((r) => r.priority === "HIGH")?.topicOrCategory).toBe("Kafka");
    expect(progress.recommendedNextPractice.find((r) => r.priority === "MEDIUM")?.topicOrCategory).toBe("Behavioral");
    expect(progress.recommendedNextPractice.find((r) => r.priority === "CONTINUE")?.topicOrCategory).toBe("System Design");
  });
});

describe("computeInterviewProgress — completion rate from partially-answered/skipped sessions (§13/§14)", () => {
  it("averages each session's own completionPercentage, never fabricating one", () => {
    const points = [
      point({}, { summary: { ...makeDebrief().summary, completionPercentage: 100 } }),
      point({}, { summary: { ...makeDebrief().summary, completionPercentage: 50 } }),
    ];
    expect(computeInterviewProgress(points).completionRate).toBe(75);
  });
});

describe("isSameContext — context compatibility (§11/§12)", () => {
  it("matches only sessions with the same resumeId AND jdMatchId", () => {
    const session = makeSession({ resumeId: "r1", jdMatchId: "j1" });
    expect(isSameContext(session, "r1", "j1")).toBe(true);
    expect(isSameContext(session, "r1", "j2")).toBe(false);
    expect(isSameContext(session, "r2", "j1")).toBe(false);
  });
});

describe("computeInterviewProgress — no linked prep report", () => {
  it("returns a null study plan with an explicit reason when the latest session has no prepId", () => {
    const progress = computeInterviewProgress([point({ prepId: null }, {})]);
    expect(progress.updatedStudyPlan).toBeNull();
    expect(progress.studyPlanUnavailableReason).toMatch(/wasn't linked/i);
  });
});

// ---------------------------------------------------------------------------
// §16 (study-plan reprioritization) and §20 (regression against the real,
// unmocked M5 debrief pipeline) — both require the same prepService/
// resumeService/jdMatchService mocking session-debrief.test.ts and
// interview-intelligence-service.test.ts already establish.
// ---------------------------------------------------------------------------

const resume: Resume = {
  contact: { name: "Jane Doe", email: "jane@example.com", phone: null, location: null, linkedin: null, github: null, website: null },
  summary: "",
  skills: [],
  technicalSkills: ["Java", "Kafka"],
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
  mandatorySkills: ["Java"],
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
};

const report: InterviewPreparationReport = {
  readinessScore: { overall: 65, resumeQuality: 65, jdMatch: 65, missingSkillsPenalty: 65, projectsScore: 65, experienceScore: 65, atsScore: 65, knowledgeBaseCoverage: 65 },
  technicalQuestions: [
    { question: "Explain your experience with Java.", difficulty: "Medium", topic: "Java", idealAnswer: { architecture: "", tradeoffs: "", bestPractices: "", performance: "", security: "" } },
    { question: "Explain your experience with Kafka.", difficulty: "Hard", topic: "Kafka", idealAnswer: { architecture: "", tradeoffs: "", bestPractices: "", performance: "", security: "" } },
  ],
  hrQuestions: [],
  projectQuestions: [],
  systemDesignQuestions: [],
  codingRecommendations: [],
  weaknessAnalysis: { weakAreas: [], missingSkills: [], knowledgeGaps: [], projectsToBuild: [], conceptsToLearn: [] },
  confidenceAnalysis: { strongAreas: [], weakAreas: [], highConfidenceTopics: [], lowConfidenceTopics: [] },
  learningRoadmap: [],
  cheatSheet: [],
};

function makeQuestion(overrides: Record<string, unknown>) {
  return { id: "q1", text: "Explain your experience with Java.", type: "Technical" as const, difficulty: "Medium" as const, source: "prep" as const, topic: "Java", ...overrides };
}

describe("computeInterviewProgress — study plan reprioritization across sessions (§7/§16)", () => {
  const sessionsById = new Map<string, SessionRecord>();

  beforeEach(() => {
    sessionsById.clear();
    prepGetMock.mockReset();
    resumeGetMock.mockReset();
    jdMatchGetMock.mockReset();
    sessionGetMock.mockReset();
    sessionGetMock.mockImplementation((id: string) => sessionsById.get(id));
    prepGetMock.mockReturnValue({ prepId: "p1", resumeId: "r1", jdMatchId: "j1", report, createdAt: new Date().toISOString() });
    resumeGetMock.mockReturnValue({ resume });
    jdMatchGetMock.mockReturnValue({ jobDescription, matchResult: {} });
  });

  it("moves a topic that was repeatedly weak across real sessions to the top of the reprioritized plan", () => {
    const qJava = makeQuestion({ id: "q1", topic: "Java" });
    const qKafka = makeQuestion({ id: "q2", topic: "Kafka", text: "Explain your experience with Kafka." });

    function startAndComplete(sessionId: string, kafkaScore: number): { session: SessionRecord; debrief: SessionDebrief } {
      const now = new Date().toISOString();
      const session: SessionRecord = {
        sessionId,
        resumeId: "r1",
        jdMatchId: "j1",
        prepId: "p1",
        interviewType: "Mixed",
        mode: "practice",
        status: "completed",
        questions: [qJava, qKafka],
        currentIndex: 1,
        transcript: [
          { question: qJava, answerText: "a", evaluation: makeEval(85), isFollowUp: false, askedAt: now, answeredAt: now },
          { question: qKafka, answerText: "a", evaluation: makeEval(kafkaScore), isFollowUp: false, askedAt: now, answeredAt: now },
        ],
        pendingFollowUp: null,
        askedQuestionKeys: [],
        preferredDifficulty: null,
        questionsMissedText: [],
        report: {
          overallScore: 70,
          interviewReadiness: 70,
          categoryScores: { technical: 70, communication: 0, problemSolving: 0, architecture: 0, leadership: 0, confidence: 0, coding: 0, behavioral: 0 },
          topicScores: [],
          strengths: [],
          weaknesses: [],
          topImprovements: [],
          questionsMissed: [],
          learningRoadmap: [],
        },
        createdAt: now,
        updatedAt: now,
      };

      sessionsById.set(sessionId, session);
      return { session, debrief: buildSessionDebrief(sessionId) };
    }

    function makeEval(overallScore: number) {
      return {
        dimensions: { correctness: overallScore, completeness: overallScore, communication: null, confidence: null, technicalAccuracy: overallScore, problemSolving: null, architectureThinking: null, tradeoffs: null, bestPractices: null, security: null, performance: null, maintainability: null },
        strengths: [],
        weaknesses: [],
        missingConcepts: [],
        betterAnswer: "",
        idealAnswer: "",
        improvementTips: [],
        followUpNeeded: false,
        followUpQuestion: null,
        overallScore,
      };
    }

    const points = [startAndComplete("s1", 20), startAndComplete("s2", 25)];
    const progress = computeInterviewProgress(points);

    expect(progress.persistentWeakAreas.some((t) => t.topic === "Kafka")).toBe(true);
    expect(progress.updatedStudyPlan).not.toBeNull();
    expect(progress.updatedStudyPlan![0].topic).toBe("Kafka");
    expect(progress.updatedStudyPlan![0].moved).toBe(true);
    expect(progress.updatedStudyPlan![0].moveReason).toMatch(/repeated weakness/i);
  });
});
