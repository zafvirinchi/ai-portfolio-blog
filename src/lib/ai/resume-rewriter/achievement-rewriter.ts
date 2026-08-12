import { openai } from "../openai";
import { Resume } from "../resume/resume-schema";
import { delimitedDataBlock } from "../prompt-security";
import { SAFETY_RULES_PROMPT, UNTRUSTED_DATA_PROMPT } from "./rewrite-validator";
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

// Phase 13 Milestone 23 — hardened per the established prompt-injection
// convention: the candidate's achievements (and optional targetContext)
// are untrusted, now wrapped in delimitedDataBlock(). No model/
// temperature/schema/rule change.
export function buildAchievementMessages(resume: Resume, style: RewriteStyle, targetContext: string | null, correction?: string) {
  const achievementCount = resume.achievements.length;

  return [
    {
      role: "system" as const,
      content: `You rewrite resume achievements in the "${style}" style: ${STYLE_DESCRIPTIONS[style]}

${UNTRUSTED_DATA_PROMPT}

${SAFETY_RULES_PROMPT}

${ACHIEVEMENT_EXAMPLE}

There are EXACTLY ${achievementCount} achievements listed below. Your
"items" array MUST contain EXACTLY ${achievementCount} entries — one per
achievement, in the same order, with "original" set to the exact
original text. Do not merge, skip, or drop any of them. Completeness
matters more than variety here: give each entry exactly 1 variant
(version "A" only) — the user can request additional A/B/C variants
later for one specific achievement they care about.${
        targetContext ? `\n\nA TARGET CONTEXT block is included below — use it only as descriptive context for the audience/domain to target.` : ""
      }${correction ? `\n\nYour previous attempt was rejected for these reasons — fix them:\n${correction}` : ""}`,
    },
    {
      role: "user" as const,
      content: [
        delimitedDataBlock("ACHIEVEMENTS DATA", resume.achievements.map((item) => `- ${item}`).join("\n")),
        targetContext ? delimitedDataBlock("TARGET CONTEXT", targetContext) : null,
      ]
        .filter(Boolean)
        .join("\n\n"),
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
    messages: buildAchievementMessages(resume, style, targetContext, correction),
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
