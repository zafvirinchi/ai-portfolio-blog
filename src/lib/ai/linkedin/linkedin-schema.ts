import { z } from "zod";

// Phase 13 Milestone 7. Same "LLM-output schema vs. richer final type"
// split every milestone in this arc uses. This package is resume-
// driven (unlike Milestone 6's jdMatchId-driven cover letters) — a
// LinkedIn profile is broader than one job application, so JD-match and
// Resume-Rewrite-Engine output are optional layers read in when present.

export const HEADLINE_STYLES = ["Professional", "Recruiter", "Executive", "Technical", "Startup", "FAANG", "Consulting"] as const;
export type HeadlineStyle = (typeof HEADLINE_STYLES)[number];

export const ABOUT_STYLES = ["Professional", "Technical", "Leadership", "RecruiterFriendly"] as const;
export type AboutStyle = (typeof ABOUT_STYLES)[number];

// This package's own 12-category scheme — deliberately independent of
// Milestone 5's 11 and Milestone 2's 9; every milestone's skills
// taxonomy in this arc has been its own, kept local to its package.
export const SKILL_CATEGORIES = [
  "Programming Languages",
  "Backend",
  "Frontend",
  "Cloud",
  "AI",
  "DevOps",
  "Databases",
  "Architecture",
  "Testing",
  "Messaging",
  "Monitoring",
  "Tools",
] as const;
export type LinkedinSkillCategory = (typeof SKILL_CATEGORIES)[number];

export const RECOMMENDATION_MESSAGE_TYPES = [
  "Connection Request",
  "Recruiter Outreach",
  "Hiring Manager Outreach",
  "Follow-up Message",
  "Thank-you Message",
  "Referral Request",
] as const;
export type RecommendationMessageType = (typeof RECOMMENDATION_MESSAGE_TYPES)[number];

export const BRANDING_PLATFORMS = ["Professional", "Conference", "Medium", "GitHub", "Portfolio", "TwitterX"] as const;
export type BrandingPlatform = (typeof BRANDING_PLATFORMS)[number];

export const ABOUT_MAX_CHARACTERS = 2600;

// ---------------------------------------------------------------------------
// Headline — one call per requested style.
// ---------------------------------------------------------------------------

export const headlineExplanationSchema = z.object({
  whyEffective: z.string(),
  keywordsUsed: z.array(z.string()).default([]),
});
export type HeadlineExplanation = z.infer<typeof headlineExplanationSchema>;

export const headlineLlmOutputSchema = z.object({
  text: z.string(),
  explanation: headlineExplanationSchema,
});
export type HeadlineLlmOutput = z.infer<typeof headlineLlmOutputSchema>;

export const headlineVariantSchema = headlineLlmOutputSchema.extend({
  style: z.enum(HEADLINE_STYLES),
});
export type HeadlineVariant = z.infer<typeof headlineVariantSchema>;

// ---------------------------------------------------------------------------
// About — one call per requested story-type, hard 2600-char cap.
// ---------------------------------------------------------------------------

export const aboutLlmOutputSchema = z.object({
  text: z.string(),
});
export type AboutLlmOutput = z.infer<typeof aboutLlmOutputSchema>;

export const aboutVariantSchema = z.object({
  storyType: z.enum(ABOUT_STYLES),
  text: z.string(),
  characterCount: z.number(),
});
export type AboutVariant = z.infer<typeof aboutVariantSchema>;

// ---------------------------------------------------------------------------
// Experience — one bulk call, one variant per bullet (Milestone 5's lesson).
// ---------------------------------------------------------------------------

export const simpleRewriteItemSchema = z.object({ original: z.string(), rewritten: z.string() });
export type SimpleRewriteItem = z.infer<typeof simpleRewriteItemSchema>;

export const experienceLlmOutputSchema = z.object({
  items: z.array(simpleRewriteItemSchema).default([]),
});
export type ExperienceLlmOutput = z.infer<typeof experienceLlmOutputSchema>;

export const experienceItemSchema = simpleRewriteItemSchema.extend({
  atsKeywords: z.array(z.string()).default([]),
});
export type ExperienceItem = z.infer<typeof experienceItemSchema>;

// ---------------------------------------------------------------------------
// Projects — Problem/Solution/Architecture/Technology/BusinessValue/Impact.
// ---------------------------------------------------------------------------

export const projectDescriptionSchema = z.object({
  name: z.string(),
  problem: z.string(),
  solution: z.string(),
  architecture: z.string(),
  technology: z.array(z.string()).default([]),
  businessValue: z.string(),
  impact: z.string(),
});
export type ProjectDescription = z.infer<typeof projectDescriptionSchema>;

