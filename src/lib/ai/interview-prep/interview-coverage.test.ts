import { vi } from "vitest";
// interview-coverage.ts imports deriveTechnicalTopics from
// ./question-generator.ts, which imports interview-chat/interview-search.ts
// (a "@/" path alias vitest's config doesn't resolve) and transitively
// reaches the metered OpenAI client (needs real Supabase env vars at
// import time) — the same constraint question-generator.test.ts's own
// comment documents. Both mocked purely so the module graph is
// importable; no test in this file calls either.
vi.mock("../openai", () => ({ openai: {} }));
vi.mock("../interview-chat/interview-search", () => ({ searchInterviewQuestions: vi.fn(async () => []) }));

import { describe, expect, it } from "vitest";

import {
  buildJdGapAnalysis,
  buildPreparationPlan,
  buildRecommendedAction,
  buildResumeEvidenceSummary,
  buildStudyPlan,
  classifyTopic,
  computeCategoryCoveragePercent,
  computeInterviewCoverage,
  computeOverallCoveragePercent,
  computeReadinessLabel,
  deduplicateQuestions,
  flattenQuestionsForBrowsing,
  READINESS_LABEL_THRESHOLD,
} from "./interview-coverage";
import { JobDescription } from "../job-description/jd-schema";
import { InterviewPreparationReport } from "./prep-schema";
import { Resume } from "../resume/resume-schema";

// Phase 17 Milestone 3, §15 — deterministic tests for the coverage/
// priority/evidence/deduplication/preparation-plan pure module. No LLM
// involved anywhere in this file (interview-coverage.ts imports no LLM
// client at all — structurally impossible for these functions to make
// a network call).

function baseResume(overrides: Partial<Resume> = {}): Resume {
  return {
    contact: { name: "Jane Doe", email: "jane@example.com", phone: null, location: null, linkedin: null, github: null, website: null },
    summary: "Backend developer.",
    skills: [],
    technicalSkills: ["Java", "Spring Boot", "Docker"],
    softSkills: [],
    workExperience: [{ title: "Senior Java Developer", company: "Acme Corp", location: null, startDate: "2020-01", endDate: null, isCurrent: true, description: ["Built REST APIs."] }],
    education: [],
    certifications: [],
    projects: [{ name: "Inventory System", description: "Tracks stock", technologies: ["Kafka"], url: null }],
    achievements: [],
    languages: [],
    yearsOfExperience: 6,
    ...overrides,
  };
}

function baseJd(overrides: Partial<JobDescription> = {}): JobDescription {
  return {
    companyName: "TestCo",
    jobTitle: "Backend Engineer",
    experienceRequired: { minYears: 3, maxYears: null, raw: "3+ years" },
    educationRequired: [],
    skills: [],
    mandatorySkills: ["Kubernetes"],
    goodToHaveSkills: ["Terraform"],
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
    ...overrides,
  };
}

function baseReport(overrides: Partial<InterviewPreparationReport> = {}): InterviewPreparationReport {
  return {
    readinessScore: { overall: 70, resumeQuality: 70, jdMatch: 70, missingSkillsPenalty: 70, projectsScore: 70, experienceScore: 70, atsScore: 70, knowledgeBaseCoverage: 70 },
    technicalQuestions: [
      { question: "Explain your experience with Java.", difficulty: "Medium", topic: "Java", idealAnswer: { architecture: "", tradeoffs: "", bestPractices: "", performance: "", security: "" } },
    ],
    hrQuestions: [{ question: "Tell me about a time you led a team.", category: "Leadership", idealAnswer: { situation: "", task: "", action: "", result: "" } }],
    projectQuestions: [{ question: "Walk me through Inventory System.", projectName: "Inventory System", focus: "Architecture", idealAnswer: { situation: "", task: "", action: "", result: "" } }],
    systemDesignQuestions: [{ question: "Design a scalable queue.", difficulty: "Medium", idealAnswer: { architecture: "", tradeoffs: "", bestPractices: "", performance: "", security: "" } }],
    codingRecommendations: [{ topic: "Arrays", difficulty: "Easy", platforms: ["LeetCode"], practiceNote: "Practice." }],
    weaknessAnalysis: { weakAreas: [], missingSkills: [], knowledgeGaps: [], projectsToBuild: [], conceptsToLearn: [] },
    confidenceAnalysis: { strongAreas: [], weakAreas: [], highConfidenceTopics: [], lowConfidenceTopics: [] },
    learningRoadmap: [],
    cheatSheet: [{ technology: "Docker", points: ["docker build -t name .", "Multi-stage builds keep images small."] }],
    ...overrides,
  };
}

