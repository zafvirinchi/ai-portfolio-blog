import { JobDescription } from "../job-description/jd-schema";
import { Resume } from "../resume/resume-schema";
import { CheatSheetEntry, Difficulty, InterviewPreparationReport } from "./prep-schema";
import { deriveTechnicalTopics } from "./question-generator";

// Phase 17 Milestone 3 — a PURE, zero-LLM module (audited first, per
// Step 1: no coverage/priority/evidence/deduplication layer previously
// existed anywhere in interview-prep/*). Every function here reads
// already-computed data (Resume, JobDescription, JdMatchResult's
// matched/missing skills, and an already-generated
// InterviewPreparationReport) and derives metadata deterministically —
// no new Resume/JD type, no new scoring engine. Nothing here calls
// prepService.generate() again or mutates a PrepRecord — it is a
// read-only analysis layer over an already-generated report.
// normalizeQuestionText() below is a trivial (lowercase + strip
// non-alphanumeric + trim) one-liner, deliberately re-declared rather
// than imported from mock-interview/question-selector.ts's own
// normalizeQuestionKey() — interview-prep is a dependency OF
// mock-interview, never the reverse, and importing across that
// boundary for a one-line utility isn't worth inverting it. Not "a
// second keyword engine" (§3's actual concern) in any meaningful sense.

function normalizeQuestionText(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Exported (Phase 17 Milestone 5) so mock-interview/session-debrief.ts can
// match a mock-interview session question's own free-text `topic` field
// against this module's topics/plan/study-plan without re-declaring the
// same normalization — the allowed direction (mock-interview already
// depends on interview-prep, never the reverse; see session-service.ts's
// own imports), unlike M3's normalizeQuestionText, which stayed private
// specifically because THAT reuse would have gone the wrong direction.
export function normalizeTopic(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+\d+(\.\d+)*\+?$/, "");
}

function toNormalizedSet(values: string[]): Set<string> {
  return new Set(values.map(normalizeTopic).filter(Boolean));
}

// ---------------------------------------------------------------------------
// Step 3 — Coverage
// ---------------------------------------------------------------------------

export type CoverageCategory = "technical" | "resume" | "jd" | "behavioral" | "systemDesign" | "coding";

export interface CategoryCoverage {
  covered: string[];
  missing: string[];
}

export interface InterviewCoverage {
  technical: CategoryCoverage;
  resume: CategoryCoverage;
  jd: CategoryCoverage;
  behavioral: CategoryCoverage;
  systemDesign: CategoryCoverage;
  coding: CategoryCoverage;
}

/** The exact 6 categories hrQuestionItemSchema's own enum already defines (prep-schema.ts) — never a new category list. */
const HR_QUESTION_CATEGORIES = ["Leadership", "Conflict Resolution", "Ownership", "Teamwork", "Communication", "Career Goals"] as const;
const SYSTEM_DESIGN_DIFFICULTIES: Difficulty[] = ["Easy", "Medium", "Hard"];

