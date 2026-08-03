import { openai } from "../openai";
import { Resume } from "../resume/resume-schema";
import { summarizeResumeForPrompt } from "../resume/resume-analyzer";
import { JOB_MATCH_ANALYSIS_JSON_SCHEMA, JobMatchAnalysis, jobMatchAnalysisSchema } from "./job-match-schema";

const ANALYSIS_MODEL = "gpt-4o-mini";

function buildJobMatchMessages(resume: Resume, jobDescription: string) {
  return [
    {
      role: "system" as const,
      content: `You are a senior technical recruiter comparing a candidate's resume
against a specific job description. Base every claim only on the resume and
job description text given to you — never invent a requirement the job
description doesn't state, or a qualification the resume doesn't show.
"jdMatchPercent" is your best-judgment estimate (0-100) of how well this
resume matches this specific job description's requirements, not a generic
resume-quality score. "missingSkills" and "missingKeywords" are things the
job description asks for that the resume doesn't show — keywords are the
job description's own terminology (e.g. "microservices", "scalability"),
skills are concrete technologies/tools. "experienceGaps" should only include
gaps where the job description states a specific requirement (e.g. "3+
years AWS") the resume doesn't meet — "required" and "candidateHas" should
each be a short human-readable phrase (e.g. "3 years required" / "You have
1 year"), not just numbers. "resumeSectionAnalysis" should cover whichever
of the resume's own sections (summary, skills, experience, education,
projects, certifications) are present, with specific feedback on how well
each supports this application. Be specific and actionable throughout —
never generic filler.`,
    },
    {
      role: "user" as const,
      content: `Candidate resume:\n\n${summarizeResumeForPrompt(resume)}\n\n---\n\nJob description:\n\n${jobDescription}`,
    },
  ];
}

/**
 * Produces the full resume-vs-job-description gap analysis in one
 * structured-output LLM call — mirrors resume/resume-analyzer.ts's
 * ResumeAnalyzer exactly (same model/temperature/strict-schema pattern).
 */
export class JobMatchAnalyzer {
  async analyze(resume: Resume, jobDescription: string): Promise<JobMatchAnalysis> {
    const completion = await openai.chat.completions.create({
      model: ANALYSIS_MODEL,
      temperature: 0.3,
      messages: buildJobMatchMessages(resume, jobDescription),
      response_format: {
        type: "json_schema",
        json_schema: JOB_MATCH_ANALYSIS_JSON_SCHEMA,
      },
    });

    const raw = completion.choices[0]?.message?.content;

    if (!raw) {
      throw new Error("Job match analysis LLM returned no content");
    }

    const parsed = jobMatchAnalysisSchema.safeParse(JSON.parse(raw));

    if (!parsed.success) {
      throw new Error(`Job match analysis failed schema validation: ${parsed.error.message}`);
    }

    return parsed.data;
  }
}

export const jobMatchAnalyzer = new JobMatchAnalyzer();
