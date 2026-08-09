import { openai } from "../openai";
import { JobDescription, JdMatchResult } from "../job-description/jd-schema";
import { ResumeOptimizerResult } from "../job-description/resume-optimizer-schema";
import { Resume } from "../resume/resume-schema";
import { summarizeResumeForPrompt } from "../resume/resume-analyzer";
import { SAFETY_RULES_PROMPT } from "./validator";
import { LENGTH_GUIDES, STYLE_DESCRIPTIONS } from "./tone-selector";
import {
  COVER_LETTER_JSON_SCHEMA,
  CoverLetterLength,
  CoverLetterStyle,
  CoverLetterVariant,
  coverLetterLlmOutputSchema,
} from "./cover-schema";

const COVER_MODEL = "gpt-4o-mini";
const COVER_TEMPERATURE = 0.3;

export interface CoverLetterGenerationContext {
  resume: Resume;
  jd: JobDescription;
  jdMatchResult: JdMatchResult;
  optimizerResult: ResumeOptimizerResult | null;
  talkingPoints: string[];
  companyName: string;
  hiringManager: string | null;
  role: string;
  style: CoverLetterStyle;
  length: CoverLetterLength;
}

function buildMessages(ctx: CoverLetterGenerationContext, correction?: string) {
  const lengthGuide = LENGTH_GUIDES[ctx.length];
  const greetingTarget = ctx.hiringManager ? `Dear ${ctx.hiringManager},` : "Dear Hiring Manager,";

  return [
    {
      role: "system" as const,
      content: `You write a recruiter-grade cover letter for a candidate applying to
${ctx.role} at ${ctx.companyName}, in the "${ctx.style}" style: ${STYLE_DESCRIPTIONS[ctx.style]}

Target length: approximately ${lengthGuide.targetWords} words. Structure:
${lengthGuide.paragraphGuidance}

${SAFETY_RULES_PROMPT}

The ONLY facts you may use about ${ctx.companyName} are these talking
points (all derived directly from the job description — never add
anything else about the company, its history, funding, or news):
${ctx.talkingPoints.map((point) => `- ${point}`).join("\n") || "- (no additional company detail available — keep company-facing content general and role-focused)"}

Generate exactly 3 variants (version "A", "B", "C") — different phrasing
and structural emphasis, all equally grounded, all matching the target
length. Each variant fills all 11 sections (greeting, opening,
whyCompany, whyCandidate, relevantExperience, relevantProjects,
technicalSkills, businessImpact, closing, callToAction, signature) PLUS
"fullText" — the complete letter assembled from those sections into
natural flowing prose, not the sections concatenated with headers. Use
"${greetingTarget}" (or an equivalent professional greeting) and sign
off using the candidate's real name from the resume. Set "wordCount" to
the actual word count of "fullText".${
        correction ? `\n\nYour previous attempt was rejected for these reasons — fix them:\n${correction}` : ""
      }`,
    },
    {
      role: "user" as const,
      content: `Candidate resume:\n\n${summarizeResumeForPrompt(ctx.resume)}\n\n---\n\nJob description (${ctx.role} at ${
        ctx.companyName
      }):\n${JSON.stringify(ctx.jd, null, 2)}\n\n---\n\nJD match data — matched skills: ${
        ctx.jdMatchResult.matchedSkills.join(", ") || "none"
      }; missing skills: ${ctx.jdMatchResult.missingSkills.join(", ") || "none"}; resume strengths for this JD: ${
        ctx.jdMatchResult.resumeStrengths.join("; ") || "none"
      }.${
        ctx.optimizerResult
          ? `\n\nAlready-optimized resume summary (reuse this phrasing where it fits naturally): ${ctx.optimizerResult.optimizedSummary}`
          : ""
      }`,
    },
  ];
}

export async function generateCoverLetter(ctx: CoverLetterGenerationContext, correction?: string): Promise<CoverLetterVariant[]> {
  const completion = await openai.chat.completions.create({
    model: COVER_MODEL,
    temperature: COVER_TEMPERATURE,
    messages: buildMessages(ctx, correction),
    response_format: {
      type: "json_schema",
      json_schema: COVER_LETTER_JSON_SCHEMA,
    },
  });

  const raw = completion.choices[0]?.message?.content;

  if (!raw) {
    throw new Error("Cover letter generation LLM returned no content");
  }

  const parsed = coverLetterLlmOutputSchema.safeParse(JSON.parse(raw));

  if (!parsed.success) {
    throw new Error(`Cover letter generation failed schema validation: ${parsed.error.message}`);
  }

  return parsed.data.variants;
}