export function computeInterviewCoverage(resume: Resume, jd: JobDescription, report: InterviewPreparationReport): InterviewCoverage {
  // Technical — deriveTechnicalTopics() is the SAME deterministic
  // derivation question-generator.ts itself already uses to decide what
  // needs a question at all; "missing" here means a topic that
  // pipeline itself identified as relevant but no generated question
  // (KB or LLM) ended up tagged with it — a genuine, real signal, not a
  // fabricated one.
  const technicalTopics = deriveTechnicalTopics(jd, resume);
  const technicalQuestionTopics = toNormalizedSet(report.technicalQuestions.map((q) => q.topic));
  const technical: CategoryCoverage = {
    covered: technicalTopics.filter((topic) => technicalQuestionTopics.has(normalizeTopic(topic))),
    missing: technicalTopics.filter((topic) => !technicalQuestionTopics.has(normalizeTopic(topic))),
  };

  // Resume — the resume's OWN explicitly-listed core technologies vs
  // what any generated question (technical, or a project question for
  // a project that lists this technology) actually touches. Every
  // project already gets its own question by construction
  // (question-generator.ts's "one per project, never invent one"
  // rule), so a resume technology used in a covered project counts as
  // covered via that project's question.
  const projectTechnologiesWithQuestions = new Set(
    report.projectQuestions.flatMap((q) => {
      const project = resume.projects.find((p) => p.name === q.projectName);
      return project ? project.technologies.map(normalizeTopic) : [];
    })
  );
  const resumeTechnologies = Array.from(new Set(resume.technicalSkills.map((s) => s.trim()).filter(Boolean)));
  const resumeCoverage: CategoryCoverage = {
    covered: resumeTechnologies.filter((skill) => technicalQuestionTopics.has(normalizeTopic(skill)) || projectTechnologiesWithQuestions.has(normalizeTopic(skill))),
    missing: resumeTechnologies.filter((skill) => !technicalQuestionTopics.has(normalizeTopic(skill)) && !projectTechnologiesWithQuestions.has(normalizeTopic(skill))),
  };

  // JD — the JD's own required/preferred skill list vs what's actually
  // addressed by a generated question topic. Deliberately does NOT
  // check the resume here (that distinction belongs to priority
  // classification / gap analysis below, never to "coverage" itself —
  // a JD requirement can be well-covered by a question regardless of
  // whether the candidate's resume happens to already have it).
  const jdSkills = Array.from(new Set([...jd.mandatorySkills, ...jd.goodToHaveSkills].map((s) => s.trim()).filter(Boolean)));
  const jdCoverage: CategoryCoverage = {
    covered: jdSkills.filter((skill) => technicalQuestionTopics.has(normalizeTopic(skill))),
    missing: jdSkills.filter((skill) => !technicalQuestionTopics.has(normalizeTopic(skill))),
  };

  // Behavioral — hrQuestionItemSchema's own fixed 6-category enum,
  // "exactly 6, one each" per question-generator.ts's own prompt intent
  // — missing only reflects the LLM genuinely under-delivering, never a
  // fabricated shortfall.
  const hrCategories = toNormalizedSet(report.hrQuestions.map((q) => q.category));
  const behavioral: CategoryCoverage = {
    covered: HR_QUESTION_CATEGORIES.filter((category) => hrCategories.has(normalizeTopic(category))),
    missing: HR_QUESTION_CATEGORIES.filter((category) => !hrCategories.has(normalizeTopic(category))),
  };

  // System Design — same "exactly 3, one per difficulty tier" prompt
  // intent; missing reflects the LLM under-delivering a tier.
  const systemDesignDifficulties = new Set(report.systemDesignQuestions.map((q) => q.difficulty));
  const systemDesign: CategoryCoverage = {
    covered: SYSTEM_DESIGN_DIFFICULTIES.filter((difficulty) => systemDesignDifficulties.has(difficulty)),
    missing: SYSTEM_DESIGN_DIFFICULTIES.filter((difficulty) => !systemDesignDifficulties.has(difficulty)),
  };

  // Coding — recommendCodingTopics() (question-generator.ts, unmodified)
  // is already a deterministic, complete-by-construction list for its
  // own scope (algorithmic topics, not JD/resume technologies) — there
  // is no genuine "missing" concept within that scope without
  // fabricating a distinction it was never designed to make.
  const coding: CategoryCoverage = {
    covered: report.codingRecommendations.map((c) => c.topic),
    missing: [],
  };

  return { technical, resume: resumeCoverage, jd: jdCoverage, behavioral, systemDesign, coding };
}

// ---------------------------------------------------------------------------
// Step 4/5 — Priority + Evidence
// ---------------------------------------------------------------------------

export type PriorityLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface TopicClassification {
  priority: PriorityLevel;
  reason: string;
  /** Never "fabricated" — null when the topic can't be traced to a specific resume/JD entry (e.g. a generic behavioral category). */
  evidenceSource: "JD" | "Resume" | "General" | null;
}

/**
 * Deterministic, evidence-only classification — never infers a
 * technology merely because it's common for the role (§4's explicit
 * caution). Mirrors this exact "mandatory > resume-evidenced > good-to-
 * have > generic" cascade for both priority (Step 4) and evidence
 * (Step 5), since both are answering the same underlying question —
 * "how strongly is this topic grounded in real JD/resume data" — from
 * two different presentations.
 */