describe("computeInterviewCoverage — category coverage (§2/§3/§15.1/§15.8)", () => {
  it("a resume technology referenced by a generated question is covered", () => {
    const coverage = computeInterviewCoverage(baseResume(), baseJd(), baseReport());
    expect(coverage.resume.covered).toContain("Java");
  });

  it("a resume technology with no corresponding question is missing, never silently dropped", () => {
    const coverage = computeInterviewCoverage(baseResume(), baseJd(), baseReport());
    // "Spring Boot" and "Docker" are on the resume but no technicalQuestion/project touches them in this fixture.
    expect(coverage.resume.missing).toEqual(expect.arrayContaining(["Spring Boot", "Docker"]));
  });

  it("a resume technology used by a project that has its own project question counts as covered", () => {
    // "Kafka" is only a project technology, not a resume.technicalSkill directly — verify project-based coverage independently.
    const resume = baseResume({ technicalSkills: ["Java", "Kafka"] });
    const coverage = computeInterviewCoverage(resume, baseJd(), baseReport());
    expect(coverage.resume.covered).toContain("Kafka");
  });

  it("computes JD coverage from the JD's own mandatory/good-to-have skills, independent of the resume", () => {
    const coverage = computeInterviewCoverage(baseResume(), baseJd(), baseReport());
    // Neither "Kubernetes" (mandatory) nor "Terraform" (good-to-have) is addressed by any question in the fixture.
    expect(coverage.jd.missing).toEqual(expect.arrayContaining(["Kubernetes", "Terraform"]));
  });

  it("behavioral coverage reflects the real generated HR categories, not a fabricated full set", () => {
    const coverage = computeInterviewCoverage(baseResume(), baseJd(), baseReport());
    expect(coverage.behavioral.covered).toEqual(["Leadership"]);
    expect(coverage.behavioral.missing).toEqual(expect.arrayContaining(["Conflict Resolution", "Ownership", "Teamwork", "Communication", "Career Goals"]));
  });

  it("system design coverage reflects the real generated difficulty tiers", () => {
    const coverage = computeInterviewCoverage(baseResume(), baseJd(), baseReport());
    expect(coverage.systemDesign.covered).toEqual(["Medium"]);
    expect(coverage.systemDesign.missing).toEqual(expect.arrayContaining(["Easy", "Hard"]));
  });

  it("coding coverage is the deterministic recommendCodingTopics() output verbatim, with no fabricated 'missing' concept", () => {
    const coverage = computeInterviewCoverage(baseResume(), baseJd(), baseReport());
    expect(coverage.coding.covered).toEqual(["Arrays"]);
    expect(coverage.coding.missing).toEqual([]);
  });
});

describe("classifyTopic — deterministic priority + evidence (§4/§5/§15.2/§15.3/§15.6/§15.7)", () => {
  it("a mandatory JD skill is CRITICAL, with JD evidence", () => {
    const result = classifyTopic("Kubernetes", baseJd(), baseResume());
    expect(result.priority).toBe("CRITICAL");
    expect(result.evidenceSource).toBe("JD");
  });

  it("a core resume technology (not JD-required) is HIGH, with Resume evidence", () => {
    const result = classifyTopic("Docker", baseJd(), baseResume());
    expect(result.priority).toBe("HIGH");
    expect(result.evidenceSource).toBe("Resume");
  });

  it("a good-to-have JD skill (not on the resume) is MEDIUM, with JD evidence", () => {
    const result = classifyTopic("Terraform", baseJd(), baseResume());
    expect(result.priority).toBe("MEDIUM");
    expect(result.evidenceSource).toBe("JD");
  });

  it("a topic with no JD or resume evidence is LOW, with General (never fabricated) evidence", () => {
    const result = classifyTopic("Blockchain", baseJd(), baseResume());
    expect(result.priority).toBe("LOW");
    expect(result.evidenceSource).toBe("General");
  });

  it("never treats a JD-missing skill as candidate experience — a mandatory skill absent from the resume is still classified from JD evidence only, never claimed as Resume evidence", () => {
    // "Kubernetes" is mandatory but does NOT appear anywhere on the resume fixture.
    const resume = baseResume();
    expect(resume.technicalSkills).not.toContain("Kubernetes");
    expect([...resume.skills, ...resume.technicalSkills]).not.toContain("Kubernetes");

    const result = classifyTopic("Kubernetes", baseJd(), resume);
    expect(result.evidenceSource).toBe("JD");
    expect(result.reason).not.toMatch(/resume/i);
  });

  it("classification is deterministic — identical input always produces identical output", () => {
    const a = classifyTopic("Kubernetes", baseJd(), baseResume());
    const b = classifyTopic("Kubernetes", baseJd(), baseResume());
    expect(a).toEqual(b);
  });
});

