import { z } from "zod";

// Phase 13 Milestone 2. New, standalone schema for the richer AI Resume
// Optimizer — deliberately separate from optimizer.ts/jd-schema.ts's
// existing OptimizerOutput (Milestone 4, untouched). Same split as the
// rest of this package: an LLM-output schema (what the structured-output
// call actually returns) and a final result schema (LLM output plus
// deterministic post-processing fields computed in resume-optimizer.ts,
// never returned directly by the LLM).

export const SKILL_CATEGORIES = [
  "Programming",
  "Backend",
  "Frontend",
  "Cloud",
  "DevOps",
  "AI",
  "Database",
  "Testing",
  "Tools",
] as const;

export const categorizedSkillGroupSchema = z.object({
  category: z.enum(SKILL_CATEGORIES),
  skills: z.array(z.string()).default([]),
});

export const optimizedBulletSchema = z.object({
  original: z.string(),
  optimized: z.string(),
});

export const IMPROVEMENT_NOTE_CATEGORIES = [
  "Removed redundancy",
  "Improved wording",
  "Added ATS keywords",
  "Improved readability",
  "Strengthened action verbs",
] as const;

export const formattingSuggestionSchema = z.object({
  area: z.string(),
  suggestion: z.string(),
});

export const improvementNoteSchema = z.object({
  category: z.enum(IMPROVEMENT_NOTE_CATEGORIES),
  note: z.string(),
});

export type CategorizedSkillGroup = z.infer<typeof categorizedSkillGroupSchema>;
export type OptimizedBulletPair = z.infer<typeof optimizedBulletSchema>;
export type FormattingSuggestion = z.infer<typeof formattingSuggestionSchema>;
export type ImprovementNote = z.infer<typeof improvementNoteSchema>;

// What the structured-output call returns.
export const resumeOptimizerLlmOutputSchema = z.object({
  optimizedSummary: z.string(),
  optimizedSkills: z.array(categorizedSkillGroupSchema).default([]),
  optimizedExperience: z.array(optimizedBulletSchema).default([]),
  optimizedProjects: z.array(optimizedBulletSchema).default([]),
  optimizedAchievements: z.array(optimizedBulletSchema).default([]),
  insertedKeywords: z.array(z.string()).default([]),
  formattingSuggestions: z.array(formattingSuggestionSchema).default([]),
  improvementNotes: z.array(improvementNoteSchema).default([]),
});

export type ResumeOptimizerLlmOutput = z.infer<typeof resumeOptimizerLlmOutputSchema>;

const STRING_ARRAY = { type: "array", items: { type: "string" } } as const;

const categorizedSkillGroupJsonSchema = {
  type: "object",
  properties: {
    category: { type: "string", enum: [...SKILL_CATEGORIES] },
    skills: STRING_ARRAY,
  },
  required: ["category", "skills"],
  additionalProperties: false,
};

const optimizedBulletJsonSchema = {
  type: "object",
  properties: {
    original: { type: "string" },
    optimized: { type: "string" },
  },
  required: ["original", "optimized"],
  additionalProperties: false,
};

const formattingSuggestionJsonSchema = {
  type: "object",
  properties: {
    area: { type: "string" },
    suggestion: { type: "string" },
  },
  required: ["area", "suggestion"],
  additionalProperties: false,
};

const improvementNoteJsonSchema = {
  type: "object",
  properties: {
    category: { type: "string", enum: [...IMPROVEMENT_NOTE_CATEGORIES] },
    note: { type: "string" },
  },
  required: ["category", "note"],
  additionalProperties: false,
};

export const RESUME_OPTIMIZER_JSON_SCHEMA: {
  name: string;
  strict: true;
  schema: Record<string, unknown>;
} = {
  name: "resume_optimizer_v2_output",
  strict: true,
  schema: {
    type: "object",
    properties: {
      optimizedSummary: { type: "string" },
      optimizedSkills: { type: "array", items: categorizedSkillGroupJsonSchema },
      optimizedExperience: { type: "array", items: optimizedBulletJsonSchema },
      optimizedProjects: { type: "array", items: optimizedBulletJsonSchema },
      optimizedAchievements: { type: "array", items: optimizedBulletJsonSchema },
      insertedKeywords: STRING_ARRAY,
      formattingSuggestions: { type: "array", items: formattingSuggestionJsonSchema },
      improvementNotes: { type: "array", items: improvementNoteJsonSchema },
    },
    required: [
      "optimizedSummary",
      "optimizedSkills",
      "optimizedExperience",
      "optimizedProjects",
      "optimizedAchievements",
      "insertedKeywords",
      "formattingSuggestions",
      "improvementNotes",
    ],
    additionalProperties: false,
  },
};

// ---------------------------------------------------------------------------
// Final result — LLM output plus deterministic fields (changeType,
// removedItems, overallImprovementScore) computed in resume-optimizer.ts.
// Never itself sent through response_format, so no JSON-schema mirror.
// ---------------------------------------------------------------------------

export const changedBulletSchema = z.object({
  original: z.string(),
  optimized: z.string(),
  changeType: z.literal("modified"),
});

export const REMOVED_ITEM_SECTIONS = ["experience", "project", "achievement"] as const;

export const removedItemSchema = z.object({
  section: z.enum(REMOVED_ITEM_SECTIONS),
  text: z.string(),
});

export type ChangedBullet = z.infer<typeof changedBulletSchema>;
export type RemovedItem = z.infer<typeof removedItemSchema>;

export const resumeOptimizerResultSchema = z.object({
  optimizedSummary: z.string(),
  optimizedSkills: z.array(categorizedSkillGroupSchema).default([]),
  optimizedExperience: z.array(changedBulletSchema).default([]),
  optimizedProjects: z.array(changedBulletSchema).default([]),
  optimizedAchievements: z.array(changedBulletSchema).default([]),
  insertedKeywords: z.array(z.string()).default([]),
  formattingSuggestions: z.array(formattingSuggestionSchema).default([]),
  improvementNotes: z.array(improvementNoteSchema).default([]),
  removedItems: z.array(removedItemSchema).default([]),
  overallImprovementScore: z.number().min(0).max(100),
});

export type ResumeOptimizerResult = z.infer<typeof resumeOptimizerResultSchema>;
