import { AtsScore, Resume, ResumeAnalysis, SkillGap } from "./resume-schema";

export interface ResumeUploadInput {
  filename: string;
  buffer: Buffer;
  mimeType?: string;
}

// The full result of one upload+analyze pass — this is what's held in
// memory (ResumeService) and what /api/ai/resume returns as JSON.
export interface ResumeAnalysisResult {
  resumeId: string;
  filename: string;
  uploadedAt: string;
  resume: Resume;
  analysis: ResumeAnalysis;
  atsScore: AtsScore;
  skillGap: SkillGap;
  processingTimeMs: number;
}

// What ResumeService actually stores per resumeId — same as the API
// response shape today, kept as a distinct type since the in-memory record
// may grow fields (e.g. raw text for future re-analysis) that shouldn't
// necessarily be re-serialized to the client.
export type ResumeRecord = ResumeAnalysisResult;
