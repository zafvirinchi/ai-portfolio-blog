import { openai } from "../openai";
import { JdMatchResult } from "../job-description/jd-schema";
import { summarizeResumeForPrompt } from "../resume/resume-analyzer";
import { Resume } from "../resume/resume-schema";
import { CANDIDATE_INSIGHTS_JSON_SCHEMA, CandidateInsights, candidateInsightsLlmOutputSchema } from "./candidate-schema";

const MODEL = "gpt-4o-mini";
const TEMPERATURE = 0.2;

function buildMessages(resume: Resume, jdMatch: JdMatchResult | null, correction?: string) {
  return [
    {
      role: "system" as const,
      content: `You are a recruiter analyst producing an internal candidate
assessment for a hiring team. Ground every claim strictly in the
resume (and job match data, if given) below — never invent a
technology, employer, certification, or metric the candidate doesn't
actually have. This also means never inventing or assuming a notice
period, availability, salary expectation, or location preference —
none of that data is given here, so never mention it. Risk factors and
weaknesses must be genuine, specific observations (e.g. "no cloud
experience listed" or "no leadership experience evident"), not generic
filler.

Produce:
- strengths: 3-6 concrete, resume-grounded strengths.
- weaknesses: 2-5 concrete, resume-grounded gaps.
- riskFactors: 1-4 genuine hiring risks (e.g. a short-tenure pattern,
  skill gaps against the job match, employment gaps) — never invent a
  risk that isn't evidenced by the data given.
- hiringRecommendation / leadershipPotential / careerGrowth /
  learningAbility / cultureFit / technicalDepth: each a Low/Medium/High
  rating with a one-to-two sentence, resume-grounded explanation.${
        correction ? `\n\nYour previous attempt was rejected — fix these issues:\n${correction}` : ""
      }`,
    },
    {
      role: "user" as const,
      content: `Candidate resume:\n\n${summarizeResumeForPrompt(resume)}${
        jdMatch
          ? `\n\nJob match data — overall match: ${jdMatch.overallMatch}%, ATS score: ${jdMatch.atsScore}, matched skills: ${
              jdMatch.matchedSkills.join(", ") || "none"
            }, missing skills: ${jdMatch.missingSkills.join(", ") || "none"}, experience match: ${jdMatch.experienceMatch.level} (${
              jdMatch.experienceMatch.reasoning
            })`
          : "\n\nNo job description match has been run for this candidate yet — base the assessment on the resume alone."
      }`,
    },
  ];
}

export async function generateCandidateInsights(
  resume: Resume,
  jdMatch: JdMatchResult | null,
  correction?: string
): Promise<CandidateInsights> {
  const completion = await openai.chat.completions.create({
    model: MODEL,
    temperature: TEMPERATURE,
    messages: buildMessages(resume, jdMatch, correction),
    response_format: {
      type: "json_schema",
      json_schema: CANDIDATE_INSIGHTS_JSON_SCHEMA,
    },
  });

  const raw = completion.choices[0]?.message?.content;

  if (!raw) {
    throw new Error("Candidate insights generation LLM returned no content");
  }

  const parsed = candidateInsightsLlmOutputSchema.safeParse(JSON.parse(raw));

  if (!parsed.success) {
    throw new Error(`Candidate insights generation failed schema validation: ${parsed.error.message}`);
  }

  return parsed.data;
}
