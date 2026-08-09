import { z } from "zod";

// Phase 13 Milestone 1. Same architecture as planner/planner-schema.ts and
// resume/resume-schema.ts: scalars use `.nullable()` (never `.optional()`)
// because OpenAI's strict Structured Outputs mode requires every property
// listed in `required`; arrays use `.array(...).default([])`. Export names
// (`jobSchema`, `jobJsonSchema`) are exactly as requested — a deliberate
// naming deviation from this codebase's usual ALL_CAPS convention for the
// JSON-schema constant elsewhere (e.g. `RESUME_EXTRACTION_JSON_SCHEMA`).

export const jobLocationSchema = z.object({
  city: z.string().nullable(),
  state: z.string().nullable(),
  country: z.string().nullable(),
  raw: z.string().nullable(),
});

export const jobExperienceRequirementSchema = z.object({
  minYears: z.number().nullable(),
  maxYears: z.number().nullable(),
  raw: z.string().nullable(),
});

export const jobSalarySchema = z.object({
  min: z.number().nullable(),
  max: z.number().nullable(),
  currency: z.string().nullable(),
  period: z.string().nullable(),
  raw: z.string().nullable(),
});

export const WORK_MODES = ["Remote", "Hybrid", "Onsite"] as const;
export type WorkMode = (typeof WORK_MODES)[number];

export const jobSchema = z.object({
  companyName: z.string().nullable(),
  industry: z.string().nullable(),
  jobTitle: z.string().nullable(),
  jobCategory: z.string().nullable(),
  employmentType: z.string().nullable(),
  location: jobLocationSchema,
  workMode: z.enum(WORK_MODES).nullable(),
  experienceRequired: jobExperienceRequirementSchema,

  requiredSkills: z.array(z.string()).default([]),
  preferredSkills: z.array(z.string()).default([]),
  mandatorySkills: z.array(z.string()).default([]),
  niceToHaveSkills: z.array(z.string()).default([]),

  programmingLanguages: z.array(z.string()).default([]),
  frameworks: z.array(z.string()).default([]),
  cloudPlatforms: z.array(z.string()).default([]),
  databases: z.array(z.string()).default([]),
  devOps: z.array(z.string()).default([]),
  aiSkills: z.array(z.string()).default([]),
  softSkills: z.array(z.string()).default([]),

  responsibilities: z.array(z.string()).default([]),
  qualifications: z.array(z.string()).default([]),
  education: z.array(z.string()).default([]),
  certifications: z.array(z.string()).default([]),
  benefits: z.array(z.string()).default([]),
  salary: jobSalarySchema,
  keywords: z.array(z.string()).default([]),
  technologies: z.array(z.string()).default([]),
  tools: z.array(z.string()).default([]),

  hiringManager: z.string().nullable(),
  recruitmentAgency: z.string().nullable(),
  visaSponsorship: z.boolean().nullable(),
  relocation: z.boolean().nullable(),
  travel: z.string().nullable(),
  securityClearance: z.string().nullable(),
  teamSize: z.string().nullable(),
  domain: z.string().nullable(),
  businessArea: z.string().nullable(),
  roleLevel: z.string().nullable(),
  seniority: z.string().nullable(),
});

export type JobLocation = z.infer<typeof jobLocationSchema>;
export type JobExperienceRequirement = z.infer<typeof jobExperienceRequirementSchema>;
export type JobSalary = z.infer<typeof jobSalarySchema>;
export type JobDescription = z.infer<typeof jobSchema>;

// Every string-array field above, used both to build the JSON schema below
// and by job-parser.ts's normalization pass (case-insensitive dedup, e.g.
// "Java"/"JAVA"/"java" -> one canonical "Java") — one list, not duplicated.
export const JOB_STRING_ARRAY_FIELDS = [
  "requiredSkills",
  "preferredSkills",
  "mandatorySkills",
  "niceToHaveSkills",
  "programmingLanguages",
  "frameworks",
  "cloudPlatforms",
  "databases",
  "devOps",
  "aiSkills",
  "softSkills",
  "responsibilities",
  "qualifications",
  "education",
  "certifications",
  "benefits",
  "keywords",
  "technologies",
  "tools",
] as const satisfies readonly (keyof JobDescription)[];

