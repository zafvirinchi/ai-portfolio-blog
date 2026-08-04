import { SKILL_CATEGORIES } from "./resume-schema";

// Hand-written mirror of resume-schema.ts's enterpriseResumeSchema for
// OpenAI Structured Outputs — same pattern as PLANNER_JSON_SCHEMA
// (planner/planner-schema.ts) and RESUME_EXTRACTION_JSON_SCHEMA
// (resume/resume-schema.ts). Kept separate rather than derived from the
// Zod schema, same rationale as both of those: strict-mode json_schema
// only supports a constrained subset of JSON Schema. Not wired into any
// OpenAI call yet — see resume-parser.ts.

const NULLABLE_STRING = { type: ["string", "null"] } as const;
const NULLABLE_NUMBER = { type: ["number", "null"] } as const;
const STRING_ARRAY = { type: "array", items: { type: "string" } } as const;

const personalInfoJsonSchema = {
  type: "object",
  properties: {
    firstName: NULLABLE_STRING,
    lastName: NULLABLE_STRING,
    email: NULLABLE_STRING,
    phone: NULLABLE_STRING,
    linkedin: NULLABLE_STRING,
    github: NULLABLE_STRING,
    portfolio: NULLABLE_STRING,
    location: NULLABLE_STRING,
  },
  required: [
    "firstName",
    "lastName",
    "email",
    "phone",
    "linkedin",
    "github",
    "portfolio",
    "location",
  ],
  additionalProperties: false,
};

const professionalSummaryJsonSchema = {
  type: "object",
  properties: {
    headline: NULLABLE_STRING,
    currentDesignation: NULLABLE_STRING,
    careerObjective: NULLABLE_STRING,
    yearsOfExperience: NULLABLE_NUMBER,
  },
  required: ["headline", "currentDesignation", "careerObjective", "yearsOfExperience"],
  additionalProperties: false,
};

const educationJsonSchema = {
  type: "object",
  properties: {
    institute: NULLABLE_STRING,
    degree: NULLABLE_STRING,
    specialization: NULLABLE_STRING,
    startYear: NULLABLE_STRING,
    endYear: NULLABLE_STRING,
    grade: NULLABLE_STRING,
  },
  required: ["institute", "degree", "specialization", "startYear", "endYear", "grade"],
  additionalProperties: false,
};

const companyJsonSchema = {
  type: "object",
  properties: {
    companyName: NULLABLE_STRING,
    designation: NULLABLE_STRING,
    employmentType: NULLABLE_STRING,
    startDate: NULLABLE_STRING,
    endDate: NULLABLE_STRING,
    duration: NULLABLE_STRING,
    location: NULLABLE_STRING,
    responsibilities: STRING_ARRAY,
    achievements: STRING_ARRAY,
  },
  required: [
    "companyName",
    "designation",
    "employmentType",
    "startDate",
    "endDate",
    "duration",
    "location",
    "responsibilities",
    "achievements",
  ],
  additionalProperties: false,
};

const projectJsonSchema = {
  type: "object",
  properties: {
    projectName: NULLABLE_STRING,
    client: NULLABLE_STRING,
    role: NULLABLE_STRING,
    description: NULLABLE_STRING,
    responsibilities: STRING_ARRAY,
    technologies: STRING_ARRAY,
    duration: NULLABLE_STRING,
    achievements: STRING_ARRAY,
  },
  required: [
    "projectName",
    "client",
    "role",
    "description",
    "responsibilities",
    "technologies",
    "duration",
    "achievements",
  ],
  additionalProperties: false,
};

const skillGroupJsonSchema = {
  type: "object",
  properties: {
    category: { type: "string", enum: [...SKILL_CATEGORIES] },
    skills: STRING_ARRAY,
  },
  required: ["category", "skills"],
  additionalProperties: false,
};

const certificationJsonSchema = {
  type: "object",
  properties: {
    name: NULLABLE_STRING,
    issuer: NULLABLE_STRING,
    date: NULLABLE_STRING,
    expiryDate: NULLABLE_STRING,
    credentialId: NULLABLE_STRING,
  },
  required: ["name", "issuer", "date", "expiryDate", "credentialId"],
  additionalProperties: false,
};

const awardJsonSchema = {
  type: "object",
  properties: {
    title: NULLABLE_STRING,
    issuer: NULLABLE_STRING,
    date: NULLABLE_STRING,
    description: NULLABLE_STRING,
  },
  required: ["title", "issuer", "date", "description"],
  additionalProperties: false,
};

const publicationJsonSchema = {
  type: "object",
  properties: {
    title: NULLABLE_STRING,
    publisher: NULLABLE_STRING,
    date: NULLABLE_STRING,
    url: NULLABLE_STRING,
    description: NULLABLE_STRING,
  },
  required: ["title", "publisher", "date", "url", "description"],
  additionalProperties: false,
};

const patentJsonSchema = {
  type: "object",
  properties: {
    title: NULLABLE_STRING,
    patentNumber: NULLABLE_STRING,
    date: NULLABLE_STRING,
    description: NULLABLE_STRING,
  },
  required: ["title", "patentNumber", "date", "description"],
  additionalProperties: false,
};

const languageJsonSchema = {
  type: "object",
  properties: {
    language: { type: "string" },
    proficiency: NULLABLE_STRING,
  },
  required: ["language", "proficiency"],
  additionalProperties: false,
};

const volunteerJsonSchema = {
  type: "object",
  properties: {
    organization: NULLABLE_STRING,
    role: NULLABLE_STRING,
    startDate: NULLABLE_STRING,
    endDate: NULLABLE_STRING,
    description: NULLABLE_STRING,
  },
  required: ["organization", "role", "startDate", "endDate", "description"],
  additionalProperties: false,
};

export const ENTERPRISE_RESUME_JSON_SCHEMA: {
  name: string;
  strict: true;
  schema: Record<string, unknown>;
} = {
  name: "enterprise_resume_extraction",
  strict: true,
  schema: {
    type: "object",
    properties: {
      personalInfo: personalInfoJsonSchema,
      professionalSummary: professionalSummaryJsonSchema,
      education: { type: "array", items: educationJsonSchema },
      companyHistory: { type: "array", items: companyJsonSchema },
      projects: { type: "array", items: projectJsonSchema },
      skills: { type: "array", items: skillGroupJsonSchema },
      certifications: { type: "array", items: certificationJsonSchema },
      awards: { type: "array", items: awardJsonSchema },
      publications: { type: "array", items: publicationJsonSchema },
      patents: { type: "array", items: patentJsonSchema },
      languagesKnown: { type: "array", items: languageJsonSchema },
      volunteerExperience: { type: "array", items: volunteerJsonSchema },
      interests: STRING_ARRAY,
      achievements: STRING_ARRAY,
    },
    required: [
      "personalInfo",
      "professionalSummary",
      "education",
      "companyHistory",
      "projects",
      "skills",
      "certifications",
      "awards",
      "publications",
      "patents",
      "languagesKnown",
      "volunteerExperience",
      "interests",
      "achievements",
    ],
    additionalProperties: false,
  },
};
