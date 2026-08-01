import { GraphNode, GraphState } from "./state";
import { portfolioChain } from "../chains/portfolio.chain";
import { answerBuilder } from "../services/answer-builder";
import { multiAgentCoordinator } from "../multi-agent";
import { ExactInterviewAnswer } from "@/types/tool-result";

// Renders a matched interview question's stored answer verbatim — no LLM
// call — so the response is exactly what the source document said, image
// and code sample included, instead of an LLM paraphrase of it.
function renderExactAnswer(exact: ExactInterviewAnswer): string {
  const parts = [exact.answer];

  if (exact.diagramUrl) {
    parts.push(`![${exact.diagramCaption || exact.question}](${exact.diagramUrl})`);
  }

  if (exact.codeExample) {
    parts.push(`\`\`\`${exact.codeLanguage ?? ""}\n${exact.codeExample}\n\`\`\``);
  }

  return parts.join("\n\n");
}

export const generationNode: GraphNode = {
  name: "generation",

  async run(state: GraphState): Promise<GraphState> {

    if (state.exactAnswer) {
      return {
        ...state,
        finalAnswer: answerBuilder.build(renderExactAnswer(state.exactAnswer)),
      };
    }

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
