import { ChatMessage } from "@/types/ai";
import { AgentIntent } from "../agent/agent-response";

export type SpecialistAgentName = "research" | "reviewer" | "summarizer";

export interface CoordinatorInput {
  question: string;
  history: ChatMessage[];
  retrievedContext: string;
  toolOutput: unknown;
  intent?: AgentIntent;
}

/** What the coordinator decided to run, and why — surfaced for logging/observability only. */
export interface CoordinatorPlan {
  runResearch: boolean;
  runReviewer: boolean;
  runSummarizer: boolean;
  reason: string;
}

export interface CoordinatorMetadata {
  plan: CoordinatorPlan;
  totalMs: number;
}

export interface CoordinatorResult {
  mergedContext: string;
  metadata: CoordinatorMetadata;
  agentsUsed: SpecialistAgentName[];
}
