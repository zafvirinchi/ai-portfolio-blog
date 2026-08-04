import { z } from "zod";
import {
  ATS_ACHIEVEMENT_TYPES,
  ATS_FEEDBACK_PRIORITIES,
  ATS_FORMATTING_SEVERITIES,
  ATS_SECTION_KEYS,
  ATS_SECTION_STATUSES,
  ATS_TECHNOLOGY_CATEGORIES,
  ATS_TECHNOLOGY_STATUSES,
} from "./ats-types";

// Phase 12 Milestone 3. Zod schemas for the ATS engine's *output* shape
// only — there is no OpenAI call anywhere in this package, so (unlike
// resume-schema.ts/resume-json-schema.ts) there is no hand-written
// json_schema mirror here; these schemas exist for type inference and
// optional runtime validation of the deterministic engine's own output.

export const atsSectionKeySchema = z.enum(ATS_SECTION_KEYS);
export const atsSectionStatusSchema = z.enum(ATS_SECTION_STATUSES);
export const atsTechnologyCategorySchema = z.enum(ATS_TECHNOLOGY_CATEGORIES);
export const atsTechnologyStatusSchema = z.enum(ATS_TECHNOLOGY_STATUSES);
export const atsFeedbackPrioritySchema = z.enum(ATS_FEEDBACK_PRIORITIES);
export const atsFormattingSeveritySchema = z.enum(ATS_FORMATTING_SEVERITIES);
export const atsAchievementTypeSchema = z.enum(ATS_ACHIEVEMENT_TYPES);

// z.union of literals rather than derived from ATS_FEEDBACK_IMPACTS — kept
// hand-written for the same reason every other json-schema-adjacent enum in
// this codebase is hand-written: explicit is easier to review than derived.
export const atsFeedbackImpactSchema = z.union([
  z.literal(2),
  z.literal(5),
  z.literal(8),
  z.literal(10),
]);

export const atsSectionScoreSchema = z.object({
  key: atsSectionKeySchema,
  label: z.string(),
  score: z.number().min(0),
  maxScore: z.number().min(0),
  percentage: z.number().min(0).max(100),
  status: atsSectionStatusSchema,
});

export const atsFeedbackItemSchema = z.object({
  id: z.string(),
  section: atsSectionKeySchema,
  message: z.string(),
  priority: atsFeedbackPrioritySchema,
  impact: atsFeedbackImpactSchema,
  quickFix: z.boolean(),
});

export const atsTechnologyCoverageEntrySchema = z.object({
  name: z.string(),
  category: atsTechnologyCategorySchema,
  mentions: z.number().min(0),
  status: atsTechnologyStatusSchema,
});

export const atsKeywordDensityEntrySchema = z.object({
  category: atsTechnologyCategorySchema,
  matched: z.number().min(0),
  total: z.number().min(0),
  density: z.number().min(0).max(100),
});

export const atsFormattingIssueSchema = z.object({
  id: z.string(),
  message: z.string(),
  severity: atsFormattingSeveritySchema,
});

export const atsBuzzwordFindingSchema = z.object({
  phrase: z.string(),
  occurrences: z.number().min(1),
  suggestedReplacements: z.array(z.string()).default([]),
});

export const atsAchievementFindingSchema = z.object({
  type: atsAchievementTypeSchema,
  snippet: z.string(),
});

export const atsInsightsSchema = z.object({
  topStrengths: z.array(z.string()).default([]),
  topWeaknesses: z.array(z.string()).default([]),
  criticalImprovements: z.array(z.string()).default([]),
  immediateFixes: z.array(z.string()).default([]),
});

export const atsReportSchema = z.object({
  overallScore: z.number().min(0).max(100),
  // overallScore expressed as a 0-1 fraction — the section maxScores
  // already sum to 100 and are themselves the section weights, so
  // "weighted" and "overall" are the same composite; this is a normalized
  // view of it for consumers that want a fraction (progress bars,
  // threshold checks) rather than a percentage. See ats-engine.ts.
  weightedScore: z.number().min(0).max(1),
  sections: z.array(atsSectionScoreSchema),
  feedback: z.array(atsFeedbackItemSchema),
  formattingIssues: z.array(atsFormattingIssueSchema),
  technologyCoverage: z.array(atsTechnologyCoverageEntrySchema),
  keywordDensity: z.array(atsKeywordDensityEntrySchema),
  buzzwords: z.array(atsBuzzwordFindingSchema),
  achievements: z.array(atsAchievementFindingSchema),
  insights: atsInsightsSchema,
  processingTimeMs: z.number().min(0),
});

export type AtsSectionScore = z.infer<typeof atsSectionScoreSchema>;
export type AtsFeedbackItem = z.infer<typeof atsFeedbackItemSchema>;
export type AtsTechnologyCoverageEntry = z.infer<typeof atsTechnologyCoverageEntrySchema>;
export type AtsKeywordDensityEntry = z.infer<typeof atsKeywordDensityEntrySchema>;
export type AtsFormattingIssue = z.infer<typeof atsFormattingIssueSchema>;
export type AtsBuzzwordFinding = z.infer<typeof atsBuzzwordFindingSchema>;
export type AtsAchievementFinding = z.infer<typeof atsAchievementFindingSchema>;
export type AtsInsights = z.infer<typeof atsInsightsSchema>;
export type AtsReport = z.infer<typeof atsReportSchema>;
