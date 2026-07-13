import { ChatMessage } from "@/types/ai";
import { AgentIntent } from "../agent/agent-response";
import { researchAgent } from "./research-agent";
import { reviewerAgent } from "./reviewer-agent";
import { summarizerAgent } from "./summarizer-agent";
import { ResearchOutput, ReviewOutput } from "./agent-response";
import {
  CoordinatorInput,
  CoordinatorPlan,
  CoordinatorResult,
  SpecialistAgentName,
} from "./agent-types";

const LOG_PREFIX = "[multi-agent]";

// Below this, there usually isn't enough retrieved context for a research
// pass to find anything meaningful to say — skip it rather than spend a
// call restating "not much here."
const SHORT_CONTEXT_CHARS = 200;

// Above this, the context is already long/detailed enough that a
// low-hallucination-risk verdict is the expected outcome — skip the
// reviewer call rather than spend one confirming what's already evident.
const HIGH_CONFIDENCE_CONTEXT_CHARS = 1200;

// A short question with no retrieved context and no tool output reads as
// a greeting or small-talk turn — nothing for a specialist agent to do.
const GREETING_MAX_QUESTION_CHARS = 30;

function buildRawContext(retrievedContext: string, toolOutput: unknown): string {
  const sections: string[] = [];

  if (retrievedContext) {
    sections.push(retrievedContext);
  }

  if (toolOutput !== undefined) {
    sections.push(`========== Tool Output ==========\n${JSON.stringify(toolOutput, null, 2)}`);
  }

  return sections.join("\n\n");
}

function decidePlan(input: CoordinatorInput, rawContext: string): CoordinatorPlan {
  const contextLength = rawContext.trim().length;
  const hasToolOutput = input.toolOutput !== undefined;

  const isGreeting =
    input.question.trim().length <= GREETING_MAX_QUESTION_CHARS && contextLength === 0 && !hasToolOutput;

  if (isGreeting) {
    return {
      runResearch: false,
      runReviewer: false,
      runSummarizer: false,
      reason: "Greeting or empty context — no specialist agents needed.",
    };
  }

  if (input.intent === "resume") {
    // resume-tool's context is already complete, self-contained candidate
    // data (not retrieved knowledge-base content), so there's nothing for
    // Research or Reviewer to meaningfully check — and bypassing all three
    // guarantees the resume-analysis context (including its "answer about
    // this candidate" framing, see PHASE9 docs) reaches PortfolioChain
    // completely unmodified rather than risking dilution by a merge pass.
    return {
      runResearch: false,
      runReviewer: false,
      runSummarizer: false,
      reason: "Resume-analysis intent — specialist agents skipped; resume context is already complete.",
    };
  }

  const runResearch = contextLength >= SHORT_CONTEXT_CHARS;
  const runReviewer = contextLength > 0 && contextLength < HIGH_CONFIDENCE_CONTEXT_CHARS;
  const runSummarizer = runResearch || runReviewer;

  const reasons: string[] = [];
  if (!runResearch) reasons.push(`context shorter than ${SHORT_CONTEXT_CHARS} chars — research skipped`);
  if (!runReviewer) reasons.push(`context empty or >= ${HIGH_CONFIDENCE_CONTEXT_CHARS} chars — reviewer skipped`);
  if (reasons.length === 0) reasons.push("moderate-length context — full specialist pass");

  return { runResearch, runReviewer, runSummarizer, reason: reasons.join("; ") };
}

/**
 * Invoked from generation-node.ts, immediately before PortfolioChain.
 * Decides which specialist agents (if any) are worth running for this
 * question, runs Research/Reviewer in parallel, merges their findings via
 * Summarizer, and returns one mergedContext string — PortfolioChain
 * remains the only component that ever generates the user-facing answer.
 */
export class MultiAgentCoordinator {
  async run(
    question: string,
    history: ChatMessage[],
    retrievedContext: string,
    toolOutput: unknown,
    intent?: AgentIntent
  ): Promise<CoordinatorResult> {
    const startedAt = Date.now();
    const input: CoordinatorInput = { question, history, retrievedContext, toolOutput, intent };
    const rawContext = buildRawContext(retrievedContext, toolOutput);

    console.log(`${LOG_PREFIX} Coordinator started`, { intent });

    const plan = decidePlan(input, rawContext);

    if (!plan.runResearch && !plan.runReviewer) {
      console.log(`${LOG_PREFIX} Coordinator finished`, { agentsUsed: [], reason: plan.reason });

      return {
        mergedContext: rawContext,
        metadata: { plan, totalMs: Date.now() - startedAt },
        agentsUsed: [],
      };
    }

    const [researchResult, reviewResult] = await Promise.all([
      plan.runResearch ? this.safeRunResearch(question, rawContext) : Promise.resolve(null),
      plan.runReviewer ? this.safeRunReview(question, rawContext) : Promise.resolve(null),
    ]);

    const agentsUsed: SpecialistAgentName[] = [];

    if (researchResult) {
      agentsUsed.push("research");
      console.log(`${LOG_PREFIX} Research complete`);
    }

    if (reviewResult) {
      agentsUsed.push("reviewer");
      console.log(`${LOG_PREFIX} Review complete`);
    }

    let mergedContext = rawContext;

    if (plan.runSummarizer && (researchResult || reviewResult)) {
      const summary = await this.safeRunSummary({
        question,
        context: rawContext,
        research: researchResult ?? undefined,
        review: reviewResult ?? undefined,
      });

      if (summary) {
        mergedContext = summary.mergedContext;
        agentsUsed.push("summarizer");
        console.log(`${LOG_PREFIX} Summarization complete`);
      }
    }

    console.log(`${LOG_PREFIX} Coordinator finished`, {
      agentsUsed,
      totalMs: Date.now() - startedAt,
    });

    return {
      mergedContext,
      metadata: { plan, totalMs: Date.now() - startedAt },
      agentsUsed,
    };
  }

  // Specialist agents are auxiliary — a single failed call should degrade
  // gracefully (fall back to the raw context) rather than break the chat,
  // matching the fallback philosophy already used by PlannerService
  // (Phase 5) and runGraph()'s own error handling (Phase 8).
  private async safeRunResearch(question: string, context: string): Promise<ResearchOutput | null> {
    try {
      return await researchAgent.run(question, context);
    } catch (error) {
      console.error(`${LOG_PREFIX} Research agent failed, skipping`, error);
      return null;
    }
  }

  private async safeRunReview(question: string, context: string): Promise<ReviewOutput | null> {
    try {
      return await reviewerAgent.run(question, context);
    } catch (error) {
      console.error(`${LOG_PREFIX} Reviewer agent failed, skipping`, error);
      return null;
    }
  }

  private async safeRunSummary(input: {
    question: string;
    context: string;
    research?: ResearchOutput;
    review?: ReviewOutput;
  }) {
    try {
      return await summarizerAgent.run(input);
    } catch (error) {
      console.error(`${LOG_PREFIX} Summarizer agent failed, falling back to raw context`, error);
      return null;
    }
  }
}

export const multiAgentCoordinator = new MultiAgentCoordinator();
