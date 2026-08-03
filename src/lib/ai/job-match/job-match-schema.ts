import { z } from "zod";

// Scalars use `.nullable()` (not `.optional()`) throughout because OpenAI's
// strict Structured Outputs mode requires every property to be listed in
// `required` — mirrors the pattern in resume/resume-schema.ts exactly.

export const experienceGapSchema = z.object({
  area: z.string(),
  required: z.string(),
  candidateHas: z.string(),
});

export const resumeSectionFeedbackSchema = z.object({
  section: z.string(),
  feedback: z.string(),
});

export const jobMatchSubScoresSchema = z.object({
  technicalMatchPercent: z.number().min(0).max(100),
  experienceMatchPercent: z.number().min(0).max(100),
  educationMatchPercent: z.number().min(0).max(100),
  softSkillsMatchPercent: z.number().min(0).max(100),
});

export const jobMatchAnalysisSchema = z.object({
  jdMatchPercent: z.number().min(0).max(100),
  subScores: jobMatchSubScoresSchema,
  missingSkills: z.array(z.string()).default([]),
  missingKeywords: z.array(z.string()).default([]),
  experienceGaps: z.array(experienceGapSchema).default([]),
  softSkillGaps: z.array(z.string()).default([]),
  certificationGaps: z.array(z.string()).default([]),
  projectGaps: z.array(z.string()).default([]),
  resumeSectionAnalysis: z.array(resumeSectionFeedbackSchema).default([]),
  recruiterFeedback: z.string(),
  priorityImprovements: z.array(z.string()).default([]),
  finalRecommendation: z.string(),
});

export type ExperienceGap = z.infer<typeof experienceGapSchema>;
export type ResumeSectionFeedback = z.infer<typeof resumeSectionFeedbackSchema>;
export type JobMatchSubScores = z.infer<typeof jobMatchSubScoresSchema>;
export type JobMatchAnalysis = z.infer<typeof jobMatchAnalysisSchema>;

// Hand-written mirror of jobMatchAnalysisSchema for OpenAI's strict
// json_schema mode — kept separate rather than derived, same rationale as
// resume-schema.ts's RESUME_ANALYSIS_JSON_SCHEMA.
export const JOB_MATCH_ANALYSIS_JSON_SCHEMA: {
  name: string;
  strict: true;
  schema: Record<string, unknown>;
} = {
  name: "job_match_analysis",
  strict: true,
  schema: {
    type: "object",
    properties: {
      jdMatchPercent: { type: "number" },
      subScores: {
        type: "object",
        properties: {
          technicalMatchPercent: { type: "number" },
          experienceMatchPercent: { type: "number" },
          educationMatchPercent: { type: "number" },
          softSkillsMatchPercent: { type: "number" },
        },
        required: [
          "technicalMatchPercent",
          "experienceMatchPercent",
          "educationMatchPercent",
          "softSkillsMatchPercent",
        ],
        additionalProperties: false,
      },
      missingSkills: { type: "array", items: { type: "string" } },
      missingKeywords: { type: "array", items: { type: "string" } },
      experienceGaps: {
        type: "array",
        items: {
          type: "object",
          properties: {
            area: { type: "string" },
            required: { type: "string" },
            candidateHas: { type: "string" },
          },
          required: ["area", "required", "candidateHas"],
          additionalProperties: false,
        },
      },
      softSkillGaps: { type: "array", items: { type: "string" } },
      certificationGaps: { type: "array", items: { type: "string" } },
      projectGaps: { type: "array", items: { type: "string" } },
      resumeSectionAnalysis: {
        type: "array",
        items: {
          type: "object",
          properties: {
            section: { type: "string" },
            feedback: { type: "string" },
          },
          required: ["section", "feedback"],
          additionalProperties: false,
        },
      },
      recruiterFeedback: { type: "string" },
      priorityImprovements: { type: "array", items: { type: "string" } },
      finalRecommendation: { type: "string" },
    },
    required: [
      "jdMatchPercent",
      "subScores",
      "missingSkills",
      "missingKeywords",
      "experienceGaps",
      "softSkillGaps",
      "certificationGaps",
      "projectGaps",
      "resumeSectionAnalysis",
      "recruiterFeedback",
      "priorityImprovements",
      "finalRecommendation",
    ],
    additionalProperties: false,
  },
};
