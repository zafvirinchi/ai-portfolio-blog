import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

import { buildLearningRoadmap } from "../interview-prep/learning-roadmap";
import { PrepRecord } from "../interview-prep/prep-types";
import { prepService } from "../interview-prep/prep-service";
import { JdMatchRecord } from "../job-description/jd-types";
import { jdMatchService } from "../job-description/jd-service";
import { JobDescription } from "../job-description/jd-schema";
import { Resume } from "../resume/resume-schema";
import { ResumeRecord } from "../resume/resume-types";
import { resumeService } from "../resume/resume-service";
import { evaluateAnswer } from "./answer-evaluator";
import { LiveFeedback, aggregateSessionFeedback, buildWeaknessAnalysisForRoadmap, formatLiveFeedback } from "./feedback-agent";
import { generateHint } from "./hint-generator";
import { presentClosing, presentQuestion } from "./interviewer-agent";
import { normalizeQuestionKey, selectNextQuestion } from "./question-selector";
import * as sessionManager from "./session-manager";
import { computeCategoryScores, computeInterviewReadiness, computeOverallScore, computeTopicScores } from "./score-engine";
import { Difficulty, SessionQuestion, SessionReport, TranscriptTurn, sessionReportSchema } from "./session-schema";
import { SessionRecord, SessionStartInput } from "./session-types";

const LOG_PREFIX = "[mock-interview]";
const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours — same pattern every in-memory store in this arc uses

interface StoredSessionRecord {
  record: SessionRecord;
  expiresAt: number;
}

export const mockInterviewRequestContext = new AsyncLocalStorage<{ sessionId: string }>();

export interface SessionTurnResult {
  session: SessionRecord;
  /** The interviewer-voice-wrapped text for the question/closing line this turn presents. */
  prompt: string;
  question: SessionQuestion | null;
  isFollowUp: boolean;
  /** Set only on the turn that just evaluated an answer (submitAnswer/skip's predecessor question) — null on start/restart, since there's nothing to give feedback on yet. */
  liveFeedback: LiveFeedback | null;
  completed: boolean;
}

interface SessionContext {
  resumeRecord: ResumeRecord;
  jdMatchRecord: JdMatchRecord;
  prepRecord?: PrepRecord;
}

function appendQuestion(session: SessionRecord, question: SessionQuestion): SessionRecord {
  return {
    ...session,
    questions: [...session.questions, question],
    currentIndex: session.questions.length,
    askedQuestionKeys: [...session.askedQuestionKeys, normalizeQuestionKey(question.text)],
    preferredDifficulty: null,
    updatedAt: new Date().toISOString(),
  };
}

export class SessionService {
  private readonly records = new Map<string, StoredSessionRecord>();

  private purgeExpired(): void {
    const now = Date.now();

    for (const [id, entry] of this.records) {
      if (entry.expiresAt <= now) {
        this.records.delete(id);
      }
    }
  }

  private save(session: SessionRecord): void {
    this.records.set(session.sessionId, { record: session, expiresAt: Date.now() + SESSION_TTL_MS });
  }

  private mustGet(sessionId: string): SessionRecord {
    const record = this.get(sessionId);

    if (!record) {
      throw new Error("Mock interview session not found or expired.");
    }

    return record;
  }

  private loadContext(session: SessionRecord): SessionContext {
    const resumeRecord = resumeService.get(session.resumeId);
    const jdMatchRecord = jdMatchService.get(session.jdMatchId);

    if (!resumeRecord || !jdMatchRecord) {
      throw new Error("Resume or JD match result no longer available for this session.");
    }

    const prepRecord = session.prepId ? prepService.get(session.prepId) : undefined;

    return { resumeRecord, jdMatchRecord, prepRecord };
  }

  private async advanceToNextQuestion(
    session: SessionRecord,
    resume: Resume,
    jd: JobDescription,
    prepRecord: PrepRecord | undefined,
    isFollowUp: boolean
  ): Promise<{ session: SessionRecord; prompt: string; question: SessionQuestion }> {
    const question = await selectNextQuestion(session, resume, jd, prepRecord);
    const prompt = presentQuestion(session, question, isFollowUp);
    const next = appendQuestion(session, question);

    console.log(`${LOG_PREFIX} Question Asked`, { sessionId: session.sessionId, type: question.type, source: question.source });

    return { session: next, prompt, question };
  }

