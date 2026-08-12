import { openai } from "../openai";
import { JobDescription } from "../job-description/jd-schema";
import { delimitedDataBlock } from "../prompt-security";
import { Resume } from "../resume/resume-schema";
import { ANSWER_EVALUATION_JSON_SCHEMA, AnswerEvaluationRaw, DIMENSIONS_BY_TYPE, SessionQuestion, answerEvaluationRawSchema } from "./session-schema";

const EVALUATION_MODEL = "gpt-4o-mini";

// The one real per-turn LLM call. Raw interaction only — building the
// prompt and parsing the response — mirrors answer-generator.ts's role in
// interview-prep. answer-evaluator.ts composes this into the final,
// scored AnswerEvaluation.

// Phase 17 Milestone 1, §5 — the candidate's own live-typed answer is the
// single most attacker-influenceable input anywhere in this package (a
// resume/JD requires an upload; this is free text typed in real time),
// yet was the one piece of content with NO untrusted-data boundary at
// all before this milestone. Wrapped in the same delimitedDataBlock()
// (../prompt-security.ts) 20+ other generative call sites across this
// codebase already use — no second delimiter implementation, and no
// change to the model/temperature/schema/scoring logic itself.
export function buildEvaluationMessages(question: SessionQuestion, answerText: string, resume: Resume, jd: JobDescription) {
  const relevantDimensions = DIMENSIONS_BY_TYPE[question.type];
  const answerBlock = delimitedDataBlock("CANDIDATE ANSWER DATA", answerText.trim() || "(no answer given)");
  const resumeBlock = delimitedDataBlock(
    "RESUME DATA",
    `Years of experience: ${resume.yearsOfExperience ?? "unknown"}, skills: ${[...resume.skills, ...resume.technicalSkills].join(", ") || "unknown"}.`
  );
  const jdBlock = delimitedDataBlock("JOB DESCRIPTION DATA", `${jd.jobTitle ?? "this role"}${jd.companyName ? ` at ${jd.companyName}` : ""}.`);

  return [
    {
      role: "system" as const,
      content: `You are a real technical interviewer scoring a candidate's spoken
answer to one interview question. Be honest and specific — this is
real feedback, not encouragement for its own sake.

Only score these dimensions for this question (a "${question.type}"
question): ${relevantDimensions.join(", ")}. Set every other dimension
to null — do not invent a score for a dimension that doesn't apply here.

Every dimension you DO score must be an integer from 0 to 100 (NOT a
0-5 or 0-10 scale) — 0 means completely wrong/absent, 50 is mediocre/
partially correct, 100 is excellent/complete. A genuinely strong,
correct, complete answer should score in the 80-100 range on the
dimensions it satisfies; a vague or shallow answer with real
substance might score 30-60; only score below 20 if the answer is
truly wrong, empty, or off-topic. Do not default to a low number out
of caution — score what the answer actually demonstrates.

Decide "followUpNeeded": true if the answer is vague, name-drops a
technology or decision without justifying it, or leaves an obvious "why"
unanswered — and if so, write a short, natural "followUpQuestion" a real
interviewer would ask next. Example: the candidate says "I used Spring
Boot" with no reasoning — a good follow-up is "Why Spring Boot instead
of Quarkus?". If the answer is already thorough, set followUpNeeded to
false and followUpQuestion to null.

CRITICAL SAFETY RULE for "betterAnswer"/"idealAnswer" when this is a
Behavioral/HR/Leadership/Project question: you do not know what actually
happened to this candidate. Never write these fields as a first-person
narrative claiming a specific event occurred — that is fabrication, even
if it sounds plausible. Write them as INSTRUCTIONAL COACHING addressed TO
the candidate in second person, describing the structure and content a
strong answer would have.

WRONG (fabricated — never do this): "At my last job, I resolved a conflict
between two engineers by scheduling a 1:1 with each of them."

RIGHT (coaching guidance): "A strong answer names a specific real
disagreement, explains the concrete steps you took to resolve it, and
ends with what changed as a result — structure your answer around a
single real example rather than speaking in generalities."

For Technical/System Design/Coding Discussion/Architecture questions,
"betterAnswer"/"idealAnswer" should be genuine, accurate technical
guidance — this is general engineering knowledge, not a claim about the
candidate, so be thorough and correct.

Every "strengths"/"weaknesses"/"missingConcepts"/"improvementTips" entry
should be specific to what the candidate actually said, not generic
boilerplate.`,
    },
    {
      role: "user" as const,
      content: `Question (${question.type}, ${question.difficulty}, topic: ${question.topic}): ${question.text}

${answerBlock}

${resumeBlock}

${jdBlock}`,
    },
  ];
}

export async function evaluateAnswerRaw(
  question: SessionQuestion,
  answerText: string,
  resume: Resume,
  jd: JobDescription
): Promise<AnswerEvaluationRaw> {
  const completion = await openai.chat.completions.create({
    model: EVALUATION_MODEL,
    temperature: 0.3,
    messages: buildEvaluationMessages(question, answerText, resume, jd),
    response_format: {
      type: "json_schema",
      json_schema: ANSWER_EVALUATION_JSON_SCHEMA,
    },
  });

  const raw = completion.choices[0]?.message?.content;

  if (!raw) {
    throw new Error("Mock interview answer evaluation LLM returned no content");
  }

  const parsed = answerEvaluationRawSchema.safeParse(JSON.parse(raw));

  if (!parsed.success) {
    throw new Error(`Mock interview answer evaluation failed schema validation: ${parsed.error.message}`);
  }

  return parsed.data;
}
