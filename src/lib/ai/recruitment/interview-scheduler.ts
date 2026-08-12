import { randomUUID } from "node:crypto";

import { openai } from "../openai";
import { JdMatchResult } from "../job-description/jd-schema";
import { jdMatchService } from "../job-description/jd-service";
import { candidateService } from "../recruiter/candidate-service";
import { summarizeResumeForPrompt } from "../resume/resume-analyzer";
import { Resume } from "../resume/resume-schema";

import { jobService } from "./job-service";
import { notificationService } from "./notification-service";
import { pipelineService } from "./pipeline-service";
import {
  ActingRole,
  FEEDBACK_SUMMARY_JSON_SCHEMA,
  INTERVIEW_KIT_JSON_SCHEMA,
  InterviewStatus,
  InterviewType,
  feedbackSummaryLlmOutputSchema,
  interviewKitLlmOutputSchema,
} from "./pipeline-schema";
import { InterviewSchedule, Job } from "./pipeline-types";

const LOG_PREFIX = "[recruitment]";
const MODEL = "gpt-4o-mini";
const TEMPERATURE = 0.2;

export interface InterviewScheduleInput {
  pipelineCandidateId: string;
  type: InterviewType;
  scheduledAt: string;
  interviewer?: string | null;
}

function buildKitMessages(job: Job, resume: Resume, type: InterviewType, jdMatch: JdMatchResult | null) {
  return [
    {
      role: "system" as const,
      content: `You are preparing a ${type} interview kit for a recruiter/
interviewer panel interviewing a candidate for the "${job.title}" role.

Ground every checklist item, question, and evaluation criterion in the
job's real required/preferred skills and the candidate's real resume
below — never invent a skill, technology, or requirement not listed.

Produce:
- checklist: 4-8 short logistics/preparation items for the interviewer.
- questions: 5-8 interview questions appropriate for a ${type} round, each tagged with a category and difficulty (Easy/Medium/Hard).
- evaluationForm: 4-6 scoring criteria relevant to a ${type} round, each with a short description and a weight (0-100, summing roughly to 100 across all criteria).`,
    },
    {
      role: "user" as const,
      content: `Job: ${job.title}${job.department ? ` (${job.department})` : ""}
Required skills: ${job.requiredSkills.join(", ") || "none listed"}
Preferred skills: ${job.preferredSkills.join(", ") || "none listed"}

Candidate resume:
${summarizeResumeForPrompt(resume)}${
        jdMatch
          ? `\n\nJob match — matched skills: ${jdMatch.matchedSkills.join(", ") || "none"}, missing skills: ${
              jdMatch.missingSkills.join(", ") || "none"
            }`
          : ""
      }`,
    },
  ];
}

export class InterviewScheduler {
  private readonly interviews = new Map<string, InterviewSchedule>();

  async schedule(input: InterviewScheduleInput): Promise<InterviewSchedule> {
    const pc = pipelineService.get(input.pipelineCandidateId);

    if (!pc) {
      throw new Error("Pipeline candidate not found, or their resume has expired.");
    }

    const interviewId = randomUUID();
    const now = new Date().toISOString();

    const interview: InterviewSchedule = {
      interviewId,
      jobId: pc.jobId,
      pipelineCandidateId: input.pipelineCandidateId,
      type: input.type,
      scheduledAt: input.scheduledAt,
      interviewer: input.interviewer ?? null,
      status: "Scheduled",
      checklist: null,
      questions: null,
      evaluationForm: null,
      feedback: null,
      createdAt: now,
      updatedAt: now,
    };

    this.interviews.set(interviewId, interview);

    const job = jobService.get(pc.jobId);
    const candidateName = (await candidateService.listForSystemUse()).find((c) => c.candidateId === pc.candidateId)?.name ?? "A candidate";

    notificationService.emit({
      type: "Interview Scheduled",
      message: `${input.type} interview scheduled for ${candidateName}${job ? ` (${job.title})` : ""} at ${input.scheduledAt}.`,
      jobId: pc.jobId,
      pipelineCandidateId: input.pipelineCandidateId,
    });

    console.log(`${LOG_PREFIX} Interview Scheduled`, { interviewId, type: input.type });

    return interview;
  }

  list(filter?: { jobId?: string; pipelineCandidateId?: string }): InterviewSchedule[] {
    let results = [...this.interviews.values()];

    if (filter?.jobId) results = results.filter((interview) => interview.jobId === filter.jobId);
    if (filter?.pipelineCandidateId) results = results.filter((interview) => interview.pipelineCandidateId === filter.pipelineCandidateId);

    return results.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  }

  get(interviewId: string): InterviewSchedule | undefined {
    return this.interviews.get(interviewId);
  }