const NULLABLE_STRING = { type: ["string", "null"] } as const;
const NULLABLE_NUMBER = { type: ["number", "null"] } as const;
const NULLABLE_BOOLEAN = { type: ["boolean", "null"] } as const;
const STRING_ARRAY = { type: "array", items: { type: "string" } } as const;

const jobLocationJsonSchema = {
  type: "object",
  properties: {
    city: NULLABLE_STRING,
    state: NULLABLE_STRING,
    country: NULLABLE_STRING,
    raw: NULLABLE_STRING,
  },
  required: ["city", "state", "country", "raw"],
  additionalProperties: false,
};

const jobExperienceRequirementJsonSchema = {
  type: "object",
  properties: {
    minYears: NULLABLE_NUMBER,
    maxYears: NULLABLE_NUMBER,
    raw: NULLABLE_STRING,
  },
  required: ["minYears", "maxYears", "raw"],
  additionalProperties: false,
};

const jobSalaryJsonSchema = {
  type: "object",
  properties: {
    min: NULLABLE_NUMBER,
    max: NULLABLE_NUMBER,
    currency: NULLABLE_STRING,
    period: NULLABLE_STRING,
    raw: NULLABLE_STRING,
  },
  required: ["min", "max", "currency", "period", "raw"],
  additionalProperties: false,
};

export const jobJsonSchema: {
  name: string;
  strict: true;
  schema: Record<string, unknown>;
} = {
  name: "job_description_extraction",
  strict: true,
  schema: {
    type: "object",
    properties: {
      companyName: NULLABLE_STRING,
      industry: NULLABLE_STRING,
      jobTitle: NULLABLE_STRING,
      jobCategory: NULLABLE_STRING,
      employmentType: NULLABLE_STRING,
      location: jobLocationJsonSchema,
      workMode: { type: ["string", "null"], enum: [...WORK_MODES, null] },
      experienceRequired: jobExperienceRequirementJsonSchema,

      requiredSkills: STRING_ARRAY,
      preferredSkills: STRING_ARRAY,
      mandatorySkills: STRING_ARRAY,
      niceToHaveSkills: STRING_ARRAY,

      programmingLanguages: STRING_ARRAY,
      frameworks: STRING_ARRAY,
      cloudPlatforms: STRING_ARRAY,
      databases: STRING_ARRAY,
      devOps: STRING_ARRAY,
      aiSkills: STRING_ARRAY,
      softSkills: STRING_ARRAY,

      responsibilities: STRING_ARRAY,
      qualifications: STRING_ARRAY,
      education: STRING_ARRAY,
      certifications: STRING_ARRAY,
      benefits: STRING_ARRAY,
      salary: jobSalaryJsonSchema,
      keywords: STRING_ARRAY,
      technologies: STRING_ARRAY,
      tools: STRING_ARRAY,

      hiringManager: NULLABLE_STRING,
      recruitmentAgency: NULLABLE_STRING,
      visaSponsorship: NULLABLE_BOOLEAN,
      relocation: NULLABLE_BOOLEAN,
      travel: NULLABLE_STRING,
      securityClearance: NULLABLE_STRING,
      teamSize: NULLABLE_STRING,
      domain: NULLABLE_STRING,
      businessArea: NULLABLE_STRING,
      roleLevel: NULLABLE_STRING,
      seniority: NULLABLE_STRING,
    },
    required: [
      "companyName",
      "industry",
      "jobTitle",
      "jobCategory",
      "employmentType",
      "location",
      "workMode",
      "experienceRequired",
      "requiredSkills",
      "preferredSkills",
      "mandatorySkills",
      "niceToHaveSkills",
      "programmingLanguages",
      "frameworks",
      "cloudPlatforms",
      "databases",
      "devOps",
      "aiSkills",
      "softSkills",
      "responsibilities",
      "qualifications",
      "education",
      "certifications",
      "benefits",
      "salary",
      "keywords",
      "technologies",
      "tools",
      "hiringManager",
      "recruitmentAgency",
      "visaSponsorship",
      "relocation",
      "travel",
      "securityClearance",
      "teamSize",
      "domain",
      "businessArea",
      "roleLevel",
      "seniority",
    ],
    additionalProperties: false,
  },
};