export const projectsLlmOutputSchema = z.object({
  projects: z.array(projectDescriptionSchema).default([]),
});
export type ProjectsLlmOutput = z.infer<typeof projectsLlmOutputSchema>;

// ---------------------------------------------------------------------------
// Skills — LLM categorization + deterministic possession backstop.
// ---------------------------------------------------------------------------

export const linkedinSkillCategoryGroupSchema = z.object({
  category: z.enum(SKILL_CATEGORIES),
  skills: z.array(z.string()).default([]),
});
export type LinkedinSkillCategoryGroup = z.infer<typeof linkedinSkillCategoryGroupSchema>;

export const skillsLlmOutputSchema = z.object({
  categories: z.array(linkedinSkillCategoryGroupSchema).default([]),
});
export type SkillsLlmOutput = z.infer<typeof skillsLlmOutputSchema>;

// ---------------------------------------------------------------------------
// Recommendation / networking messages — all 6 types in one call.
// ---------------------------------------------------------------------------

export const recommendationMessageSchema = z.object({
  type: z.enum(RECOMMENDATION_MESSAGE_TYPES),
  message: z.string(),
});
export type RecommendationMessage = z.infer<typeof recommendationMessageSchema>;

export const recommendationsLlmOutputSchema = z.object({
  messages: z.array(recommendationMessageSchema).default([]),
});
export type RecommendationsLlmOutput = z.infer<typeof recommendationsLlmOutputSchema>;

// ---------------------------------------------------------------------------
// Banner tagline + personal-branding bios — one call.
// ---------------------------------------------------------------------------

export const brandingBioSchema = z.object({
  platform: z.enum(BRANDING_PLATFORMS),
  bio: z.string(),
});
export type BrandingBio = z.infer<typeof brandingBioSchema>;

export const bannerLlmOutputSchema = z.object({
  tagline: z.string(),
  bios: z.array(brandingBioSchema).default([]),
});
export type BannerLlmOutput = z.infer<typeof bannerLlmOutputSchema>;

// ---------------------------------------------------------------------------
// Deterministic sections — never sent through response_format.
// ---------------------------------------------------------------------------

export const FEATURED_ITEM_TYPES = ["GitHub", "Portfolio", "Blog", "Certification", "Project", "Article"] as const;

export const featuredItemSchema = z.object({
  type: z.enum(FEATURED_ITEM_TYPES),
  title: z.string(),
  detail: z.string(),
  /** true = an actionable "add this" suggestion (nothing to link yet); false = a real, already-known item. */
  isGap: z.boolean(),
});
export type FeaturedItem = z.infer<typeof featuredItemSchema>;

export const featuredSuggestionSchema = z.object({
  items: z.array(featuredItemSchema).default([]),
});
export type FeaturedSuggestion = z.infer<typeof featuredSuggestionSchema>;

export const careerInterestsSchema = z.object({
  preferredRoles: z.array(z.string()).default([]),
  preferredIndustries: z.array(z.string()).default([]),
  preferredLocations: z.array(z.string()).default([]),
  remotePreference: z.string().nullable(),
  relocationPreference: z.string().nullable(),
  visaSponsorshipStatement: z.string().nullable(),
});
export type CareerInterests = z.infer<typeof careerInterestsSchema>;

export const seoKeywordCoverageSchema = z.object({
  keyword: z.string(),
  inHeadline: z.boolean(),
  inAbout: z.boolean(),
  inSkills: z.boolean(),
  inExperience: z.boolean(),
});
export type SeoKeywordCoverage = z.infer<typeof seoKeywordCoverageSchema>;

export const seoReportSchema = z.object({
  keywordCoverage: z.array(seoKeywordCoverageSchema).default([]),
  missingKeywords: z.array(z.string()).default([]),
  searchRankingScore: z.number().min(0).max(100),
  recruiterVisibilityScore: z.number().min(0).max(100),
  recommendations: z.array(z.string()).default([]),
});
export type SeoReport = z.infer<typeof seoReportSchema>;

export const PROFILE_SCORE_KEYS = [
  "overall",
  "headline",
  "about",
  "experience",
  "skills",
  "projects",
  "keyword",
  "recruiter",
  "seo",
  "networking",
  "visibility",
] as const;
export type ProfileScoreKey = (typeof PROFILE_SCORE_KEYS)[number];

export const profileScoreEntrySchema = z.object({
  score: z.number().min(0).max(100),
  recommendation: z.string(),
});
export type ProfileScoreEntry = z.infer<typeof profileScoreEntrySchema>;

