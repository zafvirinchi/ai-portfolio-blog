import { AsyncLocalStorage } from "async_hooks";
import { searchInterviewQuestions } from "./interview-search";
import { rankInterviewResults } from "./interview-ranking";
import { buildInterviewContext } from "./interview-context-builder";
import { isExactQuestionMatch, toExactAnswer } from "./interview-exact-match";
import { InterviewSearchResult, InterviewSourceSummary } from "./interview-types";

const LOG_PREFIX = "[interview-chat]";

// Request-scoped side-channel so the public chat route can surface rich
// {category, topic, question, difficulty} source attribution without
// widening the generic AgentSource shape (id/documentId/similarity) that
// tool-node.ts/source-builder.ts carry through the graph — same pattern as
// resumeRequestContext (lib/ai/resume/resume-service.ts) for the resume tool.
export const interviewSourcesContext = new AsyncLocalStorage<{ sources: InterviewSourceSummary[] }>();

export class InterviewChatService {
  /**
   * Searches the existing Interview Database and builds PortfolioChain-ready
   * context. Returns null when the search fails or nothing relevant is
   * found — callers (interview.tool.ts) fall back to the RAG knowledge base
   * in either case, so existing "no answer" behavior is unchanged.
   */
  async search(question: string): Promise<InterviewSearchResult | null> {
    console.log(`${LOG_PREFIX} Search Started`, { question });

    let candidates;
    try {
      candidates = await searchInterviewQuestions(question);
    } catch (error) {
      console.error(`${LOG_PREFIX} Search Failure`, error);
      return null;
    }

    const ranked = rankInterviewResults(question, candidates);
    console.log(`${LOG_PREFIX} Results Found`, { count: ranked.length });

    if (ranked.length === 0) {
      console.log(`${LOG_PREFIX} No Results`);
      return null;
    }

    const result = buildInterviewContext(ranked);
    console.log(`${LOG_PREFIX} Context Built`, { sources: result.sources.length });

    if (isExactQuestionMatch(question, ranked[0])) {
      result.exactAnswer = toExactAnswer(ranked[0]);
      console.log(`${LOG_PREFIX} Exact Match Found`, { question: ranked[0].question });
    }

    interviewSourcesContext.getStore()?.sources.push(...result.sources);

    return result;
  }
}

export const interviewChatService = new InterviewChatService();
