import { InterviewType, SessionQuestion } from "./session-schema";
import { SessionRecord } from "./session-types";

// Deterministic interviewer-voice wrapper — no LLM call, and no access to
// answer/evaluation content at all (it only ever receives a question),
// which is what structurally enforces "Real Interview Mode: never reveal
// the answer first, never coach before evaluation."

const OPENING_LINES: Record<InterviewType, string> = {
  Technical: "Let's start with a technical question.",
  HR: "Let's begin with a few questions about how you work.",
  Behavioral: "I'd like to hear about some real situations you've been in — let's start here.",
  "System Design": "Let's dig into system design.",
  "Coding Discussion": "Let's talk through some coding problem-solving.",
  "Project Deep Dive": "I'd like to hear about one of your projects in depth.",
  Leadership: "Let's talk about your leadership experience.",
  Architecture: "Let's discuss architecture and design decisions.",
  Mixed: "We'll cover a mix of technical and behavioral ground today — let's get started.",
};

const TRANSITION_LINES = ["Good, let's move on to the next question:", "Thanks — next up:", "Let's continue:", "Moving on:"];

const FOLLOW_UP_LINES = [
  "Good — let's dig into that a bit more:",
  "Interesting, let me follow up on that:",
  "One more thing on that:",
];

/**
 * Call this BEFORE the question is appended to session.questions — the
 * "first question" check relies on that array still reflecting the state
 * before this turn.
 */
export function presentQuestion(session: SessionRecord, question: SessionQuestion, isFollowUp: boolean): string {
  if (isFollowUp) {
    const line = FOLLOW_UP_LINES[session.transcript.length % FOLLOW_UP_LINES.length];
    return `${line} ${question.text}`;
  }

  if (session.questions.length === 0) {
    return `${OPENING_LINES[session.interviewType]} ${question.text}`;
  }

  const line = TRANSITION_LINES[session.questions.length % TRANSITION_LINES.length];
  return `${line} ${question.text}`;
}

export function presentClosing(session: SessionRecord): string {
  const answered = session.transcript.length;

  return `That wraps up this ${session.interviewType.toLowerCase()} interview — you answered ${answered} question${
    answered === 1 ? "" : "s"
  }. Your full report is ready below.`;
}
