import { randomUUID } from "node:crypto";

import { openai } from "../openai";
import { coverTechnicalTopicsFromKb, deriveTechnicalTopics } from "../interview-prep/question-generator";
import { PrepRecord } from "../interview-prep/prep-types";
import { JobDescription } from "../job-description/jd-schema";
import { ProjectEntry, Resume } from "../resume/resume-schema";
import {
  Difficulty,
  FALLBACK_QUESTION_JSON_SCHEMA,
  InterviewType,
  MockQuestionSource,
  SessionQuestion,
  fallbackQuestionSchema,
} from "./session-schema";
import { SessionRecord } from "./session-types";

const QUESTION_MODEL = "gpt-4o-mini";

// Topics scanned per stage before giving up and moving to the next
// priority source — bounds how many KB round-trips one question
// selection can trigger (each Knowledge Base check below is a real DB
// query via the read-only, protected searchInterviewQuestions()).
const MAX_TOPICS_PER_STAGE = 6;

const HR_TOPICS = ["Leadership", "Conflict Resolution", "Ownership", "Teamwork", "Communication", "Career Goals"];
const ARCHITECTURE_TOPICS = ["System Design", "Scalability", "Architecture Trade-offs", "Microservices"];
const CODING_TOPICS = ["Arrays", "Strings", "Trees", "Graphs", "Dynamic Programming", "Concurrency"];

