import { GraphNode, GraphState } from "./state";
import { portfolioChain } from "../chains/portfolio.chain";
import { answerBuilder } from "../services/answer-builder";
import { multiAgentCoordinator } from "../multi-agent";

export const generationNode: GraphNode = {
  name: "generation",

  async run(state: GraphState): Promise<GraphState> {

    // Tool output -> Coordinator.run() -> merged context -> PortfolioChain.
    // The coordinator internally decides whether Research/Reviewer/
    // Summarizer are worth running for this question (see
    // multi-agent/coordinator.ts) and always returns a usable
    // mergedContext, even when it ran zero specialist agents. Note this
    // passes the same raw retrievedContext/toolOutput promptBuilderNode
    // already merged into state.mergedContext — the coordinator now owns
    // that merging step (enriched with specialist findings when it runs
    // them), so state.mergedContext itself is no longer consulted here.
    const { mergedContext } = await multiAgentCoordinator.run(
      state.userQuestion,
      state.conversationHistory,
      state.retrievedContext ?? "",
      state.toolOutput,
      state.intent
    );

    const { answer } = await portfolioChain.invoke(
      state.userQuestion,
      state.conversationHistory,
      mergedContext
    );

    return {
      ...state,
      finalAnswer: answerBuilder.build(answer || "No answer."),
    };

  },
};
