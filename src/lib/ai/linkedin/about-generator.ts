import { openai } from "../openai";
import { summarizeResumeForPrompt } from "../resume/resume-analyzer";
import { SAFETY_RULES_PROMPT } from "./validator";
import { LinkedinGenerationContext } from "./linkedin-types";
import { ABOUT_JSON_SCHEMA, ABOUT_MAX_CHARACTERS, AboutStyle, aboutLlmOutputSchema } from "./linkedin-schema";

const ABOUT_MODEL = "gpt-4o-mini";
const ABOUT_TEMPERATURE = 0.3;

const STORY_DESCRIPTIONS: Record<AboutStyle, string> = {
  Professional: "A well-rounded professional narrative — background, strengths, and what you're looking for next.",
  Technical: "Leads with technical depth — real technologies, systems, and problems solved.",
  Leadership: "Emphasizes ownership, mentorship, and cross-team impact wherever the resume genuinely supports it.",
  RecruiterFriendly: "Scannable and keyword-forward — short paragraphs, easy for a recruiter to skim in seconds.",
};

function buildMessages(ctx: LinkedinGenerationContext, storyType: AboutStyle, correction?: string) {
  return [
    {
      role: "system" as const,
      content: `You write a LinkedIn "About" section for a candidate targeting
"${ctx.targetRole}"${ctx.industry ? ` in the ${ctx.industry} industry` : ""}, as a ${storyType} story:
${STORY_DESCRIPTIONS[storyType]}

${SAFETY_RULES_PROMPT}

HARD LIMIT: "text" must be ${ABOUT_MAX_CHARACTERS} characters or fewer —
LinkedIn's own About section limit. Write in first person, 2-4 short
paragraphs.${ctx.careerGoal ? ` Weave in this stated career goal naturally: ${ctx.careerGoal}` : ""}${
        correction ? `\n\nYour previous attempt was rejected for these reasons — fix them:\n${correction}` : ""
      }`,
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

export async function generateAbout(
  ctx: LinkedinGenerationContext,
  storyType: AboutStyle,
  correction?: string
): Promise<{ text: string; characterCount: number }> {
  const completion = await openai.chat.completions.create({
    model: ABOUT_MODEL,
    temperature: ABOUT_TEMPERATURE,
    messages: buildMessages(ctx, storyType, correction),
    response_format: {
      type: "json_schema",
      json_schema: ABOUT_JSON_SCHEMA,
    },
  });

  const raw = completion.choices[0]?.message?.content;

  if (!raw) {
    throw new Error("LinkedIn About generation LLM returned no content");
  }

  const parsed = aboutLlmOutputSchema.safeParse(JSON.parse(raw));

  if (!parsed.success) {
    throw new Error(`LinkedIn About generation failed schema validation: ${parsed.error.message}`);
  }

  return { text: parsed.data.text, characterCount: parsed.data.text.length };
}
