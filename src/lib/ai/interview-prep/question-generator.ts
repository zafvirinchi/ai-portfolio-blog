import { openai } from "../openai";
import { searchInterviewQuestions } from "../interview-chat/interview-search";
import { InterviewCandidate } from "../interview-chat/interview-types";
import { Resume } from "../resume/resume-schema";
import { JobDescription } from "../job-description/jd-schema";
import {
  CodingRecommendation,
  Difficulty,
  GENERATED_QUESTIONS_JSON_SCHEMA,
  GeneratedQuestions,
  KnowledgeBaseQuestion,
  generatedQuestionsSchema,
} from "./prep-schema";

const QUESTION_MODEL = "gpt-4o-mini";

// A topic is considered "covered by the Knowledge Base" once it has this
// many real candidate matches — below that, it's treated as needing
// AI-generated questions instead. This is what makes "KB first" real:
// a well-covered topic (e.g. "Java" if the interview DB has plenty of
// imported Java questions) never touches the LLM call at all.
const KB_SUFFICIENT_THRESHOLD = 3;
const KB_QUESTIONS_PER_TOPIC = 2;
const MAX_TOPICS = 8;

function normalizeDifficulty(level: string): Difficulty {
  const lower = level.toLowerCase();
  if (/(easy|beginner|junior|basic)/.test(lower)) return "Easy";
  if (/(hard|advanced|senior|expert)/.test(lower)) return "Hard";
  return "Medium";
}

// job-description/jd-parser.ts (protected — not modified by this
// milestone) has no case-insensitive dedup safety net of its own, unlike
// the newer job/job-parser.ts — real testing showed a JD's
// programmingLanguages coming back as ["java", "JAVA", "Java 17"], three
// separate entries for one technology. Normalizing here (case-insensitive
// + strip trailing version numbers, same pattern job-description/
// keyword-engine.ts already uses) is this milestone's own fix, applied to
// its own topic list rather than the protected parser's output.
function normalizeTopicKey(topic: string): string {
  return topic
    .trim()
    .toLowerCase()
    .replace(/\s+\d+(\.\d+)*\+?$/, "");
}

/** The spec's own example topic list, filtered to what's actually present in this JD/resume. */
export function deriveTechnicalTopics(jd: JobDescription, resume: Resume): string[] {
  const seen = new Map<string, string>();

  const addTopic = (raw: string) => {
    const key = normalizeTopicKey(raw);
    if (!key || seen.has(key)) return;
    seen.set(key, raw.trim());
  };

  for (const skill of [
    ...jd.programmingLanguages,
    ...jd.frameworks,
    ...jd.cloud,
    ...jd.databases,
    ...jd.tools,
    ...jd.aiSkills,
  ]) {
    addTopic(skill);
  }

  if (seen.size === 0) {
    // No categorized JD skills at all — fall back to the resume's own
    // technical skills so there's still something to prepare on.
    for (const skill of resume.technicalSkills.slice(0, 5)) {
      addTopic(skill);
    }
  }

  const hasMicroservicesSignal =
    jd.responsibilities.some((r) => /microservice/i.test(r)) ||
    resume.workExperience.some((job) => job.description.some((d) => /microservice/i.test(d)));

  if (hasMicroservicesSignal) addTopic("Microservices");
  if ((resume.yearsOfExperience ?? 0) >= 3) addTopic("System Design");

  return Array.from(seen.values()).slice(0, MAX_TOPICS);
}

export interface TopicCoverage {
  topic: string;
  kbQuestions: KnowledgeBaseQuestion[];
}

/**
 * searchInterviewQuestions() does a broad `ilike` keyword search (by
 * design, per interview-chat/interview-search.ts) — real testing showed
 * it returning candidates with no genuine connection to the topic (e.g.
 * a TypeScript/tsconfig question surfacing for the topic "java"). Since
 * that search function is protected/unmodified, this re-checks its
 * results against the topic locally before trusting them as "real KB
 * coverage" — a false-positive here should fall through to AI generation
 * (still correct, just less efficient), not surface an irrelevant
 * question as if it were a good match.
 */
