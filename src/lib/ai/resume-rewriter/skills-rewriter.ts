import { openai } from "../openai";
import { Resume } from "../resume/resume-schema";
import {
  RESUME_REWRITER_SKILL_CATEGORIES,
  SKILLS_REWRITE_JSON_SCHEMA,
  SkillCategoryGroup,
  skillsRewriteLlmOutputSchema,
} from "./rewrite-schema";

const REWRITE_MODEL = "gpt-4o-mini";
const REWRITE_TEMPERATURE = 0.2;

function buildMessages(resume: Resume, correction?: string) {
  const allSkills = Array.from(new Set([...resume.skills, ...resume.technicalSkills]));

  return [
    {
      role: "system" as const,
      content: `Organize this candidate's REAL, already-listed skills into these exact
categories: ${RESUME_REWRITER_SKILL_CATEGORIES.join(", ")}.

This is pure recategorization, not an opportunity to add anything: never
add a skill/technology the candidate doesn't already list, even one you
consider closely related. Omit a category entirely if the candidate has
nothing for it; never force a skill into a category it doesn't fit;
never duplicate a skill into more than one category.${
        correction ? `\n\nYour previous attempt was rejected for these reasons — fix them:\n${correction}` : ""
      }`,
    },
    {
      role: "user" as const,
      content: `Candidate's real skills: ${allSkills.join(", ") || "none listed"}`,
    },
  ];
}

/**
 * Never trusts the LLM's self-report for a factual-possession claim —
 * drops any skill not literally present (case-insensitive) in the
 * candidate's real skills list, regardless of how well the prompt is
 * followed. Same discipline as job-description/resume-optimizer.ts's
 * filterToActuallyUsedKeywords.
 */
function filterToActuallyPossessedSkills(categories: SkillCategoryGroup[], resume: Resume): SkillCategoryGroup[] {
  const possessed = new Set([...resume.skills, ...resume.technicalSkills].map((skill) => skill.trim().toLowerCase()));

  return categories
    .map((group) => ({
      category: group.category,
      skills: group.skills.filter((skill) => possessed.has(skill.trim().toLowerCase())),
    }))
    .filter((group) => group.skills.length > 0);
}

export async function generateSkillsRewrite(resume: Resume, correction?: string): Promise<SkillCategoryGroup[]> {
  const completion = await openai.chat.completions.create({
    model: REWRITE_MODEL,
    temperature: REWRITE_TEMPERATURE,
    messages: buildMessages(resume, correction),
    response_format: {
      type: "json_schema",
      json_schema: SKILLS_REWRITE_JSON_SCHEMA,
    },
  });

  const raw = completion.choices[0]?.message?.content;

  if (!raw) {
    throw new Error("Resume rewrite (skills) LLM returned no content");
  }

  const parsed = skillsRewriteLlmOutputSchema.safeParse(JSON.parse(raw));

  if (!parsed.success) {
    throw new Error(`Resume rewrite (skills) output failed schema validation: ${parsed.error.message}`);
  }

  return filterToActuallyPossessedSkills(parsed.data.categories, resume);
}
