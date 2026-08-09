import { openai } from "../openai";
import { JdMatchResult } from "../job-description/jd-schema";
import { summarizeResumeForPrompt } from "../resume/resume-analyzer";
import { Resume } from "../resume/resume-schema";

import { HIRING_RECOMMENDATION_JSON_SCHEMA, HiringRecommendation, hiringRecommendationLlmOutputSchema } from "./pipeline-schema";
import { Job } from "./pipeline-types";

const MODEL = "gpt-4o-mini";
const TEMPERATURE = 0.2;

// Job-specific — distinct from Milestone 8's job-agnostic
// candidate-insights.ts (plan design decision 6).

function buildMessages(job: Job, resume: Resume, jdMatch: JdMatchResult | null, correction?: string) {
  return [
    {
      role: "system" as const,
      content: `You are a hiring panel analyst producing a job-specific hiring
recommendation for a candidate being considered for the "${job.title}" role.

Ground every claim strictly in the job's real required/preferred skills
and the candidate's real resume (and job match data, if given) below —
never invent a technology, employer, certification, or metric the
candidate doesn't actually have.

Produce:
- classification: "Hire Immediately" only for an excellent, clear match; "Strong Match" for a good but not perfect fit; "Needs Review" when there are real gaps or uncertainty.
- culturalFit / technicalSkills / leadershipPotential: each a Low/Medium/High rating with a one-to-two sentence, resume-grounded explanation.
- riskFactors: 1-4 genuine hiring risks specific to this role (e.g. missing required skills, insufficient experience level) — never invent one that isn't evidenced.
- expectedLearningCurve: one or two sentences on how much ramp-up this candidate would likely need for this specific role, grounded in their real skill gaps.${
        correction ? `\n\nYour previous attempt was rejected — fix these issues:\n${correction}` : ""
      }`,
    },
    {
      role: "user" as const,
      content: `Job: ${job.title}${job.department ? ` (${job.department})` : ""}
Required skills: ${job.requiredSkills.join(", ") || "none listed"}
Preferred skills: ${job.preferredSkills.join(", ") || "none listed"}
Experience required: ${job.experienceRequired ?? "not specified"}

Candidate resume:
${summarizeResumeForPrompt(resume)}${
        jdMatch
          ? `\n\nJob match — overall match: ${jdMatch.overallMatch}%, matched skills: ${jdMatch.matchedSkills.join(", ") || "none"}, missing skills: ${
              jdMatch.missingSkills.join(", ") || "none"
            }, experience match: ${jdMatch.experienceMatch.level}`
          : ""
      }`,
    },
  ];
}

export async function generateHiringRecommendation(
  job: Job,
  resume: Resume,
  jdMatch: JdMatchResult | null,
  correction?: string
): Promise<HiringRecommendation> {
  const completion = await openai.chat.completions.create({
    model: MODEL,
    temperature: TEMPERATURE,
    messages: buildMessages(job, resume, jdMatch, correction),
    response_format: {
      type: "json_schema",
      json_schema: HIRING_RECOMMENDATION_JSON_SCHEMA,
    },
  });

  const raw = completion.choices[0]?.message?.content;

  if (!raw) {
    throw new Error("Hiring recommendation generation LLM returned no content");
  }

  const parsed = hiringRecommendationLlmOutputSchema.safeParse(JSON.parse(raw));

  if (!parsed.success) {
    throw new Error(`Hiring recommendation generation failed schema validation: ${parsed.error.message}`);
  }

  return parsed.data;
}
