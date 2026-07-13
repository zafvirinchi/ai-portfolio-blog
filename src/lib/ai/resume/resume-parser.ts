import { openai } from "../openai";
import { loadDocument } from "../ingestion/document-loader";
import { parseDocument, normalizeText } from "../ingestion/document-parser";
import { ResumeUploadInput } from "./resume-types";
import { Resume, RESUME_EXTRACTION_JSON_SCHEMA, resumeSchema } from "./resume-schema";

const RESUME_MODEL = "gpt-4o-mini";

// Resume upload only supports PDF/DOCX/TXT (not Markdown) — the shared
// ingestion loader also detects "md", which doesn't make sense for a resume
// upload, so it's rejected here rather than widening the pipeline's format
// list for a knowledge-base concern that doesn't apply to resumes.
const SUPPORTED_RESUME_FORMATS = new Set(["pdf", "docx", "txt"]);

function buildExtractionMessages(resumeText: string) {
  return [
    {
      role: "system" as const,
      content: `You extract structured data from resumes/CVs. Read the resume text
and return every field defined by the JSON schema. Use null for any field
that is genuinely absent from the resume — never invent information. For
"yearsOfExperience", estimate total professional experience in years from
the work history (a number, or null if it cannot be reasonably estimated).
Keep "skills" as a flat list of all skills mentioned; "technicalSkills" and
"softSkills" are the same skills re-classified into those two buckets.`,
    },
    {
      role: "user" as const,
      content: `Resume text:\n\n${resumeText}`,
    },
  ];
}

/**
 * Extracts raw text from an uploaded resume file (PDF/DOCX/TXT), reusing
 * the same document-loader/document-parser the Knowledge Ingestion
 * Pipeline uses — no parsing logic is duplicated here.
 */
export async function extractResumeText(input: ResumeUploadInput): Promise<string> {
  const loaded = loadDocument(input);

  if (!SUPPORTED_RESUME_FORMATS.has(loaded.format)) {
    throw new Error(
      `Unsupported resume format "${loaded.format}". Supported formats: PDF, DOCX, TXT.`
    );
  }

  const parsed = await parseDocument(loaded);
  const normalized = normalizeText(parsed.text);

  if (!normalized) {
    throw new Error(`No extractable text found in "${input.filename}".`);
  }

  return normalized;
}

/**
 * Turns normalized resume text into structured, Zod-validated Resume data
 * using OpenAI Structured Outputs (same strict-mode pattern as the
 * Planner — see planner/planner-service.ts).
 */
export async function parseResumeText(resumeText: string): Promise<Resume> {
  const completion = await openai.chat.completions.create({
    model: RESUME_MODEL,
    temperature: 0,
    messages: buildExtractionMessages(resumeText),
    response_format: {
      type: "json_schema",
      json_schema: RESUME_EXTRACTION_JSON_SCHEMA,
    },
  });

  const raw = completion.choices[0]?.message?.content;

  if (!raw) {
    throw new Error("Resume extraction LLM returned no content");
  }

  const parsed = resumeSchema.safeParse(JSON.parse(raw));

  if (!parsed.success) {
    throw new Error(`Resume extraction failed schema validation: ${parsed.error.message}`);
  }

  return parsed.data;
}

/** Convenience wrapper: raw file -> structured Resume, in one call. */
export async function parseResume(
  input: ResumeUploadInput
): Promise<{ resume: Resume; rawText: string }> {
  const rawText = await extractResumeText(input);
  const resume = await parseResumeText(rawText);

  return { resume, rawText };
}
