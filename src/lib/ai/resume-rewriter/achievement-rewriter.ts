import { openai } from "../openai";
import { Resume } from "../resume/resume-schema";
import { SAFETY_RULES_PROMPT } from "./rewrite-validator";
import {
  ACHIEVEMENT_REWRITE_JSON_SCHEMA,
  RewriteStyle,
  STYLE_DESCRIPTIONS,
  TextItemRewrite,
  achievementRewriteLlmOutputSchema,
} from "./rewrite-schema";

const REWRITE_MODEL = "gpt-4o-mini";
const REWRITE_TEMPERATURE = 0.2;

const ACHIEVEMENT_EXAMPLE = `EXAMPLE (structure to follow, never literal content to copy in):
Old: "Responsible for migration."
Better: "Successfully contributed to enterprise modernization initiatives
involving legacy system transformation and cloud-ready architecture
adoption."

CRITICAL: never invent a measurable metric that isn't already stated —
if the original achievement has no number, strengthen the language
qualitatively instead of adding one.`;

function buildMessages(resume: Resume, style: RewriteStyle, targetContext: string | null, correction?: string) {
  const achievementCount = resume.achievements.length;

  return [
    {
      role: "system" as const,
      content: `You rewrite resume achievements in the "${style}" style: ${STYLE_DESCRIPTIONS[style]}

${SAFETY_RULES_PROMPT}

${ACHIEVEMENT_EXAMPLE}

There are EXACTLY ${achievementCount} achievements listed below. Your
"items" array MUST contain EXACTLY ${achievementCount} entries — one per
achievement, in the same order, with "original" set to the exact
original text. Do not merge, skip, or drop any of them. Completeness
matters more than variety here: give each entry exactly 1 variant
(version "A" only) — the user can request additional A/B/C variants
later for one specific achievement they care about.${
        targetContext ? `\n\nTarget this rewrite for: ${targetContext}.` : ""
      }${correction ? `\n\nYour previous attempt was rejected for these reasons — fix them:\n${correction}` : ""}`,
    },
    {
      role: "user" as const,
      content: `Achievements to rewrite:\n\n${resume.achievements.map((item) => `- ${item}`).join("\n")}`,
    },
  ];
}

export async function generateAchievementRewrite(
  resume: Resume,
  style: RewriteStyle,
  targetContext: string | null,
  correction?: string
): Promise<TextItemRewrite[]> {
  const completion = await openai.chat.completions.create({
    model: REWRITE_MODEL,
    temperature: REWRITE_TEMPERATURE,
    messages: buildMessages(resume, style, targetContext, correction),
    response_format: {
      type: "json_schema",
      json_schema: ACHIEVEMENT_REWRITE_JSON_SCHEMA,
    },
  });

  const raw = completion.choices[0]?.message?.content;

  if (!raw) {
    throw new Error("Resume rewrite (achievements) LLM returned no content");
  }

  const parsed = achievementRewriteLlmOutputSchema.safeParse(JSON.parse(raw));

  if (!parsed.success) {
    throw new Error(`Resume rewrite (achievements) output failed schema validation: ${parsed.error.message}`);
  }

  return parsed.data.items;
}
