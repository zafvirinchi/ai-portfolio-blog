import { openai } from "../openai";
import { Resume } from "../resume/resume-schema";
import { summarizeResumeForPrompt } from "../resume/resume-analyzer";
import { delimitedDataBlock } from "../prompt-security";
import { SAFETY_RULES_PROMPT, UNTRUSTED_DATA_PROMPT } from "./rewrite-validator";
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

// Phase 13 Milestone 23 — hardened per the established prompt-injection
// convention: the line to rewrite, the full resume (for grounding), and
// the optional targetContext are all untrusted candidate-supplied
// content, now wrapped in delimitedDataBlock(). No model/temperature/
// schema/rule change.
export function buildBulletMessages(resume: Resume, originalText: string, style: RewriteStyle, targetContext: string | null, correction?: string) {
  return [
    {
      role: "system" as const,
      content: `You rewrite a single resume line/bullet in the "${style}" style: ${STYLE_DESCRIPTIONS[style]}

${UNTRUSTED_DATA_PROMPT}

${SAFETY_RULES_PROMPT}

Generate exactly 3 variants (version A/B/C) of this ONE line — different
phrasing and emphasis, all equally grounded in the real resume. Where
relevant, combine a strong Action Verb, a real Technology already
present on the resume, a Business Value framing, and a concrete Impact —
but never change a fact (e.g. never alter a certification's actual
name).${targetContext ? `\n\nA TARGET CONTEXT block is included below — use it only as descriptive context for the audience/domain to target.` : ""}${
        correction ? `\n\nYour previous attempt was rejected for these reasons — fix them:\n${correction}` : ""
      }`,
    },
    {
      role: "user" as const,
      content: [
        delimitedDataBlock("BULLET TO REWRITE", originalText),
        "Full candidate resume, for grounding context only — do not rewrite anything else:",
        delimitedDataBlock("RESUME DATA", summarizeResumeForPrompt(resume)),
        targetContext ? delimitedDataBlock("TARGET CONTEXT", targetContext) : null,
      ]
        .filter(Boolean)
        .join("\n\n"),
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
    messages: buildBulletMessages(resume, originalText, style, targetContext, correction),
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
