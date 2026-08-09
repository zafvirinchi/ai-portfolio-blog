import { openai } from "../openai";
import { summarizeResumeForPrompt } from "../resume/resume-analyzer";
import { SAFETY_RULES_PROMPT } from "./validator";
import { LinkedinGenerationContext } from "./linkedin-types";
import { BANNER_JSON_SCHEMA, BRANDING_PLATFORMS, BannerLlmOutput, BrandingPlatform, bannerLlmOutputSchema } from "./linkedin-schema";

const MODEL = "gpt-4o-mini";
const TEMPERATURE = 0.3;

// Owns both the literal "banner" tagline concept and the spec's
// "Personal Branding" bios section — no separate branding file exists
// in this milestone's 15-file budget, and both are short, platform-
// flavored positioning text generated from the same context.

const PLATFORM_GUIDANCE: Record<BrandingPlatform, string> = {
  Professional: "A general professional bio suitable for a conference speaker page or company team page.",
  Conference: "Third person, 2-3 sentences, suitable for a conference program listing.",
  Medium: "First person, warmer, suitable for a Medium author profile.",
  GitHub: "Short and technical, suitable for a GitHub profile bio field.",
  Portfolio: "First person, suitable for a personal portfolio site's About/hero section.",
  TwitterX: "Under 160 characters, suitable for a Twitter/X bio field.",
};

function buildMessages(ctx: LinkedinGenerationContext, correction?: string) {
  return [
    {
      role: "system" as const,
      content: `You write a LinkedIn banner tagline and personal-branding bios for a
candidate targeting "${ctx.targetRole}"${ctx.industry ? ` in the ${ctx.industry} industry` : ""}.

${SAFETY_RULES_PROMPT}

"tagline": a short (under 100 characters) line suitable for overlaying
on a LinkedIn banner image — a positioning statement, not a repeat of
the headline.

"bios": one bio per platform, each following its own convention:
${BRANDING_PLATFORMS.map((platform) => `- "${platform}": ${PLATFORM_GUIDANCE[platform]}`).join("\n")}${
        correction ? `\n\nYour previous attempt was rejected for these reasons — fix them:\n${correction}` : ""
      }`,
    },
    {
      role: "user" as const,
      content: `Candidate resume:\n\n${summarizeResumeForPrompt(ctx.resume)}`,
    },
  ];
}

export async function generateBanner(ctx: LinkedinGenerationContext, correction?: string): Promise<BannerLlmOutput> {
  const completion = await openai.chat.completions.create({
    model: MODEL,
    temperature: TEMPERATURE,
    messages: buildMessages(ctx, correction),
    response_format: {
      type: "json_schema",
      json_schema: BANNER_JSON_SCHEMA,
    },
  });

  const raw = completion.choices[0]?.message?.content;

  if (!raw) {
    throw new Error("LinkedIn banner generation LLM returned no content");
  }

  const parsed = bannerLlmOutputSchema.safeParse(JSON.parse(raw));

  if (!parsed.success) {
    throw new Error(`LinkedIn banner generation failed schema validation: ${parsed.error.message}`);
  }

  return parsed.data;
}
