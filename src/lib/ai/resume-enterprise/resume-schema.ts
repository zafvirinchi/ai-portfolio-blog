import { z } from "zod";

// Phase 12 Milestone 1 — schema/types only, no parsing logic here yet (see
// resume-parser.ts). Scalars use `.nullable()` (never `.optional()`) and
// arrays use `.array(...).default([])` throughout — same convention as
// resume/resume-schema.ts, required for OpenAI's strict-mode Structured
// Outputs later: every key must appear in `required`, so "not present on
// this resume" is modeled as `null`/`[]`, never a missing key.

export const personalInfoSchema = z.object({
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  linkedin: z.string().nullable(),
  github: z.string().nullable(),
  portfolio: z.string().nullable(),
  location: z.string().nullable(),
});

export const professionalSummarySchema = z.object({
  headline: z.string().nullable(),
  currentDesignation: z.string().nullable(),
  careerObjective: z.string().nullable(),
  yearsOfExperience: z.number().nullable(),
});

export const educationEntrySchema = z.object({
  institute: z.string().nullable(),
  degree: z.string().nullable(),
  specialization: z.string().nullable(),
  startYear: z.string().nullable(),
  endYear: z.string().nullable(),
  grade: z.string().nullable(),
});

export const companyEntrySchema = z.object({
  companyName: z.string().nullable(),
  designation: z.string().nullable(),
  employmentType: z.string().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  duration: z.string().nullable(),
  location: z.string().nullable(),
  responsibilities: z.array(z.string()).default([]),
  achievements: z.array(z.string()).default([]),
});

export const projectEntrySchema = z.object({
  projectName: z.string().nullable(),
  client: z.string().nullable(),
  role: z.string().nullable(),
  description: z.string().nullable(),
  responsibilities: z.array(z.string()).default([]),
  technologies: z.array(z.string()).default([]),
  duration: z.string().nullable(),
  achievements: z.array(z.string()).default([]),
});

// A single category's skills (e.g. { category: "Cloud", skills: ["AWS",
// "GCP"] }) rather than one object with a fixed field per category — keeps
// EnterpriseResume.skills extensible to new categories without a schema
// shape change, and matches the singular "ResumeSkillGroup" type name.
export const SKILL_CATEGORIES = [
  "Programming Languages",
  "Frameworks",
  "Libraries",
  "Cloud",
  "DevOps",
  "Databases",
  "AI",
  "Soft Skills",
  "Tools",
  "Methodologies",
] as const;

export const resumeSkillGroupSchema = z.object({
  category: z.enum(SKILL_CATEGORIES),
  skills: z.array(z.string()).default([]),
});

export const certificationEntrySchema = z.object({
  name: z.string().nullable(),
  issuer: z.string().nullable(),
  date: z.string().nullable(),
  expiryDate: z.string().nullable(),
  credentialId: z.string().nullable(),
});

export const awardEntrySchema = z.object({
  title: z.string().nullable(),
  issuer: z.string().nullable(),
  date: z.string().nullable(),
  description: z.string().nullable(),
});

export const publicationEntrySchema = z.object({
  title: z.string().nullable(),
  publisher: z.string().nullable(),
  date: z.string().nullable(),
  url: z.string().nullable(),
  description: z.string().nullable(),
});

export const patentEntrySchema = z.object({
  title: z.string().nullable(),
  patentNumber: z.string().nullable(),
  date: z.string().nullable(),
  description: z.string().nullable(),
});

export const languageEntrySchema = z.object({
  language: z.string(),
  proficiency: z.string().nullable(),
});

export const volunteerEntrySchema = z.object({
  organization: z.string().nullable(),
  role: z.string().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  description: z.string().nullable(),
});

export const enterpriseResumeSchema = z.object({
  personalInfo: personalInfoSchema,
  professionalSummary: professionalSummarySchema,
  education: z.array(educationEntrySchema).default([]),
  companyHistory: z.array(companyEntrySchema).default([]),
  projects: z.array(projectEntrySchema).default([]),
  skills: z.array(resumeSkillGroupSchema).default([]),
  certifications: z.array(certificationEntrySchema).default([]),
  awards: z.array(awardEntrySchema).default([]),
  publications: z.array(publicationEntrySchema).default([]),
  patents: z.array(patentEntrySchema).default([]),
  languagesKnown: z.array(languageEntrySchema).default([]),
  volunteerExperience: z.array(volunteerEntrySchema).default([]),
  interests: z.array(z.string()).default([]),
  achievements: z.array(z.string()).default([]),
});

// Phase 12 Milestone 2 — confidence scoring. Deliberately a schema separate
// from enterpriseResumeSchema (never merged into it): the OpenAI call uses
// ENTERPRISE_RESUME_JSON_SCHEMA unmodified in strict mode
// (`additionalProperties: false`), so the raw extraction literally cannot
// contain a `confidence` key. Confidence is computed deterministically from
// the validated EnterpriseResume in resume-parser.ts instead of a second
// LLM call — same reasoning resume/resume-score.ts already uses for ATS
// scoring ("avoids a third LLM round trip").
export const resumeParserConfidenceSchema = z.object({
  personalInfo: z.number().min(0).max(1),
  professionalSummary: z.number().min(0).max(1),
  education: z.number().min(0).max(1),
  companyHistory: z.number().min(0).max(1),
  projects: z.number().min(0).max(1),
  skills: z.number().min(0).max(1),
  certifications: z.number().min(0).max(1),
  awards: z.number().min(0).max(1),
  publications: z.number().min(0).max(1),
  patents: z.number().min(0).max(1),
  languagesKnown: z.number().min(0).max(1),
  volunteerExperience: z.number().min(0).max(1),
  overall: z.number().min(0).max(1),
});

export type ResumeParserConfidence = z.infer<typeof resumeParserConfidenceSchema>;

export type PersonalInfo = z.infer<typeof personalInfoSchema>;
export type ProfessionalSummary = z.infer<typeof professionalSummarySchema>;
export type ResumeEducation = z.infer<typeof educationEntrySchema>;
export type ResumeCompany = z.infer<typeof companyEntrySchema>;
export type ResumeProject = z.infer<typeof projectEntrySchema>;
export type ResumeSkillGroup = z.infer<typeof resumeSkillGroupSchema>;
export type SkillCategory = (typeof SKILL_CATEGORIES)[number];
export type ResumeCertification = z.infer<typeof certificationEntrySchema>;
export type ResumeAward = z.infer<typeof awardEntrySchema>;
export type ResumePublication = z.infer<typeof publicationEntrySchema>;
export type ResumePatent = z.infer<typeof patentEntrySchema>;
export type ResumeLanguage = z.infer<typeof languageEntrySchema>;
export type ResumeVolunteerExperience = z.infer<typeof volunteerEntrySchema>;
export type EnterpriseResume = z.infer<typeof enterpriseResumeSchema>;
