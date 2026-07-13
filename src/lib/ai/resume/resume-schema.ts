import { z } from "zod";

// ---------------------------------------------------------------------------
// Resume extraction schema
// ---------------------------------------------------------------------------
// Scalars use `.nullable()` (not `.optional()`) throughout because OpenAI's
// strict Structured Outputs mode requires every property to be listed in
// `required`; "this field doesn't apply" is modeled as `null`, not as a
// missing key. Mirrors the pattern already established in
// `planner/planner-schema.ts`.

export const contactInfoSchema = z.object({
  name: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  location: z.string().nullable(),
  linkedin: z.string().nullable(),
  github: z.string().nullable(),
  website: z.string().nullable(),
});

export const workExperienceEntrySchema = z.object({
  title: z.string(),
  company: z.string(),
  location: z.string().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  isCurrent: z.boolean(),
  description: z.array(z.string()).default([]),
});

export const educationEntrySchema = z.object({
  degree: z.string(),
  institution: z.string(),
  location: z.string().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  gpa: z.string().nullable(),
});

export const certificationEntrySchema = z.object({
  name: z.string(),
  issuer: z.string().nullable(),
  date: z.string().nullable(),
});

export const projectEntrySchema = z.object({
  name: z.string(),
  description: z.string().nullable(),
  technologies: z.array(z.string()).default([]),
  url: z.string().nullable(),
});

export const resumeSchema = z.object({
  contact: contactInfoSchema,
  summary: z.string().nullable(),
  skills: z.array(z.string()).default([]),
  technicalSkills: z.array(z.string()).default([]),
  softSkills: z.array(z.string()).default([]),
  workExperience: z.array(workExperienceEntrySchema).default([]),
  education: z.array(educationEntrySchema).default([]),
  certifications: z.array(certificationEntrySchema).default([]),
  projects: z.array(projectEntrySchema).default([]),
  achievements: z.array(z.string()).default([]),
  languages: z.array(z.string()).default([]),
  yearsOfExperience: z.number().nullable(),
});

export type ContactInfo = z.infer<typeof contactInfoSchema>;
export type WorkExperienceEntry = z.infer<typeof workExperienceEntrySchema>;
export type EducationEntry = z.infer<typeof educationEntrySchema>;
export type CertificationEntry = z.infer<typeof certificationEntrySchema>;
export type ProjectEntry = z.infer<typeof projectEntrySchema>;
export type Resume = z.infer<typeof resumeSchema>;

// Hand-written mirror of resumeSchema for OpenAI's strict json_schema mode.
// Kept separate rather than derived — see planner-schema.ts for why.
export const RESUME_EXTRACTION_JSON_SCHEMA: {
  name: string;
  strict: true;
  schema: Record<string, unknown>;
} = {
  name: "resume_extraction",
  strict: true,
  schema: {
    type: "object",
    properties: {
      contact: {
        type: "object",
        properties: {
          name: { type: ["string", "null"] },
          email: { type: ["string", "null"] },
          phone: { type: ["string", "null"] },
          location: { type: ["string", "null"] },
          linkedin: { type: ["string", "null"] },
          github: { type: ["string", "null"] },
          website: { type: ["string", "null"] },
        },
        required: ["name", "email", "phone", "location", "linkedin", "github", "website"],
        additionalProperties: false,
      },
      summary: { type: ["string", "null"] },
      skills: { type: "array", items: { type: "string" } },
      technicalSkills: { type: "array", items: { type: "string" } },
      softSkills: { type: "array", items: { type: "string" } },
      workExperience: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            company: { type: "string" },
            location: { type: ["string", "null"] },
            startDate: { type: ["string", "null"] },
            endDate: { type: ["string", "null"] },
            isCurrent: { type: "boolean" },
            description: { type: "array", items: { type: "string" } },
          },
          required: [
            "title",
            "company",
            "location",
            "startDate",
            "endDate",
            "isCurrent",
            "description",
          ],
          additionalProperties: false,
        },
      },
      education: {
        type: "array",
        items: {
          type: "object",
          properties: {
            degree: { type: "string" },
            institution: { type: "string" },
            location: { type: ["string", "null"] },
            startDate: { type: ["string", "null"] },
            endDate: { type: ["string", "null"] },
            gpa: { type: ["string", "null"] },
          },
          required: ["degree", "institution", "location", "startDate", "endDate", "gpa"],
          additionalProperties: false,
        },
      },
      certifications: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            issuer: { type: ["string", "null"] },
            date: { type: ["string", "null"] },
          },
          required: ["name", "issuer", "date"],
          additionalProperties: false,
        },
      },
      projects: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            description: { type: ["string", "null"] },
            technologies: { type: "array", items: { type: "string" } },
            url: { type: ["string", "null"] },
          },
          required: ["name", "description", "technologies", "url"],
          additionalProperties: false,
        },
      },
      achievements: { type: "array", items: { type: "string" } },
      languages: { type: "array", items: { type: "string" } },
      yearsOfExperience: { type: ["number", "null"] },
    },
    required: [
      "contact",
      "summary",
      "skills",
      "technicalSkills",
      "softSkills",
      "workExperience",
      "education",
      "certifications",
      "projects",
      "achievements",
      "languages",
      "yearsOfExperience",
    ],
    additionalProperties: false,
  },
};