  async start(input: SessionStartInput): Promise<SessionTurnResult> {
    console.log(`${LOG_PREFIX} Interview Started`, { interviewType: input.interviewType, mode: input.mode });

    const resumeRecord = resumeService.get(input.resumeId);
    if (!resumeRecord) {
      throw new Error("Resume not found or expired — please re-upload your resume.");
    }

    const jdMatchRecord = jdMatchService.get(input.jdMatchId);
    if (!jdMatchRecord) {
      throw new Error("JD match result not found or expired — please re-run the match analysis.");
    }

    const prepRecord = input.prepId ? prepService.get(input.prepId) : undefined;

    const createdAt = new Date().toISOString();
    const initial: SessionRecord = {
      sessionId: randomUUID(),
      resumeId: input.resumeId,
      jdMatchId: input.jdMatchId,
      prepId: input.prepId ?? null,
      interviewType: input.interviewType,
      mode: input.mode,
      status: "in_progress",
      questions: [],
      currentIndex: -1,
      transcript: [],
      pendingFollowUp: null,
      askedQuestionKeys: [],
      preferredDifficulty: null,
      questionsMissedText: [],
      report: null,
      createdAt,
      updatedAt: createdAt,
    };

    const { session, prompt, question } = await this.advanceToNextQuestion(
      initial,
      resumeRecord.resume,
      jdMatchRecord.jobDescription,
      prepRecord,
      false
    );

    this.purgeExpired();
    this.save(session);

    return { session, prompt, question, isFollowUp: false, liveFeedback: null, completed: false };
  }

  get(sessionId: string): SessionRecord | undefined {
    this.purgeExpired();

    return this.records.get(sessionId)?.record;
  }

  async submitAnswer(sessionId: string, answerText: string): Promise<SessionTurnResult> {
    const session = this.mustGet(sessionId);

    if (session.status !== "in_progress") {
      throw new Error(`Cannot submit an answer while the session is ${session.status.replace("_", " ")}.`);
    }

    const currentQuestion = session.pendingFollowUp ?? session.questions[session.currentIndex];
    if (!currentQuestion) {
      throw new Error("There is no active question to answer.");
    }

    const { resumeRecord, jdMatchRecord, prepRecord } = this.loadContext(session);

    const evaluation = await evaluateAnswer(currentQuestion, answerText, resumeRecord.resume, jdMatchRecord.jobDescription);
    console.log(`${LOG_PREFIX} Answer Evaluated`, { sessionId, overallScore: evaluation.overallScore });

    const liveFeedback = formatLiveFeedback(evaluation);
    console.log(`${LOG_PREFIX} Feedback Generated`, {
      sessionId,
      strengths: evaluation.strengths.length,
      weaknesses: evaluation.weaknesses.length,
    });

    const turn: TranscriptTurn = {
      question: currentQuestion,
      answerText,
      evaluation,
      isFollowUp: session.pendingFollowUp !== null,
      askedAt: session.updatedAt,
      answeredAt: new Date().toISOString(),
    };

    let next: SessionRecord = {
      ...session,
      transcript: [...session.transcript, turn],
      pendingFollowUp: null,
      updatedAt: new Date().toISOString(),
    };

    if (evaluation.followUpNeeded && evaluation.followUpQuestion) {
      const followUp: SessionQuestion = {
        id: randomUUID(),
        text: evaluation.followUpQuestion,
        type: currentQuestion.type,
        difficulty: currentQuestion.difficulty,
        source: "ai-generated",
        topic: currentQuestion.topic,
      };

      const prompt = presentQuestion(next, followUp, true);
      next = { ...appendQuestion(next, followUp), pendingFollowUp: followUp };
      this.save(next);

      console.log(`${LOG_PREFIX} Question Asked`, { sessionId, followUp: true });

      return { session: next, prompt, question: followUp, isFollowUp: true, liveFeedback, completed: false };
    }

    const { session: advanced, prompt, question } = await this.advanceToNextQuestion(
      next,
      resumeRecord.resume,
      jdMatchRecord.jobDescription,
      prepRecord,
      false
    );

    this.save(advanced);

    return { session: advanced, prompt, question, isFollowUp: false, liveFeedback, completed: false };
  }