export function classifyTopic(topic: string, jd: JobDescription, resume: Resume): TopicClassification {
  const normalized = normalizeTopic(topic);
  if (!normalized) {
    return { priority: "LOW", reason: "No specific topic to evaluate.", evidenceSource: null };
  }

  const isMandatory = jd.mandatorySkills.some((s) => normalizeTopic(s) === normalized);
  const isGoodToHave = jd.goodToHaveSkills.some((s) => normalizeTopic(s) === normalized);
  const isResumeSkill = [...resume.skills, ...resume.technicalSkills].some((s) => normalizeTopic(s) === normalized);

  if (isMandatory) {
    return {
      priority: "CRITICAL",
      reason: isResumeSkill ? "Mandatory JD requirement, also explicitly listed on the resume." : "Mandatory JD requirement.",
      evidenceSource: "JD",
    };
  }

  if (isResumeSkill) {
    return { priority: "HIGH", reason: "Core technology explicitly listed on the resume.", evidenceSource: "Resume" };
  }

  if (isGoodToHave) {
    return { priority: "MEDIUM", reason: "Good-to-have JD requirement.", evidenceSource: "JD" };
  }

  return { priority: "LOW", reason: "Not directly traced to a specific resume or JD entry.", evidenceSource: "General" };
}

// ---------------------------------------------------------------------------
// Step 6 — Deduplication
// ---------------------------------------------------------------------------

// A small, deliberately narrow set of common question-framing prefixes
// ("Explain your experience with X" / "Tell me about your X
// experience") — NOT general NLP/semantic similarity (explicitly
// forbidden, §6 — "Do NOT use an LLM for deduplication"), just the one
// concrete pattern the milestone's own example calls out. Two questions
// only ever collapse to the same "core subject" if they share BOTH this
// stripped text AND (via the caller) the same declared topic — the
// topic match is what prevents unrelated questions from merging.
const FRAME_PREFIXES = [
  /^(explain|describe|discuss|walk me through)\s+(your\s+)?/i,
  /^(tell me about|talk about)\s+(your\s+)?/i,
];

