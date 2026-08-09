import { openai } from "../openai";
import { loadDocument } from "../ingestion/document-loader";
import { parseDocument, normalizeText } from "../ingestion/document-parser";
import { JOB_STRING_ARRAY_FIELDS, JobDescription, jobJsonSchema, jobSchema } from "./job-schema";
import { JobUploadInput } from "./job-types";

const JOB_MODEL = "gpt-4o-mini";

// Same PDF/DOCX/TXT/MD support as the spec's "Accept PDF, DOCX, TXT,
// Markdown, Plain text" — the shared ingestion loader already rejects
// anything else (images, Excel, Zip, ...) via UnsupportedDocumentFormatError.
const SUPPORTED_JOB_FORMATS = new Set(["pdf", "docx", "txt", "md"]);

/**
 * Extracts raw text from a job description file, reusing the same
 * document-loader/document-parser the Knowledge Ingestion Pipeline and
 * resume/resume-parser.ts both use — no parsing logic is duplicated here.
 */
export async function extractJobText(input: JobUploadInput): Promise<string> {
  const loaded = loadDocument(input);

  if (!SUPPORTED_JOB_FORMATS.has(loaded.format)) {
    throw new Error(
      `Unsupported job description format "${loaded.format}". Supported formats: PDF, DOCX, TXT, MD.`
    );
  }

  const parsed = await parseDocument(loaded);
  const normalized = normalizeText(parsed.text);

  if (!normalized) {
    throw new Error(`No extractable text found in "${input.filename}".`);
  }

  return normalized;
}

function buildExtractionMessages(jobText: string) {
  return [
    {
      role: "system" as const,
      content: `You extract every piece of structured information from a job description.
Use null (for scalars) or an empty array (for lists) for anything genuinely
not stated — never invent a requirement, benefit, or detail the text
doesn't contain.

NORMALIZATION — this matters as much as extraction: every value must be
in canonical form, deduplicated. Never emit near-duplicate variants of the
same thing (e.g. "Java", "JAVA", "java" -> store only "Java"; "AWS",
"Amazon Web Services" -> pick the one canonical form and use it
consistently throughout the whole output).

SKILL BUCKETS: "requiredSkills" is the full set of skills the JD asks for
(broad). "mandatorySkills" is the subset phrased with the strongest
"must have"/"required"/"non-negotiable" language — a stricter list, not a
separate category (every mandatory skill should also appear in
requiredSkills). "preferredSkills" and "niceToHaveSkills" both capture the
softer ask ("nice to have"/"preferred"/"bonus"/"a plus") — populate both
identically unless the text draws a real distinction between them.

CATEGORIZED SKILLS: categorize every technical skill mentioned into
whichever of these it belongs to (a skill can appear in more than one
category and also in the broader requiredSkills/preferredSkills lists):
programmingLanguages, frameworks, cloudPlatforms, databases, devOps,
aiSkills. "softSkills" is separate — interpersonal/behavioral traits
(communication, leadership, ...), not technical.

"technologies" is the flat union of every named technology/tool mentioned
anywhere in the JD (categorized skills plus anything else technical);
"tools" is specifically software tools/platforms (Jira, Git, Figma, ...)
as opposed to core technologies; "keywords" is the JD's own significant
terminology beyond a strict skill list (e.g. "microservices",
"scalability", "cross-functional").

"location": fill city/state/country from what's stated, and "raw" with
the original location phrase. "workMode" is exactly one of "Remote",
"Hybrid", "Onsite", or null if not stated. "experienceRequired": a range
if given (e.g. "3-5 years" -> minYears 3, maxYears 5; "5+ years" ->
minYears 5, maxYears null), with "raw" holding the original phrase.
"salary": fill whatever is stated (min/max/currency/period), "raw" with
the original phrase, all null if no salary is mentioned.

"visaSponsorship"/"relocation": true/false only if the JD explicitly
states a position either way, otherwise null (don't guess). "hiringManager"
and "recruitmentAgency" are null unless a specific name/agency is named in
the text.

"roleLevel"/"seniority": if the job title itself states a level (e.g.
"Senior Backend Engineer", "Lead Data Scientist", "Principal Architect"),
that counts as stated text, not a guess — extract it (e.g. "Senior",
"Lead", "Principal"). Only leave these null if neither the title nor the
body gives any level indication at all.`,
    },
    {
      role: "user" as const,
      content: `Job description:\n\n${jobText}`,
    },
  ];
}

function dedupeCaseInsensitive(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    const key = trimmed.toLowerCase();

    if (!trimmed || seen.has(key)) continue;

    seen.add(key);
    result.push(trimmed);
  }

  return result;
}

/**
 * Deterministic safety net behind the prompt's own normalization
 * instructions — collapses any remaining case-only duplicates
 * ("Java"/"JAVA"/"java") the model didn't fully dedupe, same reasoning
 * Milestone 2's resume-normalizer.ts documents for its own cleanup pass.
 */
function normalizeJobDescription(job: JobDescription): JobDescription {
  const normalized: JobDescription = { ...job };

  for (const field of JOB_STRING_ARRAY_FIELDS) {
    normalized[field] = dedupeCaseInsensitive(job[field]);
  }

  return normalized;
}

export class JobParser {
  async parseText(jobText: string): Promise<JobDescription> {
    const completion = await openai.chat.completions.create({
      model: JOB_MODEL,
      temperature: 0,
      messages: buildExtractionMessages(jobText),
      response_format: {
        type: "json_schema",
        json_schema: jobJsonSchema,
      },
    });

    const raw = completion.choices[0]?.message?.content;

    if (!raw) {
      throw new Error("Job description extraction LLM returned no content");
    }

    const parsed = jobSchema.safeParse(JSON.parse(raw));

    if (!parsed.success) {
      throw new Error(`Job description extraction failed schema validation: ${parsed.error.message}`);
    }

    return normalizeJobDescription(parsed.data);
  }

  async parseFile(input: JobUploadInput): Promise<JobDescription> {
    const text = await extractJobText(input);
    return this.parseText(text);
  }
}

export const jobParser = new JobParser();
