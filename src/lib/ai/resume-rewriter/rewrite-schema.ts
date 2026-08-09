import { z } from "zod";

// Phase 13 Milestone 5. Same "LLM-output schema vs. richer final type"
// split every milestone in this arc uses. This package is a standalone
// sibling of job-description/resume-optimizer.ts — resume-grounded, not
// JD-grounded — so none of its schemas are shared with that module.

export const REWRITE_STYLES = [
  "Professional",
  "Executive",
  "Recruiter",
  "Technical",
  "Leadership",
  "Consulting",
  "FAANG",
  "Startup",
  "Enterprise",
] as const;
export type RewriteStyle = (typeof REWRITE_STYLES)[number];

export const REWRITE_SECTIONS = [
  "summary",
  "careerObjective",
  "experience",
  "projects",
  "skills",
  "achievements",
  "certifications",
  "bullet",
] as const;
export type RewriteSection = (typeof REWRITE_SECTIONS)[number];

// This package's own 11-category scheme — deliberately finer and
// independent from the existing optimizer's 9-category
// (job-description/resume-optimizer-schema.ts) SKILL_CATEGORIES.
export const RESUME_REWRITER_SKILL_CATEGORIES = [
  "Programming Languages",
  "Backend",
  "Frontend",
  "AI",
  "Cloud",
  "DevOps",
  "Databases",
  "Messaging",
  "Testing",
  "Architecture",
  "Tools",
] as const;
export type ResumeRewriterSkillCategory = (typeof RESUME_REWRITER_SKILL_CATEGORIES)[number];

export const VARIANT_VERSIONS = ["A", "B", "C"] as const;
export type VariantVersion = (typeof VARIANT_VERSIONS)[number];

// Shared prompt fragment every rewriter module includes — one sentence
// of tone guidance per style, kept as data (not duplicated prose) so
// every rewriter stays consistent.
export const STYLE_DESCRIPTIONS: Record<RewriteStyle, string> = {
  Professional: "Clear, polished, and neutral — broadly appropriate corporate tone.",
  Executive: "Concise and outcome-led, written for a senior audience skimming for impact.",
  Recruiter: "Keyword-dense and scannable, optimized for a recruiter doing a 6-second read.",
  Technical: "Precise and detail-forward, naming real technologies and technical decisions plainly.",
  Leadership: "Emphasizes ownership, mentorship, and cross-team influence wherever the resume already supports it.",
  Consulting: "Structured around problem-solution-impact, client/stakeholder-facing framing.",
  FAANG: "Direct, metrics-forward, action-verb-led — the terse style big tech resumes favor.",
  Startup: "Energetic and scrappy, emphasizes range, speed, and end-to-end ownership.",
  Enterprise: "Formal and structured, emphasizes scale, process, and cross-functional collaboration.",
};

// ---------------------------------------------------------------------------
// Shared building blocks
// ---------------------------------------------------------------------------

export const variantExplanationSchema = z.object({
  whyBetter: z.string(),
  atsImprovements: z.array(z.string()).default([]),
  keywordsAdded: z.array(z.string()).default([]),
  readabilityImprovement: z.string(),
  toneImprovement: z.string(),
});
export type VariantExplanation = z.infer<typeof variantExplanationSchema>;

export const textVariantSchema = z.object({
  version: z.enum(VARIANT_VERSIONS),
  text: z.string(),
  explanation: variantExplanationSchema,
});
export type TextVariant = z.infer<typeof textVariantSchema>;

export const textItemRewriteSchema = z.object({
  original: z.string(),
  variants: z.array(textVariantSchema).default([]),
});
export type TextItemRewrite = z.infer<typeof textItemRewriteSchema>;

export const projectVariantSchema = z.object({
  version: z.enum(VARIANT_VERSIONS),
  problem: z.string(),
  solution: z.string(),
  technologies: z.array(z.string()).default([]),
  businessValue: z.string(),
  impact: z.string(),
  explanation: variantExplanationSchema,
});
export type ProjectVariant = z.infer<typeof projectVariantSchema>;

export const projectItemRewriteSchema = z.object({
  original: z.string(),
  projectName: z.string(),
  variants: z.array(projectVariantSchema).default([]),
});
export type ProjectItemRewrite = z.infer<typeof projectItemRewriteSchema>;