// ---------------------------------------------------------------------------
// Analysis schema (ResumeAnalyzer output)
// ---------------------------------------------------------------------------

export const CAREER_LEVELS = [
  "entry-level",
  "mid-level",
  "senior",
  "lead",
  "principal",
] as const;

export const resumeAnalysisSchema = z.object({
  professionalSummary: z.string(),
  keyStrengths: z.array(z.string()).default([]),
  weaknesses: z.array(z.string()).default([]),
  missingSkills: z.array(z.string()).default([]),
  careerLevel: z.enum(CAREER_LEVELS),
  suitableRoles: z.array(z.string()).default([]),
  technologyStack: z.array(z.string()).default([]),
  improvementSuggestions: z.array(z.string()).default([]),
});

export type ResumeAnalysis = z.infer<typeof resumeAnalysisSchema>;

export const RESUME_ANALYSIS_JSON_SCHEMA: {
  name: string;
  strict: true;
  schema: Record<string, unknown>;
} = {
  name: "resume_analysis",
  strict: true,
  schema: {
    type: "object",
    properties: {
      professionalSummary: { type: "string" },
      keyStrengths: { type: "array", items: { type: "string" } },
      weaknesses: { type: "array", items: { type: "string" } },
      missingSkills: { type: "array", items: { type: "string" } },
      careerLevel: { type: "string", enum: [...CAREER_LEVELS] },
      suitableRoles: { type: "array", items: { type: "string" } },
      technologyStack: { type: "array", items: { type: "string" } },
      improvementSuggestions: { type: "array", items: { type: "string" } },
    },
    required: [
      "professionalSummary",
      "keyStrengths",
      "weaknesses",
      "missingSkills",
      "careerLevel",
      "suitableRoles",
      "technologyStack",
      "improvementSuggestions",
    ],
    additionalProperties: false,
  },
};

// ---------------------------------------------------------------------------
// ATS score schema
// ---------------------------------------------------------------------------

export const atsScoreSchema = z.object({
  overall: z.number().min(0).max(100),
  formatting: z.number().min(0).max(100),
  keyword: z.number().min(0).max(100),
  experience: z.number().min(0).max(100),
  skills: z.number().min(0).max(100),
  education: z.number().min(0).max(100),
  certification: z.number().min(0).max(100),
  explanation: z.string(),
});

export type AtsScore = z.infer<typeof atsScoreSchema>;

// ---------------------------------------------------------------------------
// Skill gap schema
// ---------------------------------------------------------------------------

export const skillGapSchema = z.object({
  missingJavaSkills: z.array(z.string()).default([]),
  missingSpringSkills: z.array(z.string()).default([]),
  missingCloudSkills: z.array(z.string()).default([]),
  missingDevOpsSkills: z.array(z.string()).default([]),
  missingAiSkills: z.array(z.string()).default([]),
  missingDatabaseSkills: z.array(z.string()).default([]),
  recommendedCourses: z.array(z.string()).default([]),
  recommendedCertifications: z.array(z.string()).default([]),
  recommendedProjects: z.array(z.string()).default([]),
});

export type SkillGap = z.infer<typeof skillGapSchema>;