  async updateStatus(interviewId: string, status: InterviewStatus): Promise<InterviewSchedule> {
    const interview = this.requireInterview(interviewId);
    interview.status = status;
    interview.updatedAt = new Date().toISOString();

    if (status === "Completed") {
      const pc = pipelineService.get(interview.pipelineCandidateId);
      const candidateName = pc ? (await candidateService.listForSystemUse()).find((c) => c.candidateId === pc.candidateId)?.name ?? "A candidate" : "A candidate";

      notificationService.emit({
        type: "Interview Completed",
        message: `${candidateName}'s ${interview.type} interview is complete.`,
        jobId: interview.jobId,
        pipelineCandidateId: interview.pipelineCandidateId,
      });
    }

    return interview;
  }

  /** Plain recruiter input — no LLM call (see plan design decision 7). */
  recordFeedback(interviewId: string, input: { rating: number; notes: string; actingRole?: ActingRole | null }): InterviewSchedule {
    const interview = this.requireInterview(interviewId);

    interview.feedback = {
      rating: Math.max(1, Math.min(5, Math.round(input.rating))),
      notes: input.notes,
      summary: null,
      recommendation: null,
      actingRole: input.actingRole ?? null,
      recordedAt: new Date().toISOString(),
    };
    interview.updatedAt = new Date().toISOString();

    return interview;
  }

  async generateInterviewKit(interviewId: string): Promise<InterviewSchedule> {
    const interview = this.requireInterview(interviewId);
    const pc = pipelineService.get(interview.pipelineCandidateId);

    if (!pc) {
      throw new Error("Pipeline candidate not found, or their resume has expired.");
    }

    const job = jobService.get(pc.jobId);

    if (!job) {
      throw new Error("Job not found.");
    }

    const profile = await candidateService.getProfileForSystemUse(pc.candidateId);

    if (!profile) {
      throw new Error("Candidate not found, or their resume has expired.");
    }

    const jdMatchRecord = pc.jdMatchId ? jdMatchService.get(pc.jdMatchId) : undefined;

    const completion = await openai.chat.completions.create({
      model: MODEL,
      temperature: TEMPERATURE,
      messages: buildKitMessages(job, profile.resume, interview.type, jdMatchRecord?.matchResult ?? null),
      response_format: {
        type: "json_schema",
        json_schema: INTERVIEW_KIT_JSON_SCHEMA,
      },
    });

    const raw = completion.choices[0]?.message?.content;

    if (!raw) {
      throw new Error("Interview kit generation LLM returned no content");
    }

    const parsed = interviewKitLlmOutputSchema.safeParse(JSON.parse(raw));

    if (!parsed.success) {
      throw new Error(`Interview kit generation failed schema validation: ${parsed.error.message}`);
    }

    interview.checklist = parsed.data.checklist;
    interview.questions = parsed.data.questions;
    interview.evaluationForm = parsed.data.evaluationForm;
    interview.updatedAt = new Date().toISOString();

    return interview;
  }

  async generateFeedbackSummary(interviewId: string): Promise<InterviewSchedule> {
    const interview = this.requireInterview(interviewId);

    if (!interview.feedback) {
      throw new Error("No feedback has been recorded for this interview yet.");
    }

    const pc = pipelineService.get(interview.pipelineCandidateId);
    const candidateName = pc ? (await candidateService.listForSystemUse()).find((c) => c.candidateId === pc.candidateId)?.name ?? "the candidate" : "the candidate";
    const job = pc ? jobService.get(pc.jobId) : undefined;

    const completion = await openai.chat.completions.create({
      model: MODEL,
      temperature: TEMPERATURE,
      messages: [
        {
          role: "system" as const,
          content: `You polish raw interviewer notes into a clear, professional
interview feedback summary. Ground every sentence strictly in the
notes given below — never invent a performance claim, skill
observation, or detail the interviewer didn't actually write. If the
notes are short or vague, keep the summary short and vague too, rather
than padding it with invented specifics. Also produce a one-sentence
hiring recommendation based only on the given rating and notes.`,
        },
        {
          role: "user" as const,
          content: `Candidate: ${candidateName}${job ? `\nRole: ${job.title}` : ""}
Interview type: ${interview.type}
Rating given: ${interview.feedback.rating}/5
Interviewer's raw notes: ${interview.feedback.notes}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: FEEDBACK_SUMMARY_JSON_SCHEMA,
      },
    });

    const raw = completion.choices[0]?.message?.content;

    if (!raw) {
      throw new Error("Feedback summary generation LLM returned no content");
    }

    const parsed = feedbackSummaryLlmOutputSchema.safeParse(JSON.parse(raw));

    if (!parsed.success) {
      throw new Error(`Feedback summary generation failed schema validation: ${parsed.error.message}`);
    }

    interview.feedback.summary = parsed.data.summary;
    interview.feedback.recommendation = parsed.data.recommendation;
    interview.updatedAt = new Date().toISOString();

    return interview;
  }

  private requireInterview(interviewId: string): InterviewSchedule {
    const interview = this.interviews.get(interviewId);

    if (!interview) {
      throw new Error("Interview not found.");
    }

    return interview;
  }
}

export const interviewScheduler = new InterviewScheduler();