  async getHint(sessionId: string): Promise<string> {
    const session = this.mustGet(sessionId);

    if (session.mode !== "practice") {
      throw new Error("Hints are only available in Practice Mode.");
    }

    const currentQuestion = session.pendingFollowUp ?? session.questions[session.currentIndex];
    if (!currentQuestion) {
      throw new Error("There is no active question to hint at.");
    }

    const { resumeRecord, jdMatchRecord } = this.loadContext(session);

    return generateHint(currentQuestion, resumeRecord.resume, jdMatchRecord.jobDescription);
  }

  pause(sessionId: string): SessionRecord {
    const session = sessionManager.pause(this.mustGet(sessionId));
    this.save(session);
    return session;
  }

  resume(sessionId: string): SessionRecord {
    const session = sessionManager.resume(this.mustGet(sessionId));
    this.save(session);
    return session;
  }

  async restart(sessionId: string): Promise<SessionTurnResult> {
    const restarted = sessionManager.restart(this.mustGet(sessionId));
    const { resumeRecord, jdMatchRecord, prepRecord } = this.loadContext(restarted);

    console.log(`${LOG_PREFIX} Interview Started`, { sessionId, restarted: true });

    const { session, prompt, question } = await this.advanceToNextQuestion(
      restarted,
      resumeRecord.resume,
      jdMatchRecord.jobDescription,
      prepRecord,
      false
    );

    this.save(session);

    return { session, prompt, question, isFollowUp: false, liveFeedback: null, completed: false };
  }

  async skip(sessionId: string): Promise<SessionTurnResult> {
    const skipped = sessionManager.skip(this.mustGet(sessionId));
    const { resumeRecord, jdMatchRecord, prepRecord } = this.loadContext(skipped);

    const { session, prompt, question } = await this.advanceToNextQuestion(
      skipped,
      resumeRecord.resume,
      jdMatchRecord.jobDescription,
      prepRecord,
      false
    );

    this.save(session);

    return { session, prompt, question, isFollowUp: false, liveFeedback: null, completed: false };
  }

  previous(sessionId: string): SessionRecord {
    const session = sessionManager.goToPrevious(this.mustGet(sessionId));
    this.save(session);
    return session;
  }

  next(sessionId: string): SessionRecord {
    const session = sessionManager.goToNext(this.mustGet(sessionId));
    this.save(session);
    return session;
  }

  /** One-shot override consumed by the next question-selector.ts call — "give me a harder/easier question." */
  setDifficulty(sessionId: string, difficulty: Difficulty): SessionRecord {
    const session = this.mustGet(sessionId);
    const updated: SessionRecord = { ...session, preferredDifficulty: difficulty, updatedAt: new Date().toISOString() };
    this.save(updated);
    return updated;
  }

  async end(sessionId: string): Promise<SessionTurnResult> {
    const session = sessionManager.end(this.mustGet(sessionId));
    const { resumeRecord, prepRecord } = this.loadContext(session);

    const feedbackSummary = aggregateSessionFeedback(session.transcript, session.questionsMissedText);
    const categoryScores = computeCategoryScores(session.transcript);
    const overallScore = computeOverallScore(session.transcript);
    const interviewReadiness = computeInterviewReadiness(overallScore, prepRecord?.report.readinessScore.overall);
    const topicScores = computeTopicScores(session.transcript);

    const weaknessAnalysis = buildWeaknessAnalysisForRoadmap(feedbackSummary, resumeRecord.skillGap);
    const learningRoadmap = buildLearningRoadmap(weaknessAnalysis, resumeRecord.skillGap);

    const report: SessionReport = sessionReportSchema.parse({
      overallScore,
      interviewReadiness,
      categoryScores,
      topicScores,
      strengths: feedbackSummary.strengths,
      weaknesses: feedbackSummary.weaknesses,
      topImprovements: feedbackSummary.topImprovements,
      questionsMissed: feedbackSummary.questionsMissed,
      learningRoadmap,
    });

    const finalSession: SessionRecord = { ...session, report, updatedAt: new Date().toISOString() };
    this.save(finalSession);

    console.log(`${LOG_PREFIX} Interview Completed`, { sessionId, overallScore, interviewReadiness });

    return {
      session: finalSession,
      prompt: presentClosing(finalSession),
      question: null,
      isFollowUp: false,
      liveFeedback: null,
      completed: true,
    };
  }
}

export const sessionService = new SessionService();
