import { openai } from "../openai";
import { Resume } from "../resume/resume-schema";
import { SAFETY_RULES_PROMPT } from "./rewrite-validator";
import {
  EXPERIENCE_REWRITE_JSON_SCHEMA,
  RewriteStyle,
  STYLE_DESCRIPTIONS,
  TextItemRewrite,
  experienceRewriteLlmOutputSchema,
} from "./rewrite-schema";

const REWRITE_MODEL = "gpt-4o-mini";
const REWRITE_TEMPERATURE = 0.2;

const WORKED_EXAMPLES = `EXAMPLES (structure to follow, never literal content to copy in):
Old: "Worked on Angular."
Better: "Designed and developed enterprise-grade Angular applications using RxJS, Lazy Loading, Route Guards and reusable component architecture to improve maintainability and user experience."

Old: "Created REST APIs."
Better: "Designed and implemented scalable RESTful APIs using Spring Boot, improving maintainability, security and system integration across enterprise applications."

Old: "Fixed bugs."
Better: "Resolved complex production defects through root cause analysis, improving application stability and reducing recurring incidents."

Every rewritten bullet should combine a strong Action Verb, a real
Technology already present on the resume, a Business Value framing, and
a concrete Impact — only ever built from what the original bullet and
the rest of the resume already establish.`;

function buildMessages(resume: Resume, style: RewriteStyle, targetContext: string | null, correction?: string) {
  const bulletCount = resume.workExperience.reduce((sum, job) => sum + job.description.length, 0);

  return [
    {
      role: "system" as const,
      content: `You rewrite resume work-experience bullet points in the "${style}" style:
${STYLE_DESCRIPTIONS[style]}

${SAFETY_RULES_PROMPT}

${WORKED_EXAMPLES}

There are EXACTLY ${bulletCount} bullets listed below, across all roles
combined. Your "items" array MUST contain EXACTLY ${bulletCount} entries
— one per bullet, in the same order, with "original" set to the EXACT
original bullet text. Do not merge, skip, or drop any bullet, even if
two bullets seem similar — every one of the ${bulletCount} must appear.
Completeness matters more than variety here: give each entry exactly 1
variant (version "A" only) — the user can request additional A/B/C
variants later for one specific bullet they care about.${
        targetContext ? `\n\nTarget this rewrite for: ${targetContext}.` : ""
      }${correction ? `\n\nYour previous attempt was rejected for these reasons — fix them:\n${correction}` : ""}`,
    },
    {
      role: "user" as const,
      content: `Bullets to rewrite (grouped by role):\n\n${resume.workExperience
        .map((job) => `${job.title} at ${job.company}:\n${job.description.map((line) => `- ${line}`).join("\n")}`)
        .join("\n\n")}`,
    },
  ];
}

export async function generateExperienceRewrite(
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
      json_schema: EXPERIENCE_REWRITE_JSON_SCHEMA,
    },
  });

  const raw = completion.choices[0]?.message?.content;

  if (!raw) {
    throw new Error("Resume rewrite (experience) LLM returned no content");
  }

  const parsed = experienceRewriteLlmOutputSchema.safeParse(JSON.parse(raw));

  if (!parsed.success) {
    throw new Error(`Resume rewrite (experience) output failed schema validation: ${parsed.error.message}`);
  }

  return parsed.data.items;
}
