import { z } from "zod";

// Phase 13 Milestone 6. Same "LLM-output schema vs. richer final type"
// split every milestone in this arc uses. This package is jdMatchId-
// driven (unlike Milestone 5's resume-only rewriter) — it consumes
// JdMatchResult and ResumeOptimizerResult read-only.

export const COVER_LETTER_STYLES = [
  "Recruiter",
  "Professional",
  "Executive",
  "Startup",
  "FAANG",
  "Consulting",
  "Banking",
  "AI",
  "Healthcare",
  "Government",
] as const;
export type CoverLetterStyle = (typeof COVER_LETTER_STYLES)[number];

// A word-count TIER, deliberately a separate axis from style — despite
// "Executive" appearing in both lists in the spec's own wording, these
// are not the same dimension (an Executive-*styled* letter can still be
// Short; a Startup-*styled* letter can still be the 500-word tier).
export const COVER_LETTER_LENGTHS = ["Short", "Standard", "Executive"] as const;
export type CoverLetterLength = (typeof COVER_LETTER_LENGTHS)[number];

export const EMAIL_AUDIENCES = ["Recruiter", "Referral", "LinkedIn"] as const;
export type EmailAudience = (typeof EMAIL_AUDIENCES)[number];

export const LINKEDIN_MESSAGE_TYPES = [
  "Connection Request",
  "Follow-up Message",
  "Recruiter Outreach",
  "Hiring Manager Message",
] as const;
export type LinkedinMessageType = (typeof LINKEDIN_MESSAGE_TYPES)[number];

export const VARIANT_VERSIONS = ["A", "B", "C"] as const;
export type VariantVersion = (typeof VARIANT_VERSIONS)[number];

// ---------------------------------------------------------------------------
// Cover letter — the spec's own 11-part structure, plus an assembled
// `fullText` (what's actually displayed/exported/copied).
// ---------------------------------------------------------------------------

export const coverLetterSectionsSchema = z.object({
  greeting: z.string(),
  opening: z.string(),
  whyCompany: z.string(),
  whyCandidate: z.string(),
  relevantExperience: z.string(),
  relevantProjects: z.string(),
  technicalSkills: z.string(),
  businessImpact: z.string(),
  closing: z.string(),
  callToAction: z.string(),
  signature: z.string(),
  fullText: z.string(),
});
export type CoverLetterSections = z.infer<typeof coverLetterSectionsSchema>;

export const coverLetterVariantSchema = z.object({
  version: z.enum(VARIANT_VERSIONS),
  sections: coverLetterSectionsSchema,
  wordCount: z.number(),
});
export type CoverLetterVariant = z.infer<typeof coverLetterVariantSchema>;

export const coverLetterLlmOutputSchema = z.object({
  variants: z.array(coverLetterVariantSchema).default([]),
});
export type CoverLetterLlmOutput = z.infer<typeof coverLetterLlmOutputSchema>;

// ---------------------------------------------------------------------------
// Application email — one call per requested audience.
// ---------------------------------------------------------------------------

export const emailVariantSchema = z.object({
  audience: z.enum(EMAIL_AUDIENCES),
  subject: z.string(),
  body: z.string(),
});
export type EmailVariant = z.infer<typeof emailVariantSchema>;

export const emailLlmOutputSchema = z.object({
  subject: z.string(),
  body: z.string(),
});
export type EmailLlmOutput = z.infer<typeof emailLlmOutputSchema>;

// ---------------------------------------------------------------------------
// LinkedIn messages — all 4 types together in one call (each is short).
// ---------------------------------------------------------------------------

export const linkedinMessageSchema = z.object({
  type: z.enum(LINKEDIN_MESSAGE_TYPES),
  message: z.string(),
});
export type LinkedinMessage = z.infer<typeof linkedinMessageSchema>;

export const linkedinMessagesLlmOutputSchema = z.object({
  messages: z.array(linkedinMessageSchema).default([]),
});
export type LinkedinMessagesLlmOutput = z.infer<typeof linkedinMessagesLlmOutputSchema>;

// ---------------------------------------------------------------------------
// Deterministic sections — never sent through response_format.
// ---------------------------------------------------------------------------

export const keywordCoverageSchema = z.object({
  jdKeywordsUsed: z.array(z.string()).default([]),
  missingKeywords: z.array(z.string()).default([]),
  atsImprovementNote: z.string(),
});
export type KeywordCoverage = z.infer<typeof keywordCoverageSchema>;

export const reasoningSchema = z.object({
  whyGenerated: z.string(),
  keywordsMatched: z.array(z.string()).default([]),
  resumeSectionsReferenced: z.array(z.string()).default([]),
  jdSectionsReferenced: z.array(z.string()).default([]),
});
export type Reasoning = z.infer<typeof reasoningSchema>;

// ---------------------------------------------------------------------------
// Hand-written strict JSON Schema mirrors.
// ---------------------------------------------------------------------------

type JsonSchemaSpec = { name: string; strict: true; schema: Record<string, unknown> };

const coverLetterSectionsJsonSchema = {
  type: "object",
  properties: {
    greeting: { type: "string" },
    opening: { type: "string" },
    whyCompany: { type: "string" },
    whyCandidate: { type: "string" },
    relevantExperience: { type: "string" },
    relevantProjects: { type: "string" },
    technicalSkills: { type: "string" },
    businessImpact: { type: "string" },
    closing: { type: "string" },
    callToAction: { type: "string" },
    signature: { type: "string" },
    fullText: { type: "string" },
  },
  required: [
    "greeting",
    "opening",
    "whyCompany",
    "whyCandidate",
    "relevantExperience",
    "relevantProjects",
    "technicalSkills",
    "businessImpact",
    "closing",
    "callToAction",
    "signature",
    "fullText",
  ],
  additionalProperties: false,
};

const coverLetterVariantJsonSchema = {
  type: "object",
  properties: {
    version: { type: "string", enum: [...VARIANT_VERSIONS] },
    sections: coverLetterSectionsJsonSchema,
    wordCount: { type: "number" },
  },
  required: ["version", "sections", "wordCount"],
  additionalProperties: false,
};

export const COVER_LETTER_JSON_SCHEMA: JsonSchemaSpec = {
  name: "cover_letter_variants",
  strict: true,
  schema: {
    type: "object",
    properties: { variants: { type: "array", items: coverLetterVariantJsonSchema } },
    required: ["variants"],
    additionalProperties: false,
  },
};

export const EMAIL_JSON_SCHEMA: JsonSchemaSpec = {
  name: "cover_letter_email",
  strict: true,
  schema: {
    type: "object",
    properties: {
      subject: { type: "string" },
      body: { type: "string" },
    },
    required: ["subject", "body"],
    additionalProperties: false,
  },
};

const linkedinMessageJsonSchema = {
  type: "object",
  properties: {
    type: { type: "string", enum: [...LINKEDIN_MESSAGE_TYPES] },
    message: { type: "string" },
  },
  required: ["type", "message"],
  additionalProperties: false,
};

export const LINKEDIN_MESSAGES_JSON_SCHEMA: JsonSchemaSpec = {
  name: "cover_letter_linkedin_messages",
  strict: true,
  schema: {
    type: "object",
    properties: { messages: { type: "array", items: linkedinMessageJsonSchema } },
    required: ["messages"],
    additionalProperties: false,
  },
};