export function normalizeQuestionKey(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function matchesDifficulty(candidate: string, preferred: Difficulty | null): boolean {
  return preferred === null || candidate === preferred;
}

/** The spec's own example topic pool, adapted per interview type — reuses Milestone 3's deriveTechnicalTopics() (read-only) for anything tech-flavored rather than re-deriving JD/resume skill topics from scratch. */
function topicPoolForType(type: InterviewType, jd: JobDescription, resume: Resume): string[] {
  switch (type) {
    case "HR":
    case "Behavioral":
    case "Leadership":
      return HR_TOPICS;
    case "System Design":
    case "Architecture":
      return [...ARCHITECTURE_TOPICS, ...deriveTechnicalTopics(jd, resume).slice(0, 4)];
    case "Coding Discussion":
      return CODING_TOPICS;
    case "Project Deep Dive":
      return resume.projects.map((project) => project.name);
    case "Technical":
      return deriveTechnicalTopics(jd, resume);
    case "Mixed":
      return [
        ...deriveTechnicalTopics(jd, resume),
        ...HR_TOPICS.slice(0, 2),
        ...ARCHITECTURE_TOPICS.slice(0, 1),
        ...resume.projects.slice(0, 2).map((project) => project.name),
      ];
  }
}

// ---------------------------------------------------------------------------
// Stage 1 — Knowledge Base (highest priority, per spec).
// ---------------------------------------------------------------------------

async function tryKnowledgeBase(
  pool: string[],
  type: InterviewType,
  difficulty: Difficulty | null,
  askedKeys: Set<string>
): Promise<SessionQuestion | null> {
  for (const topic of pool.slice(0, MAX_TOPICS_PER_STAGE)) {
    const { covered } = await coverTechnicalTopicsFromKb([topic]);

    for (const { kbQuestions } of covered) {
      for (const kb of kbQuestions) {
        const key = normalizeQuestionKey(kb.question);
        if (askedKeys.has(key)) continue;
        if (!matchesDifficulty(kb.difficulty, difficulty)) continue;

        return {
          id: randomUUID(),
          text: kb.question,
          type,
          difficulty: kb.difficulty as Difficulty,
          source: "knowledge-base",
          topic: kb.topic,
        };
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Stage 2 — Previous Interview Preparation (the spec's own named input —
// reuses Milestone 3's already-generated, already-answered question bank
// at zero additional LLM cost).
// ---------------------------------------------------------------------------

interface PrepCandidate {
  text: string;
  difficulty: Difficulty;
  topic: string;
}

function prepCandidatesForType(prepRecord: PrepRecord, type: InterviewType): PrepCandidate[] {
  const { report } = prepRecord;

  const technical: PrepCandidate[] = report.technicalQuestions.map((q) => ({
    text: q.question,
    difficulty: q.difficulty as Difficulty,
    topic: q.topic,
  }));
  const hr: PrepCandidate[] = report.hrQuestions.map((q) => ({
    text: q.question,
    difficulty: "Medium",
    topic: q.category,
  }));
  const project: PrepCandidate[] = report.projectQuestions.map((q) => ({
    text: q.question,
    difficulty: "Medium",
    topic: q.projectName,
  }));
  const systemDesign: PrepCandidate[] = report.systemDesignQuestions.map((q) => ({
    text: q.question,
    difficulty: q.difficulty,
    topic: "System Design",
  }));

  switch (type) {
    case "Technical":
      return technical;
    case "HR":
    case "Behavioral":
    case "Leadership":
      return hr;
    case "Project Deep Dive":
      return project;
    case "System Design":
    case "Architecture":
      return systemDesign;
    case "Coding Discussion":
      return [];
    case "Mixed":
      return [...technical, ...hr, ...project, ...systemDesign];
  }
}

function tryPrepReport(
  prepRecord: PrepRecord,
  type: InterviewType,
  difficulty: Difficulty | null,
  askedKeys: Set<string>
): SessionQuestion | null {
  for (const candidate of prepCandidatesForType(prepRecord, type)) {
    const key = normalizeQuestionKey(candidate.text);
    if (askedKeys.has(key)) continue;
    if (!matchesDifficulty(candidate.difficulty, difficulty)) continue;

    return {
      id: randomUUID(),
      text: candidate.text,
      type,
      difficulty: candidate.difficulty,
      source: "prep",
      topic: candidate.topic,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Stage 3 — Resume Projects.
// ---------------------------------------------------------------------------

const PROJECT_QUESTION_TEMPLATES: ((name: string) => string)[] = [
  (name) => `Walk me through the architecture of ${name} — how did you design it and why?`,
  (name) => `What was the hardest technical challenge you faced building ${name}, and how did you solve it?`,
  (name) => `If you had to scale ${name} to ten times its current usage, what would you change?`,
  (name) => `What trade-offs did you make while building ${name}, and would you make the same choices again?`,
];

function buildProjectQuestion(
  project: ProjectEntry,
  type: InterviewType,
  difficulty: Difficulty,
  askedKeys: Set<string>
): SessionQuestion | null {
  for (const template of PROJECT_QUESTION_TEMPLATES) {
    const text = template(project.name);
    const key = normalizeQuestionKey(text);

    if (!askedKeys.has(key)) {
      return { id: randomUUID(), text, type, difficulty, source: "resume", topic: project.name };
    }
  }

  return null;
}

function tryResumeProjects(
  resume: Resume,
  type: InterviewType,
  difficulty: Difficulty,
  askedKeys: Set<string>
): SessionQuestion | null {
  for (const project of resume.projects) {
    const question = buildProjectQuestion(project, type, difficulty, askedKeys);
    if (question) return question;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Stage 4 — JD-driven deterministic templates (technical topics) / curated
// behavioral & coding prompts. Still no LLM call — just topic-filled text.
// ---------------------------------------------------------------------------

function jdTemplateQuestion(topic: string, jd: JobDescription, type: InterviewType, difficulty: Difficulty): SessionQuestion {
  let text: string;

  if (HR_TOPICS.includes(topic)) {
    text = `Tell me about a time that best demonstrates your ${topic.toLowerCase()}.`;
  } else if (CODING_TOPICS.includes(topic)) {
    text = `Let's talk through an approach — how would you tackle a problem involving ${topic}? Walk me through your thinking on data structures and complexity.`;
  } else {
    const role = jd.jobTitle ? ` for a ${jd.jobTitle} role` : "";
    text = `This position${role} calls for ${topic} — walk me through your hands-on experience with it and a specific problem you solved using it.`;
  }

  return { id: randomUUID(), text, type, difficulty, source: "jd", topic };
}

function tryJdTemplate(
  pool: string[],
  jd: JobDescription,
  type: InterviewType,
  difficulty: Difficulty,
  askedKeys: Set<string>
): SessionQuestion | null {
  for (const topic of pool) {
    const question = jdTemplateQuestion(topic, jd, type, difficulty);
    const key = normalizeQuestionKey(question.text);

    if (!askedKeys.has(key)) return question;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Stage 5 — LLM fallback, only once every free source above is exhausted
// for this type/difficulty.
// ---------------------------------------------------------------------------

function buildFallbackMessages(session: SessionRecord, type: InterviewType, resume: Resume, jd: JobDescription, difficulty: Difficulty) {
  return [
    {
      role: "system" as const,
      content: `Generate exactly one new ${type} interview question at ${difficulty} difficulty for
a candidate interviewing for ${jd.jobTitle ?? "this role"}${jd.companyName ? ` at ${jd.companyName}` : ""}.

It must be meaningfully different from every question already asked this
session: ${session.questions.map((q) => q.text).join(" | ") || "none yet"}.

Return only the question text and a short topic label — never include an
answer, hint, or evaluation criteria in your response.`,
    },
    {
      role: "user" as const,
      content: `Candidate skills: ${[...resume.skills, ...resume.technicalSkills].join(", ") || "unknown"}.
JD key skills: ${[...jd.programmingLanguages, ...jd.frameworks, ...jd.cloud].join(", ") || "unknown"}.`,
    },
  ];
}

async function generateFallbackQuestion(
  session: SessionRecord,
  type: InterviewType,
  resume: Resume,
  jd: JobDescription,
  difficulty: Difficulty
): Promise<SessionQuestion> {
  const completion = await openai.chat.completions.create({
    model: QUESTION_MODEL,
    temperature: 0.5,
    messages: buildFallbackMessages(session, type, resume, jd, difficulty),
    response_format: {
      type: "json_schema",
      json_schema: FALLBACK_QUESTION_JSON_SCHEMA,
    },
  });

  const raw = completion.choices[0]?.message?.content;

  if (!raw) {
    throw new Error("Mock interview fallback question generation returned no content");
  }

  const parsed = fallbackQuestionSchema.parse(JSON.parse(raw));

  return {
    id: randomUUID(),
    text: parsed.question,
    type,
    difficulty,
    source: "ai-generated" as MockQuestionSource,
    topic: parsed.topic,
  };
}

// ---------------------------------------------------------------------------
// Public entry point. For a "Mixed" session, each individual question is
// resolved to a concrete sub-type (rotated) rather than literally carrying
// type "Mixed" — this matters downstream: evaluation-agent.ts's dimension
// selection and score-engine.ts's category attribution both key off the
// question's own type, and a real "Mixed" per-question type would either
// over-score every answer on all 12 dimensions or make category
// attribution meaningless.
// ---------------------------------------------------------------------------

const MIXED_ROTATION: InterviewType[] = [
  "Technical",
  "HR",
  "Project Deep Dive",
  "System Design",
  "Coding Discussion",
  "Behavioral",
  "Leadership",
];

export async function selectNextQuestion(
  session: SessionRecord,
  resume: Resume,
  jd: JobDescription,
  prepRecord?: PrepRecord
): Promise<SessionQuestion> {
  const type: InterviewType =
    session.interviewType === "Mixed" ? MIXED_ROTATION[session.questions.length % MIXED_ROTATION.length] : session.interviewType;
  const askedKeys = new Set(session.askedQuestionKeys);
  const difficulty: Difficulty = session.preferredDifficulty ?? "Medium";
  const pool = topicPoolForType(type, jd, resume);

  if (type === "Project Deep Dive") {
    const question = tryResumeProjects(resume, type, difficulty, askedKeys);
    if (question) return question;
  }

  const fromKb = await tryKnowledgeBase(pool, type, session.preferredDifficulty, askedKeys);
  if (fromKb) return fromKb;

  if (prepRecord) {
    const fromPrep = tryPrepReport(prepRecord, type, session.preferredDifficulty, askedKeys);
    if (fromPrep) return fromPrep;
  }

  const fromJd = tryJdTemplate(pool, jd, type, difficulty, askedKeys);
  if (fromJd) return fromJd;

  return generateFallbackQuestion(session, type, resume, jd, difficulty);
}
