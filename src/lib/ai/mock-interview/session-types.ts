import { Difficulty, InterviewType, SessionMode, SessionQuestion, SessionReport, SessionStatus, TranscriptTurn } from "./session-schema";

export interface SessionStartInput {
  resumeId: string;
  jdMatchId: string;
  /** Optional — when present, question-selector.ts pulls the Milestone 3 report's already-generated questions as a free, second-priority source. */
  prepId?: string;
  interviewType: InterviewType;
  mode: SessionMode;
}

export interface SessionRecord {
  sessionId: string;
  resumeId: string;
  jdMatchId: string;
  prepId: string | null;
  interviewType: InterviewType;
  mode: SessionMode;
  status: SessionStatus;
  /** Every question asked so far (including follow-ups), in order — append-only. */
  questions: SessionQuestion[];
  /** Index into `questions` for "previous"/"next" navigation through history. */
  currentIndex: number;
  transcript: TranscriptTurn[];
  /** Set by answer-evaluator when the last answer needs a follow-up; cleared once that follow-up is answered or skipped. */
  pendingFollowUp: SessionQuestion | null;
  /** Normalized question-text keys already asked — question-selector.ts's dedup guard. */
  askedQuestionKeys: string[];
  /** One-shot override for "give me a harder/easier question", cleared after the next selection. */
  preferredDifficulty: Difficulty | null;
  questionsMissedText: string[];
  report: SessionReport | null;
  createdAt: string;
  updatedAt: string;
}