describe("deduplicateQuestions — safe, conservative deduplication (§6/§15.4/§15.5)", () => {
  it("recognizes the milestone's own worked example as a near-duplicate (same topic, same core subject, different phrasing)", () => {
    const questions = [
      { question: "Explain your experience with Spring Boot.", topic: "Spring Boot" },
      { question: "Tell me about your Spring Boot experience.", topic: "Spring Boot" },
    ];

    const { kept, removed } = deduplicateQuestions(questions);
    expect(kept).toHaveLength(1);
    expect(removed).toHaveLength(1);
    expect(kept[0].question).toBe("Explain your experience with Spring Boot.");
  });

  it("removes exact-text duplicates outright", () => {
    const questions = [
      { question: "Explain your experience with Java.", topic: "Java" },
      { question: "explain your experience with java!", topic: "Java" },
    ];

    const { kept } = deduplicateQuestions(questions);
    expect(kept).toHaveLength(1);
  });

  it("never merges two genuinely different questions on the same topic (the Knowledge Base's own intentional 2-per-topic case)", () => {
    const questions = [
      { question: "Explain how HashMap resolves hash collisions internally.", topic: "Java" },
      { question: "What is the difference between ArrayList and LinkedList?", topic: "Java" },
    ];

    const { kept, removed } = deduplicateQuestions(questions);
    expect(kept).toHaveLength(2);
    expect(removed).toHaveLength(0);
  });

  it("never merges questions on different topics even if the phrasing is similar", () => {
    const questions = [
      { question: "Explain your experience with Spring Boot.", topic: "Spring Boot" },
      { question: "Explain your experience with Angular.", topic: "Angular" },
    ];

    const { kept, removed } = deduplicateQuestions(questions);
    expect(kept).toHaveLength(2);
    expect(removed).toHaveLength(0);
  });
});

describe("buildPreparationPlan — Must Prepare / High Priority / Recommended / Optional (§8/§10)", () => {
  it("sorts a mandatory, uncovered JD skill into the Must Prepare tier", () => {
    const coverage = computeInterviewCoverage(baseResume(), baseJd(), baseReport());
    const plan = buildPreparationPlan(baseResume(), baseJd(), baseReport(), coverage);

    const kubernetes = plan.find((item) => item.topic === "Kubernetes");
    expect(kubernetes?.tier).toBe("Must Prepare");
    expect(kubernetes?.priority).toBe("CRITICAL");
  });

  it("attaches the real generated question when the topic is already covered, never a fabricated one", () => {
    const coverage = computeInterviewCoverage(baseResume(), baseJd(), baseReport());
    const plan = buildPreparationPlan(baseResume(), baseJd(), baseReport(), coverage);

    const java = plan.find((item) => item.topic === "Java");
    expect(java?.question?.text).toBe("Explain your experience with Java.");
  });

  it("reuses real cheat-sheet reference content for an uncovered topic, never inventing study material", () => {
    const coverage = computeInterviewCoverage(baseResume(), baseJd(), baseReport());
    const plan = buildPreparationPlan(baseResume(), baseJd(), baseReport(), coverage);

    const docker = plan.find((item) => item.topic === "Docker");
    expect(docker?.question).toBeNull();
    expect(docker?.recommendedPreparation).toEqual(["docker build -t name .", "Multi-stage builds keep images small."]);
  });

  it("never says a candidate has experience with a skill that is missing from the resume", () => {
    const coverage = computeInterviewCoverage(baseResume(), baseJd(), baseReport());
    const plan = buildPreparationPlan(baseResume(), baseJd(), baseReport(), coverage);

    const kubernetes = plan.find((item) => item.topic === "Kubernetes");
    expect(kubernetes?.reason.toLowerCase()).not.toContain("you have");
    expect(kubernetes?.evidenceSource).toBe("JD");
  });

  it("sorts items by priority (CRITICAL first), deterministically", () => {
    const coverage = computeInterviewCoverage(baseResume(), baseJd(), baseReport());
    const plan = buildPreparationPlan(baseResume(), baseJd(), baseReport(), coverage);

    const priorities = plan.map((item) => item.priority);
    const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    for (let i = 1; i < priorities.length; i++) {
      expect(order[priorities[i - 1]]).toBeLessThanOrEqual(order[priorities[i]]);
    }
  });
});