export const profileScoreSchema = z.object({
  overall: profileScoreEntrySchema,
  headline: profileScoreEntrySchema,
  about: profileScoreEntrySchema,
  experience: profileScoreEntrySchema,
  skills: profileScoreEntrySchema,
  projects: profileScoreEntrySchema,
  keyword: profileScoreEntrySchema,
  recruiter: profileScoreEntrySchema,
  seo: profileScoreEntrySchema,
  networking: profileScoreEntrySchema,
  visibility: profileScoreEntrySchema,
});
export type ProfileScore = z.infer<typeof profileScoreSchema>;

// ---------------------------------------------------------------------------
// Hand-written strict JSON Schema mirrors.
// ---------------------------------------------------------------------------

type JsonSchemaSpec = { name: string; strict: true; schema: Record<string, unknown> };

const STRING_ARRAY = { type: "array", items: { type: "string" } } as const;

export const HEADLINE_JSON_SCHEMA: JsonSchemaSpec = {
  name: "linkedin_headline",
  strict: true,
  schema: {
    type: "object",
    properties: {
      text: { type: "string" },
      explanation: {
        type: "object",
        properties: {
          whyEffective: { type: "string" },
          keywordsUsed: STRING_ARRAY,
        },
        required: ["whyEffective", "keywordsUsed"],
        additionalProperties: false,
      },
    },
    required: ["text", "explanation"],
    additionalProperties: false,
  },
};

export const ABOUT_JSON_SCHEMA: JsonSchemaSpec = {
  name: "linkedin_about",
  strict: true,
  schema: {
    type: "object",
    properties: { text: { type: "string" } },
    required: ["text"],
    additionalProperties: false,
  },
};

const simpleRewriteItemJsonSchema = {
  type: "object",
  properties: { original: { type: "string" }, rewritten: { type: "string" } },
  required: ["original", "rewritten"],
  additionalProperties: false,
};

export const EXPERIENCE_JSON_SCHEMA: JsonSchemaSpec = {
  name: "linkedin_experience",
  strict: true,
  schema: {
    type: "object",
    properties: { items: { type: "array", items: simpleRewriteItemJsonSchema } },
    required: ["items"],
    additionalProperties: false,
  },
};

const projectDescriptionJsonSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    problem: { type: "string" },
    solution: { type: "string" },
    architecture: { type: "string" },
    technology: STRING_ARRAY,
    businessValue: { type: "string" },
    impact: { type: "string" },
  },
  required: ["name", "problem", "solution", "architecture", "technology", "businessValue", "impact"],
  additionalProperties: false,
};

export const PROJECTS_JSON_SCHEMA: JsonSchemaSpec = {
  name: "linkedin_projects",
  strict: true,
  schema: {
    type: "object",
    properties: { projects: { type: "array", items: projectDescriptionJsonSchema } },
    required: ["projects"],
    additionalProperties: false,
  },
};

const skillCategoryGroupJsonSchema = {
  type: "object",
  properties: {
    category: { type: "string", enum: [...SKILL_CATEGORIES] },
    skills: STRING_ARRAY,
  },
  required: ["category", "skills"],
  additionalProperties: false,
};

export const SKILLS_JSON_SCHEMA: JsonSchemaSpec = {
  name: "linkedin_skills",
  strict: true,
  schema: {
    type: "object",
    properties: { categories: { type: "array", items: skillCategoryGroupJsonSchema } },
    required: ["categories"],
    additionalProperties: false,
  },
};

const recommendationMessageJsonSchema = {
  type: "object",
  properties: {
    type: { type: "string", enum: [...RECOMMENDATION_MESSAGE_TYPES] },
    message: { type: "string" },
  },
  required: ["type", "message"],
  additionalProperties: false,
};

export const RECOMMENDATIONS_JSON_SCHEMA: JsonSchemaSpec = {
  name: "linkedin_recommendation_messages",
  strict: true,
  schema: {
    type: "object",
    properties: { messages: { type: "array", items: recommendationMessageJsonSchema } },
    required: ["messages"],
    additionalProperties: false,
  },
};

const brandingBioJsonSchema = {
  type: "object",
  properties: {
    platform: { type: "string", enum: [...BRANDING_PLATFORMS] },
    bio: { type: "string" },
  },
  required: ["platform", "bio"],
  additionalProperties: false,
};

export const BANNER_JSON_SCHEMA: JsonSchemaSpec = {
  name: "linkedin_banner",
  strict: true,
  schema: {
    type: "object",
    properties: {
      tagline: { type: "string" },
      bios: { type: "array", items: brandingBioJsonSchema },
    },
    required: ["tagline", "bios"],
    additionalProperties: false,
  },
};
