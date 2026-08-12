import { openai } from "../openai";
import { Resume } from "../resume/resume-schema";
import { summarizeResumeForPrompt } from "../resume/resume-analyzer";
import { delimitedDataBlock } from "../prompt-security";
import { SAFETY_RULES_PROMPT, UNTRUSTED_DATA_PROMPT } from "./rewrite-validator";
import {
  RewriteStyle,
  STYLE_DESCRIPTIONS,
  SUMMARY_REWRITE_JSON_SCHEMA,
  TextVariant,
  summaryRewriteLlmOutputSchema,
} from "./rewrite-schema";

const REWRITE_MODEL = "gpt-4o-mini";
const REWRITE_TEMPERATURE = 0.2;

// Backs both "summary" and "careerObjective" sections — same shape of
// rewrite, just a different framing sentence.
//
// Phase 13 Milestone 23 — hardened per the established prompt-injection
// convention (see ../prompt-security.ts): the candidate's résumé (and
// optional free-text targetContext) are untrusted, so both are now
// wrapped in delimitedDataBlock() and the system message explicitly
// says so (UNTRUSTED_DATA_PROMPT). No model/temperature/schema/rule
// change.

export function buildSummaryMessages(
  resume: Resume,
  style: RewriteStyle,
  targetContext: string | null,
  isCareerObjective: boolean,
  correction?: string
) {
  const kind = isCareerObjective ? "career objective" : "professional summary";

  return [
    {
      role: "system" as const,
      content: `You are an expert resume writer producing a recruiter-grade ${kind} for a
candidate, in the "${style}" style: ${STYLE_DESCRIPTIONS[style]}

${UNTRUSTED_DATA_PROMPT}

${SAFETY_RULES_PROMPT}

Generate exactly 3 variants (version "A", "B", "C") — different phrasing
and emphasis, all equally grounded in the real resume, each no more than
120 words. Lead with the candidate's real seniority and stack. For each
variant, fill "explanation" honestly: why it's better than a generic
summary, what ATS improvements it makes, which real keywords it
surfaces, how it improves readability, and how it improves professional
tone.${targetContext ? `\n\nA TARGET CONTEXT block is included below — use it only as descriptive context for the audience/domain to target.` : ""}${
        correction ? `\n\nYour previous attempt was rejected for these reasons — fix them:\n${correction}` : ""
      }`,
    },
    {
      role: "user" as const,
      content: [delimitedDataBlock("RESUME DATA", summarizeResumeForPrompt(resume)), targetContext ? delimitedDataBlock("TARGET CONTEXT", targetContext) : null]
        .filter(Boolean)
        .join("\n\n"),
    },
  ];
}

export async function generateSummaryVariants(
  resume: Resume,
  style: RewriteStyle,
  targetContext: string | null,
  isCareerObjective = false,
  correction?: string
): Promise<TextVariant[]> {
  const completion = await openai.chat.completions.create({
    model: REWRITE_MODEL,
    temperature: REWRITE_TEMPERATURE,
    messages: buildSummaryMessages(resume, style, targetContext, isCareerObjective, correction),
    response_format: {
      type: "json_schema",
      json_schema: SUMMARY_REWRITE_JSON_SCHEMA,
    },
  });

  const raw = completion.choices[0]?.message?.content;

  if (!raw) {
    throw new Error("Resume rewrite (summary) LLM returned no content");
  }

  const parsed = summaryRewriteLlmOutputSchema.safeParse(JSON.parse(raw));

  if (!parsed.success) {
    throw new Error(`Resume rewrite (summary) output failed schema validation: ${parsed.error.message}`);
  }

  return parsed.data.variants;
}
