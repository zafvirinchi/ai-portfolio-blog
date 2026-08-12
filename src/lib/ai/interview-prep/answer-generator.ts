import { z } from "zod";

import { openai } from "../openai";
import { delimitedDataBlock } from "../prompt-security";
import { Resume } from "../resume/resume-schema";
import { JobDescription } from "../job-description/jd-schema";
import { IDEAL_ANSWER_JSON_SCHEMA, IdealAnswerResult, starAnswerSchema, technicalAnswerSchema } from "./prep-schema";

const ANSWER_MODEL = "gpt-4o-mini";

// Standalone, single-question generator — not called during initial
// report generation (question-generator.ts's bulk call already includes
// answers). Exists for on-demand regeneration: the chat "explain the
// ideal answer" flow (Section 13) and a UI "regenerate" affordance.

const llmResponseSchema = z.object({
  format: z.enum(["technical", "star"]),
  technical: technicalAnswerSchema.nullable(),
  star: starAnswerSchema.nullable(),
});

// Phase 17 Milestone 1, §5 — resume/JD content wrapped in the existing
// delimitedDataBlock() helper, matching question-generator.ts's own
// sibling fix in this same package.
export function buildAnswerMessages(question: string, resume: Resume, jd: JobDescription) {
  const resumeBlock = delimitedDataBlock(
    "RESUME DATA",
    `Years of experience: ${resume.yearsOfExperience ?? "unknown"}\nWork experience: ${resume.workExperience
      .map((job) => `${job.title} at ${job.company}`)
      .join("; ")}\nProjects: ${resume.projects.map((project) => project.name).join(", ")}`
  );
  const jdBlock = delimitedDataBlock("JOB DESCRIPTION DATA", `${jd.jobTitle ?? "role"} at ${jd.companyName ?? "company"}`);

  return [
    {
      role: "system" as const,
      content: `You produce one ideal interview answer for a single question, for a
candidate preparing for a specific job.

Decide "format" yourself: "technical" (architecture/tradeoffs/best
practices/performance/security) for a technical or system-design
question; "star" (situation/task/action/result) for a behavioral,
project, or HR-style question. Fill only the matching field ("technical"
or "star") with real content; set the other to null.

CRITICAL: you do not know this candidate's real personal history. NEVER
write a "star" field as a first-person narrative claiming a specific
event occurred — that is fabrication even if it sounds plausible and even
if it references a real employer name. Write every "star" field as
INSTRUCTIONAL COACHING addressed TO the candidate in second person,
telling them what to think about and how to structure their own answer.

WRONG (fabricated — never do this): "During my time at TechNova Inc., we
faced a tight deadline for a critical project that required
collaboration across multiple teams."

RIGHT (coaching guidance): "Think of a specific project from your time as
[title] at [company] that involved real deadline pressure or cross-team
coordination — briefly note what made it challenging before describing
your response."

For a "technical" answer, give genuine, accurate engineering guidance for
the topic — this is general knowledge, not a claim about the candidate.`,
    },
    {
      role: "user" as const,
      content: `Question: ${question}\n\n${resumeBlock}\n\n${jdBlock}`,
    },
  ];
}

export async function generateIdealAnswer(question: string, resume: Resume, jd: JobDescription): Promise<IdealAnswerResult> {
  const completion = await openai.chat.completions.create({
    model: ANSWER_MODEL,
    temperature: 0.4,
    messages: buildAnswerMessages(question, resume, jd),
    response_format: {
      type: "json_schema",
      json_schema: IDEAL_ANSWER_JSON_SCHEMA,
    },
  });

  const raw = completion.choices[0]?.message?.content;

  if (!raw) {
    throw new Error("Interview prep answer generation LLM returned no content");
  }

  const parsed = llmResponseSchema.safeParse(JSON.parse(raw));

  if (!parsed.success) {
    throw new Error(`Interview prep answer generation failed schema validation: ${parsed.error.message}`);
  }

  if (parsed.data.format === "technical" && parsed.data.technical) {
    return { format: "technical", answer: parsed.data.technical };
  }

  if (parsed.data.format === "star" && parsed.data.star) {
    return { format: "star", answer: parsed.data.star };
  }

  throw new Error("Interview prep answer generation returned a format/content mismatch");
}