export const skillCategoryGroupSchema = z.object({
  category: z.enum(RESUME_REWRITER_SKILL_CATEGORIES),
  skills: z.array(z.string()).default([]),
});
export type SkillCategoryGroup = z.infer<typeof skillCategoryGroupSchema>;

export const rejectedItemSchema = z.object({
  section: z.enum(REWRITE_SECTIONS),
  originalText: z.string(),
  reason: z.string(),
});
export type RejectedItem = z.infer<typeof rejectedItemSchema>;

// ---------------------------------------------------------------------------
// LLM-output schemas — one per rewriter module's response_format call.
// ---------------------------------------------------------------------------

export const summaryRewriteLlmOutputSchema = z.object({ variants: z.array(textVariantSchema).default([]) });
export type SummaryRewriteLlmOutput = z.infer<typeof summaryRewriteLlmOutputSchema>;

export const bulletRewriteLlmOutputSchema = z.object({ variants: z.array(textVariantSchema).default([]) });
export type BulletRewriteLlmOutput = z.infer<typeof bulletRewriteLlmOutputSchema>;

export const experienceRewriteLlmOutputSchema = z.object({ items: z.array(textItemRewriteSchema).default([]) });
export type ExperienceRewriteLlmOutput = z.infer<typeof experienceRewriteLlmOutputSchema>;

export const achievementRewriteLlmOutputSchema = z.object({ items: z.array(textItemRewriteSchema).default([]) });
export type AchievementRewriteLlmOutput = z.infer<typeof achievementRewriteLlmOutputSchema>;

export const projectRewriteLlmOutputSchema = z.object({ items: z.array(projectItemRewriteSchema).default([]) });
export type ProjectRewriteLlmOutput = z.infer<typeof projectRewriteLlmOutputSchema>;

export const skillsRewriteLlmOutputSchema = z.object({ categories: z.array(skillCategoryGroupSchema).default([]) });
export type SkillsRewriteLlmOutput = z.infer<typeof skillsRewriteLlmOutputSchema>;

export const simpleRewriteItemSchema = z.object({ original: z.string(), rewritten: z.string() });
export type SimpleRewriteItem = z.infer<typeof simpleRewriteItemSchema>;

export const wholeResumeProjectItemSchema = z.object({
  original: z.string(),
  problem: z.string(),
  solution: z.string(),
  technologies: z.array(z.string()).default([]),
  businessValue: z.string(),
  impact: z.string(),
});
export type WholeResumeProjectItem = z.infer<typeof wholeResumeProjectItemSchema>;

export const wholeResumeRewriteLlmOutputSchema = z.object({
  summary: z.string(),
  experience: z.array(simpleRewriteItemSchema).default([]),
  projects: z.array(wholeResumeProjectItemSchema).default([]),
  skills: z.array(skillCategoryGroupSchema).default([]),
  achievements: z.array(simpleRewriteItemSchema).default([]),
  improvementNotes: z.array(z.string()).default([]),
});
export type WholeResumeRewriteLlmOutput = z.infer<typeof wholeResumeRewriteLlmOutputSchema>;

// ---------------------------------------------------------------------------
// Hand-written strict JSON Schema mirrors — OpenAI structured outputs
// require every property listed in `required`; scalars are never
// `.optional()` above for exactly that reason.
// ---------------------------------------------------------------------------

const STRING_ARRAY = { type: "array", items: { type: "string" } } as const;

const variantExplanationJsonSchema = {
  type: "object",
  properties: {
    whyBetter: { type: "string" },
    atsImprovements: STRING_ARRAY,
    keywordsAdded: STRING_ARRAY,
    readabilityImprovement: { type: "string" },
    toneImprovement: { type: "string" },
  },
  required: ["whyBetter", "atsImprovements", "keywordsAdded", "readabilityImprovement", "toneImprovement"],
  additionalProperties: false,
};

const textVariantJsonSchema = {
  type: "object",
  properties: {
    version: { type: "string", enum: [...VARIANT_VERSIONS] },
    text: { type: "string" },
    explanation: variantExplanationJsonSchema,
  },
  required: ["version", "text", "explanation"],
  additionalProperties: false,
};

const textItemRewriteJsonSchema = {
  type: "object",
  properties: {
    original: { type: "string" },
    variants: { type: "array", items: textVariantJsonSchema },
  },
  required: ["original", "variants"],
  additionalProperties: false,
};

