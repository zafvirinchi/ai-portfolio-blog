// Non-schema wrapper types for this package — mirrors resume/resume-types.ts
// holding ResumeUploadInput alongside (not inside) the Zod-schema-derived
// types, which live in resume-schema.ts.

import { EnterpriseResume, ResumeParserConfidence } from "./resume-schema";

export interface EnterpriseResumeUploadInput {
  filename: string;
  buffer: Buffer;
  mimeType?: string;
}

// What EnterpriseResumeParser.parseResume()/parseResumeText() return —
// the validated resume plus the deterministic per-section confidence
// scores computed alongside it (see resume-parser.ts).
export interface EnterpriseResumeParseResult {
  resume: EnterpriseResume;
  confidence: ResumeParserConfidence;
  processingTimeMs: number;
}