function coreQuestionSubject(text: string): string {
  let normalized = normalizeQuestionText(text);

  for (const pattern of FRAME_PREFIXES) {
    normalized = normalized.replace(pattern, "");
  }

  return normalized
    .replace(/\bexperience\b/g, "")
    .trim()
    .replace(/^(with|in|of|about)\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export interface DeduplicationResult<T> {
  kept: T[];
  removed: { item: T; duplicateOf: T }[];
}

/**
 * Removes exact-normalized-text duplicates outright, and same-topic
 * near-duplicates (matching "core subject" after stripping common
 * question-framing language) — deliberately conservative: two
 * questions on the SAME topic with genuinely different core subjects
 * (e.g. the Knowledge Base's own intentional up-to-2-questions-per-topic
 * allowance) are never merged, only ones that are actually near-
 * identical in substance.
 */
export function deduplicateQuestions<T extends { question: string; topic: string }>(questions: T[]): DeduplicationResult<T> {
  const kept: T[] = [];
  const removed: DeduplicationResult<T>["removed"] = [];
  const seenText = new Map<string, T>();
  const seenSubjectByTopic = new Map<string, T>();

  for (const item of questions) {
    const textKey = normalizeQuestionText(item.question);
    const subjectKey = `${normalizeTopic(item.topic)}::${coreQuestionSubject(item.question)}`;

    const textDuplicateOf = seenText.get(textKey);
    const subjectDuplicateOf = subjectKey.split("::")[1] ? seenSubjectByTopic.get(subjectKey) : undefined;
    const duplicateOf = textDuplicateOf ?? subjectDuplicateOf;

    if (duplicateOf) {
      removed.push({ item, duplicateOf });
      continue;
    }

    seenText.set(textKey, item);
    if (coreQuestionSubject(item.question)) seenSubjectByTopic.set(subjectKey, item);
    kept.push(item);
  }

  return { kept, removed };
}

// ---------------------------------------------------------------------------
// Step 8 — Personalized Preparation Plan
// ---------------------------------------------------------------------------

export type PreparationTier = "Must Prepare" | "High Priority" | "Recommended" | "Optional";

const TIER_BY_PRIORITY: Record<PriorityLevel, PreparationTier> = {
  CRITICAL: "Must Prepare",
  HIGH: "High Priority",
  MEDIUM: "Recommended",
  LOW: "Optional",
};

export interface PreparationPlanItem {
  topic: string;
  category: CoverageCategory;
  tier: PreparationTier;
  priority: PriorityLevel;
  reason: string;
  evidenceSource: "JD" | "Resume" | "General" | null;
  /** The real generated question that already addresses this topic, if any — never fabricated; null means it's a genuine gap. */
  question: { text: string; difficulty: string | null } | null;
  /** Real reference content only (study-plan.ts's existing buildCheatSheet() output) — [] when no curated reference exists for this topic, never invented. */
  recommendedPreparation: string[];
}

function findQuestionForTopic(topic: string, report: InterviewPreparationReport): { text: string; difficulty: string | null } | null {
  const normalized = normalizeTopic(topic);

  const technical = report.technicalQuestions.find((q) => normalizeTopic(q.topic) === normalized);
  if (technical) return { text: technical.question, difficulty: technical.difficulty };

  return null;
}

function cheatSheetPointsFor(topic: string, cheatSheet: CheatSheetEntry[]): string[] {
  const normalized = normalizeTopic(topic);
  const entry = cheatSheet.find((e) => normalizeTopic(e.technology) === normalized || normalized.includes(normalizeTopic(e.technology)));
  return entry?.points ?? [];
}

/**
 * Assembles the Must Prepare / High Priority / Recommended / Optional
 * plan (Step 8) from technical+JD+resume topics only — behavioral/
 * system-design/coding are already fully covered by construction
 * (§Step 2/3's own coverage computation confirms this in the common
 * case) and are surfaced separately via computeInterviewCoverage()
 * rather than duplicated into per-topic plan rows here.
 */
export function buildPreparationPlan(
  resume: Resume,
  jd: JobDescription,
  report: InterviewPreparationReport,
  coverage: InterviewCoverage
): PreparationPlanItem[] {
  const topics = new Set<string>([...coverage.technical.covered, ...coverage.technical.missing, ...coverage.jd.covered, ...coverage.jd.missing, ...coverage.resume.covered, ...coverage.resume.missing]);

  const items: PreparationPlanItem[] = Array.from(topics).map((topic) => {
    const classification = classifyTopic(topic, jd, resume);
    const question = findQuestionForTopic(topic, report);

    return {
      topic,
      category: coverage.jd.covered.includes(topic) || coverage.jd.missing.includes(topic) ? "jd" : "technical",
      tier: TIER_BY_PRIORITY[classification.priority],
      priority: classification.priority,
      reason: classification.reason,
      evidenceSource: classification.evidenceSource,
      question,
      recommendedPreparation: question ? [] : cheatSheetPointsFor(topic, report.cheatSheet),
    };
  });

  const PRIORITY_ORDER: Record<PriorityLevel, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  return items.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.topic.localeCompare(b.topic));
}

// ---------------------------------------------------------------------------
// Phase 17 Milestone 4, §2/§11 — Readiness label + coverage percentages.
// computeReadinessScore() (study-plan.ts, unmodified) remains the sole
// authoritative readiness algorithm — this only LABELS its existing
// output. 60 is not a new threshold: it mirrors candidate-interview.ts's
// existing READY_FOR_INTERVIEW_THRESHOLD (Phase 16 Milestone 8, itself
// mirroring candidateService.findReadyForInterview()'s own default),
// the one authoritative interview-readiness cutoff already established
// in this codebase. No second, more granular banding was invented.
// ---------------------------------------------------------------------------

export const READINESS_LABEL_THRESHOLD = 60;

export function computeReadinessLabel(overall: number): "Ready for Interview" | "Needs More Preparation" {
  return overall >= READINESS_LABEL_THRESHOLD ? "Ready for Interview" : "Needs More Preparation";
}

/**
 * Null (never a fabricated 0%/100%) when a category has no covered+
 * missing items to divide by — coding's `missing` is always `[]` by
 * design (see computeInterviewCoverage's own comment), so its
 * percentage is only meaningful when there's at least one recommended
 * topic to measure against.
 */
export function computeCategoryCoveragePercent(category: CategoryCoverage): number | null {
  const total = category.covered.length + category.missing.length;
  return total > 0 ? Math.round((category.covered.length / total) * 100) : null;
}

export function computeOverallCoveragePercent(coverage: InterviewCoverage): number | null {
  const categories = Object.values(coverage);
  const totalCovered = categories.reduce((sum, c) => sum + c.covered.length, 0);
  const totalItems = categories.reduce((sum, c) => sum + c.covered.length + c.missing.length, 0);
  return totalItems > 0 ? Math.round((totalCovered / totalItems) * 100) : null;
}

/**
 * One deterministic sentence, built from the plan's own already-sorted
 * output — never an LLM call, never a fabricated claim. Falls back to a
 * calm, honest message when there is nothing urgent to flag.
 */
export function buildRecommendedAction(plan: PreparationPlanItem[]): string {
  const critical = plan.filter((item) => item.priority === "CRITICAL");

  if (critical.length > 0) {
    const topics = critical.slice(0, 3).map((item) => item.topic);
    const topicList = topics.length > 1 ? `${topics.slice(0, -1).join(", ")} and ${topics[topics.length - 1]}` : topics[0];
    return `Prepare the ${critical.length} critical question${critical.length === 1 ? "" : "s"} related to ${topicList}.`;
  }

  const high = plan.filter((item) => item.priority === "HIGH");
  if (high.length > 0) {
    return `No critical gaps — focus next on the ${high.length} high-priority topic${high.length === 1 ? "" : "s"}.`;
  }

  return "No critical or high-priority gaps identified — review the Recommended and Optional sections to round out your preparation.";
}

// ---------------------------------------------------------------------------
// Phase 17 Milestone 4, §5 — JD Preparation Gaps panel. A focused view
// over the SAME classifyTopic()/coverage data the Preparation Plan
// already uses, scoped to JD skills only and explicit about the
// resume-presence question the plan's own evidenceSource already
// implies but doesn't spell out per-item.
// ---------------------------------------------------------------------------

export interface JdGapItem {
  skill: string;
  priority: PriorityLevel;
  /** True only when the skill is genuinely absent from resume.skills/technicalSkills — never inferred. */
  missingFromResume: boolean;
  /** True when no generated question addresses this skill yet. */
  missingFromCoverage: boolean;
  recommendedPreparation: string[];
}

export function buildJdGapAnalysis(resume: Resume, jd: JobDescription, coverage: InterviewCoverage, report: InterviewPreparationReport): JdGapItem[] {
  const jdSkills = Array.from(new Set([...jd.mandatorySkills, ...jd.goodToHaveSkills].map((s) => s.trim()).filter(Boolean)));
  const resumeSkillSet = toNormalizedSet([...resume.skills, ...resume.technicalSkills]);
  const coveredSet = toNormalizedSet(coverage.jd.covered);

  const items = jdSkills.map((skill) => {
    const classification = classifyTopic(skill, jd, resume);
    const missingFromCoverage = !coveredSet.has(normalizeTopic(skill));

    return {
      skill,
      priority: classification.priority,
      missingFromResume: !resumeSkillSet.has(normalizeTopic(skill)),
      missingFromCoverage,
      recommendedPreparation: missingFromCoverage ? cheatSheetPointsFor(skill, report.cheatSheet) : [],
    };
  });

  const PRIORITY_ORDER: Record<PriorityLevel, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  return items.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.skill.localeCompare(b.skill));
}

