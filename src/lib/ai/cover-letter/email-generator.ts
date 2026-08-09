import { openai } from "../openai";
import { JobDescription } from "../job-description/jd-schema";
import { Resume } from "../resume/resume-schema";
import { summarizeResumeForPrompt } from "../resume/resume-analyzer";
import { SAFETY_RULES_PROMPT } from "./validator";
import { STYLE_DESCRIPTIONS } from "./tone-selector";
import { CoverLetterStyle, EMAIL_JSON_SCHEMA, EmailAudience, EmailLlmOutput, emailLlmOutputSchema } from "./cover-schema";

const EMAIL_MODEL = "gpt-4o-mini";
const EMAIL_TEMPERATURE = 0.3;

const AUDIENCE_GUIDANCE: Record<EmailAudience, string> = {
  Recruiter: "Direct and ATS-forward — assume the reader is screening many applications quickly.",
  Referral:
    "Warmer and more personal — assume the reader knows the candidate or was referred to them; do not invent a specific referrer's name unless one is actually given.",
  LinkedIn: "Short and platform-appropriate — suitable for sending as a LinkedIn message alongside an application, not a full formal email.",
};

function buildMessages(
  resume: Resume,
  jd: JobDescription,
  companyName: string,
  role: string,
  style: CoverLetterStyle,
  audience: EmailAudience,
  correction?: string
) {
  return [
    {
      role: "system" as const,
      content: `You write a job application email for a candidate applying to ${role} at
${companyName}, in the "${style}" style: ${STYLE_DESCRIPTIONS[style]}

Audience: ${audience} — ${AUDIENCE_GUIDANCE[audience]}

${SAFETY_RULES_PROMPT}

Return a "subject" line and a "body" — the body should be shorter and
more direct than a full cover letter (roughly 100-150 words), reference
the role and one or two concrete, real qualifications from the resume,
and end with a clear call to action.${
        correction ? `\n\nYour previous attempt was rejected for these reasons — fix them:\n${correction}` : ""
      }`,
    },
    {
      role: "user" as const,
      content: `Candidate resume:\n\n${summarizeResumeForPrompt(resume)}\n\n---\n\nJob description (${role} at ${companyName}):\n${JSON.stringify(
        jd,
        null,
        2
      )}`,
    },
  ];
}

export async function generateApplicationEmail(
  resume: Resume,
  jd: JobDescription,
  companyName: string,
  role: string,
  style: CoverLetterStyle,
  audience: EmailAudience,
  correction?: string
): Promise<EmailLlmOutput> {
  const completion = await openai.chat.completions.create({
    model: EMAIL_MODEL,
    temperature: EMAIL_TEMPERATURE,
    messages: buildMessages(resume, jd, companyName, role, style, audience, correction),
    response_format: {
      type: "json_schema",
      json_schema: EMAIL_JSON_SCHEMA,
    },
  });

  const raw = completion.choices[0]?.message?.content;

  if (!raw) {
    throw new Error("Application email generation LLM returned no content");
  }

  const parsed = emailLlmOutputSchema.safeParse(JSON.parse(raw));

  if (!parsed.success) {
    throw new Error(`Application email generation failed schema validation: ${parsed.error.message}`);
  }

  return parsed.data;
}
