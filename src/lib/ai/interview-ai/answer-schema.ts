import { z } from "zod";

// OpenAI Structured Outputs schema for enterprise answer generation — same
// split pattern as planner/planner-schema.ts and resume/resume-schema.ts:
// a Zod schema for runtime validation, plus a hand-written mirror JSON
// Schema for OpenAI's strict json_schema mode (which only supports a
// constrained subset of JSON Schema, so the two are kept independent
// rather than derived).

export const DIFFICULTY_LEVELS = ["Easy", "Medium", "Hard", "Expert"] as const;

export const EXPERIENCE_LEVELS = ["Fresher", "1-3 Years", "3-5 Years", "5-8 Years", "8+ Years"] as const;

export const answerOutputSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
  shortAnswer: z.string().min(1),
  // "" when the question/category has no natural code example (e.g. a
  // behavioral or purely conceptual question) — never invented.
  codeExample: z.string(),
  difficulty: z.enum(DIFFICULTY_LEVELS),
  experienceLevel: z.enum(EXPERIENCE_LEVELS),
  importantConcepts: z.array(z.string()).default([]),
  commonMistakes: z.array(z.string()).default([]),
  followUpQuestions: z.array(z.string()).default([]),
  bestPractices: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
});

export type AnswerOutput = z.infer<typeof answerOutputSchema>;

export const ANSWER_JSON_SCHEMA: {
  name: string;
  strict: true;
  schema: Record<string, unknown>;
} = {
  name: "interview_answer_output",
  strict: true,
  schema: {
    type: "object",
    properties: {
      question: { type: "string" },
      answer: { type: "string" },
      shortAnswer: { type: "string" },
      codeExample: { type: "string" },
      difficulty: { type: "string", enum: [...DIFFICULTY_LEVELS] },
      experienceLevel: { type: "string", enum: [...EXPERIENCE_LEVELS] },
      importantConcepts: { type: "array", items: { type: "string" } },
      commonMistakes: { type: "array", items: { type: "string" } },
      followUpQuestions: { type: "array", items: { type: "string" } },
      bestPractices: { type: "array", items: { type: "string" } },
      tags: { type: "array", items: { type: "string" } },
      confidence: { type: "number" },
    },
    required: [
      "question",
      "answer",
      "shortAnswer",
      "codeExample",
      "difficulty",
      "experienceLevel",
      "importantConcepts",
      "commonMistakes",
      "followUpQuestions",
      "bestPractices",
      "tags",
      "confidence",
    ],
    additionalProperties: false,
  },
};