// ---------------------------------------------------------------------------
// Phase 17 Milestone 4, §6 — Resume Evidence panel. Every field is read
// directly off the Resume object already loaded server-side — no new
// resume parser, no LLM, no field ever shown that isn't genuinely
// present. "Leadership signals" reuses the same small, documented
// verb-matching heuristic candidate-score.ts's own leadershipFallback()
// already established as this codebase's precedent for "a resume-only
// fallback heuristic, never an LLM guess" — re-declared locally rather
// than imported (interview-prep has no dependency on the recruiter
// package, and never should for one heuristic).
// ---------------------------------------------------------------------------

const LEADERSHIP_VERBS = ["led", "managed", "mentored", "supervised", "directed", "coordinated", "spearheaded", "founded"];

export interface ResumeEvidenceSummary {
  currentRole: string | null;
  currentCompany: string | null;
  majorProjects: string[];
  technologies: string[];
  achievements: string[];
  leadershipSignals: string[];
}

export function buildResumeEvidenceSummary(resume: Resume): ResumeEvidenceSummary {
  const currentJob = resume.workExperience.find((job) => job.isCurrent) ?? resume.workExperience[0] ?? null;

  const leadershipSignals = resume.workExperience
    .flatMap((job) => job.description)
    .filter((line) => LEADERSHIP_VERBS.some((verb) => new RegExp(`\\b${verb}\\b`, "i").test(line)));

  return {
    currentRole: currentJob?.title ?? null,
    currentCompany: currentJob?.company ?? null,
    majorProjects: resume.projects.map((p) => p.name),
    technologies: [...resume.skills, ...resume.technicalSkills],
    achievements: resume.achievements,
    leadershipSignals,
  };
}

