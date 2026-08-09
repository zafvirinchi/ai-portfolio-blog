import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

import { JobDescription, JdMatchResult } from "../job-description/jd-schema";
import { jdMatchService } from "../job-description/jd-service";
import { resumeOptimizer } from "../job-description/resume-optimizer";
import { Resume } from "../resume/resume-schema";
import { resumeService } from "../resume/resume-service";
import { generateApplicationEmail } from "./email-generator";
import { generateLinkedinMessages } from "./application-generator";
import { generateCoverLetter, CoverLetterGenerationContext } from "./cover-generator";
import { deriveCompanyTalkingPoints } from "./company-research";
import { validateCoverContent } from "./validator";
import {
  CoverLetterLength,
  CoverLetterStyle,
  CoverLetterVariant,
  EmailAudience,
  EmailVariant,
  KeywordCoverage,
  LinkedinMessage,
  Reasoning,
  VariantVersion,
  keywordCoverageSchema,
  reasoningSchema,
} from "./cover-schema";
import { CoverLetterGenerateInput, CoverLetterRecord } from "./cover-types";

const LOG_PREFIX = "[cover-letter]";
const COVER_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours — same pattern every in-memory store in this arc uses

export const coverRequestContext = new AsyncLocalStorage<{ coverLetterId: string }>();

interface StoredCoverLetterRecord {
  record: CoverLetterRecord;
  expiresAt: number;
}

interface ResolvedContext {
  resume: Resume;
  jd: JobDescription;
  jdMatchResult: JdMatchResult;
}

