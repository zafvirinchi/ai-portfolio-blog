import { openai } from "../openai";
import { loadDocument } from "../ingestion/document-loader";
import { parseDocument, normalizeText } from "../ingestion/document-parser";
import { EnterpriseResume, ResumeParserConfidence, enterpriseResumeSchema } from "./resume-schema";
import { ENTERPRISE_RESUME_JSON_SCHEMA } from "./resume-json-schema";
import { EnterpriseResumeParseResult, EnterpriseResumeUploadInput } from "./resume-types";
import { normalizeEnterpriseResume } from "./resume-normalizer";

const LOG_PREFIX = "[resume-parser]";
const RESUME_MODEL = "gpt-4o-mini";

// Enterprise resume upload only supports PDF/DOCX/TXT (not Markdown) — same
// restriction and rationale as resume/resume-parser.ts.
const SUPPORTED_RESUME_FORMATS = new Set(["pdf", "docx", "txt"]);

/** Thrown when OpenAI's output fails enterpriseResumeSchema validation, or when extraction otherwise can't produce a usable result. */
export class ResumeParserError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "ResumeParserError";
  }
}

function buildExtractionMessages(resumeText: string) {
  return [
    {
      role: "system" as const,
      content: `You are an enterprise resume parser. Extract every section defined by
the JSON schema from the resume text you are given, as accurately and
completely as possible.

CRITICAL RULES:
- Never invent information. Never hallucinate. If a field is genuinely not
  present in the resume text, leave it null (for scalar fields) or an empty
  array (for list fields) — do not guess, infer beyond what's written, or
  fill in a plausible-sounding placeholder.
- Proper nouns (person names, company names, institute names, project
  names) must be copied character-for-character from the source text, even
  a single character wrong is not acceptable.
- "Leave it null" means the JSON null value itself — never the text string
  "null", "N/A", "none", "unknown", or similar filler. If you are not
  outputting real extracted text for a field, omit content and use the
  JSON null literal.
- Return valid JSON only, matching the schema exactly.

NORMALIZATION (apply consistent, canonical forms while extracting):
- Dates: use a consistent "Mon YYYY" style (e.g. "Jan 2022") where the
  resume gives enough information to do so; use "Present" for current
  roles regardless of how the resume phrases it ("Current", "Till Date",
  "Ongoing", etc.). Never guess a date the resume doesn't state.
- Company names: use the name as the resume states it, trimmed of extra
  whitespace/decoration — do not abbreviate or expand it.
- Technology/tool names: use canonical spellings, for example:
  "Java17"/"JAVA17" -> "Java 17"; "Javascript" -> "JavaScript";
  "Typescript" -> "TypeScript"; "SpringBoot" -> "Spring Boot";
  "NodeJS" -> "Node.js"; "Amazon Web Services" -> "AWS";
  "Microsoft Azure" -> "Azure"; "Google Cloud Platform" -> "GCP".
- Education: use standard degree names (e.g. "Bachelor of Technology",
  "Master of Science") rather than only an ambiguous local abbreviation
  when the resume makes the full name clear.
- Certifications: use the certification's full official name as the
  resume states it.
- Skills: deduplicate near-identical entries (e.g. don't list both "AWS"
  and "Amazon Web Services" as separate skills) and place each under the
  single most appropriate category. Category boundaries: "AI" is only for
  machine-learning/AI-specific technologies (e.g. TensorFlow, PyTorch,
  LangChain, OpenAI/LLM APIs) — general backend technologies like
  Kafka/ActiveMQ/RabbitMQ (messaging) belong under "DevOps" or "Tools", not
  "AI", even though they're sometimes used in AI systems. "Frameworks" is
  for application frameworks (Spring Boot, React, Express); "Libraries" is
  for smaller focused libraries used within an application, not full
  frameworks. Every skill/technology the resume mentions must appear
  somewhere in the output — if you're unsure which category best fits one,
  put it under "Tools" rather than leaving it out. Omitting a skill because
  its category is ambiguous is worse than putting it in an imperfect
  category.

LAYOUT AND REGIONAL VARIATION: resumes vary widely by region (Indian,
Middle Eastern, European, US, and other conventions) and by section
heading wording. Map whatever heading the resume actually uses to the
right schema section regardless of exact wording — for example
"Professional Experience", "Employment History", "Work History", and
"Career History" are all the companyHistory section; "Projects",
"Professional Projects", and "Client Projects" are all the projects
section. Do not skip a section just because its heading is unfamiliar.`,
    },
    {
      role: "user" as const,
      content: `Resume text:\n\n${resumeText}`,
    },
  ];
}

/**
 * Extracts raw text from an uploaded resume file (PDF/DOCX/TXT), reusing
 * the same Phase 6 document-loader/document-parser the Knowledge Ingestion
 * Pipeline and resume/resume-parser.ts both use — no parsing logic is
 * duplicated here.
 */
export async function extractEnterpriseResumeText(
  input: EnterpriseResumeUploadInput
): Promise<string> {
  const loaded = loadDocument(input);

  if (!SUPPORTED_RESUME_FORMATS.has(loaded.format)) {
    throw new ResumeParserError(
      `Unsupported resume format "${loaded.format}". Supported formats: PDF, DOCX, TXT.`
    );
  }

  const parsed = await parseDocument(loaded);
  const normalized = normalizeText(parsed.text);

  if (!normalized) {
    throw new ResumeParserError(`No extractable text found in "${input.filename}".`);
  }

  console.log(`${LOG_PREFIX} Text extracted`, { filename: input.filename, length: normalized.length });

  return normalized;
}

