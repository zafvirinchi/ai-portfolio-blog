import { openai } from "../openai";
import { Resume } from "../resume/resume-schema";
import { summarizeResumeForPrompt } from "../resume/resume-analyzer";
import { SAFETY_RULES_PROMPT } from "./rewrite-validator";
import {
  BULLET_REWRITE_JSON_SCHEMA,
  RewriteStyle,
  STYLE_DESCRIPTIONS,
  TextVariant,
  bulletRewriteLlmOutputSchema,
} from "./rewrite-schema";

const REWRITE_MODEL = "gpt-4o-mini";
const REWRITE_TEMPERATURE = 0.2;

// Standalone, single-item rewrite — backs "Individual Bullet Points",
// per-item "Generate Again", and certifications-section restyling
// (rewrite-service.ts loops this once per certification, since a
// certification's own NAME must never change but the surrounding
// framing/phrasing can).

function buildMessages(resume: Resume, originalText: string, style: RewriteStyle, targetContext: string | null, correction?: string) {
  return [
    {
      role: "system" as const,
      content: `You rewrite a single resume line/bullet in the "${style}" style: ${STYLE_DESCRIPTIONS[style]}

${SAFETY_RULES_PROMPT}

Generate exactly 3 variants (version A/B/C) of this ONE line — different
phrasing and emphasis, all equally grounded in the real resume. Where
relevant, combine a strong Action Verb, a real Technology already
present on the resume, a Business Value framing, and a concrete Impact —
but never change a fact (e.g. never alter a certification's actual
name).${targetContext ? `\n\nTarget this rewrite for: ${targetContext}.` : ""}${
        correction ? `\n\nYour previous attempt was rejected for these reasons — fix them:\n${correction}` : ""
      }`,
    },
    {
      role: "user" as const,
      content: `Line to rewrite: "${originalText}"\n\nFull candidate resume, for grounding context only — do not rewrite anything else:\n${summarizeResumeForPrompt(
        resume
      )}`,
    },
  ];
}

export async function generateBulletVariants(
  resume: Resume,
  originalText: string,
  style: RewriteStyle,
  targetContext: string | null,
  correction?: string
): Promise<TextVariant[]> {
  const completion = await openai.chat.completions.create({
    model: REWRITE_MODEL,
    temperature: REWRITE_TEMPERATURE,
    messages: buildMessages(resume, originalText, style, targetContext, correction),
    response_format: {
      type: "json_schema",
      json_schema: BULLET_REWRITE_JSON_SCHEMA,
    },
  });

  const raw = completion.choices[0]?.message?.content;

  if (!raw) {
    throw new Error("Resume rewrite (bullet) LLM returned no content");
  }

  const parsed = bulletRewriteLlmOutputSchema.safeParse(JSON.parse(raw));

  if (!parsed.success) {
    throw new Error(`Resume rewrite (bullet) output failed schema validation: ${parsed.error.message}`);
  }

  return parsed.data.variants;
}
