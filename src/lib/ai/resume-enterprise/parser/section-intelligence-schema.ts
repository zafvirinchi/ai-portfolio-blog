import { z } from "zod";
import {
  awardEntrySchema,
  companyEntrySchema,
  patentEntrySchema,
  personalInfoSchema,
  professionalSummarySchema,
  publicationEntrySchema,
  resumeSkillGroupSchema,
} from "../resume-schema";

// Phase 12 Milestone 5. Zod schema for the new, additive
// SectionIntelligenceResult output shape. Field renames here
// (personalInfo -> personalInformation, professionalSummary -> summary,
// companyHistory -> companies) exist ONLY at this new output layer — the
// underlying EnterpriseResume type/field names from Milestone 1 are
// untouched, so ats-score.ts/ats-breakdown.ts keep compiling and behaving
// identically.

const normalizedDateSchema = z.object({
  normalized: z.string().nullable(),
  raw: z.string().nullable(),
  isCurrent: z.boolean(),
  isApproximate: z.boolean(),
});

const timelineEntrySchema = z.object({
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  rawStartDate: z.string().nullable(),
  rawEndDate: z.string().nullable(),
  durationMonths: z.number().nullable(),
  isCurrent: z.boolean(),
  title: z.string().nullable(),
  company: z.string().nullable(),
  location: z.string().nullable(),
  employmentType: z.string().nullable(),
  industry: z.string().nullable(),
});

const employmentGapSchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
  months: z.number(),
  reason: z.string().nullable(),
});

const careerLevelTransitionSchema = z.object({
  from: z.string().nullable(),
  to: z.string(),
  date: z.string().nullable(),
  title: z.string(),
  company: z.string().nullable(),
});

const promotionEventSchema = z.object({
  title: z.string(),
  company: z.string().nullable(),
  date: z.string().nullable(),
  levelChange: z.number(),
});

const careerProgressionSchema = z.object({
  careerGrowth: z.array(careerLevelTransitionSchema),
  promotionHistory: z.array(promotionEventSchema),
  leadershipGrowth: z.boolean(),
  careerProgressionScore: z.number().min(0).max(100),
});

const careerStatisticsSchema = z.object({
  totalExperienceMonths: z.number(),
  relevantExperienceMonths: z.number(),
  averageTenureMonths: z.number(),
  longestTenureMonths: z.number(),
  shortestTenureMonths: z.number(),
  careerStabilityScore: z.number().min(0).max(100),
  careerProgressionScore: z.number().min(0).max(100),
  promotionCount: z.number(),
  employmentGapCount: z.number(),
  largestEmploymentGapMonths: z.number(),
  averageEmploymentGapMonths: z.number(),
});

const normalizedEducationSchema = z.object({
  institute: z.string().nullable(),
  degree: z.string().nullable(),
  specialization: z.string().nullable(),
  startYear: z.string().nullable(),
  endYear: z.string().nullable(),
  grade: z.object({ type: z.enum(["percentage", "cgpa"]), value: z.number() }).nullable(),
  city: z.string().nullable(),
  country: z.string().nullable(),
});

const normalizedCertificationSchema = z.object({
  name: z.string().nullable(),
  vendor: z.string().nullable(),
  issueDate: normalizedDateSchema,
  expiryDate: normalizedDateSchema,
  credentialId: z.string().nullable(),
  credentialUrl: z.string().nullable(),
  skillsCovered: z.array(z.string()),
});

const normalizedProjectSchema = z.object({
  name: z.string().nullable(),
  organization: z.string().nullable(),
  role: z.string().nullable(),
  duration: z.string().nullable(),
  description: z.string().nullable(),
  technologies: z.array(z.string()),
  tools: z.array(z.string()),
  teamSize: z.number().nullable(),
  responsibilities: z.array(z.string()),
  achievements: z.array(z.string()),
});

const normalizedLanguageSchema = z.object({
  language: z.string(),
  proficiency: z.enum(["Native", "Professional", "Intermediate", "Beginner"]).nullable(),
});

const parserQualitySchema = z.object({
  score: z.number().min(0).max(100),
  issues: z.array(z.string()),
});

const parserMetadataSchema = z.object({
  parserVersion: z.string(),
  processingTime: z.number(),
  confidence: z.number().min(0).max(1),
  documentLanguage: z.string(),
  sectionCount: z.number(),
  pageCount: z.number(),
  totalWords: z.number(),
  resumeLength: z.number(),
});

// Section 14 of the spec lists a fixed top-level field set that doesn't
// include employmentGaps/careerProgression, even though Sections 4-5
// explicitly require generating that detailed data. Rather than compute
// it and silently discard it, both are included here as additional
// fields beyond the literal Section 14 list — careerStatistics already
// summarizes gap/promotion *counts*, these two carry the underlying
// detail (each gap's dates/reason, each promotion's title/company/date).
export const sectionIntelligenceResultSchema = z.object({
  personalInformation: personalInfoSchema,
  summary: professionalSummarySchema,
  timeline: z.array(timelineEntrySchema),
  companies: z.array(companyEntrySchema),
  education: z.array(normalizedEducationSchema),
  certifications: z.array(normalizedCertificationSchema),
  awards: z.array(awardEntrySchema),
  projects: z.array(normalizedProjectSchema),
  publications: z.array(publicationEntrySchema),
  patents: z.array(patentEntrySchema),
  skills: z.array(resumeSkillGroupSchema),
  softSkills: z.array(z.string()),
  technologies: z.array(z.string()),
  tools: z.array(z.string()),
  languages: z.array(normalizedLanguageSchema),
  achievements: z.array(z.string()),
  employmentGaps: z.array(employmentGapSchema),
  careerProgression: careerProgressionSchema,
  parserMetadata: parserMetadataSchema,
  parserQuality: parserQualitySchema,
  careerStatistics: careerStatisticsSchema,
});

export type SectionIntelligenceResult = z.infer<typeof sectionIntelligenceResultSchema>;
