import { openai } from "../openai";
import { summarizeResumeForPrompt } from "../resume/resume-analyzer";
import { SAFETY_RULES_PROMPT } from "./validator";
import { LinkedinGenerationContext } from "./linkedin-types";
import { RECOMMENDATIONS_JSON_SCHEMA, RECOMMENDATION_MESSAGE_TYPES, RecommendationMessage, recommendationsLlmOutputSchema } from "./linkedin-schema";

const MODEL = "gpt-4o-mini";
const TEMPERATURE = 0.3;

function buildMessages(ctx: LinkedinGenerationContext, correction?: string) {
  return [
    {
      role: "system" as const,
      content: `You write short LinkedIn networking/recruiter messages for a candidate
targeting "${ctx.targetRole}"${ctx.industry ? ` in the ${ctx.industry} industry` : ""}.

${SAFETY_RULES_PROMPT}

Generate all ${RECOMMENDATION_MESSAGE_TYPES.length} message types together:
- "Connection Request": under 300 characters, a genuine specific reason to connect, no job pitch yet.
- "Recruiter Outreach": addressed to a recruiter, direct, references the target role.
- "Hiring Manager Outreach": addressed to a hiring manager, slightly warmer, references genuine fit.
- "Follow-up Message": sent after an initial conversation or application, brief.
- "Thank-you Message": sent after an interview or call, brief and specific.
- "Referral Request": asks a connection for a referral, respectful and low-pressure, never presumes they will say yes.

Each message must be short and reference only real resume content —
never invent a mutual connection, referrer, or shared background. Use
placeholders like [Name] or [Recruiter's Name] where a real name isn't known.${
        correction ? `\n\nYour previous attempt was rejected for these reasons — fix them:\n${correction}` : ""
      }`,
    },
    {
      role: "user" as const,
      content: `Candidate resume:\n\n${summarizeResumeForPrompt(ctx.resume)}`,
    },
  ];
}

export async function generateRecommendationMessages(
  ctx: LinkedinGenerationContext,
  correction?: string
): Promise<RecommendationMessage[]> {
  const completion = await openai.chat.completions.create({
    model: MODEL,
    temperature: TEMPERATURE,
    messages: buildMessages(ctx, correction),
    response_format: {
      type: "json_schema",
      json_schema: RECOMMENDATIONS_JSON_SCHEMA,
    },
  });

  const raw = completion.choices[0]?.message?.content;

  if (!raw) {
    throw new Error("LinkedIn recommendation message generation LLM returned no content");
  }

  const parsed = recommendationsLlmOutputSchema.safeParse(JSON.parse(raw));

  if (!parsed.success) {
    throw new Error(`LinkedIn recommendation message generation failed schema validation: ${parsed.error.message}`);
  }

  return parsed.data.messages;
}
