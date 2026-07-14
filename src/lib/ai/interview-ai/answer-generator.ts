import { openai } from "../openai";
// import type — see answer-types.ts for why this matters across the
// interview <-> interview-ai boundary.
import type { InterviewQuestion } from "../interview";
import { buildAnswerMessages } from "./answer-prompts";
import { ANSWER_JSON_SCHEMA, answerOutputSchema, type AnswerOutput } from "./answer-schema";

const ANSWER_MODEL = "gpt-4o-mini";

/**
 * Generates one enterprise-quality answer for a single interview question
 * via OpenAI Structured Outputs — the same raw-SDK-client + strict
 * json_schema + Zod-validation pattern used by PlannerService
 * (planner/planner-service.ts) and ResumeAnalyzer
 * (resume/resume-analyzer.ts). Reuses the existing shared `openai` client
 * (lib/ai/openai.ts) — no new client is created.
 *
 * Pure with respect to module state: every call is independent, nothing
 * is cached or shared between calls.
 */
export async function generateAnswer(question: InterviewQuestion): Promise<AnswerOutput> {
  const completion = await openai.chat.completions.create({
    model: ANSWER_MODEL,
    temperature: 0,
    messages: buildAnswerMessages(question),
    response_format: {
      type: "json_schema",
      json_schema: ANSWER_JSON_SCHEMA,
    },
  });

  const raw = completion.choices[0]?.message?.content;

  if (!raw) {
    throw new Error("Answer generation LLM returned no content");
  }

  const parsed = answerOutputSchema.safeParse(JSON.parse(raw));

  if (!parsed.success) {
    throw new Error(`Answer generation output failed schema validation: ${parsed.error.message}`);
  }

  return parsed.data;
}
