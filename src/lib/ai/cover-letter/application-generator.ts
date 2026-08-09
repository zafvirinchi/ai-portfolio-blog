import { openai } from "../openai";
import { JobDescription } from "../job-description/jd-schema";
import { Resume } from "../resume/resume-schema";
import { summarizeResumeForPrompt } from "../resume/resume-analyzer";
import { SAFETY_RULES_PROMPT } from "./validator";
import { STYLE_DESCRIPTIONS } from "./tone-selector";
import { CoverLetterStyle, LINKEDIN_MESSAGES_JSON_SCHEMA, LinkedinMessage, linkedinMessagesLlmOutputSchema } from "./cover-schema";

const LINKEDIN_MODEL = "gpt-4o-mini";
const LINKEDIN_TEMPERATURE = 0.3;

// Handles the spec's "LINKEDIN MESSAGE" section — the LinkedIn-based
// application/outreach messages, generated together in one call since
// each is short (LinkedIn's own length norms keep the combined output
// small, unlike Milestone 5's bulk-item array-truncation failure mode).

function buildMessages(resume: Resume, jd: JobDescription, companyName: string, role: string, style: CoverLetterStyle, correction?: string) {
  return [
    {
      role: "system" as const,
      content: `You write short LinkedIn outreach messages for a candidate applying to
${role} at ${companyName}, in the "${style}" style: ${STYLE_DESCRIPTIONS[style]}

${SAFETY_RULES_PROMPT}

Generate all 4 message types together:
- "Connection Request": under 300 characters, no mention of the job yet — just a genuine, specific reason to connect.
- "Follow-up Message": sent after connecting, briefly references the application.
- "Recruiter Outreach": addressed to a recruiter, direct, references the specific role.
- "Hiring Manager Message": addressed to the hiring manager, slightly warmer, references genuine fit for the role.

Each message must be short (LinkedIn-appropriate, not a full letter) and
reference only real resume content — never invent a mutual connection,
referrer, or shared background.${
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

export async function generateLinkedinMessages(
  resume: Resume,
  jd: JobDescription,
  companyName: string,
  role: string,
  style: CoverLetterStyle,
  correction?: string
): Promise<LinkedinMessage[]> {
  const completion = await openai.chat.completions.create({
    model: LINKEDIN_MODEL,
    temperature: LINKEDIN_TEMPERATURE,
    messages: buildMessages(resume, jd, companyName, role, style, correction),
    response_format: {
      type: "json_schema",
      json_schema: LINKEDIN_MESSAGES_JSON_SCHEMA,
    },
  });

  const raw = completion.choices[0]?.message?.content;

  if (!raw) {
    throw new Error("LinkedIn message generation LLM returned no content");
  }

  const parsed = linkedinMessagesLlmOutputSchema.safeParse(JSON.parse(raw));

  if (!parsed.success) {
    throw new Error(`LinkedIn message generation failed schema validation: ${parsed.error.message}`);
  }

  return parsed.data.messages;
}
