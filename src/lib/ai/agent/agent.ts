import { ChatMessage } from "@/types/ai";
import { runGraph } from "../graph/graph";
import { AgentResponse } from "./agent-response";

export class Agent {
  async run(
    question: string,
    history: ChatMessage[] = []
  ): Promise<AgentResponse> {

    const state = await runGraph(question, history);

    return {
      answer: state.finalAnswer ?? "No answer.",
      tool: state.selectedTool ?? "rag-tool",
      intent: state.intent ?? "rag",
      sources: state.sources,
    };

  }
}

export const agent = new Agent();