const projectVariantJsonSchema = {
  type: "object",
  properties: {
    version: { type: "string", enum: [...VARIANT_VERSIONS] },
    problem: { type: "string" },
    solution: { type: "string" },
    technologies: STRING_ARRAY,
    businessValue: { type: "string" },
    impact: { type: "string" },
    explanation: variantExplanationJsonSchema,
  },
  required: ["version", "problem", "solution", "technologies", "businessValue", "impact", "explanation"],
  additionalProperties: false,
};

const projectItemRewriteJsonSchema = {
  type: "object",
  properties: {
    original: { type: "string" },
    projectName: { type: "string" },
    variants: { type: "array", items: projectVariantJsonSchema },
  },
  required: ["original", "projectName", "variants"],
  additionalProperties: false,
};

const skillCategoryGroupJsonSchema = {
  type: "object",
  properties: {
    category: { type: "string", enum: [...RESUME_REWRITER_SKILL_CATEGORIES] },
    skills: STRING_ARRAY,
  },
  required: ["category", "skills"],
  additionalProperties: false,
};

const simpleRewriteItemJsonSchema = {
  type: "object",
  properties: {
    original: { type: "string" },
    rewritten: { type: "string" },
  },
  required: ["original", "rewritten"],
  additionalProperties: false,
};

const wholeResumeProjectItemJsonSchema = {
  type: "object",
  properties: {
    original: { type: "string" },
    problem: { type: "string" },
    solution: { type: "string" },
    technologies: STRING_ARRAY,
    businessValue: { type: "string" },
    impact: { type: "string" },
  },
  required: ["original", "problem", "solution", "technologies", "businessValue", "impact"],
  additionalProperties: false,
};

type JsonSchemaSpec = { name: string; strict: true; schema: Record<string, unknown> };

export const SUMMARY_REWRITE_JSON_SCHEMA: JsonSchemaSpec = {
  name: "resume_rewrite_summary",
  strict: true,
  schema: {
    type: "object",
    properties: { variants: { type: "array", items: textVariantJsonSchema } },
    required: ["variants"],
    additionalProperties: false,
  },
};

export const BULLET_REWRITE_JSON_SCHEMA: JsonSchemaSpec = {
  name: "resume_rewrite_bullet",
  strict: true,
  schema: {
    type: "object",
    properties: { variants: { type: "array", items: textVariantJsonSchema } },
    required: ["variants"],
    additionalProperties: false,
  },
};

export const EXPERIENCE_REWRITE_JSON_SCHEMA: JsonSchemaSpec = {
  name: "resume_rewrite_experience",
  strict: true,
  schema: {
    type: "object",
    properties: { items: { type: "array", items: textItemRewriteJsonSchema } },
    required: ["items"],
    additionalProperties: false,
  },
};

export const ACHIEVEMENT_REWRITE_JSON_SCHEMA: JsonSchemaSpec = {
  name: "resume_rewrite_achievements",
  strict: true,
  schema: {
    type: "object",
    properties: { items: { type: "array", items: textItemRewriteJsonSchema } },
    required: ["items"],
    additionalProperties: false,
  },
};

export const PROJECT_REWRITE_JSON_SCHEMA: JsonSchemaSpec = {
  name: "resume_rewrite_projects",
  strict: true,
  schema: {
    type: "object",
    properties: { items: { type: "array", items: projectItemRewriteJsonSchema } },
    required: ["items"],
    additionalProperties: false,
  },
};

export const SKILLS_REWRITE_JSON_SCHEMA: JsonSchemaSpec = {
  name: "resume_rewrite_skills",
  strict: true,
  schema: {
    type: "object",
    properties: { categories: { type: "array", items: skillCategoryGroupJsonSchema } },
    required: ["categories"],
    additionalProperties: false,
  },
};

export const WHOLE_RESUME_REWRITE_JSON_SCHEMA: JsonSchemaSpec = {
  name: "resume_rewrite_whole_resume",
  strict: true,
  schema: {
    type: "object",
    properties: {
      summary: { type: "string" },
      experience: { type: "array", items: simpleRewriteItemJsonSchema },
      projects: { type: "array", items: wholeResumeProjectItemJsonSchema },
      skills: { type: "array", items: skillCategoryGroupJsonSchema },
      achievements: { type: "array", items: simpleRewriteItemJsonSchema },
      improvementNotes: STRING_ARRAY,
    },
    required: ["summary", "experience", "projects", "skills", "achievements", "improvementNotes"],
    additionalProperties: false,
  },
};
