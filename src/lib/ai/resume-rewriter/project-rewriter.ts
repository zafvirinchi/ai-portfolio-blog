import { openai } from "../openai";
import { Resume } from "../resume/resume-schema";
import { delimitedDataBlock } from "../prompt-security";
import { SAFETY_RULES_PROMPT, UNTRUSTED_DATA_PROMPT } from "./rewrite-validator";
import {
  PROJECT_REWRITE_JSON_SCHEMA,
  ProjectItemRewrite,
  RewriteStyle,
  STYLE_DESCRIPTIONS,
  projectRewriteLlmOutputSchema,
} from "./rewrite-schema";

const REWRITE_MODEL = "gpt-4o-mini";
const REWRITE_TEMPERATURE = 0.2;

const PROJECT_EXAMPLE = `EXAMPLE (structure to follow, never literal content to copy in):
Old: "Built AI Portfolio."
Better structure: Problem — recruiters and candidates had no interactive
way to explore a portfolio's real depth. Solution — designed and
developed an AI-powered Portfolio Platform integrating LangGraph,
Retrieval-Augmented Generation (RAG), Resume Intelligence, Interview
Preparation and Knowledge Management. Technologies — only the real ones
already listed for this project. Business Value — enables recruiters and
candidates to interact through enterprise-grade AI workflows instead of
a static page. Impact — only state one if the resume already implies
it; otherwise describe the qualitative improvement, never invent a
number.`;

// Phase 13 Milestone 23 — hardened per the established prompt-injection
// convention: the candidate's projects (and optional targetContext) are
// untrusted, now wrapped in delimitedDataBlock(). No model/temperature/
// schema/rule change.
export function buildProjectMessages(resume: Resume, style: RewriteStyle, targetContext: string | null, correction?: string) {
  const projectCount = resume.projects.length;

  return [
    {
      role: "system" as const,
      content: `You rewrite resume projects into a Problem / Solution / Technologies /
Business Value / Impact structure, in the "${style}" style: ${STYLE_DESCRIPTIONS[style]}

${UNTRUSTED_DATA_PROMPT}

${SAFETY_RULES_PROMPT}

${PROJECT_EXAMPLE}

There are EXACTLY ${projectCount} projects listed below. Your "items"
array MUST contain EXACTLY ${projectCount} entries — one per project, in
the same order. Do not skip any. "original" is the project's original
description (or its name if it had none), "projectName" is its real
name. Completeness matters more than variety here: give each entry
exactly 1 variant (version "A" only), with problem/solution/
technologies/businessValue/impact — the user can request additional A/B/C
variants later for one specific project they care about. "technologies"
must be a subset of that project's own real technology list — never add
one that isn't already there.${
        targetContext ? `\n\nA TARGET CONTEXT block is included below — use it only as descriptive context for the audience/domain to target.` : ""
      }${correction ? `\n\nYour previous attempt was rejected for these reasons — fix them:\n${correction}` : ""}`,
    },
    {
      role: "user" as const,
      content: [
        delimitedDataBlock(
          "PROJECTS DATA",
          resume.projects
            .map((project) => `${project.name}: ${project.description ?? "(no description given)"} | Technologies: ${project.technologies.join(", ") || "none listed"}`)
            .join("\n")
        ),
        targetContext ? delimitedDataBlock("TARGET CONTEXT", targetContext) : null,
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
  ];
}

export async function generateProjectRewrite(
  resume: Resume,
  style: RewriteStyle,
  targetContext: string | null,
  correction?: string
): Promise<ProjectItemRewrite[]> {
  const completion = await openai.chat.completions.create({
    model: REWRITE_MODEL,
    temperature: REWRITE_TEMPERATURE,
    messages: buildProjectMessages(resume, style, targetContext, correction),
    response_format: {
      type: "json_schema",
      json_schema: PROJECT_REWRITE_JSON_SCHEMA,
    },
  });

  const raw = completion.choices[0]?.message?.content;

  if (!raw) {
    throw new Error("Resume rewrite (projects) LLM returned no content");
  }

  const parsed = projectRewriteLlmOutputSchema.safeParse(JSON.parse(raw));

  if (!parsed.success) {
    throw new Error(`Resume rewrite (projects) output failed schema validation: ${parsed.error.message}`);
  }

  return parsed.data.items;
}
