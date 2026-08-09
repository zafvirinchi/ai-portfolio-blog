import { SessionRecord } from "./session-types";

// Pure state-transition functions for the spec's own "SESSION MANAGEMENT"
// list — each takes a SessionRecord and returns a new one (or throws a
// descriptive error for an invalid transition). No persistence, no I/O:
// session-service.ts owns the store and calls into these.

function now(): string {
  return new Date().toISOString();
}

export function pause(session: SessionRecord): SessionRecord {
  if (session.status !== "in_progress") {
    throw new Error(`Cannot pause a session that is ${session.status.replace("_", " ")}.`);
  }

  return { ...session, status: "paused", updatedAt: now() };
}

export function resume(session: SessionRecord): SessionRecord {
  if (session.status !== "paused") {
    throw new Error(`Cannot resume a session that is ${session.status.replace("_", " ")}.`);
  }

  return { ...session, status: "in_progress", updatedAt: now() };
}

export function restart(session: SessionRecord): SessionRecord {
  return {
    ...session,
    status: "in_progress",
    questions: [],
    currentIndex: -1,
    transcript: [],
    pendingFollowUp: null,
    askedQuestionKeys: [],
    preferredDifficulty: null,
    questionsMissedText: [],
    report: null,
    updatedAt: now(),
  };
}

/** Marks the current question (or pending follow-up, if one is active) as missed and clears it — session-service.ts is responsible for selecting the actual next question afterward. */
export function skip(session: SessionRecord): SessionRecord {
  const current = session.pendingFollowUp ?? session.questions[session.currentIndex];

  if (!current) {
    throw new Error("There is no current question to skip.");
  }

  return {
    ...session,
    pendingFollowUp: null,
    questionsMissedText: [...session.questionsMissedText, current.text],
    updatedAt: now(),
  };
}

/** Navigation within already-asked history only — not a way to skip ahead of question generation. */
export function goToPrevious(session: SessionRecord): SessionRecord {
  if (session.currentIndex <= 0) {
    throw new Error("Already at the first question.");
  }

  return { ...session, currentIndex: session.currentIndex - 1, updatedAt: now() };
}

export function goToNext(session: SessionRecord): SessionRecord {
  if (session.currentIndex >= session.questions.length - 1) {
    throw new Error("There is no later question to move to yet.");
  }

  return { ...session, currentIndex: session.currentIndex + 1, updatedAt: now() };
}

/** Status transition only — building the actual SessionReport (score-engine.ts + feedback-agent.ts + buildLearningRoadmap()) is an async/service-level concern handled by session-service.end(), not this pure-function module. */
export function end(session: SessionRecord): SessionRecord {
  if (session.status === "completed") {
    throw new Error("This session is already completed.");
  }

  return { ...session, status: "completed", pendingFollowUp: null, updatedAt: now() };
}
