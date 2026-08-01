import { ChatMessage } from "@/types/ai";
import { ExactInterviewAnswer } from "@/types/tool-result";
import { AgentIntent, AgentSource } from "../agent/agent-response";

export interface GraphState {
  userQuestion: string;
  conversationHistory: ChatMessage[];
  selectedTool?: string;
  intent?: AgentIntent;
  retrievedContext?: string;
  toolOutput?: unknown;
  mergedContext?: string;
  finalAnswer?: string;
  sources: AgentSource[];
  /** Set when a retrieved interview question is a near-verbatim match — generationNode returns this answer verbatim instead of paraphrasing it. */
  exactAnswer?: ExactInterviewAnswer;
}

export type NodeName = "planner" | "tool" | "promptBuilder" | "generation";

export interface GraphNode {
  name: NodeName;
  run(state: GraphState): Promise<GraphState>;
}

export function createInitialGraphState(
  userQuestion: string,
  conversationHistory: ChatMessage[] = []
): GraphState {
  return {
    userQuestion,
    conversationHistory,
    sources: [],
  };
}
