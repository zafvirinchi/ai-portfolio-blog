import { JobDescription, JdMatchResult } from "./jd-schema";

// Non-schema wrapper types — mirrors resume/resume-types.ts's role
// (upload input + record shapes alongside the Zod-derived types).

export type JobDescriptionUploadInput =
  | { text: string }
  | { filename: string; buffer: Buffer; mimeType?: string };

export interface JdMatchAnalyzeInput {
  resumeId: string;
  jd: JobDescriptionUploadInput;
}

export interface JdMatchRecord {
  jdMatchId: string;
  resumeId: string;
  jobDescription: JobDescription;
  matchResult: JdMatchResult;
  createdAt: string;
}

// ats-engine.ts's output shape — 12 category scores (flat, no LLM
// involved), reused directly as the corresponding *Score fields on
// JdMatchResult so there's only one place these numbers are computed.
export interface AtsCategoryScores {
  overall: number;
  keyword: number;
  experience: number;
  education: number;
  formatting: number;
  achievement: number;
  project: number;
  leadership: number;
  certification: number;
  aiSkills: number;
  cloud: number;
  security: number;
  softSkills: number;
}
