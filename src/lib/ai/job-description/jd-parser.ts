import { openai } from "../openai";
import { loadDocument, RawFileInput } from "../ingestion/document-loader";
import { parseDocument, normalizeText } from "../ingestion/document-parser";
import { JOB_DESCRIPTION_JSON_SCHEMA, JobDescription, jobDescriptionSchema } from "./jd-schema";
import { JobDescriptionUploadInput } from "./jd-types";

const JD_MODEL = "gpt-4o-mini";

function isTextInput(input: JobDescriptionUploadInput): input is { text: string } {
  return "text" in input;
}

/**
 * Extracts raw text from a job description — either pasted text directly,
 * or a PDF/DOCX/TXT/MD upload via the same shared ingestion loader/parser
 * resume/resume-parser.ts and job-match already use (read-only reuse, no
 * changes to that module).
 */
export async function extractJobDescriptionText(input: JobDescriptionUploadInput): Promise<string> {
  if (isTextInput(input)) {
    const trimmed = input.text.trim();

    if (!trimmed) {
      throw new Error("Job description text is empty.");
    }

    return trimmed;
  }

  const raw: RawFileInput = { filename: input.filename, buffer: input.buffer, mimeType: input.mimeType };
  const loaded = loadDocument(raw);
  const parsed = await parseDocument(loaded);
  const normalized = normalizeText(parsed.text);

  if (!normalized) {
    throw new Error(`No extractable text found in "${input.filename}".`);
  }

  return normalized;
}

function buildExtractionMessages(jdText: string) {
  return [
    {
      role: "system" as const,
      content: `You extract structured requirements from a job description. Use null (for
scalars) or an empty array (for lists) for anything genuinely not stated —
never invent a requirement the text doesn't contain.

Distinguish "mandatorySkills" (phrased as "required"/"must have"/stated
with no qualifier) from "goodToHaveSkills" (phrased as "nice to
have"/"preferred"/"bonus"/"a plus"). "skills" is the flat union of both.

Categorize every skill/technology mentioned into whichever of these
buckets it belongs to — a skill can appear in more than one array where it
genuinely spans categories: cloud, frameworks, programmingLanguages,
tools, databases, aiSkills, security.

"experienceRequired": reflect a stated range if given (e.g. "3-5 years" ->
minYears 3, maxYears 5; "5+ years" -> minYears 5, maxYears null; nothing
stated -> both null). Always keep the original phrase in "raw" if any
experience requirement is mentioned, else null.

"educationRequired" is a list of stated degree/education requirements
(e.g. "Bachelor's in Computer Science or related field"), not a single
string. "domain" is the industry/business domain if statable from context
(e.g. "FinTech", "Healthcare", "E-commerce"), otherwise null.`,
    },
    {
      role: "user" as const,
      content: `Job description:\n\n${jdText}`,
    },
  ];
}

export class JdParser {
  async parseText(jdText: string): Promise<JobDescription> {
    const completion = await openai.chat.completions.create({
      model: JD_MODEL,
      temperature: 0,
      messages: buildExtractionMessages(jdText),
      response_format: {
        type: "json_schema",
        json_schema: JOB_DESCRIPTION_JSON_SCHEMA,
      },
    });

    const raw = completion.choices[0]?.message?.content;

    if (!raw) {
      throw new Error("Job description extraction LLM returned no content");
    }

    const parsed = jobDescriptionSchema.safeParse(JSON.parse(raw));

    if (!parsed.success) {
      throw new Error(`Job description extraction failed schema validation: ${parsed.error.message}`);
    }

    return parsed.data;
  }

  async parse(input: JobDescriptionUploadInput): Promise<JobDescription> {
    const text = await extractJobDescriptionText(input);
    return this.parseText(text);
  }
}

export const jdParser = new JdParser();