describe("computeReadinessLabel — reuses the existing 60-point threshold, never a new one (Phase 17 Milestone 4, §2/§11/§15.9)", () => {
  it("uses exactly 60 — the same authoritative threshold Milestone 1 established", () => {
    expect(READINESS_LABEL_THRESHOLD).toBe(60);
  });

  it("labels a score at or above 60 as Ready for Interview", () => {
    expect(computeReadinessLabel(60)).toBe("Ready for Interview");
    expect(computeReadinessLabel(90)).toBe("Ready for Interview");
  });

  it("labels a score below 60 as Needs More Preparation", () => {
    expect(computeReadinessLabel(59)).toBe("Needs More Preparation");
    expect(computeReadinessLabel(0)).toBe("Needs More Preparation");
  });
});

describe("coverage percentages — never fabricated (Phase 17 Milestone 4, §4/§15.8)", () => {
  it("computes a real percentage when a category has covered+missing items", () => {
    expect(computeCategoryCoveragePercent({ covered: ["Java"], missing: ["Kubernetes"] })).toBe(50);
  });

  it("returns null (never an invented 0%/100%) for an empty category", () => {
    expect(computeCategoryCoveragePercent({ covered: [], missing: [] })).toBeNull();
  });

  it("computes an overall percentage across every category", () => {
    const coverage = computeInterviewCoverage(baseResume(), baseJd(), baseReport());
    const percent = computeOverallCoveragePercent(coverage);
    expect(percent).not.toBeNull();
    expect(percent).toBeGreaterThanOrEqual(0);
    expect(percent).toBeLessThanOrEqual(100);
  });
});

describe("buildRecommendedAction — deterministic sentence, never LLM-generated (§2/§15)", () => {
  it("names the critical topics when any exist", () => {
    const coverage = computeInterviewCoverage(baseResume(), baseJd(), baseReport());
    const plan = buildPreparationPlan(baseResume(), baseJd(), baseReport(), coverage);

    const action = buildRecommendedAction(plan);
    expect(action).toContain("Kubernetes");
    expect(action).toMatch(/^Prepare the \d+ critical question/);
  });

  it("falls back to a calm message when there are no critical or high-priority gaps", () => {
    const action = buildRecommendedAction([{ topic: "X", category: "technical", tier: "Recommended", priority: "MEDIUM", reason: "", evidenceSource: null, question: null, recommendedPreparation: [] }]);
    expect(action).toMatch(/Recommended and Optional/);
  });
});

