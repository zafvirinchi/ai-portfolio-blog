import { AtsScore, Resume } from "../resume/resume-schema";
import { JobMatchAnalysis } from "./job-match-schema";

// Same shape as ResumeUploadInput/InterviewUploadInput — kept as its own
// named type rather than importing theirs, matching this codebase's
// existing convention of per-feature upload input types.
export interface JobMatchUploadInput {
  filename: string;
  buffer: Buffer;
  mimeType?: string;
}

export interface JobMatchResult {
  filename: string;
  resume: Resume;
  atsScore: AtsScore;
  jobMatch: JobMatchAnalysis;
  processingTimeMs: number;
}
