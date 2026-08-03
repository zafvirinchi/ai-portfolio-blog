import { extractResumeText, parseResumeText } from "../resume/resume-parser";
import { resumeScorer } from "../resume/resume-score";
import { JobMatchResult, JobMatchUploadInput } from "./job-match-types";
import { jobMatchAnalyzer } from "./job-match-analyzer";

const LOG_PREFIX = "[job-match]";

export class JobMatchService {
  /**
   * Upload -> Extract -> Parse -> Score -> JD-Match pipeline for one resume
   * against one job description. Unlike ResumeService, this holds nothing
   * in memory afterward — there's no chat-integration or resumeId follow-up
   * for this feature, so the response is the only place the result lives.
   */
  async analyze(resumeInput: JobMatchUploadInput, jobDescription: string): Promise<JobMatchResult> {
    const startedAt = Date.now();

    console.log(`${LOG_PREFIX} Resume uploaded`, { filename: resumeInput.filename });

    const rawText = await extractResumeText(resumeInput);
    const resume = await parseResumeText(rawText);

    console.log(`${LOG_PREFIX} Resume parsed`, {
      filename: resumeInput.filename,
      skillCount: resume.skills.length,
    });

    const [atsScore, jobMatch] = await Promise.all([
      Promise.resolve(resumeScorer.score(resume)),
      jobMatchAnalyzer.analyze(resume, jobDescription),
    ]);

    console.log(`${LOG_PREFIX} Job match analysis completed`, {
      filename: resumeInput.filename,
      jdMatchPercent: jobMatch.jdMatchPercent,
    });

    return {
      filename: resumeInput.filename,
      resume,
      atsScore,
      jobMatch,
      processingTimeMs: Date.now() - startedAt,
    };
  }
}

export const jobMatchService = new JobMatchService();
