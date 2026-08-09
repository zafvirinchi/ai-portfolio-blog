import { ragKnowledge } from "../knowledge/rag.service";
import { interviewChatService } from "../interview-chat";
import { interviewPrepRequestContext, prepService } from "../interview-prep/prep-service";
import { PrepRecord } from "../interview-prep/prep-types";
import { mockInterviewRequestContext, sessionService, SessionTurnResult } from "../mock-interview/session-service";
import { SessionRecord } from "../mock-interview/session-types";
import { ToolResponse, AITool } from "./types";
import { RagToolResult } from "@/types/tool-result";

const LOG_PREFIX = "[interview-chat]";

// Phase 13 Milestone 3 — additive only, same short-summary approach
// resume.tool.ts uses for its own interview-prep branch. Appended
// whenever a report exists for this session, regardless of which branch
// below (exact-match vs RAG fallback) ends up answering.
function buildInterviewPrepContext(record: PrepRecord): string {
  const { report } = record;

  const lines: string[] = [
    "",
    "The user also has a generated interview preparation report for a specific resume + job description — mention it if relevant to their question.",
    `Interview readiness score: ${report.readinessScore.overall}/100`,
    `Technical questions generated: ${report.technicalQuestions.map((item) => item.question).join("; ") || "none"}`,
    `HR questions generated: ${report.hrQuestions.map((item) => item.question).join("; ") || "none"}`,
    `Weak areas: ${report.weaknessAnalysis.weakAreas.join("; ") || "none identified"}`,
  ];

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Phase 13 Milestone 4 — mock interview command handling. Unlike the
// passive text-injection pattern above, several chat commands ("ask next
// question", "give harder question", "end interview") require an actual
// state mutation, not just richer context for the model to describe. A
// message that matches no command, while a question is pending, is
// treated as the candidate's own answer and evaluated. Scoped to sessions
// that already exist (started from /mock-interview's Setup tab) — chat
// cannot create a new session from freeform text alone.
// ---------------------------------------------------------------------------

type MockCommand = "end" | "pause" | "resume" | "restart" | "skip" | "next" | "previous" | "harder" | "easier" | "explain" | null;

function matchMockCommand(question: string): MockCommand {
  const q = question.toLowerCase();

  if (/\b(end|stop|finish)\b.*\binterview\b/.test(q)) return "end";
  if (/\bpause\b/.test(q)) return "pause";
  if (/\bresume\b/.test(q) && /\b(interview|session)\b/.test(q)) return "resume";
  if (/\brestart\b/.test(q)) return "restart";
  if (/\bskip\b/.test(q)) return "skip";
  if (/\b(next|another)\b.*\bquestion\b/.test(q)) return "next";
  if (/\bprevious\b.*\bquestion\b/.test(q)) return "previous";
  if (/\b(harder|more difficult|tougher)\b/.test(q)) return "harder";
  if (/\b(easier|simpler)\b/.test(q)) return "easier";
  if (/\b(better|ideal|correct)\s+answer\b/.test(q)) return "explain";

  return null;
}

function describeTurnResult(result: SessionTurnResult): string {
  if (result.completed) {
    const report = result.session.report;
    if (!report) return result.prompt;

    return [
      result.prompt,
      `Overall score: ${report.overallScore}/100. Interview readiness: ${report.interviewReadiness}/100.`,
      `Strengths: ${report.strengths.join("; ") || "none identified"}`,
      `Weaknesses: ${report.weaknesses.join("; ") || "none identified"}`,
      `Top improvements: ${report.topImprovements.join("; ") || "none"}`,
    ].join("\n");
  }

  const lines = [result.prompt];

  if (result.liveFeedback) {
    lines.push(
      `(Evaluation of your previous answer — score ${result.liveFeedback.score}/100: ${result.liveFeedback.headline} ` +
        `Strengths: ${result.liveFeedback.strengths.join("; ") || "none"}. ` +
        `Weaknesses: ${result.liveFeedback.weaknesses.join("; ") || "none"}.)`
    );
  }

  return lines.join("\n");
}

function describeSessionStatus(session: SessionRecord, label: string): string {
  const current = session.pendingFollowUp ?? session.questions[session.currentIndex];

  return `Mock interview session ${label}.${current ? ` Current question: ${current.text}` : ""}`;
}

async function handleMockInterviewMessage(sessionId: string, question: string): Promise<string> {
  const session = sessionService.get(sessionId);

  if (!session) {
    return "The mock interview session referenced is no longer available — start a new one from the Mock Interview page.";
  }

  const command = matchMockCommand(question);

  try {
    switch (command) {
      case "end":
        return describeTurnResult(await sessionService.end(sessionId));
      case "pause":
        return describeSessionStatus(sessionService.pause(sessionId), "paused");
      case "resume":
        return describeSessionStatus(sessionService.resume(sessionId), "resumed");
      case "restart":
        return describeTurnResult(await sessionService.restart(sessionId));
      case "skip":
      case "next":
        return describeTurnResult(await sessionService.skip(sessionId));
      case "previous":
        return describeSessionStatus(sessionService.previous(sessionId), "moved to the previous question");
      case "harder":
      case "easier":
        sessionService.setDifficulty(sessionId, command === "harder" ? "Hard" : "Easy");
        return describeTurnResult(await sessionService.skip(sessionId));
      case "explain": {
        const lastTurn = session.transcript[session.transcript.length - 1];
        if (!lastTurn) return "No answer has been evaluated yet this session, so there's nothing to explain yet.";
        return `A stronger answer to "${lastTurn.question.text}" would be: ${lastTurn.evaluation.betterAnswer}\n\nIdeal answer: ${lastTurn.evaluation.idealAnswer}`;
      }
      default: {
        const currentQuestion = session.pendingFollowUp ?? session.questions[session.currentIndex];

        if (session.status === "in_progress" && currentQuestion) {
          return describeTurnResult(await sessionService.submitAnswer(sessionId, question));
        }

        return describeSessionStatus(session, session.status.replace("_", " "));
      }
    }
  } catch (error) {
    return `That mock interview action couldn't be completed: ${error instanceof Error ? error.message : "unknown error"}`;
  }
}

export class InterviewTool implements AITool {
  name = "interview-tool";

  description =
    "Interview questions and technical prep — Java, Spring, Angular, React, Node, Database, Kafka, system design, and behavioral interview topics";

  keywords = [
    "interview",
    "interview question",
    "mock interview",
    "start interview",
    "next question",
    "end interview",
    "java",
    "spring",
    "spring boot",
    "angular",
    "react",
    "node",
    "kafka",
    "database",
    "sql",
    "system design",
    "behavioral",
    "hashmap",
    "coding question",
  ];

  priority = 90;

  async execute(question: string): Promise<ToolResponse<RagToolResult>> {
    const activePrepId = interviewPrepRequestContext.getStore()?.prepId;
    const prepRecord = activePrepId ? prepService.get(activePrepId) : undefined;
    const prepContext = prepRecord ? `\n${buildInterviewPrepContext(prepRecord)}` : "";

    const activeSessionId = mockInterviewRequestContext.getStore()?.sessionId;

    if (activeSessionId) {
      const mockContext = await handleMockInterviewMessage(activeSessionId, question);

      return {
        success: true,
        tool: this.name,
        result: {
          context: `${mockContext}${prepContext}`,
          chunks: [],
        },
      };
    }

    const matched = await interviewChatService.search(question);

    if (matched) {
      console.log(`${LOG_PREFIX} PortfolioChain Invoked`);

      return {
        success: true,
        tool: this.name,
        result: {
          context: `${matched.context}${prepContext}`,
          chunks: [],
          exactAnswer: matched.exactAnswer,
        },
      };
    }

    // No relevant imported interview questions — fall back to the RAG
    // knowledge base exactly like resumeTool does for its no-match case.
    const fallback = await ragKnowledge.search(question);

    return {
      success: true,
      tool: this.name,
      result: {
        context: `${fallback.context}${prepContext}`,
        chunks: fallback.chunks,
      },
    };
  }
}

export const interviewTool = new InterviewTool();