// ---------------------------------------------------------------------------
// Phase 17 Milestone 4, §7/§8/§10 — a flattened, filterable/searchable
// view over every generated question (technical + HR + project + system
// design), each tagged with the SAME deterministic priority/evidence
// classifyTopic() already computes, plus a stable studyOrder for the
// Study Plan presentation (§10) — CRITICAL/HIGH topics first, mirroring
// the Preparation Plan's own ordering, never a fabricated timeline.
// ---------------------------------------------------------------------------

export interface BrowsableQuestion {
  id: string;
  question: string;
  category: CoverageCategory;
  topic: string;
  difficulty: string | null;
  priority: PriorityLevel;
  evidenceSource: "JD" | "Resume" | "General" | null;
  reason: string;
  studyOrder: number;
}

export function flattenQuestionsForBrowsing(resume: Resume, jd: JobDescription, report: InterviewPreparationReport): BrowsableQuestion[] {
  const rows: Omit<BrowsableQuestion, "studyOrder">[] = [];

  report.technicalQuestions.forEach((q, index) => {
    const classification = classifyTopic(q.topic, jd, resume);
    rows.push({ id: `technical-${index}`, question: q.question, category: "technical", topic: q.topic, difficulty: q.difficulty, ...classification });
  });

  report.hrQuestions.forEach((q, index) => {
    rows.push({
      id: `hr-${index}`,
      question: q.question,
      category: "behavioral",
      topic: q.category,
      difficulty: null,
      priority: "MEDIUM",
      evidenceSource: null,
      reason: "Standard behavioral interview category — not tied to specific resume/JD evidence.",
    });
  });

  report.projectQuestions.forEach((q, index) => {
    rows.push({
      id: `project-${index}`,
      question: q.question,
      category: "resume",
      topic: q.projectName,
      difficulty: null,
      priority: "HIGH",
      evidenceSource: "Resume",
      reason: "Real project from your resume.",
    });
  });

  report.systemDesignQuestions.forEach((q, index) => {
    rows.push({
      id: `system-design-${index}`,
      question: q.question,
      category: "systemDesign",
      topic: "System Design",
      difficulty: q.difficulty,
      priority: "MEDIUM",
      evidenceSource: null,
      reason: "Standard system design topic for this role.",
    });
  });

  const PRIORITY_ORDER: Record<PriorityLevel, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  const sorted = [...rows].sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.topic.localeCompare(b.topic));

  return sorted.map((row, index) => ({ ...row, studyOrder: index + 1 }));
}

// ---------------------------------------------------------------------------
// Phase 17 Milestone 4, §10 — Study Plan. Deterministic tiers ("Step N",
// never a fabricated calendar date) derived purely from studyOrder.
// ---------------------------------------------------------------------------

export type StudyPlanBucket = "Today" | "Next" | "Later";

export interface StudyPlanEntry {
  step: number;
  bucket: StudyPlanBucket;
  topic: string;
  question: string;
  priority: PriorityLevel;
}

const TODAY_BUCKET_SIZE = 3;
const NEXT_BUCKET_SIZE = 2;

export function buildStudyPlan(questions: BrowsableQuestion[]): StudyPlanEntry[] {
  return [...questions]
    .sort((a, b) => a.studyOrder - b.studyOrder)
    .map((q, index) => ({
      step: index + 1,
      bucket: index < TODAY_BUCKET_SIZE ? "Today" : index < TODAY_BUCKET_SIZE + NEXT_BUCKET_SIZE ? "Next" : "Later",
      topic: q.topic,
      question: q.question,
      priority: q.priority,
    }));
}
