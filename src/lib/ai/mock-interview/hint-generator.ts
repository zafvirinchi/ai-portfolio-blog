import { openai } from "../openai";
import { JobDescription } from "../job-description/jd-schema";
import { Resume } from "../resume/resume-schema";
import { SessionQuestion } from "./session-schema";

const HINT_MODEL = "gpt-4o-mini";

// Practice-Mode-only (session-service.ts rejects this call outright in
// Interview Mode). Kept cheap — a single free-text completion, no
// structured-output schema needed for a one-line nudge — and deliberately
// never states the answer itself.

function buildHintMessages(question: SessionQuestion, resume: Resume, jd: JobDescription) {
  return [
    {
      role: "system" as const,
      content: `You give a SHORT hint (1-2 sentences) for an interview question — a
nudge in the right direction, never the answer itself. Point at what
concept, approach, or structure to think about; never state the
conclusion or a specific correct value/technology name that would let
the candidate skip the thinking. This is Practice Mode, where hints are
allowed, but a hint should still make the candidate do the work.`,
    },
    {
      role: "user" as const,
      content: `Question (${question.type}, topic: ${question.topic}): ${question.text}

Candidate skills: ${[...resume.skills, ...resume.technicalSkills].join(", ") || "unknown"}.
Target role: ${jd.jobTitle ?? "this role"}${jd.companyName ? ` at ${jd.companyName}` : ""}.`,
    },
  ];
}

export async function generateHint(question: SessionQuestion, resume: Resume, jd: JobDescription): Promise<string> {
  const completion = await openai.chat.completions.create({
    model: HINT_MODEL,
    temperature: 0.4,
    messages: buildHintMessages(question, resume, jd),
  });

  const hint = completion.choices[0]?.message?.content?.trim();

  if (!hint) {
    throw new Error("Mock interview hint generation returned no content");
  }

  return hint;
}
