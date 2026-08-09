import { openai } from "../openai";
import { SAFETY_RULES_PROMPT } from "./validator";
import { LinkedinGenerationContext } from "./linkedin-types";
import {
  EXPERIENCE_JSON_SCHEMA,
  PROJECTS_JSON_SCHEMA,
  ProjectDescription,
  SimpleRewriteItem,
  experienceLlmOutputSchema,
  projectsLlmOutputSchema,
} from "./linkedin-schema";

const MODEL = "gpt-4o-mini";
const TEMPERATURE = 0.3;

/** Prefers the Resume Rewrite Engine's accepted Experience section (Milestone 5) when available — otherwise the raw resume. */
function resolveExperienceBullets(ctx: LinkedinGenerationContext): string[] {
  const rewritten = ctx.rewriteRecord?.sections.experience?.current;
  if (rewritten && rewritten.length > 0) return rewritten;

  return ctx.resume.workExperience.flatMap((job) => job.description);
}

function buildExperienceMessages(ctx: LinkedinGenerationContext, bullets: string[], correction?: string) {
  return [
    {
      role: "system" as const,
      content: `You rewrite resume/LinkedIn experience bullet points for a LinkedIn
profile targeting "${ctx.targetRole}"${ctx.industry ? ` in the ${ctx.industry} industry` : ""}.

${SAFETY_RULES_PROMPT}

Each rewritten bullet should combine a strong action verb, a real
technology already used, business impact, and (where genuinely
applicable) leadership framing — grounded only in what the original
bullet and the rest of the resume already establish.

There are EXACTLY ${bullets.length} bullets listed below. Your "items"
array MUST contain EXACTLY ${bullets.length} entries — one per bullet,
in the same order, with "original" set to the exact original text.
Completeness matters more than variety here: one strong rewrite per
bullet, not multiple options.${
        correction ? `\n\nYour previous attempt was rejected for these reasons — fix them:\n${correction}` : ""
      }`,
    },
    {
      role: "user" as const,
      content: `Bullets to rewrite:\n${bullets.map((bullet) => `- ${bullet}`).join("\n")}`,
    },
  ];
}

export async function generateExperience(ctx: LinkedinGenerationContext, correction?: string): Promise<SimpleRewriteItem[]> {
  const bullets = resolveExperienceBullets(ctx);
  if (bullets.length === 0) return [];

  const completion = await openai.chat.completions.create({
    model: MODEL,
    temperature: TEMPERATURE,
    messages: buildExperienceMessages(ctx, bullets, correction),
    response_format: {
      type: "json_schema",
      json_schema: EXPERIENCE_JSON_SCHEMA,
    },
  });

  const raw = completion.choices[0]?.message?.content;

  if (!raw) {
    throw new Error("LinkedIn experience generation LLM returned no content");
  }

  const parsed = experienceLlmOutputSchema.safeParse(JSON.parse(raw));

  if (!parsed.success) {
    throw new Error(`LinkedIn experience generation failed schema validation: ${parsed.error.message}`);
  }

  return parsed.data.items;
}

function buildProjectMessages(ctx: LinkedinGenerationContext, correction?: string) {
  const projects = ctx.resume.projects;

  return [
    {
      role: "system" as const,
      content: `You write recruiter-grade LinkedIn project descriptions for a profile
targeting "${ctx.targetRole}"${ctx.industry ? ` in the ${ctx.industry} industry` : ""}.

${SAFETY_RULES_PROMPT}

For each project, cover Problem / Solution / Architecture / Technology /
Business Value / Impact. "technology" must be a subset of that
project's own real technology list — never add one that isn't already
there.

There are EXACTLY ${projects.length} projects listed below. Your
"projects" array MUST contain EXACTLY ${projects.length} entries — one
per project, in the same order, with "name" set to its real name.${
        correction ? `\n\nYour previous attempt was rejected for these reasons — fix them:\n${correction}` : ""
      }`,
    },
    {
      role: "user" as const,
      content: `Projects:\n${projects
        .map(
          (project) =>
            `${project.name}: ${project.description ?? "(no description given)"} | Technologies: ${
              project.technologies.join(", ") || "none listed"
            }`
        )
        .join("\n")}`,
    },
  ];
}

export async function generateProjects(ctx: LinkedinGenerationContext, correction?: string): Promise<ProjectDescription[]> {
  if (ctx.resume.projects.length === 0) return [];

  const completion = await openai.chat.completions.create({
    model: MODEL,
    temperature: TEMPERATURE,
    messages: buildProjectMessages(ctx, correction),
    response_format: {
      type: "json_schema",
      json_schema: PROJECTS_JSON_SCHEMA,
    },
  });

  const raw = completion.choices[0]?.message?.content;

  if (!raw) {
    throw new Error("LinkedIn project generation LLM returned no content");
  }

  const parsed = projectsLlmOutputSchema.safeParse(JSON.parse(raw));

  if (!parsed.success) {
    throw new Error(`LinkedIn project generation failed schema validation: ${parsed.error.message}`);
  }

  return parsed.data.projects;
}