/** Fraction (0-1) of the given values that are non-null/non-empty — the building block every section's confidence score is derived from. */
function completeness(values: unknown[]): number {
  if (values.length === 0) return 0;

  const filled = values.filter((value) => {
    if (value === null || value === undefined) return false;
    if (typeof value === "string") return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return true;
  }).length;

  return filled / values.length;
}

/** Average per-entry completeness across a list section — 0 for an empty list (nothing extracted, so nothing to be confident about). */
function listCompleteness<T extends object>(entries: T[]): number {
  if (entries.length === 0) return 0;

  const scores = entries.map((entry) => completeness(Object.values(entry)));
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

// Core sections (present on nearly every resume) are weighted higher than
// bonus sections (patents/publications/volunteer work, genuinely absent
// from most resumes) so a resume without them isn't penalized as "low
// confidence" for a section that was never going to have content.
const SECTION_WEIGHTS: Record<Exclude<keyof ResumeParserConfidence, "overall">, number> = {
  personalInfo: 0.15,
  professionalSummary: 0.15,
  education: 0.15,
  companyHistory: 0.18,
  projects: 0.08,
  skills: 0.15,
  certifications: 0.03,
  awards: 0.03,
  publications: 0.02,
  patents: 0.02,
  languagesKnown: 0.02,
  volunteerExperience: 0.02,
};

/**
 * Deterministic, field-completeness-based confidence per section (and a
 * weighted overall score) — computed from the already-validated resume
 * rather than a second LLM self-assessment call, which tends to be poorly
 * calibrated. Same "avoid an extra LLM round trip when a heuristic works"
 * reasoning as resume/resume-score.ts's ATS scoring.
 */
function computeConfidence(resume: EnterpriseResume): ResumeParserConfidence {
  const sectionScores: Record<Exclude<keyof ResumeParserConfidence, "overall">, number> = {
    personalInfo: completeness(Object.values(resume.personalInfo)),
    professionalSummary: completeness(Object.values(resume.professionalSummary)),
    education: listCompleteness(resume.education),
    companyHistory: listCompleteness(resume.companyHistory),
    projects: listCompleteness(resume.projects),
    skills: resume.skills.length === 0 ? 0 : listCompleteness(resume.skills),
    certifications: listCompleteness(resume.certifications),
    awards: listCompleteness(resume.awards),
    publications: listCompleteness(resume.publications),
    patents: listCompleteness(resume.patents),
    languagesKnown: listCompleteness(resume.languagesKnown),
    volunteerExperience: listCompleteness(resume.volunteerExperience),
  };

  const overall = (Object.keys(SECTION_WEIGHTS) as (keyof typeof SECTION_WEIGHTS)[]).reduce(
    (sum, section) => sum + sectionScores[section] * SECTION_WEIGHTS[section],
    0
  );

  return {
    ...sectionScores,
    overall: Math.round(overall * 100) / 100,
  };
}

/**
 * Full text -> validated, normalized EnterpriseResume + confidence
 * pipeline: OpenAI Structured Outputs (gpt-4o-mini, temperature 0, strict
 * json_schema — exactly the planner/resume-analyzer pattern) -> Zod
 * validation against enterpriseResumeSchema -> deterministic normalization
 * -> deterministic confidence scoring.
 */
export class EnterpriseResumeParser {
  async parseResumeText(resumeText: string): Promise<EnterpriseResumeParseResult> {
    const startedAt = Date.now();

    const completion = await openai.chat.completions.create({
      model: RESUME_MODEL,
      temperature: 0,
      messages: buildExtractionMessages(resumeText),
      response_format: {
        type: "json_schema",
        json_schema: ENTERPRISE_RESUME_JSON_SCHEMA,
      },
    });

    const raw = completion.choices[0]?.message?.content;

    if (!raw) {
      throw new ResumeParserError("Enterprise resume extraction LLM returned no content");
    }

    console.log(`${LOG_PREFIX} Structured extraction completed`);

    let parsedJson: unknown;

    try {
      parsedJson = JSON.parse(raw);
    } catch (error) {
      throw new ResumeParserError("Enterprise resume extraction returned invalid JSON", error);
    }

    const validated = enterpriseResumeSchema.safeParse(parsedJson);

    if (!validated.success) {
      throw new ResumeParserError(
        `Enterprise resume extraction failed schema validation: ${validated.error.message}`,
        validated.error
      );
    }

    console.log(`${LOG_PREFIX} Validation completed`, {
      companies: validated.data.companyHistory.length,
      education: validated.data.education.length,
      skillGroups: validated.data.skills.length,
    });

    const normalized = normalizeEnterpriseResume(validated.data);

    console.log(`${LOG_PREFIX} Normalization completed`);

    const confidence = computeConfidence(normalized);

    const result: EnterpriseResumeParseResult = {
      resume: normalized,
      confidence,
      processingTimeMs: Date.now() - startedAt,
    };

    console.log(`${LOG_PREFIX} Parser finished`, {
      overallConfidence: confidence.overall,
      processingTimeMs: result.processingTimeMs,
    });

    return result;
  }

  async parseResume(input: EnterpriseResumeUploadInput): Promise<EnterpriseResumeParseResult> {
    console.log(`${LOG_PREFIX} Resume uploaded`, { filename: input.filename });

    const text = await extractEnterpriseResumeText(input);

    return this.parseResumeText(text);
  }
}

export const enterpriseResumeParser = new EnterpriseResumeParser();
