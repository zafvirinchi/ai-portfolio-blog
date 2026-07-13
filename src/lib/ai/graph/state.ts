import { ChatMessage } from "@/types/ai";
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
