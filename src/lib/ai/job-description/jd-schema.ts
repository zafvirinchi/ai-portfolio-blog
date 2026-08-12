import { z } from "zod";

// ---------------------------------------------------------------------------
// Job description extraction schema (jd-parser.ts)
// ---------------------------------------------------------------------------
// Scalars use `.nullable()` (not `.optional()`) throughout — same
// requirement as resume/resume-schema.ts: OpenAI's strict Structured
// Outputs mode requires every property listed in `required`.

export const jdExperienceRequirementSchema = z.object({
  minYears: z.number().nullable(),
  maxYears: z.number().nullable(),
  raw: z.string().nullable(),
});

export const jobDescriptionSchema = z.object({
  companyName: z.string().nullable(),
  jobTitle: z.string().nullable(),
  experienceRequired: jdExperienceRequirementSchema,
  educationRequired: z.array(z.string()).default([]),
  skills: z.array(z.string()).default([]),
  mandatorySkills: z.array(z.string()).default([]),
  goodToHaveSkills: z.array(z.string()).default([]),
  responsibilities: z.array(z.string()).default([]),
  softSkills: z.array(z.string()).default([]),
  certifications: z.array(z.string()).default([]),
  cloud: z.array(z.string()).default([]),
  frameworks: z.array(z.string()).default([]),
  programmingLanguages: z.array(z.string()).default([]),
  tools: z.array(z.string()).default([]),
  databases: z.array(z.string()).default([]),
  aiSkills: z.array(z.string()).default([]),
  security: z.array(z.string()).default([]),
  domain: z.string().nullable(),
});

export type JdExperienceRequirement = z.infer<typeof jdExperienceRequirementSchema>;
export type JobDescription = z.infer<typeof jobDescriptionSchema>;

// ---------------------------------------------------------------------------
// Optimization mode (Milestone 15, §22) — controls how much latitude
// optimizer.ts's rewrite prompt takes, never how truthful it's allowed to
// be (the truthfulness rules apply identically at every mode).
// ---------------------------------------------------------------------------

export const OPTIMIZATION_MODES = ["conservative", "balanced", "aggressive"] as const;
export type OptimizationMode = (typeof OPTIMIZATION_MODES)[number];
export const DEFAULT_OPTIMIZATION_MODE: OptimizationMode = "balanced";

const JD_STRING_ARRAY = { type: "array", items: { type: "string" } } as const;

export const JOB_DESCRIPTION_JSON_SCHEMA: {
  name: string;
  strict: true;
  schema: Record<string, unknown>;
} = {
  name: "job_description_extraction",
  strict: true,
  schema: {
    type: "object",
    properties: {
      companyName: { type: ["string", "null"] },
      jobTitle: { type: ["string", "null"] },
      experienceRequired: {
        type: "object",
        properties: {
          minYears: { type: ["number", "null"] },
          maxYears: { type: ["number", "null"] },
          raw: { type: ["string", "null"] },
        },
        required: ["minYears", "maxYears", "raw"],
        additionalProperties: false,
      },
      educationRequired: JD_STRING_ARRAY,
      skills: JD_STRING_ARRAY,
      mandatorySkills: JD_STRING_ARRAY,
      goodToHaveSkills: JD_STRING_ARRAY,
      responsibilities: JD_STRING_ARRAY,
      softSkills: JD_STRING_ARRAY,
      certifications: JD_STRING_ARRAY,
      cloud: JD_STRING_ARRAY,
      frameworks: JD_STRING_ARRAY,
      programmingLanguages: JD_STRING_ARRAY,
      tools: JD_STRING_ARRAY,
      databases: JD_STRING_ARRAY,
      aiSkills: JD_STRING_ARRAY,
      security: JD_STRING_ARRAY,
      domain: { type: ["string", "null"] },
    },
    required: [
      "companyName",
      "jobTitle",
      "experienceRequired",
      "educationRequired",
      "skills",
      "mandatorySkills",
      "goodToHaveSkills",
      "responsibilities",
      "softSkills",
      "certifications",
      "cloud",
      "frameworks",
      "programmingLanguages",
      "tools",
      "databases",
      "aiSkills",
      "security",
      "domain",
    ],
    additionalProperties: false,
  },
};

// ---------------------------------------------------------------------------
// Optimizer output schema (optimizer.ts) — the one LLM call that generates
// rather than extracts. Combines the Step 6 (rewrite) and Step 7
// (improvement suggestions) outputs into a single structured-output call.
// ---------------------------------------------------------------------------

export const optimizedBulletSchema = z.object({
  original: z.string(),
  optimized: z.string(),
  starFormat: z.boolean(),
});

export const improvementSuggestionSchema = z.object({
  title: z.string(),
  why: z.string(),
  impact: z.string(),
  howToFix: z.string(),
  priority: z.enum(["High", "Medium", "Low"]),
});

