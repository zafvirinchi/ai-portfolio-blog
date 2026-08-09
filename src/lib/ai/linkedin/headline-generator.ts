import { openai } from "../openai";
import { summarizeResumeForPrompt } from "../resume/resume-analyzer";
import { SAFETY_RULES_PROMPT } from "./validator";
import { LinkedinGenerationContext } from "./linkedin-types";
import { HEADLINE_JSON_SCHEMA, HeadlineStyle, HeadlineVariant, headlineLlmOutputSchema } from "./linkedin-schema";

const HEADLINE_MODEL = "gpt-4o-mini";
const HEADLINE_TEMPERATURE = 0.3;

const STYLE_DESCRIPTIONS: Record<HeadlineStyle, string> = {
  Professional: "Clear, polished, and neutral — broadly appropriate corporate tone.",
  Recruiter: "Keyword-dense and scannable, optimized for LinkedIn search and a recruiter's fast first read.",
  Executive: "Concise and outcome-led, written for a senior audience.",
  Technical: "Precise and detail-forward, naming real technologies plainly.",
  Startup: "Energetic and direct, emphasizes range and ownership.",
  FAANG: "Direct, metrics-forward, action-verb-led — the terse style big tech profiles favor.",
  Consulting: "Structured around value delivered, client/stakeholder-facing framing.",
};

function buildMessages(ctx: LinkedinGenerationContext, style: HeadlineStyle, correction?: string) {
  return [
    {
      role: "system" as const,
      content: `You write a LinkedIn headline (max 220 characters — LinkedIn's own
field limit) for a candidate targeting "${ctx.targetRole}"${
        ctx.industry ? ` in the ${ctx.industry} industry` : ""
      }, in the "${style}" style: ${STYLE_DESCRIPTIONS[style]}

${SAFETY_RULES_PROMPT}

${
        ctx.careerGoal ? `The candidate's stated career goal: ${ctx.careerGoal}\n\n` : ""
      }Return "text" (the headline itself, under 220 characters) and
"explanation" — why it's effective, and which real keywords from the
resume it surfaces.${correction ? `\n\nYour previous attempt was rejected for these reasons — fix them:\n${correction}` : ""}`,
    },
    {
      role: "user" as const,
      content: `Candidate resume:\n\n${summarizeResumeForPrompt(ctx.resume)}${
        ctx.rewriteRecord?.sections.summary
          ? `\n\nAccepted rewritten summary: ${ctx.rewriteRecord.sections.summary.current.join(" ")}`
          : ""
      }`,
    },
  ];
}

export async function generateHeadline(
  ctx: LinkedinGenerationContext,
  style: HeadlineStyle,
  correction?: string
): Promise<HeadlineVariant> {
  const completion = await openai.chat.completions.create({
    model: HEADLINE_MODEL,
    temperature: HEADLINE_TEMPERATURE,
    messages: buildMessages(ctx, style, correction),
    response_format: {
      type: "json_schema",
      json_schema: HEADLINE_JSON_SCHEMA,
    },
  });

  const raw = completion.choices[0]?.message?.content;

  if (!raw) {
    throw new Error("LinkedIn headline generation LLM returned no content");
  }

  const parsed = headlineLlmOutputSchema.safeParse(JSON.parse(raw));

  if (!parsed.success) {
    throw new Error(`LinkedIn headline generation failed schema validation: ${parsed.error.message}`);
  }

  return { style, ...parsed.data };
}