function containsWholeTermLoose(haystack: string, term: string): boolean {
  if (!term.trim()) return false;
  const escaped = term.trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(^|[^a-z0-9+#.])${escaped}([^a-z0-9+#.]|$)`, "i");
  return pattern.test(haystack);
}

function computeKeywordCoverage(jdMatchResult: JdMatchResult, letterText: string): KeywordCoverage {
  const lower = letterText.toLowerCase();
  const jdKeywordsUsed = jdMatchResult.matchedSkills.filter((skill) => containsWholeTermLoose(lower, skill));
  const missingKeywords = jdMatchResult.missingSkills.filter((skill) => !containsWholeTermLoose(lower, skill));

  const atsImprovementNote =
    jdKeywordsUsed.length > 0
      ? `This letter naturally surfaces ${jdKeywordsUsed.length} of the JD's matched skills, reinforcing the ATS keyword alignment already established by the resume.`
      : "This letter doesn't yet surface any of the JD's matched skills by name — consider a more technical style if ATS keyword density matters for this application.";

  return keywordCoverageSchema.parse({ jdKeywordsUsed, missingKeywords, atsImprovementNote });
}

function computeReasoning(jdMatchResult: JdMatchResult, jd: JobDescription, letterText: string): Reasoning {
  const lower = letterText.toLowerCase();
  const keywordsMatched = jdMatchResult.matchedSkills.filter((skill) => containsWholeTermLoose(lower, skill));

  const resumeSectionsReferenced: string[] = [];
  if (/\b(experience|worked|developed|built|led|designed|implemented)\b/i.test(letterText)) resumeSectionsReferenced.push("Work Experience");
  if (/\bproject/i.test(letterText)) resumeSectionsReferenced.push("Projects");
  if (keywordsMatched.length > 0) resumeSectionsReferenced.push("Skills");

  const jdSectionsReferenced: string[] = [];
  if (jd.responsibilities.some((responsibility) => lower.includes(responsibility.slice(0, 15).toLowerCase()))) {
    jdSectionsReferenced.push("Responsibilities");
  }
  if (keywordsMatched.length > 0) jdSectionsReferenced.push("Required Skills");
  if (jd.domain && lower.includes(jd.domain.toLowerCase())) jdSectionsReferenced.push("Domain");

  return reasoningSchema.parse({
    whyGenerated: `Generated to align the candidate's real experience with ${
      jd.jobTitle ?? "this role"
    }'s stated requirements, using only verified resume content and the job description's own stated details.`,
    keywordsMatched,
    resumeSectionsReferenced,
    jdSectionsReferenced,
  });
}

export class CoverLetterService {
  private readonly records = new Map<string, StoredCoverLetterRecord>();

  private purgeExpired(): void {
    const now = Date.now();

    for (const [id, entry] of this.records) {
      if (entry.expiresAt <= now) {
        this.records.delete(id);
      }
    }
  }

  private save(record: CoverLetterRecord): void {
    this.records.set(record.coverLetterId, { record, expiresAt: Date.now() + COVER_TTL_MS });
  }

  private mustGet(coverLetterId: string): CoverLetterRecord {
    this.purgeExpired();
    const stored = this.records.get(coverLetterId);

    if (!stored) {
      throw new Error("Cover letter session not found or expired.");
    }

    return stored.record;
  }

  private resolveContext(record: CoverLetterRecord): ResolvedContext {
    const jdMatchRecord = jdMatchService.get(record.jdMatchId);

    if (!jdMatchRecord) {
      throw new Error("JD match result not found or expired — please re-run the match analysis.");
    }

    const resumeRecord = resumeService.get(jdMatchRecord.resumeId);

    if (!resumeRecord) {
      throw new Error("Resume not found or expired — please re-upload your resume.");
    }

    return { resume: resumeRecord.resume, jd: jdMatchRecord.jobDescription, jdMatchResult: jdMatchRecord.matchResult };
  }

  /** Validates every variant's fullText; on failure, retries the whole call once, then drops any still-invalid variant. Throws only if every variant fails even after the retry. */
  private async generateValidatedLetter(ctx: CoverLetterGenerationContext, resume: ResolvedContext["resume"], jd: JobDescription): Promise<CoverLetterVariant[]> {
    let variants = await generateCoverLetter(ctx);
    let invalid = variants.filter((variant) => !validateCoverContent(resume, jd, ctx.companyName, variant.sections.fullText).valid);

    if (invalid.length > 0) {
      const violations = invalid.flatMap(
        (variant) => validateCoverContent(resume, jd, ctx.companyName, variant.sections.fullText).violations
      );
      variants = await generateCoverLetter(ctx, violations.join("; "));
      invalid = variants.filter((variant) => !validateCoverContent(resume, jd, ctx.companyName, variant.sections.fullText).valid);
    }

    const valid = variants.filter((variant) => !invalid.includes(variant));

    console.log(`${LOG_PREFIX} Validation Passed`, { kept: valid.length, rejected: invalid.length });

    if (valid.length === 0) {
      throw new Error("Cover letter generation repeatedly produced ungrounded content — please try again or adjust the style/length.");
    }

    return valid;
  }

  async start(input: CoverLetterGenerateInput): Promise<CoverLetterRecord> {
    console.log(`${LOG_PREFIX} Generation Started`, { jdMatchId: input.jdMatchId, style: input.style, length: input.length });

    const jdMatchRecord = jdMatchService.get(input.jdMatchId);

    if (!jdMatchRecord) {
      throw new Error("JD match result not found or expired — please re-run the match analysis.");
    }

    const resumeRecord = resumeService.get(jdMatchRecord.resumeId);

    if (!resumeRecord) {
      throw new Error("Resume not found or expired — please re-upload your resume.");
    }

    const { resume } = resumeRecord;
    const { jobDescription, matchResult } = jdMatchRecord;
    const optimizerResult = resumeOptimizer.get(input.jdMatchId) ?? null;

    const companyName = input.companyName?.trim() || jobDescription.companyName;
    if (!companyName) {
      throw new Error("Company name is required — the job description didn't include one, so please provide it explicitly.");
    }

    const role = input.role?.trim() || jobDescription.jobTitle;
    if (!role) {
      throw new Error("Role is required — the job description didn't include a job title, so please provide it explicitly.");
    }

    const hiringManager = input.hiringManager?.trim() || null;
    const talkingPoints = deriveCompanyTalkingPoints(jobDescription, companyName);

    const ctx: CoverLetterGenerationContext = {
      resume,
      jd: jobDescription,
      jdMatchResult: matchResult,
      optimizerResult,
      talkingPoints,
      companyName,
      hiringManager,
      role,
      style: input.style,
      length: input.length,
    };

    const letterVariants = await this.generateValidatedLetter(ctx, resume, jobDescription);
    console.log(`${LOG_PREFIX} Letter Generated`, { variants: letterVariants.length });

    const primaryText = letterVariants[0].sections.fullText;
    const keywordCoverage = computeKeywordCoverage(matchResult, primaryText);
    const reasoning = computeReasoning(matchResult, jobDescription, primaryText);

    const createdAt = new Date().toISOString();
    const record: CoverLetterRecord = {
      coverLetterId: randomUUID(),
      jdMatchId: input.jdMatchId,
      companyName,
      hiringManager,
      role,
      style: input.style,
      length: input.length,
      letterVariants,
      acceptedLetter: null,
      letterHistory: [],
      emails: {},
      linkedinMessages: null,
      keywordCoverage,
      reasoning,
      createdAt,
      updatedAt: createdAt,
    };

    this.purgeExpired();
    this.save(record);

    console.log(`${LOG_PREFIX} Completed`, { coverLetterId: record.coverLetterId });

    return record;
  }

  get(coverLetterId: string): CoverLetterRecord | undefined {
    this.purgeExpired();
    return this.records.get(coverLetterId)?.record;
  }

  async regenerateLetter(coverLetterId: string, style?: CoverLetterStyle, length?: CoverLetterLength): Promise<CoverLetterRecord> {
    const record = this.mustGet(coverLetterId);
    const { resume, jd, jdMatchResult } = this.resolveContext(record);
    const optimizerResult = resumeOptimizer.get(record.jdMatchId) ?? null;

    const effectiveStyle = style ?? record.style;
    const effectiveLength = length ?? record.length;
    const talkingPoints = deriveCompanyTalkingPoints(jd, record.companyName);

    console.log(`${LOG_PREFIX} Generation Started`, { coverLetterId, style: effectiveStyle, length: effectiveLength, regenerate: true });

    const ctx: CoverLetterGenerationContext = {
      resume,
      jd,
      jdMatchResult,
      optimizerResult,
      talkingPoints,
      companyName: record.companyName,
      hiringManager: record.hiringManager,
      role: record.role,
      style: effectiveStyle,
      length: effectiveLength,
    };

    const letterVariants = await this.generateValidatedLetter(ctx, resume, jd);
    console.log(`${LOG_PREFIX} Letter Generated`, { coverLetterId, variants: letterVariants.length });

    const primaryText = letterVariants[0].sections.fullText;

    const updated: CoverLetterRecord = {
      ...record,
      style: effectiveStyle,
      length: effectiveLength,
      letterVariants,
      keywordCoverage: computeKeywordCoverage(jdMatchResult, primaryText),
      reasoning: computeReasoning(jdMatchResult, jd, primaryText),
      updatedAt: new Date().toISOString(),
    };

    this.save(updated);
    console.log(`${LOG_PREFIX} Completed`, { coverLetterId });

    return updated;
  }

  acceptLetterVariant(coverLetterId: string, version: VariantVersion): CoverLetterRecord {
    const record = this.mustGet(coverLetterId);
    const chosen = record.letterVariants.find((variant) => variant.version === version);

    if (!chosen) {
      throw new Error(`No pending variant "${version}" to accept.`);
    }

    const updated: CoverLetterRecord = {
      ...record,
      acceptedLetter: chosen,
      letterHistory: record.acceptedLetter ? [...record.letterHistory, record.acceptedLetter] : record.letterHistory,
      updatedAt: new Date().toISOString(),
    };

    this.save(updated);

    return updated;
  }

  async generateEmail(coverLetterId: string, audience: EmailAudience): Promise<CoverLetterRecord> {
    const record = this.mustGet(coverLetterId);
    const { resume, jd } = this.resolveContext(record);

    let output = await generateApplicationEmail(resume, jd, record.companyName, record.role, record.style, audience);
    let validation = validateCoverContent(resume, jd, record.companyName, `${output.subject} ${output.body}`);

    if (!validation.valid) {
      output = await generateApplicationEmail(resume, jd, record.companyName, record.role, record.style, audience, validation.violations.join("; "));
      validation = validateCoverContent(resume, jd, record.companyName, `${output.subject} ${output.body}`);

      if (!validation.valid) {
        throw new Error(`Application email generation repeatedly produced ungrounded content: ${validation.violations.join("; ")}`);
      }
    }

    console.log(`${LOG_PREFIX} Email Generated`, { coverLetterId, audience });
    console.log(`${LOG_PREFIX} Validation Passed`, { coverLetterId, artifact: "email", audience });

    const emailVariant: EmailVariant = { audience, subject: output.subject, body: output.body };

    const updated: CoverLetterRecord = {
      ...record,
      emails: { ...record.emails, [audience]: emailVariant },
      updatedAt: new Date().toISOString(),
    };

    this.save(updated);

    return updated;
  }

  async generateLinkedinMessages(coverLetterId: string): Promise<CoverLetterRecord> {
    const record = this.mustGet(coverLetterId);
    const { resume, jd } = this.resolveContext(record);

    let messages = await generateLinkedinMessages(resume, jd, record.companyName, record.role, record.style);
    let invalid = messages.filter((message) => !validateCoverContent(resume, jd, record.companyName, message.message).valid);

    if (invalid.length > 0) {
      const violations = invalid.flatMap((message) => validateCoverContent(resume, jd, record.companyName, message.message).violations);
      messages = await generateLinkedinMessages(resume, jd, record.companyName, record.role, record.style, violations.join("; "));
      invalid = messages.filter((message) => !validateCoverContent(resume, jd, record.companyName, message.message).valid);
    }

    const valid: LinkedinMessage[] = messages.filter((message) => !invalid.includes(message));

    console.log(`${LOG_PREFIX} LinkedIn Generated`, { coverLetterId, kept: valid.length, rejected: invalid.length });
    console.log(`${LOG_PREFIX} Validation Passed`, { coverLetterId, artifact: "linkedin" });

    const updated: CoverLetterRecord = {
      ...record,
      linkedinMessages: valid,
      updatedAt: new Date().toISOString(),
    };

    this.save(updated);

    return updated;
  }
}

export const coverLetterService = new CoverLetterService();