// Substring containment alone isn't safe here — "java" is literally a
// substring of "javascript" (confirmed by real testing: JavaScript-
// tagged questions surfaced as "Java" matches). Requires whole-word
// boundaries so a topic can't match inside an unrelated longer word.
function containsWholeTerm(haystack: string, term: string): boolean {
  if (!term) return false;

  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(^|[^a-z0-9+#.])${escaped}([^a-z0-9+#.]|$)`, "i");

  return pattern.test(haystack);
}

function candidateIsRelevantToTopic(candidate: InterviewCandidate, topic: string): boolean {
  const normalizedTopic = normalizeTopicKey(topic);
  if (!normalizedTopic) return false;

  // Deliberately excludes topicTitle/categoryTitle: real testing found a
  // KB row literally titled "Java" whose question was "What is
  // TypeScript?" — a data-quality issue in the interview_questions table
  // itself (Interview Extraction is protected, so this can't be fixed at
  // the source). Those shared category labels are exactly where a batch
  // mis-tagging shows up; the question text and tags are specific to one
  // row and a far more reliable signal. A false negative here just falls
  // through to AI generation (always correct, just less KB reuse) — a
  // false positive would surface a wrong answer, which is worse.
  const haystack = [candidate.question, ...candidate.tags].join(" ").toLowerCase();

  return containsWholeTerm(haystack, normalizedTopic);
}

/**
 * Searches the existing Interview Knowledge Base for each candidate
 * topic (read-only reuse of interview-chat/interview-search.ts — no new
 * tables, no changes to Interview Extraction). Topics with enough real,
 * topic-relevant matches are satisfied entirely from the KB; the rest are
 * returned as `uncoveredTopics` for the one LLM call to fill in.
 */
export async function coverTechnicalTopicsFromKb(
  topics: string[]
): Promise<{ covered: TopicCoverage[]; uncoveredTopics: string[] }> {
  const covered: TopicCoverage[] = [];
  const uncoveredTopics: string[] = [];

  for (const topic of topics) {
    const searchResults: InterviewCandidate[] = await searchInterviewQuestions(topic);
    const candidates = searchResults.filter((candidate) => candidateIsRelevantToTopic(candidate, topic));

    if (candidates.length >= KB_SUFFICIENT_THRESHOLD) {
      const kbQuestions: KnowledgeBaseQuestion[] = candidates.slice(0, KB_QUESTIONS_PER_TOPIC).map((candidate) => ({
        question: candidate.question,
        answer: candidate.answer,
        difficulty: normalizeDifficulty(candidate.level),
        topic,
        category: candidate.categoryTitle,
        source: "knowledge-base" as const,
      }));

      covered.push({ topic, kbQuestions });
    } else {
      uncoveredTopics.push(topic);
    }
  }

  return { covered, uncoveredTopics };
}

function buildQuestionGenerationMessages(resume: Resume, jd: JobDescription, uncoveredTopics: string[]) {
  const projectNames = resume.projects.slice(0, 4).map((project) => project.name);

  return [
    {
      role: "system" as const,
      content: `You generate a personalized interview-preparation question set for a
candidate, based on their real resume and a specific job description.

CRITICAL SAFETY RULE for behavioral/project "idealAnswer" (STAR format):
you do NOT know what actually happened to this candidate. NEVER write a
STAR field as a first-person narrative claiming a specific event
occurred — that is fabrication, even if it sounds plausible and even if
it references a real employer name. Every STAR field must be written as
INSTRUCTIONAL COACHING addressed TO the candidate in second person,
telling them what to think about and how to structure their own answer —
never narrating what "happened" as if you witnessed it.

WRONG (fabricated — never do this): "During my time at TechNova Inc., we
faced a tight deadline for a critical project that required
collaboration across multiple teams."

RIGHT (coaching guidance): "Think of a specific project from your time as
[title] at [company] that involved real deadline pressure or cross-team
coordination — briefly note what made it challenging before describing
your response."

Apply this same real-employer/role/project-referencing coaching voice to
every "situation"/"task"/"action"/"result" field — reference the
resume's real company/role/project names to make the guidance concrete,
but never claim to know what specifically happened there.

For technical/system-design "idealAnswer" (architecture/tradeoffs/best
practices/performance/security), give genuine, accurate technical
guidance for the topic — this is general engineering knowledge, not a
claim about the candidate specifically, so be thorough and correct.

SECTIONS:
- "technicalQuestions": generate questions ONLY for these topics (the
  Knowledge Base already has enough real questions for every other
  relevant topic, so only these need new ones): ${
    uncoveredTopics.join(", ") || "none — skip this section, return an empty array"
  }. Up to 6 total, spread across Easy/Medium/Hard.
- "hrQuestions": exactly 6, one each for these categories: Leadership,
  Conflict Resolution, Ownership, Teamwork, Communication, Career Goals.
- "projectQuestions": one per project, for these real projects only (never
  invent a project not listed): ${projectNames.join(", ") || "none — the candidate has no listed projects, return an empty array"}.
  Each should ask about one of: Architecture, Challenges, Design
  Decisions, Scaling, Security, Deployment, Trade-offs — vary the focus
  across projects rather than repeating the same angle.
- "systemDesignQuestions": exactly 3 — one Easy, one Medium, one Hard —
  relevant to this JD's domain and the technologies it names.`,
    },
    {
      role: "user" as const,
      content: `Candidate resume (summary):\nName: ${resume.contact.name ?? "Unknown"}\nYears of experience: ${
        resume.yearsOfExperience ?? "unknown"
      }\nSkills: ${[...resume.skills, ...resume.technicalSkills].join(", ")}\nWork experience: ${resume.workExperience
        .map((job) => `${job.title} at ${job.company}`)
        .join("; ")}\nProjects: ${resume.projects
        .map((project) => `${project.name} (${project.technologies.join(", ")})`)
        .join("; ")}\n\n---\n\nJob description (${jd.jobTitle ?? "role"} at ${
        jd.companyName ?? "company"
      }):\n${JSON.stringify(jd, null, 2)}`,
    },
  ];
}

/**
 * The one generative call in this package — AI-generated technical
 * questions (only for KB-short topics) plus all HR/project/system-design
 * questions, each with its ideal answer included in the same response.
 */
export async function generateQuestionsAndAnswers(
  resume: Resume,
  jd: JobDescription,
  uncoveredTopics: string[]
): Promise<GeneratedQuestions> {
  const completion = await openai.chat.completions.create({
    model: QUESTION_MODEL,
    temperature: 0.4,
    messages: buildQuestionGenerationMessages(resume, jd, uncoveredTopics),
    response_format: {
      type: "json_schema",
      json_schema: GENERATED_QUESTIONS_JSON_SCHEMA,
    },
  });

  const raw = completion.choices[0]?.message?.content;

  if (!raw) {
    throw new Error("Interview prep question generation LLM returned no content");
  }

  const parsed = generatedQuestionsSchema.safeParse(JSON.parse(raw));

  if (!parsed.success) {
    throw new Error(`Interview prep question generation failed schema validation: ${parsed.error.message}`);
  }

  return parsed.data;
}

// ---------------------------------------------------------------------------
// Coding practice recommendations — deterministic, topic/platform/
// difficulty guidance only. Never a specific problem name or URL: this
// codebase has no LeetCode/HackerRank API to verify a real problem exists,
// so naming one would be a fabrication risk, same discipline as every
// other generative section in this arc.
// ---------------------------------------------------------------------------

const CORE_CODING_TOPICS: { topic: string; difficulty: Difficulty }[] = [
  { topic: "Arrays", difficulty: "Easy" },
  { topic: "Strings", difficulty: "Easy" },
  { topic: "Trees", difficulty: "Medium" },
  { topic: "Graphs", difficulty: "Medium" },
  { topic: "Dynamic Programming", difficulty: "Hard" },
];

const SENIOR_CODING_TOPICS: { topic: string; difficulty: Difficulty }[] = [
  { topic: "System Design", difficulty: "Hard" },
  { topic: "Concurrency", difficulty: "Hard" },
];

export function recommendCodingTopics(jd: JobDescription, resume: Resume): CodingRecommendation[] {
  const isSenior =
    (resume.yearsOfExperience ?? 0) >= 5 ||
    /senior|lead|principal|architect|staff/i.test(jd.jobTitle ?? "") ||
    /senior|lead|principal|architect|staff/i.test(resume.workExperience[0]?.title ?? "");

  const topics = isSenior ? [...CORE_CODING_TOPICS, ...SENIOR_CODING_TOPICS] : CORE_CODING_TOPICS;

  return topics.map(({ topic, difficulty }) => ({
    topic,
    difficulty,
    platforms: ["LeetCode", "HackerRank"],
    practiceNote: `Practice ${topic} problems at the ${difficulty} tier — filter by tag on either platform rather than a single named problem, since coverage varies over time.`,
  }));
}