describe("buildJdGapAnalysis — never claims resume experience that isn't there (§5/§10/§15.3)", () => {
  it("flags a mandatory JD skill absent from the resume as missingFromResume: true", () => {
    const gaps = buildJdGapAnalysis(baseResume(), baseJd(), computeInterviewCoverage(baseResume(), baseJd(), baseReport()), baseReport());
    const kubernetes = gaps.find((g) => g.skill === "Kubernetes");

    expect(kubernetes?.missingFromResume).toBe(true);
    expect(kubernetes?.priority).toBe("CRITICAL");
  });

  it("flags a JD skill actually present on the resume as missingFromResume: false", () => {
    const resume = baseResume({ technicalSkills: ["Java", "Spring Boot", "Docker", "Kubernetes"] });
    const gaps = buildJdGapAnalysis(resume, baseJd(), computeInterviewCoverage(resume, baseJd(), baseReport()), baseReport());
    const kubernetes = gaps.find((g) => g.skill === "Kubernetes");

    expect(kubernetes?.missingFromResume).toBe(false);
  });

  it("attaches real cheat-sheet preparation guidance only for genuinely uncovered gaps", () => {
    const report = baseReport({ cheatSheet: [{ technology: "Kubernetes", points: ["Pod = smallest deployable unit."] }] });
    const gaps = buildJdGapAnalysis(baseResume(), baseJd(), computeInterviewCoverage(baseResume(), baseJd(), report), report);
    const kubernetes = gaps.find((g) => g.skill === "Kubernetes");

    expect(kubernetes?.missingFromCoverage).toBe(true);
    expect(kubernetes?.recommendedPreparation).toEqual(["Pod = smallest deployable unit."]);
  });
});

describe("buildResumeEvidenceSummary — only real resume data, never fabricated (§6/§15.5)", () => {
  it("surfaces the current role, projects, technologies, and achievements verbatim", () => {
    const resume = baseResume({ achievements: ["Reduced latency by 40%."] });
    const evidence = buildResumeEvidenceSummary(resume);

    expect(evidence.currentRole).toBe("Senior Java Developer");
    expect(evidence.currentCompany).toBe("Acme Corp");
    expect(evidence.majorProjects).toEqual(["Inventory System"]);
    expect(evidence.achievements).toEqual(["Reduced latency by 40%."]);
  });

  it("detects a real leadership signal from work-experience bullet text, never an invented one", () => {
    const resume = baseResume({
      workExperience: [{ title: "Tech Lead", company: "Acme Corp", location: null, startDate: "2020-01", endDate: null, isCurrent: true, description: ["Led a team of 5 engineers."] }],
    });
    const evidence = buildResumeEvidenceSummary(resume);

    expect(evidence.leadershipSignals).toEqual(["Led a team of 5 engineers."]);
  });

  it("never invents a leadership signal when no leadership verb appears anywhere", () => {
    const resume = baseResume({
      workExperience: [{ title: "Developer", company: "Acme Corp", location: null, startDate: "2020-01", endDate: null, isCurrent: true, description: ["Wrote unit tests."] }],
    });
    const evidence = buildResumeEvidenceSummary(resume);

    expect(evidence.leadershipSignals).toEqual([]);
  });
});

describe("flattenQuestionsForBrowsing / buildStudyPlan — deterministic ordering, never fabricated timelines (§7/§10/§15.10)", () => {
  it("tags every question with a deterministic category/priority", () => {
    const questions = flattenQuestionsForBrowsing(baseResume(), baseJd(), baseReport());
    expect(questions.length).toBeGreaterThan(0);
    expect(questions.every((q) => ["technical", "resume", "jd", "behavioral", "systemDesign", "coding"].includes(q.category))).toBe(true);
  });

  it("study plan ordering is deterministic — identical input always produces identical step order", () => {
    const questionsA = flattenQuestionsForBrowsing(baseResume(), baseJd(), baseReport());
    const questionsB = flattenQuestionsForBrowsing(baseResume(), baseJd(), baseReport());

    expect(buildStudyPlan(questionsA).map((e) => e.topic)).toEqual(buildStudyPlan(questionsB).map((e) => e.topic));
  });

  it("uses Step N ordering, never a fabricated calendar date", () => {
    const questions = flattenQuestionsForBrowsing(baseResume(), baseJd(), baseReport());
    const plan = buildStudyPlan(questions);

    expect(plan.every((entry) => typeof entry.step === "number")).toBe(true);
    expect(plan.every((entry) => ["Today", "Next", "Later"].includes(entry.bucket))).toBe(true);
    expect(JSON.stringify(plan)).not.toMatch(/\d{4}-\d{2}-\d{2}/); // no calendar date anywhere
  });
});