export const optimizerOutputSchema = z.object({
  optimizedSummary: z.string(),
  optimizedExperience: z.array(optimizedBulletSchema).default([]),
  optimizedProjects: z.array(optimizedBulletSchema).default([]),
  optimizedSkills: z.array(z.string()).default([]),
  missingSkillsSection: z.array(z.string()).default([]),
  improvementSuggestions: z.array(improvementSuggestionSchema).default([]),
});

export type OptimizedBullet = z.infer<typeof optimizedBulletSchema>;
export type ImprovementSuggestion = z.infer<typeof improvementSuggestionSchema>;
export type OptimizerOutput = z.infer<typeof optimizerOutputSchema>;

const optimizedBulletJsonSchema = {
  type: "object",
  properties: {
    original: { type: "string" },
    optimized: { type: "string" },
    starFormat: { type: "boolean" },
  },
  required: ["original", "optimized", "starFormat"],
  additionalProperties: false,
};

export const OPTIMIZER_JSON_SCHEMA: {
  name: string;
  strict: true;
  schema: Record<string, unknown>;
} = {
  name: "resume_optimizer_output",
  strict: true,
  schema: {
    type: "object",
    properties: {
      optimizedSummary: { type: "string" },
      optimizedExperience: { type: "array", items: optimizedBulletJsonSchema },
      optimizedProjects: { type: "array", items: optimizedBulletJsonSchema },
      optimizedSkills: JD_STRING_ARRAY,
      missingSkillsSection: JD_STRING_ARRAY,
      improvementSuggestions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            why: { type: "string" },
            impact: { type: "string" },
            howToFix: { type: "string" },
            priority: { type: "string", enum: ["High", "Medium", "Low"] },
          },
          required: ["title", "why", "impact", "howToFix", "priority"],
          additionalProperties: false,
        },
      },
    },
    required: [
      "optimizedSummary",
      "optimizedExperience",
      "optimizedProjects",
      "optimizedSkills",
      "missingSkillsSection",
      "improvementSuggestions",
    ],
    additionalProperties: false,
  },
};

// ---------------------------------------------------------------------------
// Final combined result (jd-service.ts assembles this programmatically —
// it's never returned directly by an LLM call, so no JSON-schema mirror is
// needed here). Covers Step 8's literal field list plus formattingScore/
// achievementScore/softSkillsScore/experienceMatch/educationMatch, which
// Steps 3-5 explicitly require computing even though Step 8's example JSON
// omits them — same "don't silently discard real computed data" precedent
// Milestone 5 set for employmentGaps/careerProgression.
// ---------------------------------------------------------------------------

export const experienceMatchSchema = z.object({
  level: z.enum(["Excellent", "Good", "Weak"]),
  score: z.number().min(0).max(100),
  reasoning: z.string(),
});

export const educationMatchSchema = z.object({
  matched: z.array(z.string()).default([]),
  missing: z.array(z.string()).default([]),
  betterAlternatives: z.array(z.string()).default([]),
});

export const jdMatchResultSchema = z.object({
  overallMatch: z.number().min(0).max(100),
  atsScore: z.number().min(0).max(100),
  keywordScore: z.number().min(0).max(100),
  experienceScore: z.number().min(0).max(100),
  educationScore: z.number().min(0).max(100),
  formattingScore: z.number().min(0).max(100),
  achievementScore: z.number().min(0).max(100),
  projectScore: z.number().min(0).max(100),
  leadershipScore: z.number().min(0).max(100),
  certificationScore: z.number().min(0).max(100),
  aiScore: z.number().min(0).max(100),
  cloudScore: z.number().min(0).max(100),
  securityScore: z.number().min(0).max(100),
  softSkillsScore: z.number().min(0).max(100),
  matchedSkills: z.array(z.string()).default([]),
  /** JD skills that are the same technology family as something on the resume without being a confident exact match (e.g. resume shows "Spring Boot", JD wants "Spring Framework") — worth surfacing distinctly from a flat miss, per Milestone 15's MATCHED/PARTIAL/MISSING categorization. */
  partialSkills: z.array(z.object({ jdSkill: z.string(), resumeSkill: z.string(), reason: z.string() })).default([]),
  missingSkills: z.array(z.string()).default([]),
  additionalSkills: z.array(z.string()).default([]),
  resumeStrengths: z.array(z.string()).default([]),
  resumeWeaknesses: z.array(z.string()).default([]),
  experienceMatch: experienceMatchSchema,
  educationMatch: educationMatchSchema,
  optimizedSummary: z.string(),
  optimizedExperience: z.array(optimizedBulletSchema).default([]),
  optimizedProjects: z.array(optimizedBulletSchema).default([]),
  optimizedSkills: z.array(z.string()).default([]),
  missingKeywordsSection: z.array(z.string()).default([]),
  missingKeywords: z.array(z.string()).default([]),
  improvementSuggestions: z.array(improvementSuggestionSchema).default([]),
});

export type ExperienceMatch = z.infer<typeof experienceMatchSchema>;
export type EducationMatch = z.infer<typeof educationMatchSchema>;
export type JdMatchResult = z.infer<typeof jdMatchResultSchema>;
