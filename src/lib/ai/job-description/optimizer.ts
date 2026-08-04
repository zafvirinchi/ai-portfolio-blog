import { openai } from "../openai";
import { Resume } from "../resume/resume-schema";
import { summarizeResumeForPrompt } from "../resume/resume-analyzer";
import { JobDescription, OPTIMIZER_JSON_SCHEMA, OptimizerOutput, optimizerOutputSchema } from "./jd-schema";
import { JdMatchComputation } from "./jd-matcher";

const OPTIMIZER_MODEL = "gpt-4o-mini";

function buildOptimizerMessages(resume: Resume, jd: JobDescription, computation: JdMatchComputation) {
  return [
    {
      role: "system" as const,
      content: `You are an expert resume writer optimizing a candidate's resume for a
specific job description.

CRITICAL RULE — do not violate this under any circumstance: you may only
REPHRASE and RESTRUCTURE content that is already present in the
candidate's resume. Never invent a metric, technology, employer, project,
or achievement the resume doesn't already state. This also means: never
add a descriptive qualifier ("high-traffic", "large-scale",
"mission-critical", "enterprise-grade", ...) or a claimed outcome
("resulting in improved reliability", "ensuring performance under load",
...) unless the original bullet already states it — a scope, scale, or
result claim you added yourself is fabrication even if you didn't invent
a specific number. If a bullet has no quantifiable result or explicit
scope to draw on, restructure it into stronger action-verb phrasing
without inventing one — a truthful rewrite beats a fabricated one every
time.

Rewrite the professional summary ("optimizedSummary") to foreground the
candidate's REAL experience using the job description's own terminology
wherever it's truthfully applicable.

For each work-experience bullet and each project bullet worth rewriting,
return both "original" and your "optimized" rewrite. Prefer STAR structure
(Situation, Task, Action, Result) where the source material supports it,
and set "starFormat" true only when your rewrite actually follows that
structure — false if you only strengthened the verb/phrasing without a
full STAR shape.

"optimizedSkills" reorders/emphasizes the candidate's REAL skills most
relevant to this job description — never add a skill absent from the
resume. "missingSkillsSection" lists job-description skills genuinely
missing from the resume, for the candidate's awareness (not something to
silently add).

"improvementSuggestions": up to 20 concrete, prioritized improvements.
Each needs "why" it matters, its likely "impact" (phrase it like "+5 ATS
points" or "significantly improves keyword match" — a short, concrete
phrase, not just a number), and "howToFix" — a specific, actionable step.`,
    },
    {
      role: "user" as const,
      content: `Candidate resume:\n\n${summarizeResumeForPrompt(resume)}\n\n---\n\nJob description (${
        jd.jobTitle ?? "role"
      } at ${jd.companyName ?? "company"}):\n${JSON.stringify(jd, null, 2)}\n\n---\n\nComputed gap analysis:\nMissing skills: ${
        computation.keywordMatch.missing.join(", ") || "none"
      }\nExperience match: ${computation.experienceMatch.level} — ${
        computation.experienceMatch.reasoning
      }\nEducation gaps: ${computation.educationMatch.missing.join(", ") || "none"}\nATS score: ${
        computation.ats.overall
      }/100`,
    },
  ];
}

/**
 * The one generative step in this package — produces the Step 6 (rewrite)
 * and Step 7 (improvement suggestions) output in a single structured-
 * output call, keeping the total LLM calls for one "Analyze Match" click
 * at exactly 2 (JD parse + this), matching job-match's existing
 * 2-call/maxDuration=60 budget.
 */
export class ResumeOptimizer {
  async optimize(resume: Resume, jd: JobDescription, computation: JdMatchComputation): Promise<OptimizerOutput> {
    const completion = await openai.chat.completions.create({
      model: OPTIMIZER_MODEL,
      temperature: 0.4,
      messages: buildOptimizerMessages(resume, jd, computation),
      response_format: {
        type: "json_schema",
        json_schema: OPTIMIZER_JSON_SCHEMA,
      },
    });

    const raw = completion.choices[0]?.message?.content;

    if (!raw) {
      throw new Error("Resume optimization LLM returned no content");
    }

    const parsed = optimizerOutputSchema.safeParse(JSON.parse(raw));

    if (!parsed.success) {
      throw new Error(`Resume optimization failed schema validation: ${parsed.error.message}`);
    }

    return parsed.data;
  }
}

export const resumeOptimizer = new ResumeOptimizer();
