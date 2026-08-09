import { randomUUID } from "node:crypto";

import { openai } from "../openai";
import { summarizeResumeForPrompt } from "../resume/resume-analyzer";
import { Resume } from "../resume/resume-schema";

import { EMAIL_JSON_SCHEMA, NotificationType, emailLlmOutputSchema } from "./pipeline-schema";
import { InterviewSchedule, Job, Notification, Offer } from "./pipeline-types";

const MODEL = "gpt-4o-mini";
const TEMPERATURE = 0.2;

export interface NotificationEmitInput {
  type: NotificationType;
  message: string;
  jobId?: string | null;
  pipelineCandidateId?: string | null;
}

export class NotificationService {
  private readonly notifications: Notification[] = [];

  emit(input: NotificationEmitInput): Notification {
    const notification: Notification = {
      notificationId: randomUUID(),
      type: input.type,
      message: input.message,
      jobId: input.jobId ?? null,
      pipelineCandidateId: input.pipelineCandidateId ?? null,
      read: false,
      createdAt: new Date().toISOString(),
    };

    this.notifications.unshift(notification);

    return notification;
  }

  list(): Notification[] {
    return [...this.notifications];
  }

  markRead(notificationId: string): Notification {
    const notification = this.notifications.find((item) => item.notificationId === notificationId);

    if (!notification) {
      throw new Error("Notification not found.");
    }

    notification.read = true;
    return notification;
  }
}

export const notificationService = new NotificationService();

// ---------------------------------------------------------------------------
// Email generation — 5 separate on-demand functions (plan design
// decision 8), each grounded strictly in the real job/candidate/
// interview/offer data given, never inventing a fact.
// ---------------------------------------------------------------------------

const GROUNDING_RULE =
  "Ground every claim strictly in the job and candidate data given below — never invent a skill, employer, certification, date, or fact not present in the data. Use [Sender Name] as a placeholder for the sender's own name.";

async function generateEmail(systemPrompt: string, userContent: string): Promise<{ subject: string; body: string }> {
  const completion = await openai.chat.completions.create({
    model: MODEL,
    temperature: TEMPERATURE,
    messages: [
      { role: "system" as const, content: `${systemPrompt}\n\n${GROUNDING_RULE}` },
      { role: "user" as const, content: userContent },
    ],
    response_format: {
      type: "json_schema",
      json_schema: EMAIL_JSON_SCHEMA,
    },
  });

  const raw = completion.choices[0]?.message?.content;

  if (!raw) {
    throw new Error("Email generation LLM returned no content");
  }

  const parsed = emailLlmOutputSchema.safeParse(JSON.parse(raw));

  if (!parsed.success) {
    throw new Error(`Email generation failed schema validation: ${parsed.error.message}`);
  }

  return parsed.data;
}

export async function generateInterviewInvitationEmail(job: Job, resume: Resume, interview: InterviewSchedule) {
  return generateEmail(
    `Write a professional interview invitation email for a candidate being invited to a ${interview.type} interview for the "${job.title}" role.`,
    `Job: ${job.title}${job.department ? ` (${job.department})` : ""}
Interview type: ${interview.type}
Scheduled at: ${interview.scheduledAt}
Interviewer: ${interview.interviewer ?? "to be confirmed"}

Candidate resume:
${summarizeResumeForPrompt(resume)}`
  );
}

export async function generateInterviewReminderEmail(job: Job, resume: Resume, interview: InterviewSchedule) {
  return generateEmail(
    `Write a brief, friendly interview reminder email for a candidate whose ${interview.type} interview for the "${job.title}" role is coming up.`,
    `Job: ${job.title}
Interview type: ${interview.type}
Scheduled at: ${interview.scheduledAt}
Interviewer: ${interview.interviewer ?? "to be confirmed"}

Candidate resume:
${summarizeResumeForPrompt(resume)}`
  );
}

export async function generateOfferLetterEmail(job: Job, resume: Resume, offer: Offer) {
  return generateEmail(
    `Write a warm, professional offer letter email for a candidate being offered the "${job.title}" role.`,
    `Job: ${job.title}${job.department ? ` (${job.department})` : ""}
Salary: ${offer.salary ?? "to be discussed"}
Start date: ${offer.startDate ?? "to be discussed"}
Offer expiry: ${offer.expiryDate ?? "not specified"}

Candidate resume:
${summarizeResumeForPrompt(resume)}`
  );
}

export async function generateRejectionEmail(job: Job, resume: Resume) {
  return generateEmail(
    `Write a respectful, kind rejection email for a candidate who was not selected for the "${job.title}" role. Do not state a specific reason for rejection unless one is given — keep it general and encouraging.`,
    `Job: ${job.title}

Candidate resume:
${summarizeResumeForPrompt(resume)}`
  );
}

export async function generateFollowUpEmail(job: Job, resume: Resume) {
  return generateEmail(
    `Write a brief follow-up email checking in with a candidate about their application for the "${job.title}" role.`,
    `Job: ${job.title}

Candidate resume:
${summarizeResumeForPrompt(resume)}`
  );
}
